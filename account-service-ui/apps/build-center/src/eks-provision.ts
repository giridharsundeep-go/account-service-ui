import { isIP } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { object, text } from './deployment-config';
import { checkDeploymentTarget, kubectl } from './deployment-runner';
import { aws, AwsResourceNotFound, clusterName, describeCluster, verifyAwsAccount, withEksConfig } from './eks';
import type { EksAccount, EksProvisionRoles } from './eks';
import type { BuildPlatform, EksConnection, EksProvision, EksProvisionSettings, EksSubnet } from './models';

const subnetId = /^subnet-(?:[0-9a-f]{8}|[0-9a-f]{17})$/;
const instanceTypeName = /^[a-z0-9][a-z0-9-]{0,30}\.[a-z0-9][a-z0-9-]{0,30}$/;
const version = /^1\.\d{1,2}$/;
const jobTag = 'greatley-poshley-build-center-job';
export const deployedGroup = 'greatley-build-center-deployer';

export function workspaceAccessManifest(namespace: string): Record<string, unknown> {
  const metadata = { name: deployedGroup, namespace };
  const rules = [
    { apiGroups: ['apps'], resources: ['deployments'], verbs: ['get', 'list', 'watch', 'create', 'patch'] },
    { apiGroups: ['apps'], resources: ['deployments/scale'], verbs: ['get', 'patch', 'update'] },
    { apiGroups: [''], resources: ['services'], verbs: ['get', 'create', 'patch'] },
    { apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] },
    { apiGroups: [''], resources: ['pods/log'], verbs: ['get'] },
    { apiGroups: [''], resources: ['secrets'], verbs: ['get', 'create', 'patch'] },
    { apiGroups: ['autoscaling'], resources: ['horizontalpodautoscalers'], verbs: ['get', 'create', 'patch', 'delete'] },
    { apiGroups: ['networking.k8s.io'], resources: ['ingresses'], verbs: ['get', 'create', 'patch', 'delete'] },
    { apiGroups: ['metrics.k8s.io'], resources: ['pods'], verbs: ['get', 'list'] },
  ];
  const nodeReader = 'build-center-node-reader';
  return {
    apiVersion: 'v1', kind: 'List', items: [
      { apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } },
      { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role', metadata, rules },
      { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata,
        subjects: [{ kind: 'Group', name: deployedGroup, apiGroup: 'rbac.authorization.k8s.io' }],
        roleRef: { kind: 'Role', name: deployedGroup, apiGroup: 'rbac.authorization.k8s.io' } },
      { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'ClusterRole', metadata: { name: nodeReader },
        rules: [
          { apiGroups: [''], resources: ['nodes'], verbs: ['get', 'list'] },
          { apiGroups: ['metrics.k8s.io'], resources: ['nodes'], verbs: ['get', 'list'] },
        ] },
      { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'ClusterRoleBinding', metadata: { name: nodeReader },
        subjects: [{ kind: 'Group', name: deployedGroup, apiGroup: 'rbac.authorization.k8s.io' }],
        roleRef: { kind: 'ClusterRole', name: nodeReader, apiGroup: 'rbac.authorization.k8s.io' } },
    ],
  };
}

export function provisionSettings(input: unknown, account: EksAccount): EksProvisionSettings {
  const values = object(input);
  const region = text(values['region']);
  const cluster = text(values['cluster']);
  const namespace = text(values['namespace']);
  const kubernetesVersion = text(values['kubernetesVersion']);
  const nodeGroup = text(values['nodeGroup']);
  const instanceType = text(values['instanceType']);
  const capacityType = values['capacityType'];
  const subnetIds = values['subnetIds'];
  const { minNodes, desiredNodes, maxNodes, diskGiB } = values;
  const publicAccessCidr = text(values['publicAccessCidr']);
  const [address, prefix] = publicAccessCidr.split('/');
  if (!account.regions.includes(region) || !account.namespaces.includes(namespace) ||
      !clusterName.test(cluster) || !clusterName.test(nodeGroup) || !version.test(kubernetesVersion) ||
      !instanceTypeName.test(instanceType) || (capacityType !== 'ON_DEMAND' && capacityType !== 'SPOT') ||
      !Array.isArray(subnetIds) || subnetIds.length < 2 ||
      !subnetIds.every(id => typeof id === 'string' && subnetId.test(id)) || new Set(subnetIds).size !== subnetIds.length ||
      (publicAccessCidr && (!/^\d{1,2}$/.test(prefix ?? '') || Number(prefix) < 1 || Number(prefix) > 32 ||
        isIP(address) !== 4 || publicAccessCidr !== address + '/' + prefix))) {
    throw new Error('Check the cluster and node group names, Kubernetes version, approved namespace, subnets, and endpoint CIDR.');
  }
  if (!whole(minNodes, 0) || !whole(desiredNodes, Math.max(1, minNodes)) ||
      !whole(maxNodes, desiredNodes) || !whole(diskGiB, 1, 16_384)) {
    throw new Error('Set whole-number worker counts with minimum ≤ desired ≤ maximum, at least one desired worker, and a valid disk size.');
  }
  return { accountId: account.id, region, cluster, namespace, kubernetesVersion, nodeGroup, instanceType,
    capacityType, subnetIds, publicAccessCidr: publicAccessCidr || undefined, minNodes, desiredNodes, maxNodes, diskGiB };
}

function whole(value: unknown, min: number, max = 2_147_483_647): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

async function supportedVersions(account: EksAccount, region: string): Promise<string[]> {
  const result = await aws(account, region, ['eks', 'describe-cluster-versions', '--version-status', 'STANDARD_SUPPORT'], 'eks:DescribeClusterVersions');
  const versions = result['clusterVersions'];
  if (!Array.isArray(versions)) throw new Error('AWS did not return a list of supported Kubernetes versions.');
  return versions.map(value => text(object(value)['clusterVersion'])).filter(value => version.test(value));
}

async function listSubnets(account: EksAccount, region: string, ids?: string[]): Promise<EksSubnet[]> {
  const result = await aws(account, region, ['ec2', 'describe-subnets', '--filters', 'Name=state,Values=available',
    ...(ids ? ['--subnet-ids', ...ids] : [])], 'ec2:DescribeSubnets');
  if (!Array.isArray(result['Subnets'])) throw new Error('AWS did not return a subnet list.');
  return result['Subnets'].map(value => {
    const item = object(value);
    const name = Array.isArray(item['Tags']) ? item['Tags'].map(object).find(tag => tag['Key'] === 'Name') : undefined;
    return {
      id: text(item['SubnetId']), vpc: text(item['VpcId']), zone: text(item['AvailabilityZone']),
      zoneId: text(item['AvailabilityZoneId']), name: text(name?.['Value']) || undefined,
    };
  }).filter(item => subnetId.test(item.id) && item.vpc && item.zone && item.zoneId);
}

export async function provisionOptions(account: EksAccount, region: string): Promise<{ versions: string[]; subnets: EksSubnet[] }> {
  await verifyAwsAccount(account, region);
  const [versions, subnets] = await Promise.all([supportedVersions(account, region), listSubnets(account, region)]);
  return { versions, subnets };
}

export async function requestEksWorkerGroup(
  account: EksAccount, roles: EksProvisionRoles, job: EksProvision,
  capacityOverride?: 'ON_DEMAND' | 'SPOT',
): Promise<{ name: string; status: string; updateId?: string; desiredNodes: number;
  issues: EksProvision['workerGroupIssues']; workerNodePolicyAttached?: boolean; created: boolean }> {
  const { region, cluster, nodeGroup, subnetIds, instanceType, diskGiB, minNodes, desiredNodes, maxNodes } = job.settings;
  await verifyAwsAccount(account, region);
  const clusterInfo = await describeCluster(account, region, cluster);
  if (clusterInfo.status !== 'ACTIVE') throw new Error('The EKS control plane must be ACTIVE before creating worker nodes.');
  const existing = await describeResource(account, region,
    ['eks', 'describe-nodegroup', '--cluster-name', cluster, '--nodegroup-name', nodeGroup], 'nodegroup', 'eks:DescribeNodegroup');
  if (existing) {
    if (object(existing['tags'])[jobTag] !== job.id) {
      throw new Error('A node group with this name already exists and was not created by this Build Center setup.');
    }
    const diagnostic = await inspectEksWorkerGroup(account, job);
    return { name: nodeGroup, status: text(existing['status']) || 'UNKNOWN',
      desiredNodes: Number(object(existing['scalingConfig'])['desiredSize'] ?? desiredNodes),
      issues: diagnostic?.issues ?? workerIssues(existing), workerNodePolicyAttached: diagnostic?.workerNodePolicyAttached, created: false };
  }
  const policyStatus = await workerRolePolicyStatus(account, region, roles.nodeRoleArn);
  if (policyStatus.minimalOnly) {
    throw new Error('The EC2 node role has AmazonEKSWorkerNodeMinimalPolicy but lacks the EC2 describe permissions needed by standard EKS workers. Attach AmazonEKSWorkerNodePolicy in the node role, then create the worker group.');
  }
  const platform = await instancePlatform(account, region, instanceType);
  const subnets = await listSubnets(account, region, subnetIds);
  if (subnets.length !== subnetIds.length || new Set(subnets.map(item => item.vpc)).size !== 1 ||
      new Set(subnets.map(item => item.zoneId)).size < 2) {
    throw new Error('The saved worker subnets are no longer available in at least two Availability Zones. Edit the cluster setup to select valid subnets.');
  }
  const capacityType = capacityOverride ?? job.settings.capacityType;
  const result = await aws(account, region, ['eks', 'create-nodegroup', '--cli-input-json', JSON.stringify({
    clusterName: cluster,
    nodegroupName: nodeGroup,
    subnets: subnetIds,
    nodeRole: roles.nodeRoleArn,
    instanceTypes: [instanceType],
    capacityType,
    diskSize: diskGiB,
    scalingConfig: { minSize: minNodes, desiredSize: desiredNodes, maxSize: maxNodes },
    amiType: platform === 'linux/arm64' ? 'AL2023_ARM_64_STANDARD' : 'AL2023_x86_64_STANDARD',
    tags: { [jobTag]: job.id },
    clientRequestToken: job.id,
  })], 'eks:CreateNodegroup and iam:PassRole');
  const created = object(result['nodegroup']);
  const update = object(result['update']);
  return { name: text(created['nodegroupName']) || nodeGroup, status: text(created['status']) || 'CREATING',
    updateId: text(update['id']) || undefined, desiredNodes, issues: workerIssues(created), workerNodePolicyAttached: policyStatus.attached, created: true };
}

function workerIssues(group: Record<string, unknown>): EksProvision['workerGroupIssues'] {
  const issues = object(group['health'])['issues'];
  if (!Array.isArray(issues)) return [];
  return issues.map(value => {
    const issue = object(value);
    return { code: text(issue['code']) || 'UNKNOWN', message: text(issue['message']) || 'AWS did not return a failure detail.',
      resourceIds: Array.isArray(issue['resourceIds']) ? issue['resourceIds'].filter((id): id is string => typeof id === 'string') : [] };
  });
}

async function workerRolePolicyStatus(account: EksAccount, region: string, roleArn: string): Promise<{ attached: boolean; minimalOnly: boolean }> {
  const roleName = roleArn.split('/').at(-1) ?? '';
  if (!roleName) throw new Error('The EC2 node role ARN is invalid.');
  const result = await aws(account, region, ['iam', 'list-attached-role-policies', '--role-name', roleName], 'iam:ListAttachedRolePolicies');
  const policies = Array.isArray(result['AttachedPolicies']) ? result['AttachedPolicies'].map(object) : [];
  const names = policies.map(policy => text(policy['PolicyName']));
  const attached = names.includes('AmazonEKSWorkerNodePolicy');
  const hasCustomPolicy = policies.some(policy => !text(policy['PolicyArn']).startsWith('arn:aws:iam::aws:policy/'));
  return { attached, minimalOnly: !attached && !hasCustomPolicy && names.includes('AmazonEKSWorkerNodeMinimalPolicy') };
}

export async function inspectEksWorkerRole(account: EksAccount, region: string, roleArn: string): Promise<{
  workerNodePolicyAttached: boolean;
  issues: NonNullable<EksProvision['workerGroupIssues']>;
}> {
  const status = await workerRolePolicyStatus(account, region, roleArn);
  return {
    workerNodePolicyAttached: status.attached,
    issues: status.minimalOnly ? [{ code: 'MissingWorkerNodePolicy',
      message: 'The configured node role has AmazonEKSWorkerNodeMinimalPolicy but lacks EC2 describe permissions required by standard EKS worker nodes. Attach AmazonEKSWorkerNodePolicy or an equivalent custom policy.',
      resourceIds: [roleArn] }] : [],
  };
}

async function autoscalingIssues(account: EksAccount, region: string, group: Record<string, unknown>): Promise<NonNullable<EksProvision['workerGroupIssues']>> {
  const groups = object(group['resources'])['autoScalingGroups'];
  const names = Array.isArray(groups) ? groups.map(value => text(object(value)['name'])).filter(Boolean) : [];
  const issues: NonNullable<EksProvision['workerGroupIssues']> = [];
  for (const name of names) {
    try {
      const response = await aws(account, region, ['autoscaling', 'describe-scaling-activities',
        '--auto-scaling-group-name', name, '--max-items', '10'], 'autoscaling:DescribeScalingActivities');
      const activities = Array.isArray(response['Activities']) ? response['Activities'].map(object) : [];
      for (const activity of activities.filter(item => item['StatusCode'] === 'Failed').slice(0, 3)) {
        const detail = text(activity['StatusMessage']) || text(activity['Description']) || text(activity['Cause']);
        if (detail) issues.push({ code: /spot|unfulfillablecapacity/i.test(detail) ? 'SpotCapacityUnavailable' : 'AutoScalingLaunchFailure',
          message: detail.slice(0, 500), resourceIds: [name] });
      }
    } catch {
      // Do not hide EKS node group status if optional Auto Scaling diagnostics are unavailable.
    }
  }
  return issues;
}

export async function inspectEksWorkerGroup(account: EksAccount, job: EksProvision): Promise<{
  status: string; issues: EksProvision['workerGroupIssues']; updateId?: string; workerNodePolicyAttached?: boolean;
} | undefined> {
  const { region, cluster, nodeGroup } = job.settings;
  const group = await describeResource(account, region,
    ['eks', 'describe-nodegroup', '--cluster-name', cluster, '--nodegroup-name', nodeGroup], 'nodegroup', 'eks:DescribeNodegroup');
  if (!group || object(group['tags'])[jobTag] !== job.id) return;
  const issues = workerIssues(group) ?? [];
  let workerNodePolicyAttached: boolean | undefined;
  try {
    const roleDiagnostics = await inspectEksWorkerRole(account, region, text(group['nodeRole']));
    workerNodePolicyAttached = roleDiagnostics.workerNodePolicyAttached;
    issues.push(...roleDiagnostics.issues);
  } catch {
    // EKS and Auto Scaling diagnostics are still returned when IAM list permission is absent.
  }
  issues.push(...await autoscalingIssues(account, region, group));
  return { status: text(group['status']) || 'UNKNOWN', issues,
    updateId: text(object(group['update'])['id']) || undefined, workerNodePolicyAttached };
}

export async function instancePlatform(account: EksAccount, region: string, instanceType: string): Promise<BuildPlatform> {
  const result = await aws(account, region, ['ec2', 'describe-instance-types', '--instance-types', instanceType],
    'ec2:DescribeInstanceTypes');
  const types = result['InstanceTypes'];
  const type = Array.isArray(types) ? object(types[0]) : {};
  const architectures = object(type['ProcessorInfo'])['SupportedArchitectures'];
  if (Array.isArray(architectures)) {
    if (architectures.includes('arm64')) return 'linux/arm64';
    if (architectures.includes('x86_64')) return 'linux/amd64';
  }
  throw new Error('Choose a Linux x86-64 or ARM64 EC2 instance type.');
}

async function describeResource(
  account: EksAccount, region: string, command: string[], resultKey: string, permission: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const resource = (await aws(account, region, command, permission))[resultKey];
    if (!resource) throw new Error('AWS did not return the requested ' + resultKey + '.');
    return object(resource);
  } catch (error) {
    if (error instanceof AwsResourceNotFound) return undefined;
    throw error;
  }
}

function ownResource(resource: Record<string, unknown> | undefined, job: EksProvision, label: string): void {
  if (resource && object(resource['tags'])[jobTag] !== job.id) {
    throw new Error('An AWS ' + label + ' already uses this name. Choose a different name or connect the existing cluster.');
  }
}

async function waitFor(
  read: () => Promise<Record<string, unknown> | undefined>, label: string, job: EksProvision, pending: string[],
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 50 * 60_000;
  while (Date.now() < deadline) {
    const resource = await read();
    if (resource) {
      ownResource(resource, job, label);
      const status = text(resource['status']);
      if (status === 'ACTIVE') return resource;
      if (!pending.includes(status)) {
        const issue = workerIssues(resource)?.[0];
        const detail = issue ? ' (' + issue.code + (issue.message ? ': ' + issue.message : '') + ')' : '';
        throw new Error('AWS ' + label + ' entered ' + (status || 'an unknown state') + detail + '. Check the AWS resource health details.');
      }
    }
    await delay(15_000);
  }
  throw new Error('AWS is still provisioning the ' + label + '. Resume to check its current status.');
}

async function createWorkspaceAccess(account: EksAccount, roles: EksProvisionRoles, connection: EksConnection): Promise<void> {
  const { cluster, region, namespace } = connection;
  const describe = await describeCluster(account, region, cluster);
  await withEksConfig(account, { ...connection, deploymentRoleArn: undefined }, describe, async target => {
    const file = join(dirname(target.kubeconfig), 'namespace.json');
    await writeFile(file, JSON.stringify(workspaceAccessManifest(namespace)), { mode: 0o600 });
    try {
      await kubectl(target, ['apply', '--server-side', '--field-manager=build-center-provisioner', '-f', file],
        'Could not prepare the deployment namespace. Check that Build Center can reach the EKS endpoint and that its provisioning identity can administer the cluster.');
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'Could not prepare the deployment namespace.';
      if (!describe.endpointPublicAccess) {
        throw new Error(cause + ' This cluster has a private-only API endpoint. Run Build Center from its VPC/VPN, or resume setup with this server’s restricted public egress CIDR (for example, a single IPv4 address ending in /32).');
      }
      throw error;
    }
  });
  const access = await describeResource(account, region,
    ['eks', 'describe-access-entry', '--cluster-name', cluster, '--principal-arn', roles.deploymentRoleArn],
    'accessEntry', 'eks:DescribeAccessEntry');
  if (!access) {
    await aws(account, region, ['eks', 'create-access-entry', '--cluster-name', cluster,
      '--principal-arn', roles.deploymentRoleArn, '--type', 'STANDARD', '--kubernetes-groups', deployedGroup,
      '--client-request-token', connection.id.slice(4)], 'eks:CreateAccessEntry');
  } else if (!Array.isArray(access['kubernetesGroups']) || !access['kubernetesGroups'].includes(deployedGroup)) {
    throw new Error('The deployment role already has an access entry without the required Kubernetes group.');
  }
}

export async function runEksProvisioning(
  account: EksAccount, roles: EksProvisionRoles, job: EksProvision, progress: (message: string) => void,
): Promise<EksConnection> {
  const settings = job.settings;
  const { region, cluster, kubernetesVersion, namespace, nodeGroup, subnetIds, publicAccessCidr } = settings;
  const tag = { [jobTag]: job.id };
  const readCluster = () => describeResource(account, region, ['eks', 'describe-cluster', '--name', cluster], 'cluster', 'eks:DescribeCluster');
  const readNodes = () => describeResource(account, region,
    ['eks', 'describe-nodegroup', '--cluster-name', cluster, '--nodegroup-name', nodeGroup], 'nodegroup', 'eks:DescribeNodegroup');
  const readMetrics = () => describeResource(account, region,
    ['eks', 'describe-addon', '--cluster-name', cluster, '--addon-name', 'metrics-server'], 'addon', 'eks:DescribeAddon');

  progress('Validating the AWS account and worker configuration');
  await verifyAwsAccount(account, region);
  const nodeRolePolicy = await workerRolePolicyStatus(account, region, roles.nodeRoleArn);
  if (nodeRolePolicy.minimalOnly) {
    throw new Error('The EC2 node role has AmazonEKSWorkerNodeMinimalPolicy but lacks the EC2 describe permissions needed by standard EKS workers. Attach AmazonEKSWorkerNodePolicy before creating worker nodes.');
  }
  const platform = await instancePlatform(account, region, settings.instanceType);
  const existingCluster = await readCluster();
  ownResource(existingCluster, job, 'cluster');
  if (!existingCluster) {
    const [subnets, versions] = await Promise.all([listSubnets(account, region, subnetIds), supportedVersions(account, region)]);
    if (subnets.length !== subnetIds.length || new Set(subnets.map(item => item.vpc)).size !== 1 ||
        new Set(subnets.map(item => item.zoneId)).size < 2) {
      throw new Error('Select available subnets in one VPC across at least two Availability Zones.');
    }
    if (!versions.includes(kubernetesVersion)) throw new Error('The selected Kubernetes version is outside EKS standard support.');
    progress('Creating the EKS control plane');
    await aws(account, region, ['eks', 'create-cluster', '--cli-input-json', JSON.stringify({
      name: cluster, roleArn: roles.clusterRoleArn, version: kubernetesVersion, tags: tag, clientRequestToken: job.id,
      resourcesVpcConfig: {
        subnetIds, endpointPrivateAccess: true, endpointPublicAccess: Boolean(publicAccessCidr),
        ...(publicAccessCidr ? { publicAccessCidrs: [publicAccessCidr] } : {}),
      },
      accessConfig: { authenticationMode: 'API', bootstrapClusterCreatorAdminPermissions: true },
      upgradePolicy: { supportType: 'STANDARD' },
    })], 'eks:CreateCluster and iam:PassRole');
  }
  progress('Waiting for the EKS control plane');
  let activeCluster = await waitFor(readCluster, 'cluster', job, ['CREATING', 'UPDATING']);
  if (publicAccessCidr) {
    const network = object(activeCluster['resourcesVpcConfig']);
    const allowedCidrs = Array.isArray(network['publicAccessCidrs']) ? network['publicAccessCidrs'] : [];
    if (network['endpointPublicAccess'] !== true || !allowedCidrs.includes(publicAccessCidr)) {
      const publicAccessCidrs = [...new Set([
        ...allowedCidrs.filter((cidr): cidr is string => typeof cidr === 'string'), publicAccessCidr,
      ])];
      progress('Adding the configured CIDR to EKS API endpoint access');
      await aws(account, region, ['eks', 'update-cluster-config', '--name', cluster, '--resources-vpc-config', JSON.stringify({
        endpointPrivateAccess: true, endpointPublicAccess: true, publicAccessCidrs,
      })], 'eks:UpdateClusterConfig');
      progress('Waiting for the EKS API endpoint update');
      activeCluster = await waitFor(readCluster, 'cluster endpoint', job, ['UPDATING']);
    }
  }
  const createdAt = typeof activeCluster['createdAt'] === 'number' ? activeCluster['createdAt'] * 1000 :
    Date.parse(text(activeCluster['createdAt']));
  const connection: EksConnection = {
    id: 'eks-' + job.id, accountId: account.id, cluster, region, namespace, platform,
    arn: text(activeCluster['arn']), createdAt, deploymentRoleArn: roles.deploymentRoleArn,
  };
  if (!Number.isFinite(createdAt) || !connection.arn) throw new Error('AWS did not return a valid cluster identity.');
  const existingNodes = await readNodes();
  ownResource(existingNodes, job, 'node group');
  if (!existingNodes) {
    progress('Creating the EC2 managed node group');
    await aws(account, region, ['eks', 'create-nodegroup', '--cli-input-json', JSON.stringify({
      clusterName: cluster, nodegroupName: nodeGroup, subnets: subnetIds, nodeRole: roles.nodeRoleArn,
      instanceTypes: [settings.instanceType], capacityType: settings.capacityType, diskSize: settings.diskGiB,
      scalingConfig: { minSize: settings.minNodes, desiredSize: settings.desiredNodes, maxSize: settings.maxNodes },
      amiType: platform === 'linux/arm64' ? 'AL2023_ARM_64_STANDARD' : 'AL2023_x86_64_STANDARD',
      tags: tag, clientRequestToken: job.id,
    })], 'eks:CreateNodegroup and iam:PassRole');
  }
  progress('Waiting for EC2 workers');
  await waitFor(readNodes, 'node group', job, ['CREATING', 'UPDATING']);

  // Worker provisioning uses the AWS EKS API and does not need kubectl access.
  // Create workers before preparing Kubernetes namespace access so that a private
  // endpoint/network issue does not prevent the requested EC2 nodes from starting.
  progress('Preparing the namespace and deployment role');
  await createWorkspaceAccess(account, roles, connection);

  const existingMetrics = await readMetrics();
  ownResource(existingMetrics, job, 'Metrics Server add-on');
  if (!existingMetrics) {
    progress('Installing Metrics Server');
    await aws(account, region, ['eks', 'create-addon', '--cli-input-json', JSON.stringify({
      clusterName: cluster, addonName: 'metrics-server', clientRequestToken: job.id, tags: tag,
    })], 'eks:CreateAddon');
  }
  progress('Waiting for Metrics Server');
  await waitFor(readMetrics, 'Metrics Server add-on', job, ['CREATING', 'UPDATING']);
  progress('Verifying app deployment access');
  await withEksConfig(account, connection, await describeCluster(account, region, cluster), checkDeploymentTarget);
  return connection;
}
