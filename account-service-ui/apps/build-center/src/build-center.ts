import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { appUrl } from '../../../vendor/suite/index.js';
import { BuildLogViewer } from './build-log-viewer';
import { CloudProviders } from './cloud-providers';
import { Deployments } from './deployments';
import { AwsResources } from './aws-resources';
import { isBuildInProgress, recipeLabels } from './models';
import { BuildCenterSession } from './session';
import type { BuildRecipe, BuildRun, EksAccountOption, Pipeline, PipelineSettings, ProviderStatus, SourceRepository } from './models';

const buildTabs = [
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'builds', label: 'Builds' },
  { id: 'images', label: 'Images' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'resources', label: 'AWS resources' },
] as const;
type BuildTab = typeof buildTabs[number]['id'];
type BuildView = BuildTab | 'settings';
type RunFilter = 'all' | 'active' | 'succeeded' | 'failed' | 'stopped';

interface OpenLog {
  runId: string;
  text: string | null;
  pending: boolean;
  error: string;
}

type ResourceSection = 'queues' | 'instances' | 'cluster';

function initialView(): BuildView {
  const page = new URLSearchParams(window.location.search).get('view');
  return page === 'settings' || page === 'builds' || page === 'images' || page === 'deployments' || page === 'resources' ? page : 'pipelines';
}

function initialResourceSection(): ResourceSection {
  const resource = new URLSearchParams(window.location.search).get('resource');
  return resource === 'ec2' || resource === 'instances' ? 'instances' :
    resource === 'eks' || resource === 'cluster' ? 'cluster' : 'queues';
}

@Component({
  selector: 'app-build-center',
  imports: [CommonModule, FormsModule, BuildLogViewer, CloudProviders, Deployments, AwsResources],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './build-center.html',
  styleUrl: './build-center.css',
})
export class BuildCenter {
  private readonly injector = inject(Injector);
  private readonly deploymentPanel = viewChild(Deployments);
  private readonly resourcePanel = viewChild(AwsResources);
  private runsRequest = 0;
  protected readonly session = inject(BuildCenterSession);
  protected readonly view = signal<BuildView>(initialView());
  protected readonly tabs = buildTabs;
  protected readonly resourceSection = signal<ResourceSection>(initialResourceSection());
  protected readonly pageTitle = computed(() => this.tabs.find(tab => tab.id === this.view())?.label || 'Settings');
  protected readonly navigationPage = computed(() => this.view() === 'resources' ?
    ({ queues: 'sqs', instances: 'ec2', cluster: 'eks' } as const)[this.resourceSection()] : this.view());
  protected readonly createLabel = computed(() => this.view() === 'deployments' ? 'New deployment' :
    this.view() === 'resources' ? ({ queues: 'Create queue', instances: 'Select running', cluster: 'Create node group' } as const)[this.resourceSection()] :
    'New pipeline');
  protected readonly pipelines = signal<Pipeline[]>([]);
  protected readonly awsConnections = signal<EksAccountOption[]>([]);
  protected readonly query = signal('');
  protected readonly filteredPipelines = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.pipelines().filter(pipeline => [
      pipeline.name, pipeline.repositoryUrl, pipeline.branch, pipeline.environment,
    ].some(value => value.toLowerCase().includes(query)));
  });
  protected readonly provider = signal<ProviderStatus | null>(null);
  protected readonly selected = signal<Pipeline | null>(null);
  protected readonly selectedBuild = signal<BuildRun | null>(null);
  protected readonly pipelineBuilds = computed(() => {
    const pipeline = this.selected();
    if (!pipeline) return [];
    return this.projectRuns().filter(run => run.pipelineId === pipeline.id)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  });
  protected readonly recentPipelineBuilds = computed(() => this.pipelineBuilds().slice(0, 10));
  protected readonly projectOpen = signal(false);
  protected readonly scopeAll = signal(true);
  protected readonly checkedPipelines = signal<ReadonlySet<string>>(new Set());
  protected readonly allPipelinesChecked = computed(() => this.filteredPipelines().length > 0 &&
    this.filteredPipelines().every(pipeline => this.checkedPipelines().has(pipeline.id)));
  protected readonly batchNotice = signal('');
  private readonly projectRuns = signal<BuildRun[]>([]);
  protected readonly runs = computed(() => this.scopeAll() ? this.projectRuns() :
    this.projectRuns().filter(run => run.pipelineId === this.selected()?.id));
  protected readonly projectNames = computed(() => new Map(this.pipelines().map(pipeline => [pipeline.id, pipeline.name])));
  protected readonly latestRuns = computed(() => {
    const latest = new Map<string, BuildRun>();
    for (const run of this.projectRuns()) if (!latest.has(run.pipelineId)) latest.set(run.pipelineId, run);
    return latest;
  });
  protected readonly recipeLabels = recipeLabels;
  protected readonly recipes = Object.keys(recipeLabels) as BuildRecipe[];
  protected readonly runQuery = signal('');
  protected readonly runFilter = signal<RunFilter>('all');
  protected readonly selectedLog = signal<OpenLog | null>(null);
  protected readonly loggedRun = computed(() => this.projectRuns().find(run => run.id === this.selectedLog()?.runId));
  protected readonly images = computed(() => this.runs().filter(run => run.artifact));
  protected readonly deployableImages = computed(() => this.projectRuns().filter(run => run.status === 'succeeded' && run.artifact));
  protected readonly latestDeployableImage = computed(() => this.deployableImages().slice()
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).at(0));
  protected readonly deploymentImage = signal('');
  protected readonly deploymentTarget = signal('');
  protected readonly resourceTarget = signal('');
  protected readonly activeRuns = computed(() => this.runs().filter(run => isBuildInProgress(run.status)).length);
  protected readonly filteredRuns = computed(() => {
    const query = this.runQuery().trim().toLowerCase();
    const filter = this.runFilter();
    return this.runs().filter(run => {
      if (filter === 'active' && !isBuildInProgress(run.status)) return false;
      if (filter !== 'all' && filter !== 'active' && run.status !== filter) return false;
      return !query || [run.tag, run.branch, run.commit, run.requestedCommit, this.projectNames().get(run.pipelineId)]
        .some(value => value?.toLowerCase().includes(query));
    });
  });
  protected readonly busy = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly providerNotice = signal('');
  protected readonly githubSetup = signal(false);
  protected readonly preview = signal(false);
  protected readonly repositories = signal<SourceRepository[]>([]);
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<Pipeline | null>(null);
  protected buildArgs = '';
  protected githubAccountType: 'personal' | 'organization' = 'personal';
  protected githubOrganization = '';
  protected draft: PipelineSettings = this.emptyDraft();

  constructor() {
    void this.initialize();
    const interval = setInterval(() => {
      if (this.view() !== 'settings' && this.projectRuns().some(run => isBuildInProgress(run.status))) {
        void this.refresh();
      }
    }, 4_000);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }

  protected showView(view: BuildView): void {
    this.error.set('');
    if (view !== 'builds') { this.selectedLog.set(null); this.selectedBuild.set(null); }
    if (view !== 'deployments') {
      this.deploymentImage.set('');
      this.deploymentTarget.set('');
    }
    this.view.set(view);
    const url = new URL(window.location.href);
    if (view === 'pipelines') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    if (view === 'resources') url.searchParams.set('resource', this.resourceSection() === 'queues' ? 'sqs' :
      this.resourceSection() === 'instances' ? 'ec2' : 'eks');
    else url.searchParams.delete('resource');
    window.history.replaceState(window.history.state, '', url);
  }

  protected navigate(event: Event): void {
    const page = (event as CustomEvent<string>).detail;
    if (page === 'pipelines') {
      this.showPipelineList();
    } else if (page === 'sqs' || page === 'ec2' || page === 'eks') {
      this.setResourceSection(page === 'sqs' ? 'queues' : page === 'ec2' ? 'instances' : 'cluster');
      this.showView('resources');
    } else if (page === 'settings' || page === 'deployments' || page === 'builds' || page === 'images' || page === 'resources') {
      this.showView(page);
    } else if (page === 'developers') {
      window.location.assign(new URL('/developers', appUrl('professy')));
    }
  }

  protected search(event: Event, submit = false): void {
    this.query.set((event as CustomEvent<string>).detail);
    if (submit) this.showPipelineList();
  }

  protected showPipelineList(): void {
    this.projectOpen.set(false);
    this.editorOpen.set(false);
    this.scopeAll.set(true);
    this.showView('pipelines');
  }

  protected setResourceSection(section: ResourceSection): void {
    this.resourceSection.set(section);
    if (this.view() === 'resources') {
      const url = new URL(window.location.href);
      url.searchParams.set('resource', section === 'queues' ? 'sqs' : section === 'instances' ? 'ec2' : 'eks');
      window.history.replaceState(window.history.state, '', url);
    }
  }

  protected moveTab(event: KeyboardEvent): void {
    const position = this.tabs.findIndex(tab => tab.id === this.view());
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (position + this.tabs.length - 1) % this.tabs.length; break;
      case 'ArrowRight': next = (position + 1) % this.tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = this.tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const id = this.tabs[next].id;
    this.showView(id);
    document.getElementById(`build-tab-${id}`)?.focus();
  }

  protected async signOut(): Promise<void> {
    await this.act(() => this.session.signOut());
  }

  protected create(): void {
    if (this.view() === 'deployments') this.deploymentPanel()?.openForm();
    else if (this.view() === 'resources') this.resourcePanel()?.createPrimaryAction();
    else if (this.view() === 'pipelines') this.openEditor();
  }

  protected async openEditor(): Promise<void> {
    await this.act(async () => {
      try {
        const list = await this.request<{ accounts: EksAccountOption[] }>('/deployments/aws/accounts');
        this.awsConnections.set(list.accounts);
      } catch {
        this.awsConnections.set([]);
      }
      this.editing.set(null);
      this.draft = { ...this.emptyDraft(), awsConnectionId: this.awsConnections()[0]?.id };
      this.buildArgs = '';
      this.editorOpen.set(true);
      this.query.set('');
      this.showView('pipelines');
    });
  }

  protected editPipeline(pipeline: Pipeline): void {
    this.editing.set(pipeline);
    this.draft = { ...pipeline, awsConnectionId: pipeline.awsConnectionId || this.awsConnections()[0]?.id,
      trigger: pipeline.trigger || 'manual' };
    this.buildArgs = Object.entries(pipeline.buildArgs).map(([key, value]) => `${key}=${value}`).join('\n');
    this.editorOpen.set(true);
  }

  protected awsConnectionName(id: string): string {
    return this.awsConnections().find(item => item.id === id)?.name || 'Configured AWS account';
  }

  protected async connectProvider(): Promise<void> {
    if (!this.provider()?.manualAvailable) {
      this.githubSetup.set(true);
      return;
    }
    await this.act(async () => {
      await this.request('/provider/connect', 'POST');
      this.provider.set(await this.request<ProviderStatus>('/provider'));
    });
  }

  protected async continueToGitHub(): Promise<void> {
    await this.act(async () => {
      const { action, manifest } = await this.request<{ action: string; manifest: object }>('/provider/github/begin', 'POST', {
        accountType: this.githubAccountType,
        organization: this.githubOrganization,
      });
      const target = new URL(action);
      if (target.origin !== 'https://github.com') throw new Error('Build Center received an invalid GitHub setup URL.');
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = target.href;
      form.hidden = true;
      const data = document.createElement('input');
      data.type = 'hidden';
      data.name = 'manifest';
      data.value = JSON.stringify(manifest);
      form.append(data);
      document.body.append(form);
      form.submit();
    });
  }

  protected async verifyInstallation(): Promise<void> {
    await this.act(() => this.checkGitHubInstallation());
  }

  protected async checkRunner(): Promise<void> {
    await this.act(async () => {
      this.provider.set(await this.request<ProviderStatus>('/provider'));
    });
  }

  private async checkGitHubInstallation(): Promise<void> {
    const result = await this.request<{ connected: boolean }>('/provider/github/check', 'POST');
    this.provider.set(await this.request<ProviderStatus>('/provider'));
    this.providerNotice.set(result.connected ? 'GitHub is connected. You can now import the selected repositories.' :
      'Installation is still pending. Finish on GitHub or wait for your organization to approve the app, then check again.');
  }

  protected async loadRepositories(): Promise<void> {
    await this.act(async () => {
      const response = await this.request<{ repositories: SourceRepository[] }>('/provider/repos');
      this.repositories.set(response.repositories);
    });
  }

  protected chooseRepository(event: Event): void {
    const url = (event.target as HTMLSelectElement).value;
    const repo = this.repositories().find(item => item.url === url);
    if (!repo) return;
    const name = repo.fullName.split('/').at(-1) ?? '';
    this.draft = { ...this.draft, repositoryUrl: repo.url, branch: repo.defaultBranch || 'main',
      name: this.draft.name || name, imageName: this.draft.imageName || name.toLowerCase(),
      artifactPath: this.draft.artifactPath || `${this.draft.environment}/${name.toLowerCase()}` };
  }

  protected async savePipeline(): Promise<void> {
    await this.act(async () => {
      const entries = this.buildArgs.split('\n').filter(line => line.trim()).map(line => {
        const separator = line.indexOf('=');
        if (separator < 1) throw new Error('Enter one NAME=value build argument per line.');
        return [line.slice(0, separator).trim(), line.slice(separator + 1)];
      });
      if (new Set(entries.map(([key]) => key)).size !== entries.length) {
        throw new Error('Use each build argument name only once.');
      }
      const current = this.editing();
      const path = current ? `/pipelines/${current.id}` : '/pipelines';
      const pipeline = await this.request<Pipeline>(path, current ? 'PUT' : 'POST', {
        ...this.draft,
        buildArgs: Object.fromEntries(entries),
      });
      this.pipelines.update(pipelines => current
        ? pipelines.map(item => item.id === current.id ? pipeline : item)
        : [pipeline, ...pipelines]);
      this.editorOpen.set(false);
      this.openPipeline(pipeline);
    });
  }

  protected openPipeline(pipeline: Pipeline): void {
    this.showView('pipelines');
    this.projectOpen.set(true);
    this.selected.set(pipeline);
    this.scopeAll.set(false);
    this.runQuery.set('');
    this.runFilter.set('all');
    this.preview.set(false);
  }

  protected selectPipelineById(id: string): void {
    const pipeline = this.pipelines().find(item => item.id === id);
    this.scopeAll.set(!pipeline);
    if (pipeline) this.selected.set(pipeline);
    this.runQuery.set('');
    this.runFilter.set('all');
  }

  protected togglePipelines(ids: string[], checked: boolean): void {
    this.checkedPipelines.update(current => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  protected toggleVisiblePipelines(checked: boolean): void {
    this.togglePipelines(this.filteredPipelines().map(pipeline => pipeline.id), checked);
  }

  protected async startSelected(): Promise<void> {
    const pipelineIds = [...this.checkedPipelines()];
    if (!pipelineIds.length) return;
    await this.act(async () => {
      const result = await this.request<{ runs: BuildRun[]; skipped: number }>('/runs', 'POST', { pipelineIds });
      this.batchNotice.set(`Queued ${result.runs.length} ${result.runs.length === 1 ? 'build' : 'builds'}.${result.skipped ? ` ${result.skipped} already in progress.` : ''}`);
      this.checkedPipelines.set(new Set());
      this.selectPipelineById('');
      this.showView('builds');
      await this.refresh(true);
    });
  }

  protected async start(): Promise<void> {
    const pipeline = this.selected();
    if (!pipeline) return;
    await this.act(async () => {
      try {
        await this.request(`/pipelines/${pipeline.id}/runs`, 'POST');
        this.selectPipelineById(pipeline.id);
        this.showView('builds');
      } finally {
        await this.refresh(true);
      }
    });
  }

  protected async refresh(force = false): Promise<void> {
    if (this.refreshing() && !force) return;
    const request = ++this.runsRequest;
    this.refreshing.set(true);
    try {
      const result = await this.request<{ runs: BuildRun[] }>('/runs');
      if (request !== this.runsRequest) return;
      const previousRun = this.loggedRun();
      const previousBuild = this.selectedBuild();
      this.projectRuns.set(result.runs);
      if (previousBuild) this.selectedBuild.set(result.runs.find(run => run.id === previousBuild.id) ?? previousBuild);
      if (previousRun && isBuildInProgress(previousRun.status)) {
        const currentRun = this.loggedRun();
        if (currentRun) void this.readLog(!isBuildInProgress(currentRun.status));
      }
    } catch (error) {
      if (request === this.runsRequest) this.showError(error);
    } finally {
      if (request === this.runsRequest) this.refreshing.set(false);
    }
  }

  protected showLog(run: BuildRun): void {
    this.selectedBuild.set(null);
    this.showView('builds');
    this.selectedLog.set({ runId: run.id, text: null, pending: false, error: '' });
    void this.readLog();
  }

  protected showBuild(run: BuildRun): void {
    this.selectedLog.set(null);
    this.selectPipelineById(run.pipelineId);
    this.selectedBuild.set(run);
    this.showView('builds');
    this.selectedBuild.set(run);
  }

  protected closeBuild(): void {
    this.selectedBuild.set(null);
    afterNextRender(() => document.getElementById('build-history-heading')?.focus(), { injector: this.injector });
  }

  protected closeLog(): void {
    const runId = this.selectedLog()?.runId;
    this.selectedLog.set(null);
    afterNextRender(() => (document.getElementById(`open-log-${runId}`) ?? document.getElementById('build-history-heading'))?.focus(),
      { injector: this.injector });
  }

  protected async readLog(force = false): Promise<void> {
    const run = this.loggedRun();
    const log = this.selectedLog();
    if (!run || !log || (log.pending && !force)) return;
    const pending = { ...log, pending: true, error: '' };
    this.selectedLog.set(pending);
    try {
      const result = await this.request<{ log: string }>(`/pipelines/${run.pipelineId}/runs/${run.id}/log`);
      if (this.selectedLog() === pending) this.selectedLog.set({ ...pending, pending: false, text: result.log });
    } catch (error) {
      if (this.selectedLog() === pending) {
        this.selectedLog.set({ ...pending, pending: false,
          error: error instanceof Error ? error.message : 'Could not load the build log.' });
      }
    }
  }

  protected async download(run: BuildRun): Promise<void> {
    await this.act(async () => {
      const result = await this.request<{ url: string }>(`/pipelines/${run.pipelineId}/runs/${run.id}/download`, 'POST');
      window.location.assign(result.url);
    });
  }

  protected deployImage(run: BuildRun): void {
    this.deploymentImage.set(run.id);
    this.showView('deployments');
  }

  protected deployToTarget(id: string): void {
    this.deploymentTarget.set(id);
    this.showView('deployments');
  }

  protected manageNodeGroups(id: string): void {
    this.resourceTarget.set(id);
    this.setResourceSection('cluster');
    this.showView('resources');
  }

  protected archiveSize(bytes: number): string {
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    const unit = Math.min(units.length - 1, Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024)));
    return `${(bytes / 1024 ** unit).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unit]}`;
  }

  private async initialize(): Promise<void> {
    await this.act(async () => {
      const callbackUrl = new URL(window.location.href);
      const githubReturn = callbackUrl.searchParams.get('github');
      if (githubReturn) {
        callbackUrl.searchParams.delete('github');
        window.history.replaceState(window.history.state, '', callbackUrl);
      }
      const [status, list] = await Promise.all([
        this.request<ProviderStatus>('/provider'),
        this.request<{ pipelines: Pipeline[] }>('/pipelines'),
      ]);
      this.provider.set(status);
      this.pipelines.set(list.pipelines);
      this.selected.set(list.pipelines[0] ?? null);
      await this.refresh(true);
      await this.request<{ accounts: EksAccountOption[] }>('/deployments/aws/accounts')
        .then(result => this.awsConnections.set(result.accounts)).catch(() => this.awsConnections.set([]));
      if (githubReturn === 'registered') {
        const result = await this.request<{ installUrl: string }>('/provider/github/complete', 'POST');
        this.provider.set(await this.request<ProviderStatus>('/provider'));
        window.location.assign(result.installUrl);
      } else if (githubReturn === 'installed' && status.canManage && (status.installUrl || status.account)) {
        await this.checkGitHubInstallation();
      } else if (githubReturn === 'expired') {
        this.error.set('GitHub setup expired. Select Connect GitHub to try again.');
      }
    });
    this.loading.set(false);
  }

  private request<T>(path: string, method = 'GET', body?: object): Promise<T> {
    return this.session.request<T>(path, method, body);
  }

  private async act(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'An unexpected error occurred.');
  }

  private emptyDraft(): PipelineSettings {
    return { name: '', repositoryUrl: '', branch: 'main', environment: 'development',
      dockerfile: 'Dockerfile', context: '.', imageName: '', artifactPath: '', buildArgs: {}, trigger: 'manual' };
  }
}
