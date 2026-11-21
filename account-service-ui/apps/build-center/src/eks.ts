import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readWorkspace } from './build-store';
import { readAwsCredentials } from './aws-credentials';
import { dnsLabel, object, registrySettings, text } from './deployment-config';
import type { ClusterTarget, RegistrySettings } from './deployment-config';
import type { DeploymentTarget, EksAccountOption, EksConnection } from './models';
import { privateKeyPath, setting } from './server-config';

const exec = promisify(execFile);
export const regionName = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;
export const clusterName = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const context = 'build-center';

export interface EksProvisionRoles {
  clusterRoleArn: string;
  nodeRoleArn: string;
  deploymentRoleArn: string;
}

export interface EksAccount extends Omit<EksAccountOption, 'provisioning'>, RegistrySettings {
  workspaceId: string;
  awsAccountId: string;
  profile?: string;
  credentialRef?: string;
  provisioning?: EksProvisionRoles;
}

export interface EksTarget extends DeploymentTarget {
  account: EksAccount;
  connection: EksConnection;
}

export type ResolvableTarget = ClusterTarget | EksTarget;

function options(value: unknown, pattern: RegExp): string[] {
  if (!Array.isArray(value) || !value.length ||
      !value.every(item => typeof item === 'string' && pattern.test(item))) {
    throw new Error('Invalid EKS connection options.');
  }
  return [...new Set(value)];
}

const profileName = /^[a-zA-Z0-9_][a-zA-Z0-9_.@+ -]{0,127}$/;

export function readAccount(input: unknown): EksAccount {
  const account = object(input);
  const id = text(account['id']);
  const name = text(account['name']);
  const workspaceId = text(account['workspaceId']);
  const awsAccountId = text(account['awsAccountId']);
  const profile = text(account['profile']);
  const credentialRef = text(account['credentialRef']);
  if (!dnsLabel.test(id) || !name || !/^\d+$/.test(workspaceId) || !/^\d{12}$/.test(awsAccountId) ||
      (profile && !profileName.test(profile)) ||
      (credentialRef && !/^[0-9a-f-]{36}$/i.test(credentialRef)) || (profile && credentialRef)) {
    throw new Error('Invalid EKS account.');
  }
  let provisioning: EksProvisionRoles | undefined;
  if (account['provisioning'] !== undefined) {
    const roles = object(account['provisioning']);
    provisioning = {
      clusterRoleArn: text(roles['clusterRoleArn']),
      nodeRoleArn: text(roles['nodeRoleArn']),
      deploymentRoleArn: text(roles['deploymentRoleArn']),
    };
    const arn = new RegExp('^arn:aws(?:-[a-z0-9-]+)?:iam::' + awsAccountId + ':role/[A-Za-z0-9+=,.@_/-]+$');
    const roleFields = [
      ['EKS cluster role ARN', provisioning.clusterRoleArn],
      ['EC2 node role ARN', provisioning.nodeRoleArn],
      ['Kubernetes deployment role ARN', provisioning.deploymentRoleArn],
    ] as const;
    const invalidRole = roleFields.find(([, value]) => !arn.test(value));
    if (invalidRole) throw new Error(invalidRole[0] + ' must be an IAM role ARN in AWS account ' + awsAccountId + '.');
    if (new Set(roleFields.map(([, value]) => value)).size !== roleFields.length) {
      throw new Error('EKS cluster, node, and deployment roles must be three distinct IAM roles.');
    }
  }
  return {
    id, name, workspaceId, awsAccountId, profile: profile || undefined,
    credentialRef: credentialRef || undefined, provisioning,
    regions: options(account['regions'], regionName),
    namespaces: options(account['namespaces'], dnsLabel),
    ...registrySettings(account, false),
  };
}

export function awsSetupSources(workspaceId: string): { id: string; name: string; profile?: string }[] {
  const setupWorkspace = setting('BUILD_CENTER_AWS_SETUP_ORG_ID') || setting('BUILD_CENTER_WORKSPACE_ORG_ID');
  if (setupWorkspace !== workspaceId) return [];
  const approvedProfiles = (setting('BUILD_CENTER_AWS_PROFILES') || process.env['AWS_PROFILE'] || '')
    .split(',').map(name => name.trim()).filter(name => profileName.test(name));
  const sources: { id: string; name: string; profile?: string }[] = [...new Set(approvedProfiles)]
    .map(profile => ({ id: 'profile:' + profile, name: profile, profile }));
  if (setting('BUILD_CENTER_AWS_ALLOW_HOST_ROLE') === 'true') sources.push({ id: 'host', name: 'Server IAM role' });
  return sources;
}

export function eksAccounts(workspaceId: string): EksAccount[] {
  const file = setting('BUILD_CENTER_EKS_ACCOUNTS_FILE');
  try {
    const config: unknown = file ? JSON.parse(readFileSync(privateKeyPath(file), 'utf8')) : [];
    if (!Array.isArray(config)) throw new Error('Expected a list of EKS accounts.');
    const accounts = config.map(readAccount).filter(account => account.workspaceId === workspaceId);
    const sources = awsSetupSources(workspaceId);
    accounts.push(...readWorkspace(workspaceId).awsAccounts.filter(account =>
      Boolean(account.credentialRef) || sources.some(source => source.profile === account.profile)));
    if (new Set(accounts.map(account => account.id)).size !== accounts.length) throw new Error('Duplicate EKS account ID.');
    return accounts;
  } catch {
    throw new Error('The server could not read its AWS account configuration.');
  }
}

type AwsIdentity = {
  profile?: string;
  credentialRef?: string;
  workspaceId?: string;
  credentials?: AwsCredentials;
};

function awsArgs(account: AwsIdentity, region: string, operation: string[]): string[] {
  return [
    '--no-cli-pager', '--no-cli-auto-prompt', '--region', region, '--output', 'json',
    '--cli-connect-timeout', '5', '--cli-read-timeout', '8',
    ...(account.profile ? ['--profile', account.profile] : []), ...operation,
  ];
}

async function awsEnvironment(account: AwsIdentity): Promise<NodeJS.ProcessEnv | undefined> {
  const credentials = account.credentials ??
    (account.credentialRef && account.workspaceId
      ? readAwsCredentials(account.workspaceId, account.credentialRef)
      : undefined);
  if (!credentials) return;
  const environment: NodeJS.ProcessEnv = { ...process.env,
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
  };
  delete environment['AWS_PROFILE'];
  delete environment['AWS_DEFAULT_PROFILE'];
  if (credentials.sessionToken) environment['AWS_SESSION_TOKEN'] = credentials.sessionToken;
  else delete environment['AWS_SESSION_TOKEN'];
  return environment;
}

export class AwsResourceNotFound extends Error {}
export class AwsResourceExists extends Error {}

export async function aws(account: AwsIdentity, region: string, args: string[], permission: string): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await exec('aws', awsArgs(account, region, args), {
      env: await awsEnvironment(account), timeout: 22_000, maxBuffer: 1024 * 1024,
    });
    return object(JSON.parse(stdout));
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    if (failure.code === 'ENOENT') throw new Error('Install AWS CLI v2 on the Build Center server.');
    if (/ExpiredToken|UnauthorizedSSOToken|Token has expired|sso login|Unable to locate credentials/i.test(failure.stderr ?? '')) {
      throw new Error('AWS authentication is unavailable. Refresh the server AWS profile or check its IAM role.');
    }
    if (/SignatureDoesNotMatch/i.test(failure.stderr ?? '')) {
      throw new Error('AWS could not verify the credential signature. Confirm the access key ID and secret key are a matching pair; for temporary ASIA keys, provide the matching session token. Check that the Build Center server clock is synchronized.');
    }
    if (permission === 'sqs:ListQueues' && /AccessDenied|not authorized to perform/i.test(failure.stderr ?? '')) {
      throw new Error('The AWS identity connected to Build Center is not allowed to list SQS queues. Grant sqs:ListQueues with Resource "*" to the identity used by this connection, then allow sqs:GetQueueAttributes and sqs:CreateQueue on the queues Build Center manages. For saved access keys, update the IAM user; for an AWS profile or server identity, update that profile\'s user or role. The example policy is deploy/build-center/aws-resources-sqs-policy.example.json.');
    }
    if (permission.startsWith('eks:') && /AccessDenied|not authorized to perform/i.test(failure.stderr ?? '')) {
      throw new Error(`The AWS identity connected to Build Center is missing ${permission}. Add this action to the IAM user or role configured in Build Center Settings → Cloud providers, scoped to the selected EKS cluster or node group. See deploy/build-center/aws-eks-observability-policy.example.json.`);
    }
    if (/ResourceNotFoundException|RepositoryNotFoundException/.test(failure.stderr ?? '')) {
      throw new AwsResourceNotFound('The requested AWS resource was not found.');
    }
    if (/RepositoryAlreadyExistsException/.test(failure.stderr ?? '')) throw new AwsResourceExists('The ECR repository already exists.');
    const awsCode = /An error occurred \(([A-Za-z0-9_.-]+)\)/.exec(failure.stderr ?? '')?.[1];
    throw new Error('The AWS request failed' + (awsCode ? ' (' + awsCode + ')' : '') +
      '. Check the configuration, server identity, and ' + permission + ' permission.');
  }
}

export async function callerIdentity(account: AwsIdentity, region: string): Promise<{ accountId: string; arn: string }> {
  const identity = await aws(account, region, ['sts', 'get-caller-identity'], 'AWS STS');
  const accountId = text(identity['Account']);
  const arn = text(identity['Arn']);
  if (!/^\d{12}$/.test(accountId) || !/^arn:[^:]+:[^:]+::\d{12}:.+$/.test(arn)) {
    throw new Error('AWS did not return a valid caller identity.');
  }
  return { accountId, arn };
}

export async function callerAccount(account: AwsIdentity, region: string): Promise<string> {
  return (await callerIdentity(account, region)).accountId;
}

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export async function verifyAwsCredentials(credentials: AwsCredentials, region: string): Promise<string> {
  return callerAccount({ credentials }, region);
}

async function withAwsCredentials(account: AwsIdentity): Promise<AwsCredentials | undefined> {
  if (account.credentials) return account.credentials;
  if (account.credentialRef && account.workspaceId) {
    return readAwsCredentials(account.workspaceId, account.credentialRef);
  }
  return;
}

export async function verifyAwsAccount(account: EksAccount, region: string): Promise<void> {
  if (await callerAccount(account, region) !== account.awsAccountId) {
    throw new Error('The server identity belongs to a different AWS account.');
  }
}

export async function listEksClusters(account: EksAccount, region: string): Promise<string[]> {
  await verifyAwsAccount(account, region);
  const result = await aws(account, region, ['eks', 'list-clusters'], 'eks:ListClusters');
  if (!Array.isArray(result['clusters'])) throw new Error('AWS did not return a cluster list.');
  return result['clusters'].filter((name): name is string => typeof name === 'string' && clusterName.test(name)).sort();
}

export async function describeCluster(account: EksAccount, region: string, name: string) {
  const output = await aws(account, region, ['eks', 'describe-cluster', '--name', name], 'eks:DescribeCluster');
  const data = object(output['cluster']);
  const arn = text(data['arn']);
  const endpoint = text(data['endpoint']);
  const certificate = text(object(data['certificateAuthority'])['data']);
  const vpcConfig = object(data['resourcesVpcConfig']);
  const subnetIds = Array.isArray(vpcConfig['subnetIds']) ?
    vpcConfig['subnetIds'].filter((value): value is string => typeof value === 'string') : [];
  const createdAt = typeof data['createdAt'] === 'number' ? data['createdAt'] * 1000 : Date.parse(text(data['createdAt']));
  const arnParts = arn.split(':');
  if (arnParts[0] !== 'arn' || arnParts[2] !== 'eks' || arnParts[3] !== region ||
      arnParts[4] !== account.awsAccountId || arnParts[5] !== 'cluster/' + name || arnParts.length !== 6 ||
      !Number.isFinite(createdAt)) throw new Error('The cluster does not match the configured AWS account and region.');
  if (data['status'] !== 'ACTIVE' && data['status'] !== 'UPDATING') {
    throw new Error('The EKS cluster is ' + (text(data['status']) || 'unavailable') + '. Wait for it to become active.');
  }
  if (!/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(endpoint) || !/^[a-zA-Z0-9+/]+={0,2}$/.test(certificate)) {
    throw new Error('AWS did not return a valid cluster endpoint and certificate.');
  }
  return {
    arn, createdAt, endpoint, certificate, status: text(data['status']), subnetIds,
    endpointPublicAccess: vpcConfig['endpointPublicAccess'] === true,
    endpointPrivateAccess: vpcConfig['endpointPrivateAccess'] === true,
  };
}

export function eksTarget(connection: EksConnection, accounts: EksAccount[]): EksTarget | undefined {
  const account = accounts.find(item => item.id === connection.accountId);
  const { id, cluster, region, namespace, platform, arn } = connection;
  if (!account || !account.regions.includes(region) || !account.namespaces.includes(namespace) ||
      arn.split(':')[4] !== account.awsAccountId ||
      (connection.deploymentRoleArn && connection.deploymentRoleArn !== account.provisioning?.deploymentRoleArn)) return;
  return {
    id, name: cluster, namespace, platform, domain: account.domain, ingressClass: account.ingressClass,
    eks: { cluster, region }, account, connection,
  };
}

export async function prepareEksConnection(
  input: unknown, accounts: EksAccount[], id: string, verify: (target: ClusterTarget) => Promise<void>,
): Promise<EksConnection> {
  const { accountId, region, cluster, namespace, platform } = object(input);
  const account = accounts.find(item => item.id === accountId);
  if (!account || typeof region !== 'string' || !account.regions.includes(region) ||
      typeof cluster !== 'string' || !clusterName.test(cluster) ||
      typeof namespace !== 'string' || !account.namespaces.includes(namespace) ||
      (platform !== 'linux/amd64' && platform !== 'linux/arm64')) {
    throw new Error('Choose an approved AWS account, region, cluster, namespace, and image platform.');
  }
  const describe = await describeCluster(account, region, cluster);
  const connection = { id, accountId: account.id, cluster, namespace, region, platform,
    deploymentRoleArn: account.provisioning?.deploymentRoleArn,
    arn: describe.arn, createdAt: describe.createdAt } satisfies EksConnection;
  await withEksConfig(account, connection, describe, verify);
  return connection;
}

export async function withEksConfig<T>(
  account: EksAccount, connection: EksConnection, describe: Awaited<ReturnType<typeof describeCluster>>,
  action: (target: ClusterTarget) => Promise<T>, roleArn = connection.deploymentRoleArn,
): Promise<T> {
  if (roleArn) {
    const identity = await callerIdentity(account, connection.region);
    if (/^arn:[^:]+:iam::\d{12}:root$/.test(identity.arn)) {
      throw new Error('This Build Center AWS connection uses the account root user. EKS access is configured to assume a deployment role, but root credentials cannot use that role-assumption flow. Reconnect with a non-root IAM Identity Center profile or scoped IAM principal that can assume the configured deployment role, then reconnect the EKS cluster.');
    }
  }
  const work = await mkdtemp(join(tmpdir(), 'build-center-eks-'));
  const kubeconfig = join(work, 'config.json');
  const { id, namespace, platform, cluster, region } = connection;
  try {
    const credentials = await withAwsCredentials(account);
    let execEnvironment: { name: string; value: string }[] | undefined;
    if (credentials) {
      const awsConfig = join(work, 'aws-config');
      const awsCredentials = join(work, 'aws-credentials');
      await Promise.all([
        writeFile(awsConfig, '[profile build-center]\n', { mode: 0o600 }),
        writeFile(awsCredentials, '', { mode: 0o600 }),
      ]);
      execEnvironment = [
        { name: 'AWS_ACCESS_KEY_ID', value: credentials.accessKeyId },
        { name: 'AWS_SECRET_ACCESS_KEY', value: credentials.secretAccessKey },
        ...(credentials.sessionToken ? [{ name: 'AWS_SESSION_TOKEN', value: credentials.sessionToken }] : []),
        { name: 'AWS_PROFILE', value: 'build-center' },
        { name: 'AWS_DEFAULT_PROFILE', value: 'build-center' },
        { name: 'AWS_CONFIG_FILE', value: awsConfig },
        { name: 'AWS_SHARED_CREDENTIALS_FILE', value: awsCredentials },
      ];
    }
    await writeFile(kubeconfig, JSON.stringify({
      apiVersion: 'v1', kind: 'Config', 'current-context': context,
      clusters: [{ name: context, cluster: { server: describe.endpoint, 'certificate-authority-data': describe.certificate } }],
      contexts: [{ name: context, context: { cluster: context, user: context, namespace } }],
      users: [{ name: context, user: { exec: {
        apiVersion: 'client.authentication.k8s.io/v1beta1', command: 'aws', interactiveMode: 'Never',
        ...(execEnvironment ? { env: execEnvironment } : {}),
        args: awsArgs(account, region, [
          'eks', 'get-token', '--cluster-name', cluster, ...(roleArn ? ['--role-arn', roleArn] : []),
        ]),
      } } }],
    }), { mode: 0o600 });
    const { registry, registryAuthFile, imagePullSecret, ingressClass, domain } = account;
    return await action({
      id, name: cluster, namespace, platform, kubeconfig, context, registry, registryAuthFile, imagePullSecret, ingressClass, domain,
      eks: { cluster, region }, ecrAccount: account,
    });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function withDeploymentTarget<T>(
  target: ResolvableTarget, action: (resolved: ClusterTarget) => Promise<T>,
): Promise<T> {
  if ('kubeconfig' in target) return action(target);
  const { account, connection } = target;
  const describe = await describeCluster(account, connection.region, connection.cluster);
  if (describe.arn !== connection.arn || describe.createdAt !== connection.createdAt) {
    throw new Error('The saved EKS cluster was replaced. Connect the new cluster before deploying.');
  }
  return withEksConfig(account, connection, describe, action);
}
