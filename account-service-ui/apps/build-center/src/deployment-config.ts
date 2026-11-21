import { readFileSync } from 'node:fs';
import type { DeploymentSettings, DeploymentTarget } from './models';
import type { EksAccount } from './eks';
import { privateKeyPath, setting } from './server-config';

export interface RegistrySettings {
  registry?: string;
  registryAuthFile?: string;
  ecrRepositoryPrefix?: string;
  imagePullSecret?: string;
  ingressClass?: string;
  domain?: string;
}

export interface ClusterTarget extends DeploymentTarget, RegistrySettings {
  kubeconfig: string;
  context: string;
  ecrAccount?: EksAccount;
}

export const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const dnsName = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const sensitiveEnvironmentName = /(?:^|_)(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIALS?)(?:_|$)/i;

export interface ParsedDeploymentEnvironment {
  values: Record<string, string>;
  secretValues: Record<string, string>;
}

export function parseDeploymentEnvironment(content: unknown): ParsedDeploymentEnvironment {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 60 * 1024) {
    throw new Error('Keep the .env configuration under 60 KiB.');
  }
  const values: Record<string, string> = {};
  const secretValues: Record<string, string> = {};
  for (const [index, sourceLine] of content.split(/\r?\n/).entries()) {
    const line = sourceLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid .env syntax on line ${index + 1}. Use KEY=value, one variable per line.`);
    const [, name, raw] = match;
    if (Object.hasOwn(values, name) || Object.hasOwn(secretValues, name)) {
      throw new Error(`The .env variable ${name} is listed more than once.`);
    }
    const value = raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))) ? raw.slice(1, -1) : raw;
    if (value.includes('\0') || /[\r\n]/.test(value)) throw new Error(`The .env value for ${name} contains an invalid character.`);
    (sensitiveEnvironmentName.test(name) ? secretValues : values)[name] = value;
    if (Object.keys(values).length + Object.keys(secretValues).length > 100) {
      throw new Error('Configure no more than 100 .env variables.');
    }
  }
  return { values, secretValues };
}

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalName(value: unknown): boolean {
  return value === undefined || value === '' || (typeof value === 'string' && dnsName.test(value));
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function deploymentSettings(input: unknown): DeploymentSettings | undefined {
  const { app, port, cpuMillicores, memoryMiB, readinessPath, configMap, secret, serviceAccount, nodeName, runtimeEnv,
    secretNames, publicHostname, publicSubdomain, publicLoadBalancer, publicCustomHostname, publicTlsCertificateArn, imageRegistry, scaling } = object(input);
  const name = text(app);
  const subdomain = text(publicSubdomain);
  const tlsCertificateArn = text(publicTlsCertificateArn);
  const customHostname = text(publicCustomHostname).toLowerCase();
  const path = text(readinessPath);
  if (!dnsLabel.test(name) || !/^[a-z]/.test(name) ||
      !integer(port, 1, 65_535) || !integer(cpuMillicores, 1, 1_000_000) || !integer(memoryMiB, 1, 1_000_000) ||
      (path && !/^\/[A-Za-z0-9._~/%-]{0,199}$/.test(path)) || !optionalName(configMap) || !optionalName(secret) ||
      !optionalName(serviceAccount) || !optionalName(nodeName) || typeof publicHostname !== 'boolean' ||
      (publicLoadBalancer !== undefined && typeof publicLoadBalancer !== 'boolean') ||
      (publicHostname && subdomain && !dnsLabel.test(subdomain)) ||
      (customHostname && (!publicLoadBalancer || customHostname.length > 253 || !customHostname.includes('.') ||
        !customHostname.split('.').every(label => dnsLabel.test(label)))) ||
      (tlsCertificateArn && !/^arn:aws:acm:[a-z0-9-]+:\d{12}:certificate\/[0-9a-f-]{36}$/.test(tlsCertificateArn)) ||
      (customHostname && !tlsCertificateArn) ||
      (tlsCertificateArn && !publicLoadBalancer) ||
      (imageRegistry !== undefined && imageRegistry !== 'ecr' && imageRegistry !== 'configured')) return;
  const { mode, replicas, min, max, cpuPercent } = object(scaling);
  if (runtimeEnv !== undefined && (!runtimeEnv || typeof runtimeEnv !== 'object' || Array.isArray(runtimeEnv))) return;
  const vars = Object.entries(object(runtimeEnv));
  if (!vars.every(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !sensitiveEnvironmentName.test(key) &&
      typeof value === 'string' && !/[\r\n\0]/.test(value))) return;
  const secretKeys = secretNames === undefined ? [] : secretNames;
  if (!Array.isArray(secretKeys) || secretKeys.length > 100 ||
      !secretKeys.every(key => typeof key === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) ||
      new Set(secretKeys).size !== secretKeys.length) return;
  const common: Omit<DeploymentSettings, 'scaling'> = { app: name, port, cpuMillicores, memoryMiB, readinessPath: path || undefined,
    configMap: text(configMap) || undefined, secret: text(secret) || undefined,
    serviceAccount: text(serviceAccount) || undefined, nodeName: text(nodeName) || undefined,
    publicHostname, publicSubdomain: publicHostname ? subdomain || name : undefined, publicLoadBalancer,
    publicCustomHostname: customHostname || undefined, publicTlsCertificateArn: tlsCertificateArn || undefined, imageRegistry,
    runtimeEnv: vars.length ? Object.fromEntries(vars) as Record<string, string> : undefined,
    secretNames: secretKeys.length ? [...secretKeys] as string[] : undefined };
  if (mode === 'fixed' && integer(replicas, 1, 2_147_483_647)) return { ...common, scaling: { mode, replicas } };
  if (mode === 'auto' && integer(min, 1, 2_147_483_647) && integer(max, min, 2_147_483_647) &&
      integer(cpuPercent, 1, 2_147_483_647)) return { ...common, scaling: { mode, min, max, cpuPercent } };
  return undefined;
}

export function registrySettings(target: Record<string, unknown>, required = true): RegistrySettings {
  const registry = text(target['registry']);
  const domain = text(target['domain']);
  const ingressClass = text(target['ingressClass']);
  const registryAuthFile = text(target['registryAuthFile']);
  const imagePullSecret = text(target['imagePullSecret']);
  const ecrRepositoryPrefix = text(target['ecrRepositoryPrefix']);
  if (((required || registry) && !/^[a-z0-9.-]+(?::\d+)?(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/.test(registry)) ||
      (!registry && (registryAuthFile || imagePullSecret)) ||
      (ecrRepositoryPrefix && (ecrRepositoryPrefix.length > 190 ||
        !/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/.test(ecrRepositoryPrefix))) ||
      (domain && (!domain.includes('.') || !domain.split('.').every(label => dnsLabel.test(label)) || domain.length > 189)) ||
      (ingressClass && !domain) || !optionalName(ingressClass) || !optionalName(imagePullSecret)) {
    throw new Error('Invalid registry or ingress settings.');
  }
  return { registry: registry || undefined, ecrRepositoryPrefix: ecrRepositoryPrefix || undefined,
    domain: domain || undefined, ingressClass: ingressClass || undefined,
    imagePullSecret: imagePullSecret || undefined,
    registryAuthFile: registryAuthFile ? privateKeyPath(registryAuthFile) : undefined };
}

function readTarget(input: unknown): ClusterTarget & { workspaceId: string } {
  const target = object(input);
  const id = text(target['id']);
  const name = text(target['name']);
  const namespace = text(target['namespace']);
  const workspaceId = text(target['workspaceId']);
  const kubeconfig = text(target['kubeconfig']);
  const context = text(target['context']);
  const platform = target['platform'];
  if (!dnsLabel.test(id) || !name || !dnsLabel.test(namespace) || !/^\d+$/.test(workspaceId) || !kubeconfig ||
      !context || (platform !== 'linux/amd64' && platform !== 'linux/arm64')) {
    throw new Error('Invalid deployment target.');
  }
  return { id, name, namespace, workspaceId, context, kubeconfig: privateKeyPath(kubeconfig), platform,
    ...registrySettings(target) };
}

export function deploymentTargets(workspaceId: string): ClusterTarget[] {
  const file = setting('BUILD_CENTER_DEPLOY_TARGETS_FILE');
  if (!file) return [];
  try {
    const config: unknown = JSON.parse(readFileSync(privateKeyPath(file), 'utf8'));
    if (!Array.isArray(config)) throw new Error('Expected a list of deployment targets.');
    const targets = config.map(readTarget);
    if (new Set(targets.map(target => target.id)).size !== targets.length) throw new Error('Duplicate deployment target ID.');
    return targets.filter(target => target.workspaceId === workspaceId);
  } catch {
    throw new Error('The server could not read its Kubernetes target configuration.');
  }
}
