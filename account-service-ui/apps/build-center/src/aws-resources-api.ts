import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Router } from 'express';
import { object, text } from './deployment-config';
import { describeCluster, eksAccounts, aws, eksTarget, verifyAwsAccount, withDeploymentTarget, withEksConfig } from './eks';
import type { EksAccount } from './eks';
import { readWorkspace } from './build-store';
import { kubectl } from './deployment-runner';
import { deployedGroup, instancePlatform, workspaceAccessManifest } from './eks-provision';

async function accountFor(orgId: string, input: unknown, regionInput: unknown): Promise<{ account: EksAccount; region: string }> {
  const accountId = text(input);
  const region = text(regionInput);
  const account = eksAccounts(orgId).find(item => item.id === accountId);
  if (!account || !account.regions.includes(region)) throw new Error('Choose a connected AWS account and an approved region.');
  await verifyAwsAccount(account, region);
  return { account, region };
}

function arr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function asTime(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function instanceRecords(result: Record<string, unknown>) {
  return arr(result['Reservations']).flatMap(reservation => arr(reservation['Instances'])).map(instance => {
    const tags = Object.fromEntries(arr(instance['Tags']).map(tag => [text(tag['Key']), text(tag['Value'])]));
    const state = text(object(instance['State'])['Name']);
    const autoScalingGroup = tags['aws:autoscaling:groupName'] || tags['aws:autoscaling:group-name'];
    const eksCluster = tags['eks:cluster-name'] || tags['aws:eks:cluster-name'] ||
      Object.keys(tags).find(key => key.startsWith('kubernetes.io/cluster/'))?.slice('kubernetes.io/cluster/'.length);
    const managed = Boolean(autoScalingGroup || eksCluster || tags['eks:nodegroup-name']);
    return {
      id: text(instance['InstanceId']), name: tags['Name'] || text(instance['InstanceId']),
      type: text(instance['InstanceType']), state, launchTime: asTime(instance['LaunchTime']),
      availabilityZone: text(object(instance['Placement'])['AvailabilityZone']),
      privateIp: text(instance['PrivateIpAddress']), publicIp: text(instance['PublicIpAddress']),
      cpuAverage: undefined as number | undefined,
      networkInBytes: undefined as number | undefined, networkOutBytes: undefined as number | undefined,
      diskReadBytes: undefined as number | undefined, diskWriteBytes: undefined as number | undefined,
      systemStatus: undefined as string | undefined, instanceStatus: undefined as string | undefined,
      managedBy: eksCluster ? 'EKS node' : autoScalingGroup ? 'Auto Scaling group' : undefined,
      nodeGroup: tags['eks:nodegroup-name'], eksCluster, autoScalingGroup,
      eligibleForStartStop: !managed && (state === 'running' || state === 'stopped'),
    };
  }).filter(instance => /^i-[0-9a-f]{8,17}$/.test(instance.id));
}

async function ec2Inventory(account: EksAccount, region: string) {
  const response = await aws(account, region, ['ec2', 'describe-instances', '--filters',
    'Name=instance-state-name,Values=pending,running,shutting-down,stopping,stopped'], 'ec2:DescribeInstances');
  const instances = instanceRecords(response);
  const running = instances.filter(item => item.state === 'running').slice(0, 100);
  if (running.length) {
    const now = Date.now();
    const definitions = [
      ['cpu', 'CPUUtilization', 'Average'], ['netin', 'NetworkIn', 'Sum'], ['netout', 'NetworkOut', 'Sum'],
      ['diskread', 'DiskReadBytes', 'Sum'], ['diskwrite', 'DiskWriteBytes', 'Sum'],
    ] as const;
    const queries = running.flatMap((instance, index) => definitions.map(([prefix, metric, stat]) => ({
      Id: `${prefix}${index}`,
      Label: `${instance.id} ${metric}`,
      MetricStat: { Metric: { Namespace: 'AWS/EC2', MetricName: metric, Dimensions: [{ Name: 'InstanceId', Value: instance.id }] },
        Period: 300, Stat: stat },
      ReturnData: true,
    })));
    try {
      const metrics = await aws(account, region, ['cloudwatch', 'get-metric-data', '--start-time',
        new Date(now - 60 * 60_000).toISOString(), '--end-time', new Date(now).toISOString(),
        '--metric-data-queries', JSON.stringify(queries)], 'cloudwatch:GetMetricData');
      const byQuery = new Map(arr(metrics['MetricDataResults']).map(item => [text(item['Id']), item]));
      running.forEach((instance, index) => {
        for (const [prefix, field] of [['cpu', 'cpuAverage'], ['netin', 'networkInBytes'], ['netout', 'networkOutBytes'],
          ['diskread', 'diskReadBytes'], ['diskwrite', 'diskWriteBytes']] as const) {
          const values = byQuery.get(`${prefix}${index}`)?.['Values'];
          if (Array.isArray(values) && values.length) {
            const value = prefix === 'cpu' ? values.reduce((sum, entry) => sum + Number(entry || 0), 0) / values.length :
              values.reduce((sum, entry) => sum + Number(entry || 0), 0);
            instance[field] = Math.round(value * (prefix === 'cpu' ? 10 : 1)) / (prefix === 'cpu' ? 10 : 1);
          }
        }
      });
    } catch {
      // Inventory remains useful when CloudWatch:GetMetricData has not been granted.
    }
    try {
      const status = await aws(account, region, ['ec2', 'describe-instance-status', '--include-all-instances', '--instance-ids',
        ...running.map(instance => instance.id)], 'ec2:DescribeInstanceStatus');
      const byId = new Map(arr(status['InstanceStatuses']).map(item => [text(item['InstanceId']), item]));
      for (const instance of running) {
        const detail = byId.get(instance.id);
        if (detail) {
          instance.systemStatus = text(object(detail['SystemStatus'])['Status']);
          instance.instanceStatus = text(object(detail['InstanceStatus'])['Status']);
        }
      }
    } catch {
      // EC2 inventory remains available without instance status check permission.
    }
  }
  return instances;
}

function eligibleInstanceIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100 ||
      !input.every(id => typeof id === 'string' && /^i-[0-9a-f]{8,17}$/.test(id))) {
    throw new Error('Select between 1 and 100 valid EC2 instances.');
  }
  return [...new Set(input as string[])];
}

function quantity(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function nodeReady(node: Record<string, unknown>): boolean {
  return arr(object(node['status'])['conditions']).some(condition => condition['type'] === 'Ready' && condition['status'] === 'True');
}

function metricsFailure(error: unknown, resource: 'node' | 'pod'): string {
  const detail = error instanceof Error ? error.message : '';
  if (/forbidden|unauthorized|cannot (?:get|list)/i.test(detail)) {
    const metricsResource = resource === 'node' ? 'nodes' : 'pods';
    return `Metrics Server responded, but EKS denied ${resource} metrics access. The deployment role needs get/list on metrics.k8s.io/${metricsResource}. Set up resource metrics can apply this only with cluster-admin access; otherwise have a cluster administrator apply deploy/build-center/aws-eks-metrics-rbac.yaml. Details: ${detail.slice(0, 240)}`;
  }
  if (/not found|could not find the requested resource|no matches for|404/i.test(detail)) {
    return 'The Kubernetes Metrics API is not installed. Install the EKS Metrics Server add-on, then use Set up resource metrics to grant Build Center read access.';
  }
  if (/service unavailable|no endpoints available|503|timed out/i.test(detail)) {
    return 'The Metrics Server add-on is still starting or cannot reach worker kubelets. Refresh in a minute; if it persists, check node security groups for TCP 10250.';
  }
  return detail || `Could not read ${resource} resource metrics. Check the Metrics Server add-on and Kubernetes metrics permissions.`;
}

async function connectedCluster(orgId: string, targetId: unknown) {
  const connection = readWorkspace(orgId).eksConnections.find(item => item.id === text(targetId));
  if (!connection) throw new Error('Choose a connected EKS cluster.');
  const target = eksTarget(connection, eksAccounts(orgId));
  if (!target) throw new Error('This EKS target is no longer connected to an approved AWS account.');
  const cluster = await describeCluster(target.account, connection.region, connection.cluster);
  if (cluster.arn !== connection.arn || cluster.createdAt !== connection.createdAt) {
    throw new Error('The saved EKS cluster was replaced. Reconnect the current cluster before managing node groups.');
  }
  return { target, cluster };
}

async function clusterSubnets(account: EksAccount, region: string, ids: string[]) {
  if (!ids.length) throw new Error('AWS did not return the cluster subnets.');
  const result = await aws(account, region, ['ec2', 'describe-subnets', '--subnet-ids', ...ids], 'ec2:DescribeSubnets');
  const records = arr(result['Subnets']).map(subnet => {
    const tags = arr(subnet['Tags']);
    const name = tags.find(tag => tag['Key'] === 'Name')?.['Value'];
    return { id: text(subnet['SubnetId']), vpc: text(subnet['VpcId']), zone: text(subnet['AvailabilityZone']),
      zoneId: text(subnet['AvailabilityZoneId']), state: text(subnet['State']), name: text(name) };
  }).filter(subnet => subnet.id && subnet.vpc && subnet.zoneId);
  if (records.length !== ids.length) throw new Error('One or more cluster subnets are no longer available.');
  return records;
}

function wholeNumber(value: unknown, min: number, max = 2_147_483_647): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

async function clusterOverview(orgId: string, targetId: string) {
  const workspace = readWorkspace(orgId);
  const targetConnection = workspace.eksConnections.find(connection => connection.id === targetId);
  if (!targetConnection) throw new Error('Choose a connected EKS cluster.');
  const target = eksTarget(targetConnection, eksAccounts(orgId));
  if (!target) throw new Error('This EKS target is no longer connected to an approved AWS account.');
  return withDeploymentTarget(target, async resolved => {
    const [nodesResult, workloadResult, nodeMetricsResult, podMetricsResult] = await Promise.allSettled([
      kubectl(resolved, ['get', 'nodes', '-o', 'json'], 'Could not read EKS nodes. The connected Kubernetes role needs permission to list nodes.'),
      kubectl(resolved, ['get', 'deployments,pods', '-o', 'json'], 'Could not read deployments and pods in the connected namespace.'),
      kubectl(resolved, ['get', '--raw=/apis/metrics.k8s.io/v1beta1/nodes'], 'Node metrics are unavailable. Check Metrics Server and node metrics permissions.'),
      kubectl(resolved, ['get', '--raw=/apis/metrics.k8s.io/v1beta1/namespaces/' + encodeURIComponent(resolved.namespace) + '/pods'], 'Pod metrics are unavailable. Check Metrics Server and pod metrics permissions.'),
    ]);
    const nodesDoc = nodesResult.status === 'fulfilled' ? object(JSON.parse(nodesResult.value)) : {};
    const workloadsDoc = workloadResult.status === 'fulfilled' ? object(JSON.parse(workloadResult.value)) : {};
    const nodeMetricsDoc = nodeMetricsResult.status === 'fulfilled' ? object(JSON.parse(nodeMetricsResult.value)) : {};
    const podMetricsDoc = podMetricsResult.status === 'fulfilled' ? object(JSON.parse(podMetricsResult.value)) : {};
    const nodeMetrics = new Map(arr(nodeMetricsDoc['items']).map(item => [text(object(item['metadata'])['name']), object(item['usage'])]));
    const nodes = arr(nodesDoc['items']).map(node => {
      const metadata = object(node['metadata']);
      const status = object(node['status']);
      const addresses = arr(status['addresses']);
      const capacity = object(status['capacity']);
      const allocatable = object(status['allocatable']);
      const usage = nodeMetrics.get(text(metadata['name'])) ?? {};
      return {
        name: text(metadata['name']), ready: nodeReady(node),
        instanceType: text(object(metadata['labels'])['node.kubernetes.io/instance-type']),
        zone: text(object(metadata['labels'])['topology.kubernetes.io/zone']),
        internalIp: text(addresses.find(item => item['type'] === 'InternalIP')?.['address']),
        cpuCapacity: quantity(capacity['cpu']), memoryCapacity: quantity(capacity['memory']),
        cpuAllocatable: quantity(allocatable['cpu']), memoryAllocatable: quantity(allocatable['memory']),
        cpuUsage: quantity(usage['cpu']), memoryUsage: quantity(usage['memory']),
      };
    });
    const deployments = arr(workloadsDoc['items']).filter(item => object(item['metadata'])['namespace'] === resolved.namespace &&
      object(item['spec'])['replicas'] !== undefined).map(item => {
        const metadata = object(item['metadata']);
        const spec = object(item['spec']);
        const status = object(item['status']);
        return { name: text(metadata['name']), app: text(object(metadata['labels'])['app.kubernetes.io/name']) || text(metadata['name']),
          desired: Number(spec['replicas'] ?? 0), ready: Number(status['readyReplicas'] ?? 0) };
      });
    const deploymentByLabel = new Map(deployments.map(deployment => [deployment.app, deployment.name]));
    const podUsage = new Map(arr(podMetricsDoc['items']).map(item => [text(object(item['metadata'])['name']), object(item['containers'])]));
    const pods = arr(workloadsDoc['items']).filter(item => object(item['metadata'])['namespace'] === resolved.namespace &&
      Array.isArray(object(item['spec'])['containers'])).map(pod => {
        const metadata = object(pod['metadata']);
        const spec = object(pod['spec']);
        const status = object(pod['status']);
        const labels = object(metadata['labels']);
        const name = text(metadata['name']);
        const serviceLabel = text(labels['app.kubernetes.io/name']) || text(labels['app']);
        const statuses = arr(status['containerStatuses']);
        const containers = podUsage.get(name);
        const containerMetrics = Array.isArray(containers) ? containers.map(object) : [];
        return {
          name, service: deploymentByLabel.get(serviceLabel) || deploymentByLabel.get(name) || serviceLabel || 'Unmapped workload',
          node: text(spec['nodeName']) || 'Pending scheduling', state: text(object(status['phase'])) || 'Unknown',
          podIp: text(status['podIP']), readyContainers: statuses.filter(item => item['ready'] === true).length,
          totalContainers: arr(spec['containers']).length,
          restarts: statuses.reduce((sum, item) => sum + Number(item['restartCount'] ?? 0), 0),
          cpuUsage: containerMetrics.map(item => quantity(object(item['usage'])['cpu'])).filter(Boolean).join(' + ') || undefined,
          memoryUsage: containerMetrics.map(item => quantity(object(item['usage'])['memory'])).filter(Boolean).join(' + ') || undefined,
        };
      });
    const [groupsResult] = await Promise.allSettled([
      aws(target.account, target.connection.region, ['eks', 'list-nodegroups', '--cluster-name', target.connection.cluster], 'eks:ListNodegroups'),
    ]);
    let nodeGroups: Record<string, unknown>[] = [];
    let nodeGroupMessage = '';
    if (groupsResult.status === 'fulfilled') {
      const groups = groupsResult.value['nodegroups'];
      if (Array.isArray(groups)) {
        const descriptions = await Promise.allSettled(groups.filter((name): name is string => typeof name === 'string')
          .map(name => aws(target.account, target.connection.region,
            ['eks', 'describe-nodegroup', '--cluster-name', target.connection.cluster, '--nodegroup-name', name], 'eks:DescribeNodegroup')));
        const failedDescription = descriptions.find(item => item.status === 'rejected');
        nodeGroupMessage = failedDescription?.status === 'rejected'
          ? failedDescription.reason instanceof Error ? failedDescription.reason.message : 'Node group details require eks:DescribeNodegroup.' : '';
        nodeGroups = descriptions.flatMap(item => item.status === 'fulfilled' ? [object(item.value['nodegroup'])] : []).map(group => {
          const scaling = object(group['scalingConfig']);
          return { name: text(group['nodegroupName']), status: text(group['status']), min: Number(scaling['minSize'] ?? 0),
            desired: Number(scaling['desiredSize'] ?? 0), max: Number(scaling['maxSize'] ?? 0) };
        });
      }
    } else nodeGroupMessage = groupsResult.reason instanceof Error ? groupsResult.reason.message : 'Node group details require eks:ListNodegroups.';
    return {
      cluster: resolved.name, namespace: resolved.namespace, nodes, deployments, pods, nodeGroups,
      errors: {
        nodes: nodesResult.status === 'rejected' ? 'Node inventory needs cluster-level Kubernetes permission to list nodes.' : '',
        workloads: workloadResult.status === 'rejected' ? 'The connected namespace role cannot read deployments and pods.' : '',
        nodeMetrics: nodeMetricsResult.status === 'rejected' ? metricsFailure(nodeMetricsResult.reason, 'node') : '',
        podMetrics: podMetricsResult.status === 'rejected' ? metricsFailure(podMetricsResult.reason, 'pod') : '',
        nodeGroups: nodeGroupMessage,
      },
    };
  });
}

export function registerAwsResources(api: Router): void {
  api.get('/deployments/aws/resources/sqs', async (request, response) => {
    try {
      const { account, region } = await accountFor(response.locals['orgId'], request.query['accountId'], request.query['region']);
      const result = await aws(account, region, ['sqs', 'list-queues'], 'sqs:ListQueues');
      const urls = Array.isArray(result['QueueUrls']) ? result['QueueUrls'].filter((url): url is string => typeof url === 'string') : [];
      const queues = await Promise.all(urls.map(async url => {
        const details = await aws(account, region, ['sqs', 'get-queue-attributes', '--queue-url', url,
          '--attribute-names', 'All'], 'sqs:GetQueueAttributes');
        const attrs = object(details['Attributes']);
        const name = url.split('/').at(-1) || url;
        return { name, url, arn: text(attrs['QueueArn']), fifo: attrs['FifoQueue'] === 'true',
          visible: Number(attrs['ApproximateNumberOfMessages'] ?? 0), inFlight: Number(attrs['ApproximateNumberOfMessagesNotVisible'] ?? 0),
          delayed: Number(attrs['ApproximateNumberOfMessagesDelayed'] ?? 0),
          retentionSeconds: Number(attrs['MessageRetentionPeriod'] ?? 0), visibilitySeconds: Number(attrs['VisibilityTimeout'] ?? 0),
          createdAt: asTime(attrs['CreatedTimestamp']), lastModified: asTime(attrs['LastModifiedTimestamp']) };
      }));
      response.json({ queues });
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'Could not load SQS queues.' });
    }
  });

  api.post('/deployments/aws/resources/sqs', async (request, response) => {
    try {
      const { account, region } = await accountFor(response.locals['orgId'], request.body?.accountId, request.body?.region);
      const name = text(request.body?.name);
      const fifo = request.body?.fifo === true;
      if (!/^[A-Za-z0-9_-]{1,75}(?:\.fifo)?$/.test(name) || (fifo && !name.endsWith('.fifo')) || (!fifo && name.endsWith('.fifo'))) {
        response.status(400).json({ message: 'Enter a queue name with letters, numbers, hyphens, or underscores. FIFO queues must end in .fifo.' });
        return;
      }
      const attributes = fifo ? ['--attributes', 'FifoQueue=true,ContentBasedDeduplication=true'] : [];
      const result = await aws(account, region, ['sqs', 'create-queue', '--queue-name', name, ...attributes], 'sqs:CreateQueue');
      response.status(201).json({ url: text(result['QueueUrl']), name });
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'Could not create the SQS queue.' });
    }
  });

  api.get('/deployments/aws/resources/instances', async (request, response) => {
    try {
      const { account, region } = await accountFor(response.locals['orgId'], request.query['accountId'], request.query['region']);
      response.json({ instances: await ec2Inventory(account, region) });
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'Could not load EC2 instances.' });
    }
  });

  api.post('/deployments/aws/resources/instances/action', async (request, response) => {
    try {
      const { account, region } = await accountFor(response.locals['orgId'], request.body?.accountId, request.body?.region);
      const ids = eligibleInstanceIds(request.body?.instanceIds);
      const action = request.body?.action;
      if (action !== 'start' && action !== 'stop') { response.status(400).json({ message: 'Choose Start or Stop.' }); return; }
      const current = instanceRecords(await aws(account, region, ['ec2', 'describe-instances', '--instance-ids', ...ids], 'ec2:DescribeInstances'));
      if (current.length !== ids.length) { response.status(404).json({ message: 'One or more instances were not found in this account and region.' }); return; }
      const blocked = current.filter(instance => !instance.eligibleForStartStop || instance.state !== (action === 'stop' ? 'running' : 'stopped'));
      if (blocked.length) {
        response.status(409).json({ message: 'Action not submitted. Only standalone ' + (action === 'stop' ? 'running' : 'stopped') +
          ' EC2 instances can be changed here. EKS and Auto Scaling instances must be managed through their node group or scaling group.' });
        return;
      }
      const verb = action === 'stop' ? 'stop-instances' : 'start-instances';
      const permission = action === 'stop' ? 'ec2:StopInstances' : 'ec2:StartInstances';
      const result = await aws(account, region, ['ec2', verb, '--instance-ids', ...ids], permission);
      response.json({ action, instances: arr(result['StoppingInstances'] ?? result['StartingInstances']).map(item => ({
        id: text(object(item['InstanceId'])), state: text(object(item['CurrentState'])['Name']),
      })) });
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'Could not change EC2 instance state.' });
    }
  });

  api.get('/deployments/eks/overview', async (request, response) => {
    try {
      const orgId = response.locals['orgId'] as string;
      const targetId = text(request.query['targetId']);
      response.json(await clusterOverview(orgId, targetId));
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'Could not load EKS cluster resources.' });
    }
  });

  api.post('/deployments/eks/metrics/setup', async (request, response) => {
    try {
      const orgId = response.locals['orgId'] as string;
      const { target, cluster } = await connectedCluster(orgId, request.body?.targetId);
      const { account, connection } = target;
      await withEksConfig(account, { ...connection, deploymentRoleArn: undefined }, cluster, async resolved => {
        const directory = await mkdtemp(join(tmpdir(), 'build-center-metrics-rbac-'));
        const file = join(directory, 'metrics-access.json');
        try {
          await writeFile(file, JSON.stringify(workspaceAccessManifest(connection.namespace)), { mode: 0o600 });
          await kubectl(resolved, ['apply', '--server-side', '--field-manager=build-center-provisioner', '-f', file],
            'Could not configure Metrics API access. The connected AWS identity must have cluster-admin access to the EKS Kubernetes API.');
        } finally {
          await rm(directory, { recursive: true, force: true }).catch(() => {});
        }
      });

      await withDeploymentTarget(target, async resolved => {
        const [nodeAccess, podAccess] = await Promise.all([
          kubectl(resolved, ['auth', 'can-i', 'get', 'nodes.metrics.k8s.io'],
            'Could not verify metrics API authorization for the EKS deployment role.'),
          kubectl(resolved, ['auth', 'can-i', 'list', 'pods.metrics.k8s.io'],
            'Could not verify metrics API authorization for the EKS deployment role.'),
        ]);
        if (nodeAccess !== 'yes' || podAccess !== 'yes') {
          throw new Error(`Kubernetes RBAC was applied, but the deployment role still cannot read metrics (nodes: ${nodeAccess}, pods: ${podAccess}). Have an EKS cluster administrator apply deploy/build-center/aws-eks-metrics-rbac.yaml and verify the deployment role is mapped to group greatley-build-center-deployer.`);
        }
        await Promise.all([
          kubectl(resolved, ['get', '--raw=/apis/metrics.k8s.io/v1beta1/nodes'], 'Node metrics API is still unavailable after the RBAC update.'),
          kubectl(resolved, ['get', '--raw=/apis/metrics.k8s.io/v1beta1/namespaces/' + encodeURIComponent(connection.namespace) + '/pods'], 'Pod metrics API is still unavailable after the RBAC update.'),
        ]);
      });

      response.json({ status: 'configured',
        message: `Read-only node and pod metrics access is configured for ${deployedGroup}. Refresh the cluster overview.` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not configure metrics access.';
      const unauthorized = /server has asked(?: for)? the client to provide credentials|unauthorized|no credentials/i.test(detail);
      response.status(409).json({ message: unauthorized
        ? 'The AWS identity available to Build Center is not authenticated as an EKS cluster administrator, so it cannot change cluster RBAC. Using an authorized cluster-admin kubectl context, apply deploy/build-center/aws-eks-metrics-rbac.yaml, then refresh this page. This grants only node metrics and professy namespace pod metrics to Build Center.'
        : detail });
    }
  });

  api.get('/deployments/eks/nodegroups/options', async (request, response) => {
    try {
      const orgId = response.locals['orgId'] as string;
      const { target, cluster } = await connectedCluster(orgId, request.query['targetId']);
      const roleConfigured = Boolean(target.account.provisioning?.nodeRoleArn);
      const subnets = await clusterSubnets(target.account, target.connection.region, cluster.subnetIds);
      response.json({
        cluster: target.name,
        platform: target.platform,
        roleConfigured,
        subnets: subnets.map(({ id, name, zone, zoneId, state }) => ({ id, name, zone, zoneId, state })),
      });
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'Could not load node group options.' });
    }
  });

  api.post('/deployments/eks/nodegroups', async (request, response) => {
    try {
      const orgId = response.locals['orgId'] as string;
      const body = object(request.body);
      const { target, cluster } = await connectedCluster(orgId, body['targetId']);
      const { account, connection } = target;
      const roles = account.provisioning;
      if (!roles?.nodeRoleArn) {
        response.status(409).json({ message: 'Configure an EC2 node role in the AWS provider settings before creating worker nodes.' });
        return;
      }
      if (cluster.status !== 'ACTIVE') {
        response.status(409).json({ message: 'The EKS control plane must be ACTIVE before adding a node group.' });
        return;
      }
      const name = text(body['name']);
      const instanceType = text(body['instanceType']);
      const capacityType = body['capacityType'];
      const diskGiB = body['diskGiB'];
      const minNodes = body['minNodes'];
      const desiredNodes = body['desiredNodes'];
      const maxNodes = body['maxNodes'];
      const requestedSubnets = body['subnetIds'];
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(name) ||
          !/^[a-z0-9][a-z0-9-]{0,30}\.[a-z0-9][a-z0-9-]{0,30}$/.test(instanceType) ||
          (capacityType !== 'ON_DEMAND' && capacityType !== 'SPOT') ||
          !wholeNumber(diskGiB, 1, 16_384) || !wholeNumber(minNodes, 0) ||
          !wholeNumber(desiredNodes, Math.max(1, minNodes)) || !wholeNumber(maxNodes, desiredNodes) ||
          !Array.isArray(requestedSubnets) || requestedSubnets.length < 2 ||
          !requestedSubnets.every(id => typeof id === 'string' && /^subnet-(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(id)) ||
          new Set(requestedSubnets).size !== requestedSubnets.length) {
        response.status(400).json({ message: 'Check the node group name, instance type, capacity, disk, subnet selection, and worker counts.' });
        return;
      }
      const subnetIds = requestedSubnets as string[];
      if (subnetIds.some(id => !cluster.subnetIds.includes(id))) {
        response.status(400).json({ message: 'Select only subnets configured for this EKS cluster.' });
        return;
      }
      const subnets = await clusterSubnets(account, connection.region, subnetIds);
      if (subnets.some(subnet => subnet.state !== 'available') || new Set(subnets.map(subnet => subnet.vpc)).size !== 1 ||
          new Set(subnets.map(subnet => subnet.zoneId)).size < 2) {
        response.status(400).json({ message: 'Select available subnets in one VPC across at least two Availability Zones.' });
        return;
      }
      await verifyAwsAccount(account, connection.region);
      const platform = await instancePlatform(account, connection.region, instanceType);
      if (platform !== connection.platform) {
        response.status(400).json({ message: `Choose an instance type compatible with this cluster's ${connection.platform} deployment images.` });
        return;
      }
      const listed = await aws(account, connection.region, ['eks', 'list-nodegroups', '--cluster-name', connection.cluster], 'eks:ListNodegroups');
      if (Array.isArray(listed['nodegroups']) && listed['nodegroups'].includes(name)) {
        response.status(409).json({ message: 'A node group with this name already exists in the cluster.' });
        return;
      }
      const result = await aws(account, connection.region, ['eks', 'create-nodegroup', '--cli-input-json', JSON.stringify({
        clusterName: connection.cluster,
        nodegroupName: name,
        subnets: subnetIds,
        nodeRole: roles.nodeRoleArn,
        instanceTypes: [instanceType],
        capacityType,
        diskSize: diskGiB,
        scalingConfig: { minSize: minNodes, desiredSize: desiredNodes, maxSize: maxNodes },
        amiType: platform === 'linux/arm64' ? 'AL2023_ARM_64_STANDARD' : 'AL2023_x86_64_STANDARD',
        tags: { 'build-center.greatley-poshley.com/managed': 'true' },
      })], 'eks:CreateNodegroup and iam:PassRole');
      const group = object(result['nodegroup']);
      response.status(202).json({
        name: text(group['nodegroupName']) || name,
        status: text(group['status']) || 'CREATING',
        desiredNodes,
        update: object(result['update']),
      });
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'Could not create the EKS node group.' });
    }
  });

  api.post('/deployments/eks/nodegroups/:name/scaling', async (request, response) => {
    try {
      const orgId = response.locals['orgId'] as string;
      const targetId = text(request.body?.targetId);
      const connection = readWorkspace(orgId).eksConnections.find(item => item.id === targetId);
      if (!connection) { response.sendStatus(404); return; }
      const target = eksTarget(connection, eksAccounts(orgId));
      if (!target) { response.status(409).json({ message: 'Reconnect this EKS cluster before managing workers.' }); return; }
      const groupName = request.params['name'];
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(groupName)) { response.status(400).json({ message: 'Invalid node group.' }); return; }
      const action = request.body?.action;
      if (action !== 'start' && action !== 'stop') { response.status(400).json({ message: 'Choose Start workers or Stop workers.' }); return; }
      const { account } = target;
      const region = connection.region;
      await verifyAwsAccount(account, region);
      const available = await aws(account, region, ['eks', 'list-nodegroups', '--cluster-name', connection.cluster], 'eks:ListNodegroups');
      if (!Array.isArray(available['nodegroups']) || !available['nodegroups'].includes(groupName)) {
        response.status(404).json({ message: 'That EKS node group does not belong to the connected cluster.' }); return;
      }
      const details = await aws(account, region, ['eks', 'describe-nodegroup', '--cluster-name', connection.cluster,
        '--nodegroup-name', groupName], 'eks:DescribeNodegroup');
      const group = object(details['nodegroup']);
      if (group['status'] !== 'ACTIVE') { response.status(409).json({ message: 'Wait for the node group to become ACTIVE before changing its size.' }); return; }
      const scaling = object(group['scalingConfig']);
      const max = Number(scaling['maxSize'] ?? 1);
      const min = action === 'stop' ? 0 : 1;
      const desired = action === 'stop' ? 0 : 1;
      if (action === 'start' && max < 1) { response.status(409).json({ message: 'Increase the node group maximum to at least one before starting workers.' }); return; }
      const updated = await aws(account, region, ['eks', 'update-nodegroup-config', '--cluster-name', connection.cluster,
        '--nodegroup-name', groupName, '--scaling-config', `minSize=${min},maxSize=${max},desiredSize=${desired}`], 'eks:UpdateNodegroupConfig');
      response.status(202).json({ action, nodeGroup: groupName, update: object(updated['update']) });
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'Could not update the EKS node group.' });
    }
  });
}
