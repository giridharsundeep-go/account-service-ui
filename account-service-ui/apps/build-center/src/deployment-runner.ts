import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { ClusterTarget } from './deployment-config';
import { prepareEcrRepository } from './ecr';
import type { BuildRun, DeploymentRelease } from './models';
import { resolveArchive } from './runner';

const exec = promisify(execFile);
const appLabel = 'app.kubernetes.io/name';
const managerLabel = 'app.kubernetes.io/managed-by';
const ownerLabel = 'build-center.greatley-poshley.com/pipeline';
const fieldManager = 'greatley-build-center';

async function command(file: string, args: string[], message: string, timeout = 20_000): Promise<string> {
  try {
    const { stdout } = await exec(file, args, { timeout, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const code = failure.code;
    if (code === 'ENOENT') throw new Error(`Install ${file} on the Build Center server.`);
    if (file === 'kubectl') {
      const details = (failure.stderr || failure.stdout || '').replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();
      if (details) {
        const cause = /unable to connect|dial tcp|i\/o timeout|no such host|connection refused/i.test(details)
          ? 'EKS API connectivity' : /forbidden|unauthorized|cannot (?:create|patch|list|get)/i.test(details)
            ? 'Kubernetes access' : 'Kubernetes response';
        throw new Error(`${message} ${cause}: ${details.slice(0, 600)}`);
      }
    }
    throw new Error(message);
  }
}

export function kubectl(target: ClusterTarget, args: string[], message: string, timeout?: number): Promise<string> {
  return command('kubectl', [
    `--kubeconfig=${target.kubeconfig}`, `--context=${target.context}`, `--namespace=${target.namespace}`, ...args,
  ], message, timeout);
}

function labels(release: DeploymentRelease): Record<string, string> {
  return { [appLabel]: release.settings.app, [managerLabel]: fieldManager, [ownerLabel]: release.pipelineId };
}

type Workload = {
  metadata?: { labels?: Record<string, string> };
  spec?: { replicas?: number; type?: string };
  status?: { readyReplicas?: number; loadBalancer?: { ingress?: { hostname?: string; ip?: string }[] } };
};

async function findOwned(target: ClusterTarget, release: DeploymentRelease, kind: string): Promise<Workload | undefined> {
  const name = release.settings.app;
  const output = await kubectl(target, ['get', `${kind}/${name}`, '--ignore-not-found', '-o', 'json'],
    `Could not read ${kind}/${name}. Check cluster connectivity and namespace permissions.`);
  if (!output) return;
  const item = JSON.parse(output) as Workload;
  if (item.metadata?.labels?.[managerLabel] !== fieldManager || item.metadata.labels[ownerLabel] !== release.pipelineId) {
    throw new Error(`${kind}/${name} belongs to another workload. Choose a different app name or namespace.`);
  }
  return item;
}

export async function checkDeploymentTarget(target: ClusterTarget): Promise<void> {
  const answer = await kubectl(target, ['auth', 'can-i', 'patch', 'deployments.apps'],
    'Could not authorize deployments. Check the kubeconfig, cluster connectivity, and namespace role.');
  if (answer !== 'yes') throw new Error('The configured namespace role cannot update deployments.');
}

export async function deploymentDetails(target: ClusterTarget, release: DeploymentRelease) {
  const deployment = await findOwned(target, release, 'deployment');
  if (!deployment) return null;
  const service = release.settings.publicLoadBalancer ? await findOwned(target, release, 'service') : undefined;
  const loadBalancer = service?.spec?.type === 'LoadBalancer';
  const ingress = loadBalancer ? service?.status?.loadBalancer?.ingress?.[0] : undefined;
  const host = ingress?.hostname;
  const ip = ingress?.ip;
  const endpoint = host && /^[a-zA-Z0-9.-]+$/.test(host) ?
    `http://${host}` : ip && isIP(ip) ? `http://${isIP(ip) === 6 ? '[' + ip + ']' : ip}` : undefined;
  return { ready: deployment.status?.readyReplicas ?? 0, desired: deployment.spec?.replicas ?? 0, loadBalancer, endpoint };
}

export async function deploymentLogs(target: ClusterTarget, release: DeploymentRelease): Promise<string> {
  if (!(await findOwned(target, release, 'deployment'))) throw new Error('This workload has no deployment in the cluster.');
  const selector = Object.entries(labels(release)).map(([key, value]) => `${key}=${value}`).join(',');
  return kubectl(target, ['logs', '-l', selector, '--tail=80', '--prefix=true', '--all-containers=true'],
    'Pod logs are currently unavailable. Check whether pods have started and the namespace role can read pod logs.');
}

async function publishArchive(
  orgId: string, run: BuildRun, target: ClusterTarget, release: DeploymentRelease, work: string,
  progress: (message: string, image?: string, percent?: number) => void,
): Promise<string> {
  const artifact = run.artifact;
  if (!artifact) throw new Error('This build has no image archive.');
  const archive = await resolveArchive(orgId, artifact.path).catch(() => {
    throw new Error('This image archive is no longer available on the runner.');
  });
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== artifact.sha256) throw new Error('The image archive no longer matches its build checksum.');
  const source = `docker-archive:${archive}`;
  const config = JSON.parse(await command('skopeo', ['inspect', '--config', source],
    'Could not inspect the Docker image archive.')) as { architecture?: string; os?: string };
  if (`${config.os}/${config.architecture}` !== target.platform) {
    throw new Error(`Image platform ${config.os}/${config.architecture} does not match the target. Rebuild for ${target.platform}.`);
  }
  if (release.settings.imageRegistry === 'ecr' && target.ecrAccount && target.eks && artifact.image.includes('@sha256:')) {
    const prefix = target.ecrAccount.ecrRepositoryPrefix ? target.ecrAccount.ecrRepositoryPrefix + '/' : '';
    const expected = target.ecrAccount.awsAccountId + '.dkr.ecr.' + target.eks.region +
      '.amazonaws.com/' + prefix + release.settings.app + '@sha256:';
    if (artifact.image.startsWith(expected)) return artifact.image;
  }
  let repository: string;
  let authFile: string | undefined;
  let tag = run.version ?? run.tag;
  if (release.settings.imageRegistry === 'ecr') {
    if (!target.ecrAccount || !target.eks) throw new Error('Amazon ECR publishing requires an AWS-connected EKS target.');
    progress('Preparing the Amazon ECR repository');
    ({ repository, authFile } = await prepareEcrRepository(target.ecrAccount, target.eks.region, release.settings.app, work));
    progress('Publishing the image to Amazon ECR');
  } else {
    if (!target.registry) throw new Error('This cluster has no configured image registry. Select Amazon ECR.');
    repository = `${target.registry}/${release.settings.app}`;
    authFile = target.registryAuthFile;
  }
  const digestFile = join(work, 'digest');
  const auth = authFile ? ['--dest-authfile', authFile] : [];
  await command('skopeo', ['copy', ...auth, '--digestfile', digestFile, source, `docker://${repository}:${tag}`],
    'Could not publish the image. Check registry access and the publisher credentials.', 10 * 60_000);
  const digest = (await readFile(digestFile, 'utf8')).trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error('The registry did not return a valid image digest.');
  return `${repository}@${digest}`;
}

function manifests(target: ClusterTarget, release: DeploymentRelease, image: string,
                   secretEnv: Record<string, string> = {}): object[] {
  const { app, port, cpuMillicores, memoryMiB, scaling, configMap, secret, readinessPath } = release.settings;
  const selector = labels(release);
  const metadata = { name: app, namespace: target.namespace, labels: selector };
  const loadBalancer = release.settings.publicLoadBalancer === true;
  const envFrom = [
    ...(configMap ? [{ configMapRef: { name: configMap } }] : []),
    ...(secret ? [{ secretRef: { name: secret } }] : []),
  ];
  const resources = [
    ...(Object.keys(secretEnv).length && secret ? [{
      apiVersion: 'v1', kind: 'Secret', metadata: { ...metadata, name: secret }, type: 'Opaque', stringData: secretEnv,
    }] : []),
    {
      apiVersion: 'apps/v1', kind: 'Deployment', metadata,
      spec: {
        progressDeadlineSeconds: 300,
        selector: { matchLabels: selector },
        template: {
          metadata: { labels: selector, annotations: { 'build-center.greatley-poshley.com/release': release.id } },
          spec: {
            automountServiceAccountToken: false,
            serviceAccountName: release.settings.serviceAccount,
            enableServiceLinks: false,
            ...(release.settings.nodeName ? { nodeName: release.settings.nodeName } : {}),
            nodeSelector: { 'kubernetes.io/os': 'linux', 'kubernetes.io/arch': target.platform.split('/')[1] },
            imagePullSecrets: release.settings.imageRegistry !== 'ecr' && target.imagePullSecret ?
              [{ name: target.imagePullSecret }] : [],
            containers: [{
              name: 'app', image, envFrom,
              env: Object.entries(release.settings.runtimeEnv ?? {}).map(([name, value]) => ({ name, value })),
              ports: [{ name: 'http', containerPort: port }],
              resources: { requests: { cpu: `${cpuMillicores}m`, memory: `${memoryMiB}Mi` } },
              readinessProbe: { ...(readinessPath ? { httpGet: { path: readinessPath, port } } : { tcpSocket: { port } }),
                periodSeconds: 5, timeoutSeconds: 2 },
            }],
          },
        },
      },
    },
    {
      apiVersion: 'v1', kind: 'Service',
      metadata: loadBalancer ? { ...metadata, annotations: {
        'service.beta.kubernetes.io/aws-load-balancer-scheme': 'internet-facing',
      } } : metadata,
      spec: { type: loadBalancer ? 'LoadBalancer' : 'ClusterIP', selector,
        ports: [{ name: 'http', port: loadBalancer ? 80 : port, targetPort: 'http' }] },
    },
  ] as object[];
  if (scaling.mode === 'auto') {
    resources.push({
      apiVersion: 'autoscaling/v2', kind: 'HorizontalPodAutoscaler', metadata,
      spec: {
        scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: app },
        minReplicas: scaling.min, maxReplicas: scaling.max,
        metrics: [{ type: 'Resource', resource: { name: 'cpu',
          target: { type: 'Utilization', averageUtilization: scaling.cpuPercent } } }],
      },
    });
  }
  if (release.hostname) {
    resources.push({
      apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata,
      spec: { ingressClassName: target.ingressClass, rules: [{ host: release.hostname,
        http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: app, port: { number: port } } } }] } }] },
    });
  }
  return resources;
}

export async function deployRelease(
  orgId: string, target: ClusterTarget, release: DeploymentRelease, run: BuildRun | undefined,
  progress: (message: string, image?: string, percent?: number) => void, secretEnv: Record<string, string> = {},
): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), 'build-center-deploy-'));
  try {
    if (release.settings.scaling.mode === 'auto') {
      await kubectl(target, ['get', '--raw=/apis/metrics.k8s.io/v1beta1'],
        'The Kubernetes resource metrics API is unavailable. Install or enable Metrics Server before using CPU autoscaling.');
    }
    const [, , autoscaler, ingress] = await Promise.all([
      findOwned(target, release, 'deployment'), findOwned(target, release, 'service'),
      findOwned(target, release, 'hpa'), findOwned(target, release, 'ingress'),
    ]);
    let image = release.image;
    if (!image && run) {
      progress('Checking the archive and publishing the image');
      image = await publishArchive(orgId, run, target, release, work, progress);
    }
    if (!image) throw new Error('This release has no published image.');
    progress('Validating Kubernetes resources', image);
    const resources = manifests(target, release, image, secretEnv) as { kind?: string }[];
    const deployment = resources.find(resource => resource.kind === 'Deployment');
    if (!deployment) throw new Error('The deployment manifest could not be prepared.');
    const supportingResources = resources.filter(resource => resource !== deployment);
    const deploymentFile = join(work, 'deployment.json');
    const supportingFile = join(work, 'supporting-resources.json');
    await writeFile(deploymentFile, JSON.stringify(deployment));
    await writeFile(supportingFile, JSON.stringify({ apiVersion: 'v1', kind: 'List', items: supportingResources }));
    const apply = ['apply', '--server-side', `--field-manager=${fieldManager}`];
    await kubectl(target, [...apply, '--dry-run=server', '-f', supportingFile],
      'Kubernetes rejected a supporting resource. Check the namespace permissions, policy, and resource settings.');
    await kubectl(target, [...apply, '--force-conflicts', '--dry-run=server', '-f', deploymentFile],
      'Kubernetes rejected the deployment manifest. Check the namespace permissions, policy, and resource settings.');
    progress('Applying Kubernetes resources', image);
    await kubectl(target, [...apply, '-f', supportingFile],
      'Could not apply supporting Kubernetes resources. Check the current workload before retrying.');
    await kubectl(target, [...apply, '--force-conflicts', '-f', deploymentFile],
      'Could not apply the Kubernetes deployment. Check the current workload before retrying.');
    const { app, scaling } = release.settings;
    if (scaling.mode === 'fixed') {
      if (autoscaler) await kubectl(target, ['delete', `hpa/${app}`, '--ignore-not-found'],
        'Could not remove the existing autoscaler. Check the namespace role.');
      await kubectl(target, ['scale', `deployment/${app}`, `--replicas=${scaling.replicas}`],
        'Could not set the replica count. Check deployment scale permissions.');
    }
    if (ingress && !release.hostname) {
      await kubectl(target, ['delete', `ingress/${app}`, '--ignore-not-found'],
        'Could not remove the previous ingress. Check the namespace role.');
    }
    progress('Waiting for ready replicas', image);
    const deadline = Date.now() + 5 * 60_000;
    let lastReady = -1;
    let lastDesired = -1;
    while (Date.now() < deadline) {
      const output = await kubectl(target, ['get', `deployment/${app}`, '-o', 'json'],
        'The deployment status could not be read while waiting for pods to become ready.');
      const deployment = JSON.parse(output) as {
        metadata?: { generation?: number };
        spec?: { replicas?: number };
        status?: { observedGeneration?: number; updatedReplicas?: number; readyReplicas?: number; availableReplicas?: number;
          conditions?: { type?: string; status?: string; reason?: string; message?: string }[] };
      };
      const desired = Math.max(1, deployment.spec?.replicas ?? 1);
      const ready = Math.min(deployment.status?.updatedReplicas ?? 0, deployment.status?.readyReplicas ?? 0,
        deployment.status?.availableReplicas ?? 0);
      const observed = (deployment.status?.observedGeneration ?? 0) >= (deployment.metadata?.generation ?? 0);
      const failed = deployment.status?.conditions?.find(condition => condition.type === 'Progressing' &&
        condition.status === 'False' && condition.reason === 'ProgressDeadlineExceeded');
      if (failed) throw new Error(`The rollout exceeded its progress deadline: ${failed.message || 'pods did not become ready'}`);
      if (ready !== lastReady || desired !== lastDesired) {
        lastReady = ready; lastDesired = desired;
        const percent = Math.min(99, 90 + Math.floor(ready / desired * 9));
        progress(`Waiting for ready replicas (${ready}/${desired} ready)`, image, percent);
      }
      if (observed && ready >= desired) break;
      await delay(3_000);
    }
    if (Date.now() >= deadline) {
      throw new Error('The rollout did not become ready within five minutes. Check pod logs, image pull access, health checks, and worker capacity.');
    }
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
