import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Router } from 'express';
import { readWorkspace, updateWorkspace } from './build-store';
import { object, text } from './deployment-config';
import { inspectEksWorkerGroup, inspectEksWorkerRole, provisionOptions, provisionSettings, requestEksWorkerGroup, runEksProvisioning } from './eks-provision';
import { aws, describeCluster, eksAccounts, verifyAwsAccount } from './eks';
import type { EksAccount, EksProvisionRoles } from './eks';
import type { EksProvision } from './models';

const active = new Set<string>();

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The EKS setup request failed.';
}

function startJob(orgId: string, account: EksAccount, roles: EksProvisionRoles, job: EksProvision): void {
  active.add(job.id);
  function update(changes: Partial<EksProvision>): void {
    updateWorkspace(orgId, state => {
      const record = state.eksProvisions.find(item => item.id === job.id);
      if (record) Object.assign(record, changes);
    });
  }
  void (async () => {
    try {
      const target = await runEksProvisioning(account, roles, job, progress => update({ message: progress }));
      updateWorkspace(orgId, state => {
        const record = state.eksProvisions.find(item => item.id === job.id);
        if (record) {
          const index = state.eksConnections.findIndex(item => item.arn === target.arn &&
            item.createdAt === target.createdAt && item.namespace === target.namespace);
          if (index === -1) state.eksConnections.push(target);
          else {
            // Preserve existing releases and settings when a target already points to this namespace.
            target.id = state.eksConnections[index].id;
            state.eksConnections[index] = target;
          }
          Object.assign(record, { status: 'ready', message: 'Ready for app deployments', targetId: target.id });
        }
      });
    } catch (error) {
      update({ status: 'failed', message: message(error) });
    } finally {
      active.delete(job.id);
    }
  })().catch(() => console.error('Could not update the EKS provisioning record', job.id));
}

export function registerEksProvisioning(api: Router): void {
  api.get('/deployments/eks/provision', async (_request, response) => {
    const orgId = response.locals['orgId'] as string;
    const jobs: EksProvision[] = readWorkspace(orgId).eksProvisions.map(job =>
      job.status === 'running' && !active.has(job.id)
        ? { ...job, status: 'paused' as const, message: 'Build Center restarted. Resume to continue checking AWS.' } : job);
    try {
      const configuredAccounts = eksAccounts(orgId);
      const accounts = configuredAccounts.map(({ id, name, regions, namespaces, provisioning, credentialRef }) =>
        ({ id, name, regions, namespaces, provisioning: Boolean(provisioning), hasCredentials: Boolean(credentialRef) }));
      const detailedJobs = await Promise.all(jobs.map(async job => {
        if (job.status !== 'failed' && job.status !== 'paused') return job;
        const account = configuredAccounts.find(item => item.id === job.settings.accountId);
        if (!account?.provisioning) return job;
        try {
          const workerGroup = await inspectEksWorkerGroup(account, job);
          if (workerGroup) return { ...job, workerGroupStatus: workerGroup.status,
            workerGroupUpdateId: workerGroup.updateId, workerGroupIssues: workerGroup.issues,
            workerNodePolicyAttached: workerGroup.workerNodePolicyAttached };
          const role = await inspectEksWorkerRole(account, job.settings.region, account.provisioning.nodeRoleArn);
          return { ...job, workerGroupStatus: undefined, workerGroupUpdateId: undefined,
            workerGroupIssues: role.issues, workerNodePolicyAttached: role.workerNodePolicyAttached };
        } catch {
          return job;
        }
      }));
      response.json({ accounts, jobs: detailedJobs });
    } catch (error) {
      response.json({ accounts: [], jobs, configurationMessage: message(error) });
    }
  });

  api.get('/deployments/eks/provision/options', async (request, response) => {
    try {
      const account = eksAccounts(response.locals['orgId']).find(item => item.id === request.query['accountId']);
      const region = request.query['region'];
      if (!account?.provisioning || typeof region !== 'string' || !account.regions.includes(region)) {
        response.status(400).json({ message: 'Choose an AWS account enabled for provisioning and an approved region.' });
        return;
      }
      response.json(await provisionOptions(account, region));
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.post('/deployments/eks/provision', (request, response) => {
    const orgId = response.locals['orgId'] as string;
    try {
      const data = object(request.body);
      const account = eksAccounts(orgId).find(item => item.id === data['accountId']);
      if (!account?.provisioning) {
        response.status(400).json({ message: 'Choose an AWS account enabled for EKS provisioning.' });
        return;
      }
      const settings = provisionSettings(data, account);
      const job: EksProvision = { id: randomUUID(), settings, status: 'running', message: 'Starting EKS setup',
        requestedAt: new Date().toISOString() };
      updateWorkspace(orgId, state => {
        if (state.eksProvisions.some(item => item.settings.accountId === settings.accountId &&
            item.settings.region === settings.region && item.settings.cluster === settings.cluster)) {
          throw new Error('There is already a setup record for this cluster. Open it below to check or resume setup.');
        }
        state.eksProvisions.unshift(job);
      });
      startJob(orgId, account, account.provisioning, job);
      response.status(202).json(job);
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.post('/deployments/eks/provision/:id/resume', (request, response) => {
    const orgId = response.locals['orgId'] as string;
    const job = readWorkspace(orgId).eksProvisions.find(item => item.id === request.params.id);
    if (!job) { response.sendStatus(404); return; }
    if (job.status === 'ready' || active.has(job.id)) {
      response.status(409).json({ message: 'This setup is already running or ready.' });
      return;
    }
    try {
      const account = eksAccounts(orgId).find(item => item.id === job.settings.accountId);
      if (!account?.provisioning) throw new Error('The AWS account is no longer enabled for EKS provisioning.');
      const requestedCidr = text(object(request.body)['publicAccessCidr']);
      if (requestedCidr) {
        const [address, prefix] = requestedCidr.split('/');
        if (!/^\d{1,2}$/.test(prefix ?? '') || Number(prefix) < 1 || Number(prefix) > 32 ||
            isIP(address) !== 4 || requestedCidr !== address + '/' + prefix) {
          throw new Error('Enter a restricted IPv4 CIDR such as 203.0.113.10/32.');
        }
      }
      const settings = { ...job.settings, ...(requestedCidr ? { publicAccessCidr: requestedCidr } : {}) };
      provisionSettings(settings, account);
      const resumed: EksProvision = { ...job, settings, status: 'running', message: 'Checking existing AWS resources' };
      updateWorkspace(orgId, state => {
        const index = state.eksProvisions.findIndex(item => item.id === job.id);
        state.eksProvisions[index] = resumed;
      });
      startJob(orgId, account, account.provisioning, resumed);
      response.status(202).json(resumed);
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.post('/deployments/eks/provision/:id/workers', async (request, response) => {
    const orgId = response.locals['orgId'] as string;
    const job = readWorkspace(orgId).eksProvisions.find(item => item.id === request.params.id);
    if (!job) { response.sendStatus(404); return; }
    try {
      const account = eksAccounts(orgId).find(item => item.id === job.settings.accountId);
      if (!account?.provisioning) throw new Error('The AWS account is no longer enabled for EKS provisioning.');
      const requestedCapacity = request.body?.capacityType;
      if (requestedCapacity !== undefined && requestedCapacity !== 'ON_DEMAND' && requestedCapacity !== 'SPOT') {
        throw new Error('Choose On-Demand or Spot worker capacity.');
      }
      const workerGroup = await requestEksWorkerGroup(account, account.provisioning, job, requestedCapacity);
      updateWorkspace(orgId, state => {
        const record = state.eksProvisions.find(item => item.id === job.id);
        if (record) Object.assign(record, {
          ...(workerGroup.created && requestedCapacity ? { settings: { ...record.settings, capacityType: requestedCapacity } } : {}),
          workerGroupStatus: workerGroup.status,
          workerGroupUpdateId: workerGroup.updateId,
          workerGroupIssues: workerGroup.issues,
          workerNodePolicyAttached: workerGroup.workerNodePolicyAttached,
        });
      });
      response.status(202).json(workerGroup);
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.post('/deployments/eks/provision/:id/node-role-policy', async (request, response) => {
    const orgId = response.locals['orgId'] as string;
    const job = readWorkspace(orgId).eksProvisions.find(item => item.id === request.params.id);
    if (!job) { response.sendStatus(404); return; }
    try {
      const account = eksAccounts(orgId).find(item => item.id === job.settings.accountId);
      const nodeRoleArn = account?.provisioning?.nodeRoleArn;
      if (!account || !nodeRoleArn) throw new Error('The EC2 node role is no longer configured for this AWS account.');
      const region = job.settings.region;
      await verifyAwsAccount(account, region);
      const nodeGroup = await aws(account, region, ['iam', 'list-attached-role-policies', '--role-name', nodeRoleArn.split('/').at(-1) ?? ''],
        'iam:ListAttachedRolePolicies');
      const policies = Array.isArray(nodeGroup['AttachedPolicies']) ? nodeGroup['AttachedPolicies'].map(object) : [];
      const policyArn = 'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy';
      if (!policies.some(item => text(item['PolicyArn']) === policyArn)) {
        await aws(account, region, ['iam', 'attach-role-policy', '--role-name', nodeRoleArn.split('/').at(-1) ?? '', '--policy-arn', policyArn],
          'iam:AttachRolePolicy');
      }
      response.status(202).json({ policy: 'AmazonEKSWorkerNodePolicy', attached: true });
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.post('/deployments/eks/provision/:id/workers/delete', async (request, response) => {
    const orgId = response.locals['orgId'] as string;
    const job = readWorkspace(orgId).eksProvisions.find(item => item.id === request.params.id);
    if (!job) { response.sendStatus(404); return; }
    try {
      const account = eksAccounts(orgId).find(item => item.id === job.settings.accountId);
      if (!account?.provisioning) throw new Error('The AWS account is no longer enabled for EKS provisioning.');
      await verifyAwsAccount(account, job.settings.region);
      const cluster = await describeCluster(account, job.settings.region, job.settings.cluster);
      const existing = await aws(account, job.settings.region, ['eks', 'describe-nodegroup', '--cluster-name', job.settings.cluster,
        '--nodegroup-name', job.settings.nodeGroup], 'eks:DescribeNodegroup');
      const group = object(existing['nodegroup']);
      if (object(group['tags'])['greatley-poshley-build-center-job'] !== job.id) {
        throw new Error('The EKS node group is not owned by this Build Center setup job.');
      }
      if (text(group['status']) !== 'CREATE_FAILED') {
        throw new Error('Only a CREATE_FAILED node group can be removed here. Refresh status before retrying.');
      }
      if (text(cluster.arn).split(':')[4] !== account.awsAccountId) {
        throw new Error('The EKS node group does not match the configured AWS account.');
      }
      const deletion = await aws(account, job.settings.region, ['eks', 'delete-nodegroup', '--cluster-name', job.settings.cluster,
        '--nodegroup-name', job.settings.nodeGroup], 'eks:DeleteNodegroup');
      const responseGroup = object(deletion['nodegroup']);
      updateWorkspace(orgId, state => {
        const record = state.eksProvisions.find(item => item.id === job.id);
        if (record) Object.assign(record, { workerGroupStatus: text(responseGroup['status']) || 'DELETING', workerGroupIssues: [] });
      });
      response.status(202).json({ name: job.settings.nodeGroup, status: text(responseGroup['status']) || 'DELETING' });
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });
}
