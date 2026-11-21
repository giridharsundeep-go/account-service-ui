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
  metadata?: { name?: string; labels?: Record<string, string>; annotations?: Record<string, string>;
    creationTimestamp?: string; generation?: number };
  spec?: {
    replicas?: number;
    type?: string;
    selector?: { matchLabels?: Record<string, string> };
    strategy?: { type?: string; rollingUpdate?: { maxSurge?: string | number; maxUnavailable?: string | number } };
    template?: { spec?: { serviceAccountName?: string; automountServiceAccountToken?: boolean; containers?: {
      name?: string; image?: string; ports?: { name?: string; containerPort?: number; protocol?: string }[];
      resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
      readinessProbe?: { httpGet?: { path?: string; port?: number | string }; tcpSocket?: { port?: number | string };
        periodSeconds?: number; timeoutSeconds?: number; failureThreshold?: number };
    }[] } };
  };
  status?: {
    readyReplicas?: number; updatedReplicas?: number; availableReplicas?: number; observedGeneration?: number;
    conditions?: { type?: string; status?: string; reason?: string; message?: string; lastTransitionTime?: string }[];
    loadBalancer?: { ingress?: { hostname?: string; ip?: string }[] };
  };
};

function safeMetadata(metadata: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata ?? {}).filter(([key]) =>
    !/(?:password|secret|token|credential|private.?key|api.?key)/i.test(key)));
}

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
  const selector = Object.entries(labels(release)).map(([key, value]) => `${key}=${value}`).join(',');
  const [service, podList, metricOutput] = await Promise.all([
    release.settings.publicLoadBalancer ? findOwned(target, release, 'service') : undefined,
    kubectl(target, ['get', 'pods', '--selector', selector, '-o', 'json'],
      'Could not read deployment pods. Check pod list permission for this namespace.'),
    kubectl(target, ['top', 'pods', '--containers', '--no-headers', '--selector', selector],
      'Pod metrics are currently unavailable.').catch(() => ''),
  ]);
  const loadBalancer = service?.spec?.type === 'LoadBalancer';
  const ingress = loadBalancer ? service?.status?.loadBalancer?.ingress?.[0] : undefined;
  const host = ingress?.hostname;
  const ip = ingress?.ip;
  const scheme = release.settings.publicTlsCertificateArn ? 'https' : 'http';
  const endpoint = release.hostname ? `${scheme}://${release.hostname}` : host && /^[a-zA-Z0-9.-]+$/.test(host) ?
    `${scheme}://${host}` : ip && isIP(ip) ? `${scheme}://${isIP(ip) === 6 ? '[' + ip + ']' : ip}` : undefined;
  const ready = deployment.status?.readyReplicas ?? 0;
  const desired = deployment.spec?.replicas ?? 0;
  const specs = deployment.spec?.template?.spec?.containers ?? [];
  const metricRows = new Map<string, { cpu: string; memory: string }>();
  for (const line of metricOutput.split(/\r?\n/)) {
    const [pod, container, cpu, memory] = line.trim().split(/\s+/);
    if (pod && container && cpu && memory) metricRows.set(`${pod}/${container}`, { cpu, memory });
  }
  const podItems = (JSON.parse(podList) as { items?: {
    metadata?: { name?: string; creationTimestamp?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
    spec?: { nodeName?: string; serviceAccountName?: string; restartPolicy?: string; containers?: typeof specs };
    status?: { phase?: string; podIP?: string; startTime?: string;
      hostIP?: string; qosClass?: string; reason?: string; message?: string;
      conditions?: { type?: string; status?: string; reason?: string; message?: string; lastTransitionTime?: string }[];
      containerStatuses?: { name?: string; ready?: boolean; restartCount?: number;
        state?: { waiting?: { reason?: string }; running?: { startedAt?: string };
          terminated?: { reason?: string; exitCode?: number; finishedAt?: string } } }[];
    };
  }[] }).items ?? [];
  const pods = podItems.map(pod => {
    const statuses = new Map((pod.status?.containerStatuses ?? []).map(item => [item.name, item]));
    const containers = (pod.spec?.containers ?? []).map(container => {
      const status = statuses.get(container.name);
      const state = status?.state?.waiting ? `Waiting · ${status.state.waiting.reason ?? 'Pending'}` :
        status?.state?.terminated ? `Terminated · ${status.state.terminated.reason ?? status.state.terminated.exitCode ?? 'Exited'}` :
          status?.state?.running ? 'Running' : status?.ready ? 'Ready' : 'Starting';
      return { name: container.name, image: container.image, ready: status?.ready ?? false,
        restartCount: status?.restartCount ?? 0, state, stateSince: status?.state?.running?.startedAt ??
          status?.state?.terminated?.finishedAt,
        ports: container.ports ?? [], resources: container.resources,
        metrics: pod.metadata?.name && container.name ? metricRows.get(`${pod.metadata.name}/${container.name}`) : undefined };
    });
    const conditions = (pod.status?.conditions ?? []).map(condition => ({ type: condition.type, status: condition.status,
      reason: condition.reason, message: condition.message, lastTransitionTime: condition.lastTransitionTime }));
    return { name: pod.metadata?.name, phase: pod.status?.phase ?? 'Unknown', reason: pod.status?.reason,
      message: pod.status?.message, labels: safeMetadata(pod.metadata?.labels), annotations: safeMetadata(pod.metadata?.annotations),
      ready: conditions.some(condition => condition.type === 'Ready' && condition.status === 'True'),
      nodeName: pod.spec?.nodeName, hostIP: pod.status?.hostIP, podIP: pod.status?.podIP,
      serviceAccountName: pod.spec?.serviceAccountName, restartPolicy: pod.spec?.restartPolicy,
      qosClass: pod.status?.qosClass, createdAt: pod.metadata?.creationTimestamp,
      startedAt: pod.status?.startTime, restartCount: containers.reduce((total, container) => total + container.restartCount, 0),
      conditions, containers };
  });
  return {
    name: deployment.metadata?.name, namespace: target.namespace, createdAt: deployment.metadata?.creationTimestamp,
    generation: deployment.metadata?.generation, observedGeneration: deployment.status?.observedGeneration,
    ready, desired, updated: deployment.status?.updatedReplicas ?? 0, available: deployment.status?.availableReplicas ?? 0,
    state: desired === 0 ? 'stopped' as const : ready >= desired ? 'running' as const : 'starting' as const,
    strategy: deployment.spec?.strategy?.type ?? 'RollingUpdate', selector: deployment.spec?.selector?.matchLabels ?? {},
    labels: safeMetadata(deployment.metadata?.labels), annotations: safeMetadata(deployment.metadata?.annotations),
    serviceAccountName: deployment.spec?.template?.spec?.serviceAccountName || 'default',
    automountServiceAccountToken: deployment.spec?.template?.spec?.automountServiceAccountToken ?? true,
    rollingUpdate: deployment.spec?.strategy?.rollingUpdate,
    conditions: deployment.status?.conditions ?? [], containers: specs, pods,
    metricsAvailable: metricRows.size > 0, loadBalancer, endpoint,
  };
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

function autoscalerManifest(target: ClusterTarget, release: DeploymentRelease): object {
  const { app, scaling } = release.settings;
  if (scaling.mode !== 'auto') throw new Error('CPU autoscaling is not enabled for this deployment.');
  return {
    apiVersion: 'autoscaling/v2', kind: 'HorizontalPodAutoscaler',
    metadata: { name: app, namespace: target.namespace, labels: labels(release) },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: app },
      minReplicas: scaling.min, maxReplicas: scaling.max,
      metrics: [{ type: 'Resource', resource: { name: 'cpu',
        target: { type: 'Utilization', averageUtilization: scaling.cpuPercent } } }],
    },
  };
}

async function applyAutoscaler(target: ClusterTarget, release: DeploymentRelease, dryRun = false): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), 'build-center-hpa-'));
  const file = join(work, 'autoscaler.json');
  try {
    await writeFile(file, JSON.stringify(autoscalerManifest(target, release)));
    const args = ['apply', '--server-side', `--field-manager=${fieldManager}`, '--force-conflicts',
      ...(dryRun ? ['--dry-run=server'] : []), '-f', file];
    await kubectl(target, args, 'Could not configure the CPU autoscaler. Check autoscaling permissions and the EKS API.');
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function setDeploymentPods(target: ClusterTarget, release: DeploymentRelease, running: boolean): Promise<void> {
  const { app, scaling } = release.settings;
  if (!(await findOwned(target, release, 'deployment'))) {
    throw new Error(`The Build Center deployment ${app} was not found in namespace ${target.namespace}.`);
  }
  const autoscaler = await findOwned(target, release, 'hpa');
  if (!running) {
    if (autoscaler) {
      await kubectl(target, ['delete', `hpa/${app}`, '--ignore-not-found'],
        'Could not pause the CPU autoscaler. Check autoscaling delete permission.');
    }
    try {
      await kubectl(target, ['scale', `deployment/${app}`, '--replicas=0'],
        'Could not stop the pods. Check deployment scale permission.');
    } catch (error) {
      if (autoscaler && scaling.mode === 'auto') await applyAutoscaler(target, release).catch(() => {});
      throw error;
    }
    return;
  }

  const desired = scaling.mode === 'auto' ? scaling.min : scaling.replicas;
  if (scaling.mode === 'auto') await applyAutoscaler(target, release, true);
  await kubectl(target, ['scale', `deployment/${app}`, `--replicas=${desired}`],
    'Could not start the pods. Check deployment scale permission.');
  if (scaling.mode === 'auto') {
    try {
      await applyAutoscaler(target, release);
    } catch (error) {
      await kubectl(target, ['scale', `deployment/${app}`, '--replicas=0'],
        'Could not restore the stopped state after autoscaler setup failed.').catch(() => {});
      throw error;
    }
  }
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
        ...(release.settings.publicTlsCertificateArn ? {
          'service.beta.kubernetes.io/aws-load-balancer-backend-protocol': 'http',
          'service.beta.kubernetes.io/aws-load-balancer-ssl-cert': release.settings.publicTlsCertificateArn,
          'service.beta.kubernetes.io/aws-load-balancer-ssl-ports': '443',
        } : {}),
      } } : metadata,
      spec: { type: loadBalancer ? 'LoadBalancer' : 'ClusterIP', selector,
        ports: loadBalancer ? [
          { name: 'http', port: 80, targetPort: 'http' },
          ...(release.settings.publicTlsCertificateArn ? [{ name: 'https', port: 443, targetPort: 'http' }] : []),
        ] : [{ name: 'http', port, targetPort: 'http' }] },
    },
  ] as object[];
  if (scaling.mode === 'auto') {
    resources.push(autoscalerManifest(target, release));
  }
  if (release.hostname && !loadBalancer) {
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
