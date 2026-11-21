import { DatePipe, KeyValuePipe } from '@angular/common';
import { afterNextRender, Component, DestroyRef, computed, effect, inject, Injector, input, OnChanges, OnInit, signal, SimpleChanges, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EksTargets } from './eks-targets';
import type { BuildRun, DeploymentProfile, DeploymentRelease, DeploymentSettings, DeploymentTarget, EksAccountOption, ImageRegistry, Pipeline } from './models';
import { BuildCenterSession } from './session';

interface DeploymentList {
  targets: DeploymentTarget[];
  releases: DeploymentRelease[];
  accounts: EksAccountOption[];
  profiles: DeploymentProfile[];
  configurationMessage?: string;
}

interface WorkloadDetails {
  workload: {
    name?: string; namespace?: string; createdAt?: string; generation?: number; observedGeneration?: number;
    ready: number; desired: number; updated: number; available: number;
    state?: 'running' | 'stopped' | 'starting'; strategy: string; selector: Record<string, string>;
    labels: Record<string, string>; annotations: Record<string, string>; serviceAccountName: string;
    automountServiceAccountToken: boolean;
    rollingUpdate?: { maxSurge?: string | number; maxUnavailable?: string | number };
    conditions: { type?: string; status?: string; reason?: string; message?: string; lastTransitionTime?: string }[];
    containers: DeploymentContainerDetails[]; pods: DeploymentPodDetails[]; metricsAvailable: boolean;
    loadBalancer?: boolean; endpoint?: string;
  } | null;
  log?: string;
}

interface DeploymentContainerDetails {
  name?: string; image?: string;
  ports?: { name?: string; containerPort?: number; protocol?: string }[];
  resources?: { requests?: { cpu?: string; memory?: string }; limits?: { cpu?: string; memory?: string } };
  readinessProbe?: { httpGet?: { path?: string; port?: number | string }; tcpSocket?: { port?: number | string };
    periodSeconds?: number; timeoutSeconds?: number; failureThreshold?: number };
}

interface DeploymentPodDetails {
  name?: string; phase: string; ready: boolean; reason?: string; message?: string; nodeName?: string;
  hostIP?: string; podIP?: string; serviceAccountName?: string; restartPolicy?: string; qosClass?: string;
  labels: Record<string, string>; annotations: Record<string, string>; createdAt?: string; startedAt?: string;
  restartCount: number;
  conditions: { type?: string; status?: string; reason?: string; message?: string; lastTransitionTime?: string }[];
  containers: (DeploymentContainerDetails & { ready: boolean; restartCount: number; state: string; stateSince?: string;
    metrics?: { cpu: string; memory: string } })[];
}

interface WorkerNode {
  name: string; ready: boolean; architecture: string; instanceType: string; zone: string; nodeGroup: string; cpu: string; memory: string;
}

const sensitiveEnvironmentName = /(?:^|_)(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIALS?)(?:_|$)/i;

@Component({
  selector: 'app-deployments',
  imports: [DatePipe, KeyValuePipe, FormsModule, EksTargets],
  templateUrl: './deployments.html',
  styleUrls: ['./build-center.css', './deployments.css'],
})
export class Deployments implements OnInit, OnChanges {
  readonly images = input.required<BuildRun[]>();
  readonly pipelines = input.required<Pipeline[]>();
  readonly initialRunId = input('');
  readonly initialTargetId = input('');
  private readonly session = inject(BuildCenterSession);
  private readonly injector = inject(Injector);
  private readonly clusterTargets = viewChild(EksTargets);
  protected readonly data = signal<DeploymentList>({ targets: [], releases: [], accounts: [], profiles: [] });
  protected readonly targetId = signal('');
  protected readonly pipelineId = signal('');
  protected readonly pipelineOptions = computed(() => this.pipelines());
  protected readonly pipelineImages = computed(() => this.images()
    .filter(item => item.pipelineId === this.pipelineId() && item.status === 'succeeded' && item.artifact)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)));
  protected readonly target = computed(() => this.data().targets.find(item => item.id === this.targetId()));
  protected readonly registryOptions = computed<ImageRegistry[]>(() => {
    const target = this.target();
    return target?.registries ?? (target ? ['configured'] : []);
  });
  protected readonly selectedId = signal('');
  protected readonly selected = computed(() => this.data().releases.find(item => item.id === this.selectedId()));
  protected readonly workload = signal<WorkloadDetails | null>(null);
  protected readonly nodes = signal<WorkerNode[]>([]);
  protected readonly compatibleNodes = computed(() => {
    const architecture = this.target()?.platform.split('/')[1];
    return this.nodes().filter(node => node.ready && node.architecture === architecture);
  });
  protected readonly nodesLoading = signal(false);
  protected readonly nodesError = signal('');
  protected readonly dockerfileEnv = signal<string[] | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly formOpen = signal(false);
  protected runId = '';
  protected envContent = '';
  protected app = '';
  protected publicSubdomain = '';
  protected publicCustomHostname = '';
  protected publicTlsCertificateArn = '';
  protected port = 8080;
  protected cpuMillicores = 250;
  protected memoryMiB = 512;
  protected readinessPath = '';
  protected configMap = '';
  protected secret = '';
  protected serviceAccount = '';
  protected nodeName = '';
  protected registry: ImageRegistry | '' = '';
  protected exposure: 'private' | 'hostname' | 'load-balancer' = 'private';
  protected mode: 'fixed' | 'auto' = 'auto';
  protected replicas = 1;
  protected min = 1;
  protected max = 3;
  protected cpuPercent = 70;
  private refreshPending = false;
  private dataVersion = 0;

  constructor() {
    effect(() => {
      const candidates = this.images().filter(item => item.status === 'succeeded' && item.artifact);
      if (this.pipelineId() || !candidates.length) return;
      const latest = candidates.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
      this.pipelineId.set(latest.pipelineId);
      this.selectImage(latest.id);
    });
    const poll = setInterval(() => {
      if (this.data().releases.some(release => release.status === 'running')) void this.refresh();
    }, 1_000);
    inject(DestroyRef).onDestroy(() => clearInterval(poll));
  }

  ngOnInit(): void {
    this.targetId.set(this.initialTargetId());
    const initialRun = this.images().find(item => item.id === this.initialRunId());
    const pipelineId = initialRun?.pipelineId ?? this.images()
      .slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0]?.pipelineId ?? '';
    this.pipelineId.set(pipelineId);
    this.selectImage(initialRun?.id ?? this.latestImageFor(pipelineId)?.id ?? '');
    this.formOpen.set(Boolean(this.initialRunId() || this.initialTargetId()));
    void this.refresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const requestedId = this.initialRunId();
    const requestedRun = requestedId ? this.images().find(item => item.id === requestedId) : undefined;
    if (requestedRun && this.runId !== requestedRun.id) {
      this.pipelineId.set(requestedRun.pipelineId);
      this.selectImage(requestedRun.id);
      return;
    }
    if (!changes['images'] || this.pipelineId() || !this.images().length) return;
    const latest = this.images().slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    this.pipelineId.set(latest.pipelineId);
    this.selectImage(this.latestImageFor(latest.pipelineId)?.id ?? '');
  }

  openForm(): void {
    if (!this.data().targets.length) {
      this.clusterTargets()?.open();
      return;
    }
    if (!this.pipelineId()) {
      const latest = this.images().filter(item => item.status === 'succeeded' && item.artifact)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
      if (latest) {
        this.pipelineId.set(latest.pipelineId);
        this.selectImage(this.latestImageFor(latest.pipelineId)?.id ?? '');
      }
    }
    this.formOpen.set(true);
    void this.loadNodes();
    afterNextRender(() => document.getElementById('release-pipeline')?.focus(), { injector: this.injector });
  }

  protected configureProfile(profile: DeploymentProfile): void {
    this.pipelineId.set(profile.pipelineId);
    this.targetId.set(profile.targetId);
    const latest = this.latestImageFor(profile.pipelineId);
    const prior = this.data().releases.find(release => release.pipelineId === profile.pipelineId &&
      release.targetId === profile.targetId);
    this.selectImage(latest?.id ?? prior?.runId ?? '');
    this.formOpen.set(true);
    void this.loadNodes(profile.targetId);
    afterNextRender(() => document.getElementById('release-pipeline')?.focus(), { injector: this.injector });
  }

  protected async deployProfile(profile: DeploymentProfile): Promise<void> {
    const run = this.latestImageFor(profile.pipelineId);
    const target = this.data().targets.find(item => item.id === profile.targetId);
    if (!run || !target) {
      this.displayError(new Error(!run ? 'This pipeline has no successful image to deploy yet.' : 'The saved cluster target is unavailable.'));
      return;
    }
    this.targetId.set(profile.targetId);
    this.pipelineId.set(profile.pipelineId);
    this.selectImage(run.id);
    this.loadSettings(profile.settings, run.dockerfileEnv ?? []);
    this.envContent = profile.envContent ?? this.envContent;
    const parsed = this.parseEnvironment();
    if (!parsed) return;
    const missingSecrets = Object.entries(parsed.secretValues).filter(([, value]) => !value).map(([name]) => name);
    if (missingSecrets.length) {
      this.formOpen.set(true);
      this.notice.set(`Add values for ${missingSecrets.join(', ')} in the environment editor, save the configuration, then deploy.`);
      void this.loadNodes(profile.targetId);
      afterNextRender(() => document.getElementById('envContent')?.focus(), { injector: this.injector });
      return;
    }
    await this.act(async () => {
      const release = await this.session.request<DeploymentRelease>('/deployments', 'POST', {
        targetId: profile.targetId, pipelineId: profile.pipelineId, runId: run.id,
        settings: profile.settings, envContent: this.envContent,
      });
      this.track(release);
      this.formOpen.set(false);
    });
  }

  protected profileRelease(profile: DeploymentProfile): DeploymentRelease | undefined {
    const releases = this.data().releases.filter(release => release.targetId === profile.targetId &&
      release.pipelineId === profile.pipelineId && release.settings.app === profile.settings.app)
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
    return releases.find(release => release.status === 'running') ?? releases.find(release => release.status === 'succeeded');
  }

  protected canControlRelease(release: DeploymentRelease): boolean {
    const latestSucceeded = this.data().releases.filter(item => item.targetId === release.targetId &&
      item.pipelineId === release.pipelineId && item.namespace === release.namespace &&
      item.settings.app === release.settings.app && item.status === 'succeeded')
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))[0];
    return latestSucceeded?.id === release.id;
  }

  protected async stopProfile(profile: DeploymentProfile): Promise<void> {
    const release = this.profileRelease(profile);
    if (release) await this.setPodState(release, false);
  }

  protected async startProfile(profile: DeploymentProfile): Promise<void> {
    const release = this.profileRelease(profile);
    if (release) await this.setPodState(release, true);
  }

  protected async stopRelease(release: DeploymentRelease): Promise<void> {
    await this.setPodState(release, false);
  }

  protected async startRelease(release: DeploymentRelease): Promise<void> {
    await this.setPodState(release, true);
  }

  private async setPodState(release: DeploymentRelease, running: boolean): Promise<void> {
    await this.act(async () => {
      const updated = await this.session.request<DeploymentRelease>(
        `/deployments/${release.id}/${running ? 'start' : 'stop'}`, 'POST');
      this.data.update(data => ({
        ...data,
        profiles: data.profiles.map(profile => profile.targetId === release.targetId &&
          profile.pipelineId === release.pipelineId && profile.settings.app === release.settings.app ?
            { ...profile, workloadState: updated.workloadState } : profile),
        releases: data.releases.map(item => item.id === updated.id ? updated : item),
      }));
      this.selectedId.set(updated.id);
      const details = await this.session.request<WorkloadDetails>(`/deployments/${updated.id}/workload`);
      this.workload.set(details);
      this.syncWorkloadState(updated, details);
    });
  }

  protected selectPipeline(id: string): void {
    this.pipelineId.set(id);
    const latest = this.latestImageFor(id);
    this.selectImage(latest?.id ?? '');
  }

  protected latestImageFor(pipelineId: string): BuildRun | undefined {
    return this.images().filter(item => item.pipelineId === pipelineId && item.status === 'succeeded' && item.artifact)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  }

  protected pipelineName(id: string): string {
    return this.pipelineOptions().find(pipeline => pipeline.id === id)?.name ?? id;
  }

  protected targetName(id: string): string {
    return this.data().targets.find(target => target.id === id)?.name ?? id;
  }

  protected targetNamespace(id: string): string {
    return this.data().targets.find(target => target.id === id)?.namespace ?? '';
  }

  protected selectorText(selector: Record<string, string>): string {
    return Object.entries(selector).map(([key, value]) => `${key}=${value}`).join(', ');
  }

  protected hasMetadata(metadata: Record<string, string>): boolean {
    return Object.keys(metadata).length > 0;
  }

  protected selectImage(runId: string): void {
    const run = this.images().find(item => item.id === runId && item.pipelineId === this.pipelineId() &&
      item.status === 'succeeded' && item.artifact);
    this.runId = run?.id ?? '';
    if (!run) {
      this.dockerfileEnv.set(null);
      this.envContent = '';
      this.updateTargetOptions();
      return;
    }
    const scannedEnvironment = run.dockerfileEnv ?? [];
    this.dockerfileEnv.set(run.dockerfileEnv ?? null);
    const saved = this.data().profiles.find(item => item.pipelineId === run.pipelineId && item.targetId === this.targetId());
    const previous = this.data().releases.find(item =>
      item.pipelineId === run.pipelineId && item.targetId === this.targetId() && item.status === 'succeeded');
    this.loadSettings(saved?.settings ?? previous?.settings ?? {
      app: run.imageName.split('/').at(-1) ?? '',
      port: 8080,
      cpuMillicores: 250,
      memoryMiB: 512,
      publicHostname: false,
      scaling: { mode: 'auto', min: 1, max: 3, cpuPercent: 70 },
    }, scannedEnvironment);
    this.envContent = saved?.envContent ?? this.defaultEnvironment(run, scannedEnvironment,
      saved?.settings ?? previous?.settings);
  }

  private defaultEnvironment(run: BuildRun, scanned: string[], settings?: DeploymentSettings): string {
    if (/professy-backend/i.test(run.imageName)) {
      return [
        'DB_URL=jdbc:mysql://greatley-poshley.cynui8840ddn.us-east-1.rds.amazonaws.com:3306/professy?sslMode=VERIFY_IDENTITY',
        'DB_USERNAME=admin', 'DB_PASSWORD=', 'JWT_SECRET=', 'KAFKA_BOOTSTRAP_SERVERS=',
        'APP_EVENTS_TRANSPORT=sqs',
      ].join('\n');
    }
    const stored = Object.entries(settings?.runtimeEnv ?? {}).map(([name, value]) => `${name}=${value}`);
    const secretNames = (settings?.secretNames ?? []).map(name => `${name}=`);
    const values = [...stored, ...secretNames];
    if (values.length) return values.join('\n');
    return [...new Set(scanned)].map(name => `${name}=`).join('\n');
  }

  protected selectTarget(id: string): void {
    this.targetId.set(id);
    this.notice.set('');
    this.selectImage(this.runId);
    void this.loadNodes(id);
  }

  protected onTargetConnected(target: DeploymentTarget): void {
    this.dataVersion++;
    this.data.update(data => ({ ...data, targets: [...data.targets.filter(item => item.id !== target.id), target] }));
    this.selectTarget(target.id);
    this.openForm();
  }

  protected async loadNodes(targetId = this.targetId()): Promise<void> {
    const target = this.data().targets.find(item => item.id === targetId);
    if (!target?.eks) {
      this.nodes.set([]);
      this.nodesError.set('');
      this.nodeName = '';
      return;
    }
    this.nodesLoading.set(true);
    this.nodesError.set('');
    try {
      const result = await this.session.request<{ nodes: WorkerNode[] }>(`/deployments/targets/${encodeURIComponent(targetId)}/nodes`);
      if (targetId !== this.targetId()) return;
      this.nodes.set(result.nodes);
      if (this.nodeName && !result.nodes.some(node => node.name === this.nodeName && node.ready)) {
        this.nodeName = '';
        this.notice.set('The previously selected worker node is no longer Ready. Choose another node or use automatic scheduling.');
      }
    } catch (error) {
      if (targetId === this.targetId()) this.nodesError.set(error instanceof Error ? error.message : 'Could not load worker nodes.');
    } finally {
      if (targetId === this.targetId()) this.nodesLoading.set(false);
    }
  }

  protected async refresh(): Promise<void> {
    if (this.refreshPending) return;
    this.refreshPending = true;
    const version = this.dataVersion;
    try {
      const data = await this.session.request<DeploymentList>('/deployments');
      if (version !== this.dataVersion) return;
      const previousStatus = this.selected()?.status;
      this.data.set(data);
      if (!this.target() && (this.targetId() || data.targets.length === 1)) {
        this.selectTarget(data.targets.length === 1 ? data.targets[0].id : '');
      } else if (this.loading()) {
        this.selectImage(this.runId);
        if (this.target()) void this.loadNodes(this.targetId());
      } else {
        this.updateTargetOptions();
      }
      const release = this.selected();
      if (previousStatus === 'running' && release?.status === 'succeeded' && !this.busy()) {
        void this.inspect(release);
      }
    } catch (error) {
      this.displayError(error);
    } finally {
      this.loading.set(false);
      this.refreshPending = false;
    }
  }

  protected async submit(deploy = true): Promise<void> {
    const target = this.target();
    if (!target || !this.runId || !this.registry) return;
    const parsed = this.parseEnvironment();
    if (!parsed) return;
    const missingSecrets = Object.entries(parsed.secretValues).filter(([, value]) => !value).map(([name]) => name);
    if (deploy && missingSecrets.length) {
      this.displayError(new Error(`Enter values for required sensitive .env variables: ${missingSecrets.join(', ')}.`));
      return;
    }
    const secretNames = Object.keys(parsed.secretValues);
    if (secretNames.length && !this.secret) this.secret = `${this.app.slice(0, 58)}-env`;
    const settings: DeploymentSettings = {
      app: this.app, port: this.port, cpuMillicores: this.cpuMillicores, memoryMiB: this.memoryMiB,
      readinessPath: this.readinessPath || undefined, configMap: this.configMap || undefined, secret: this.secret || undefined,
      serviceAccount: this.serviceAccount || undefined,
      nodeName: this.nodeName || undefined,
      runtimeEnv: Object.keys(parsed.values).length ? parsed.values : undefined,
      secretNames: secretNames.length ? secretNames : undefined,
      publicHostname: this.exposure === 'hostname',
      publicSubdomain: this.exposure === 'hostname' ? this.publicSubdomain.trim() : undefined,
      publicLoadBalancer: this.exposure === 'load-balancer',
      publicCustomHostname: this.exposure === 'load-balancer' ? this.publicCustomHostname.trim().toLowerCase() || undefined : undefined,
      publicTlsCertificateArn: this.exposure === 'load-balancer' ? this.publicTlsCertificateArn.trim() || undefined : undefined,
      imageRegistry: this.registry,
      scaling: this.mode === 'fixed' ? { mode: 'fixed', replicas: this.replicas } :
        { mode: 'auto', min: this.min, max: this.max, cpuPercent: this.cpuPercent },
    };
    await this.act(async () => {
      const body = { targetId: target.id, pipelineId: this.pipelineId(), runId: this.runId, settings,
        envContent: this.envContent };
      if (deploy) {
        const release = await this.session.request<DeploymentRelease>('/deployments', 'POST', body);
        this.track(release);
        this.rememberProfile({ targetId: target.id, pipelineId: release.pipelineId, settings: release.settings, envContent: this.envContent });
        this.formOpen.set(false);
      } else {
        const profile = await this.session.request<DeploymentProfile>('/deployments/profiles', 'PUT', body);
        this.rememberProfile(profile);
        this.notice.set('Saved settings for ' + profile.settings.app + ' on ' + target.name + '.');
        this.formOpen.set(false);
      }
    });
  }

  protected async inspect(release: DeploymentRelease, logs = false): Promise<void> {
    if (this.selectedId() !== release.id) this.workload.set(null);
    this.selectedId.set(release.id);
    await this.act(async () => {
      const result = await this.session.request<WorkloadDetails>(
        `/deployments/${release.id}/workload${logs ? '?logs=true' : ''}`);
      if (this.selectedId() === release.id) {
        this.workload.set(result);
        this.syncWorkloadState(release, result);
      }
    });
  }

  private syncWorkloadState(release: DeploymentRelease, details: WorkloadDetails): void {
    const state = details.workload?.state;
    if (state !== 'running' && state !== 'stopped') return;
    this.data.update(data => ({
      ...data,
      profiles: data.profiles.map(profile => profile.targetId === release.targetId &&
        profile.pipelineId === release.pipelineId && profile.settings.app === release.settings.app ?
          { ...profile, workloadState: state } : profile),
      releases: data.releases.map(item => item.id === release.id ? { ...item, workloadState: state } : item),
    }));
  }

  protected async rollback(release: DeploymentRelease): Promise<void> {
    await this.act(async () => {
      this.track(await this.session.request<DeploymentRelease>(`/deployments/${release.id}/rollback`, 'POST'));
    });
  }

  protected edit(release: DeploymentRelease): void {
    this.selectTarget(release.targetId);
    this.runId = release.runId;
    const run = this.images().find(item => item.id === release.runId);
    this.pipelineId.set(release.pipelineId);
    const scannedEnvironment = run?.dockerfileEnv ?? [];
    this.dockerfileEnv.set(run?.dockerfileEnv ?? null);
    this.loadSettings(release.settings, scannedEnvironment);
    const profile = this.data().profiles.find(item => item.targetId === release.targetId && item.pipelineId === release.pipelineId);
    this.envContent = profile?.envContent ?? this.defaultEnvironment(run ?? { imageName: release.settings.app } as BuildRun,
      scannedEnvironment, release.settings);
    this.openForm();
  }

  private loadSettings(settings: DeploymentSettings, scannedEnvironment: string[] = []): void {
    this.app = settings.app;
    this.publicSubdomain = settings.publicSubdomain ?? settings.app;
    this.publicCustomHostname = settings.publicCustomHostname ?? '';
    this.publicTlsCertificateArn = settings.publicTlsCertificateArn ?? '';
    this.port = settings.port;
    this.cpuMillicores = settings.cpuMillicores;
    this.memoryMiB = settings.memoryMiB;
    this.readinessPath = settings.readinessPath ?? '';
    this.configMap = settings.configMap ?? '';
    this.secret = settings.secret ?? '';
    this.serviceAccount = settings.serviceAccount ?? '';
    this.nodeName = settings.nodeName ?? '';
    this.registry = settings.imageRegistry ?? '';
    this.exposure = settings.publicLoadBalancer ? 'load-balancer' : settings.publicHostname ? 'hostname' : 'private';
    this.mode = settings.scaling.mode;
    this.replicas = settings.scaling.mode === 'fixed' ? settings.scaling.replicas : 1;
    this.min = settings.scaling.mode === 'auto' ? settings.scaling.min : 1;
    this.max = settings.scaling.mode === 'auto' ? settings.scaling.max : 3;
    this.cpuPercent = settings.scaling.mode === 'auto' ? settings.scaling.cpuPercent : 70;
    this.updateTargetOptions();
  }

  private parseEnvironment(): { values: Record<string, string>; secretValues: Record<string, string> } | undefined {
    const values: Record<string, string> = {};
    const secretValues: Record<string, string> = {};
    const lines = this.envContent.split(/\r?\n/);
    for (const [index, sourceLine] of lines.entries()) {
      const line = sourceLine.trimEnd();
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (!match) {
        this.displayError(new Error(`Invalid .env syntax on line ${index + 1}. Use KEY=value, one variable per line.`));
        return;
      }
      const [, name, value] = match;
      if (Object.hasOwn(values, name) || Object.hasOwn(secretValues, name) || value.includes('\0')) {
        this.displayError(new Error(`The .env variable ${name} is duplicated or contains an invalid value.`));
        return;
      }
      const unquoted = value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) ? value.slice(1, -1) : value;
      (sensitiveEnvironmentName.test(name) ? secretValues : values)[name] = unquoted;
    }
    return { values, secretValues };
  }

  private updateTargetOptions(): void {
    const registries = this.registryOptions();
    if (!this.registry || !registries.includes(this.registry)) this.registry = registries[0] ?? '';
    if ((this.exposure === 'hostname' && !this.target()?.domain) ||
      (this.exposure === 'load-balancer' && !this.target()?.eks)) this.exposure = 'private';
  }

  private track(release: DeploymentRelease): void {
    this.dataVersion++;
    this.data.update(data => ({ ...data, releases: [release, ...data.releases] }));
    this.selectedId.set(release.id);
    this.workload.set(null);
  }

  private rememberProfile(profile: DeploymentProfile): void {
    this.dataVersion++;
    this.data.update(data => ({ ...data, profiles: [
      ...data.profiles.filter(item => item.targetId !== profile.targetId || item.pipelineId !== profile.pipelineId), profile,
    ] }));
  }

  private async act(action: () => Promise<void>): Promise<void> {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try { await action(); } catch (error) { this.displayError(error); } finally { this.busy.set(false); }
  }

  private displayError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'The deployment request failed.');
  }
}
