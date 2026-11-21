import { randomUUID } from 'node:crypto';
import type { RequestHandler, Router } from 'express';
import { registerAwsProviderSetup } from './aws-provider-api';
import { registerAwsResources } from './aws-resources-api';
import { readWorkspace, updateWorkspace } from './build-store';
import { deploymentSettings, deploymentTargets, object, parseDeploymentEnvironment, text } from './deployment-config';
import { readDeploymentEnvironment, saveDeploymentEnvironment } from './aws-credentials';
import type { ClusterTarget } from './deployment-config';
import { describeCluster, eksAccounts, eksTarget, listEksClusters, prepareEksConnection, withDeploymentTarget, withEksConfig } from './eks';
import type { ResolvableTarget } from './eks';
import { registerEksProvisioning } from './eks-provision-api';
import { checkDeploymentTarget, deploymentDetails, deploymentLogs, deployRelease, kubectl, setDeploymentPods } from './deployment-runner';
import type { BuildRun, DeploymentProfile, DeploymentRelease, DeploymentSettings, DeploymentTarget, EksAccountOption, ImageRegistry } from './models';

const active = new Map<string, string>();

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The deployment request failed.';
}

function stagePercent(stage: string, current: number): number {
  const normalized = stage.toLowerCase();
  const steps: [string, number][] = [
    ['checking the target workload', 3],
    ['checking the archive and publishing', 8],
    ['preparing the amazon ecr repository', 20],
    ['publishing the image', 38],
    ['validating kubernetes resources', 58],
    ['applying kubernetes resources', 72],
    ['waiting for ready replicas', 90],
    ['rollout complete', 100],
    ['pods are ready', 100],
  ];
  const match = steps.find(([label]) => normalized.includes(label));
  return match ? Math.max(current, match[1]) : current;
}

function viewOf(target: ResolvableTarget): DeploymentTarget {
  const { id, name, namespace, platform, domain, ingressClass, eks } = target;
  return { id, name, namespace, platform, domain, ingressClass, eks, registries: availableRegistries(target) };
}

function availableRegistries(target: ResolvableTarget): ImageRegistry[] {
  const registries: ImageRegistry[] = [];
  if ('connection' in target) registries.push('ecr');
  if ('account' in target ? target.account.registry : target.registry) registries.push('configured');
  return registries;
}

function findTarget(orgId: string, id: unknown): ResolvableTarget | undefined {
  const connection = readWorkspace(orgId).eksConnections.find(item => item.id === id);
  if (connection) return eksTarget(connection, eksAccounts(orgId));
  return deploymentTargets(orgId).find(target => target.id === id);
}

function findRelease(orgId: string, id: unknown): DeploymentRelease | undefined {
  return readWorkspace(orgId).releases.find(release => release.id === id);
}

function saveProfile(profiles: DeploymentProfile[], profile: DeploymentProfile): void {
  const index = profiles.findIndex(item => item.targetId === profile.targetId && item.pipelineId === profile.pipelineId);
  if (index === -1) profiles.push(profile);
  else profiles[index] = profile;
}

function findImage(orgId: string, runId: unknown): BuildRun | undefined {
  return readWorkspace(orgId).runs.find(item => item.id === runId && item.status === 'succeeded' && item.artifact);
}

async function targetNodes(target: ResolvableTarget) {
  const readNodes = async (resolved: ClusterTarget) => {
    const raw = await kubectl(resolved, ['get', 'nodes', '-o', 'json'],
      'Could not load EKS worker nodes. Check the cluster endpoint and Kubernetes node-list permission.');
    const items = object(JSON.parse(raw))['items'];
    if (!Array.isArray(items)) throw new Error('Kubernetes did not return a node list.');
    return items.map(object).map(node => {
      const metadata = object(node['metadata']);
      const labels = object(metadata['labels']);
      const status = object(node['status']);
      const conditions = Array.isArray(status['conditions']) ? status['conditions'].map(object) : [];
      const ready = conditions.some(condition => condition['type'] === 'Ready' && condition['status'] === 'True');
      const capacity = object(status['capacity']);
      const allocatable = object(status['allocatable']);
      return {
        name: text(metadata['name']), ready,
        architecture: text(labels['kubernetes.io/arch']),
        instanceType: text(labels['node.kubernetes.io/instance-type']),
        zone: text(labels['topology.kubernetes.io/zone']),
        nodeGroup: text(labels['eks.amazonaws.com/nodegroup']),
        cpu: text(allocatable['cpu']) || text(capacity['cpu']),
        memory: text(allocatable['memory']) || text(capacity['memory']),
      };
    }).filter(node => node.name);
  };
  if ('connection' in target) {
    const { account, connection } = target;
    const cluster = await describeCluster(account, connection.region, connection.cluster);
    if (cluster.arn !== connection.arn || cluster.createdAt !== connection.createdAt) {
      throw new Error('The saved EKS cluster was replaced. Reconnect the cluster before selecting a worker node.');
    }
    return withEksConfig(account, connection, cluster, readNodes);
  }
  return withDeploymentTarget(target, readNodes);
}

function startRelease(orgId: string, target: ResolvableTarget, settings: DeploymentSettings,
                      source: { run: BuildRun } | { previous: DeploymentRelease },
                      secretEnv: Record<string, string> = {}): DeploymentRelease | undefined {
  const identity = 'connection' in target ? [target.connection.arn, target.connection.createdAt] : [target.kubeconfig, target.context];
  const key = JSON.stringify([...identity, target.namespace, settings.app]);
  if (active.has(key)) return;
  const run = 'run' in source ? source.run : undefined;
  const previous = 'previous' in source ? source.previous : undefined;
  const build = 'run' in source ? source.run : source.previous;
  const release: DeploymentRelease = {
    id: randomUUID(), targetId: target.id, targetName: target.name, namespace: target.namespace,
    settings, runId: 'run' in source ? source.run.id : source.previous.runId, pipelineId: build.pipelineId,
    requestedAt: new Date().toISOString(), status: 'running', workloadState: 'running', message: 'Checking the target workload',
    version: build.version,
    progressPercent: 3,
    progress: [{ at: new Date().toISOString(), message: 'Checking the target workload', percent: 3 }],
    hostname: settings.publicCustomHostname ?? (settings.publicHostname ? `${settings.publicSubdomain ?? settings.app}.${target.domain}` : undefined),
    image: previous?.image, rollbackOf: previous?.id,
  };
  updateWorkspace(orgId, state => {
    state.releases.unshift(release);
    saveProfile(state.deploymentProfiles, { targetId: target.id, pipelineId: build.pipelineId, settings, workloadState: 'running' });
  });
  active.set(key, release.id);

  function update(changes: Partial<DeploymentRelease>): void {
    updateWorkspace(orgId, state => {
      const record = state.releases.find(item => item.id === release.id);
      if (!record) return;
      const percent = changes.progressPercent ?? (changes.status === 'succeeded' ? 100 :
        stagePercent(changes.message ?? '', record.progressPercent ?? 0));
      if (typeof changes.message === 'string' && changes.message !== record.message) {
        record.progress = [...(record.progress ?? []), { at: new Date().toISOString(), message: changes.message, percent }].slice(-100);
      }
      Object.assign(record, changes, { progressPercent: percent });
    });
  }
  void (async () => {
    try {
      await withDeploymentTarget(target, resolved =>
        deployRelease(orgId, resolved, release, run, (stage, image, progressPercent) => update({ message: stage,
          ...(progressPercent === undefined ? {} : { progressPercent }), ...(image ? { image } : {}) }), secretEnv));
      update({ status: 'succeeded',
        message: settings.publicLoadBalancer ? 'Pods are ready. AWS assigns the public endpoint separately.' : 'Rollout complete',
        finishedAt: new Date().toISOString() });
    } catch (error) {
      update({ status: 'failed', message: message(error), finishedAt: new Date().toISOString() });
    } finally {
      active.delete(key);
    }
  })().catch(() => console.error('Could not save Build Center release', release.id));
  return release;
}

export function registerDeployments(api: Router): void {
  api.use('/deployments', (_request, response, next) => {
    if (response.locals['isAdmin'] === true) next();
    else response.status(403).json({ message: 'Only workspace administrators can manage deployments.' });
  });
  registerEksProvisioning(api);
  registerAwsProviderSetup(api);
  registerAwsResources(api);

  api.get('/deployments', (_request, response) => {
    const orgId = response.locals['orgId'] as string;
    const state = readWorkspace(orgId);
    const targets: DeploymentTarget[] = [];
    const accounts: EksAccountOption[] = [];
    const configurationMessages: string[] = [];
    try {
      const approved = eksAccounts(orgId);
      accounts.push(...approved.map(({ id, name, regions, namespaces, provisioning, credentialRef }) =>
        ({ id, name, regions, namespaces, provisioning: Boolean(provisioning), hasCredentials: Boolean(credentialRef) })));
      for (const connection of state.eksConnections) {
        const target = eksTarget(connection, approved);
        if (target) targets.push(viewOf(target));
      }
    } catch (error) {
      configurationMessages.push(message(error));
    }
    try {
      targets.push(...deploymentTargets(orgId).map(viewOf).filter(target => !targets.some(item => item.id === target.id)));
    } catch (error) {
      configurationMessages.push(message(error));
    }
    const activeIds = new Set(active.values());
    const profiles = state.deploymentProfiles.map(profile => ({ ...profile,
      workloadState: profile.workloadState ?? state.releases
        .filter(release => release.targetId === profile.targetId && release.pipelineId === profile.pipelineId &&
          release.settings.app === profile.settings.app && release.status === 'succeeded')
        .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))[0]?.workloadState ??
          (state.releases.some(release => release.targetId === profile.targetId && release.pipelineId === profile.pipelineId &&
            release.settings.app === profile.settings.app && release.status === 'succeeded') ? 'running' : undefined),
      envContent: readDeploymentEnvironment(orgId, profile.targetId, profile.pipelineId) ??
        [...Object.entries(profile.settings.runtimeEnv ?? {}).map(([name, value]) => `${name}=${value}`),
          ...(profile.settings.secretNames ?? []).map(name => `${name}=`)].join('\n'),
    }));
    const releases = state.releases.map(release => {
      const profile = profiles.find(item => item.targetId === release.targetId && item.pipelineId === release.pipelineId &&
        item.settings.app === release.settings.app);
      return {
        ...release,
        workloadState: release.workloadState ?? profile?.workloadState ?? (release.status === 'succeeded' ? 'running' : undefined),
        ...(release.status === 'running' && !activeIds.has(release.id) ?
          { status: 'failed' as const, message: 'The deployment runner restarted. Check the workload before retrying.' } : {}),
      };
    });
    response.json({ targets, releases, accounts, profiles, configurationMessage: configurationMessages.join(' ') });
  });

  api.get('/deployments/eks/accounts/:id/clusters', async (request, response) => {
    try {
      const account = eksAccounts(response.locals['orgId']).find(item => item.id === request.params.id);
      if (!account) { response.sendStatus(404); return; }
      const region = request.query['region'];
      if (typeof region !== 'string' || !account.regions.includes(region)) {
        response.status(400).json({ message: 'Choose an approved AWS region.' });
        return;
      }
      response.json({ clusters: await listEksClusters(account, region) });
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.post('/deployments/eks/connect', async (request, response) => {
    const orgId = response.locals['orgId'] as string;
    try {
      const accounts = eksAccounts(orgId);
      const connection = await prepareEksConnection(request.body, accounts, 'eks-' + randomUUID(), checkDeploymentTarget);
      const saved = updateWorkspace(orgId, workspace => {
        const existing = workspace.eksConnections.find(item =>
          item.arn === connection.arn && item.createdAt === connection.createdAt && item.namespace === connection.namespace);
        if (existing) {
          if (existing.accountId !== connection.accountId || existing.platform !== connection.platform) {
            throw new Error('That namespace already has an EKS target with a different account connection or platform.');
          }
          return existing;
        }
        workspace.eksConnections.push(connection);
        return connection;
      });
      response.status(saved === connection ? 201 : 200).json(viewOf(eksTarget(saved, accounts)!));
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.get('/deployments/targets/:id/nodes', async (request, response) => {
    try {
      const target = findTarget(response.locals['orgId'], request.params.id);
      if (!target) { response.sendStatus(404); return; }
      response.json({ nodes: await targetNodes(target) });
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.post('/deployments/targets/:id/check', async (request, response) => {
    try {
      const target = findTarget(response.locals['orgId'], request.params.id);
      if (!target) { response.sendStatus(404); return; }
      await withDeploymentTarget(target, checkDeploymentTarget);
      response.sendStatus(204);
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  function saveOrDeploy(doDeploy: boolean): RequestHandler {
    return async (request, response) => {
      const orgId = response.locals['orgId'] as string;
      let envContent: string;
      let parsedEnvironment: ReturnType<typeof parseDeploymentEnvironment>;
      try {
        envContent = request.body?.envContent;
        parsedEnvironment = parseDeploymentEnvironment(envContent);
      } catch (error) {
        response.status(400).json({ message: message(error) });
        return;
      }
      const settings = deploymentSettings(request.body?.settings);
      if (!settings) {
        response.status(400).json({ message: 'Check the app name, subdomain, image node placement, nonsecret runtime environment values, container port, resource requests, and scaling settings. Send passwords, tokens, and keys as Kubernetes Secret values.' });
        return;
      }
      const run = findImage(orgId, request.body?.runId);
      if (!run) { response.status(404).json({ message: 'Select a successful build with an image archive.' }); return; }
      if (request.body?.pipelineId !== run.pipelineId) {
        response.status(400).json({ message: 'The selected image does not belong to the selected pipeline. Refresh the pipeline build list and choose one of its images.' });
        return;
      }
      settings.runtimeEnv = Object.keys(parsedEnvironment.values).length ? parsedEnvironment.values : undefined;
      settings.secretNames = Object.keys(parsedEnvironment.secretValues).length ? Object.keys(parsedEnvironment.secretValues) : undefined;
      const secretEnv = parsedEnvironment.secretValues;
      try {
        const expectedSecrets = new Set(settings.secretNames ?? []);
        const missingSecrets = [...expectedSecrets].filter(name => !secretEnv[name]);
        if (doDeploy && missingSecrets.length) {
          response.status(400).json({ message: `Enter values for required sensitive .env variables: ${missingSecrets.join(', ')}.` });
          return;
        }
        const target = findTarget(orgId, request.body?.targetId);
        if (!target) { response.sendStatus(404); return; }
        if (expectedSecrets.size && !settings.secret) {
          response.status(400).json({ message: 'Enter a Kubernetes Secret name for the sensitive environment values.' });
          return;
        }
        if (settings.nodeName) {
          const node = (await targetNodes(target)).find(item => item.name === settings.nodeName);
          if (!node) {
            response.status(409).json({ message: 'The selected worker node is no longer in this cluster. Refresh the node list and choose a ready node.' });
            return;
          }
          if (!node.ready) {
            response.status(409).json({ message: 'The selected worker node is not Ready. Choose a Ready node or use automatic scheduling.' });
            return;
          }
          if (node.architecture !== target.platform.split('/')[1]) {
            response.status(409).json({ message: 'The selected worker node architecture does not match the built image. Choose a compatible Ready node.' });
            return;
          }
        }
        if (settings.publicHostname && (!target.domain || !target.ingressClass)) {
          response.status(400).json({ message: 'Custom subdomains require a configured base domain and active IngressClass on this EKS cluster.' });
          return;
        }
        if (settings.publicLoadBalancer && !('connection' in target)) {
          response.status(400).json({ message: 'An AWS load balancer requires an AWS-connected EKS target.' });
          return;
        }
        const registries = availableRegistries(target);
        // Requests from older clients used the configured registry whenever available.
        const imageRegistry = settings.imageRegistry ?? (registries.includes('configured') ? 'configured' : 'ecr');
        if (!registries.includes(imageRegistry)) {
          response.status(400).json({ message: 'Select an image registry supported by the cluster target.' });
          return;
        }
        settings.imageRegistry = imageRegistry;
        const savedProfile = readWorkspace(orgId).deploymentProfiles.find(item =>
          item.targetId === target.id && item.pipelineId === run.pipelineId);
        const profile: DeploymentProfile = { targetId: target.id, pipelineId: run.pipelineId, settings,
          workloadState: doDeploy ? 'running' : savedProfile?.workloadState ?? 'running' };
        saveDeploymentEnvironment(orgId, target.id, run.pipelineId, envContent);
        updateWorkspace(orgId, state => saveProfile(state.deploymentProfiles, profile));
        if (!doDeploy) { response.json({ ...profile, envContent }); return; }
        const release = startRelease(orgId, target, settings, { run }, secretEnv);
        if (!release) { response.status(409).json({ message: 'A rollout is already running for this app.' }); return; }
        response.status(202).json(release);
      } catch (error) {
        response.status(409).json({ message: message(error) });
      }
    };
  }

  api.put('/deployments/profiles', saveOrDeploy(false));
  api.post('/deployments', saveOrDeploy(true));

  function controlPods(running: boolean): RequestHandler {
    return async (request, response) => {
      const orgId = response.locals['orgId'] as string;
      const release = findRelease(orgId, request.params['id']);
      if (!release || release.status !== 'succeeded' || !release.image) {
        response.status(409).json({ message: 'Only a successful deployment can be started or stopped.' });
        return;
      }
      const latestSuccessful = readWorkspace(orgId).releases
        .filter(item => item.targetId === release.targetId && item.pipelineId === release.pipelineId &&
          item.namespace === release.namespace && item.settings.app === release.settings.app && item.status === 'succeeded')
        .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))[0];
      if (latestSuccessful?.id !== release.id) {
        response.status(409).json({ message: 'Start or stop controls are available only for the latest successful release.' });
        return;
      }
      const target = findTarget(orgId, release.targetId);
      if (!target || target.namespace !== release.namespace) {
        response.status(409).json({ message: 'The original deployment target is unavailable.' });
        return;
      }
      const anotherRollout = readWorkspace(orgId).releases.some(item => item.id !== release.id &&
        item.status === 'running' && item.targetId === release.targetId && item.namespace === release.namespace &&
        item.settings.app === release.settings.app);
      if (anotherRollout) {
        response.status(409).json({ message: 'A deployment rollout is already running for this application.' });
        return;
      }
      const workloadState = running ? 'running' : 'stopped';
      try {
        await withDeploymentTarget(target, resolved => setDeploymentPods(resolved, release, running));
        const updated = updateWorkspace(orgId, state => {
          const current = state.releases.find(item => item.id === release.id);
          if (!current) return undefined;
          current.workloadState = workloadState;
          const profile = state.deploymentProfiles.find(item => item.targetId === release.targetId &&
            item.pipelineId === release.pipelineId && item.settings.app === release.settings.app);
          if (profile) profile.workloadState = workloadState;
          return current;
        });
        if (!updated) { response.sendStatus(404); return; }
        response.json(updated);
      } catch (error) {
        response.status(409).json({ message: message(error) });
      }
    };
  }

  api.post('/deployments/:id/stop', controlPods(false));
  api.post('/deployments/:id/start', controlPods(true));

  api.post('/deployments/:id/rollback', (request, response) => {
    const orgId = response.locals['orgId'] as string;
    const previous = findRelease(orgId, request.params.id);
    if (!previous?.image || previous.status !== 'succeeded') { response.sendStatus(404); return; }
    try {
      const target = findTarget(orgId, previous.targetId);
      if (!target || target.namespace !== previous.namespace ||
          (previous.settings.publicHostname && previous.hostname !== `${previous.settings.publicSubdomain ?? previous.settings.app}.${target.domain}`)) {
        response.status(409).json({ message: 'The original deployment target is unavailable or has changed.' });
        return;
      }
      const release = startRelease(orgId, target, previous.settings, { previous });
      if (!release) { response.status(409).json({ message: 'A rollout is already running for this app.' }); return; }
      response.status(202).json(release);
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });

  api.get('/deployments/:id/workload', async (request, response) => {
    const orgId = response.locals['orgId'] as string;
    const release = findRelease(orgId, request.params.id);
    if (!release) { response.sendStatus(404); return; }
    try {
      const target = findTarget(orgId, release.targetId);
      if (!target || target.namespace !== release.namespace) {
        response.status(409).json({ message: 'The original deployment target is unavailable.' });
        return;
      }
      const details = await withDeploymentTarget(target, async resolved => {
        const workload = await deploymentDetails(resolved, release);
        const log = request.query['logs'] === 'true' && workload ? await deploymentLogs(resolved, release) : undefined;
        return { workload, log };
      });
      response.json(details);
    } catch (error) {
      response.status(409).json({ message: message(error) });
    }
  });
}
