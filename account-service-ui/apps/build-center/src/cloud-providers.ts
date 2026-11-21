import { Component, DestroyRef, computed, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule, NgForm, NgModel } from '@angular/forms';
import type { EksAccountOption, EksProvision, EksProvisionSettings, EksSubnet } from './models';
import { BuildCenterSession } from './session';

interface CloudSettings {
  accounts: EksAccountOption[];
  jobs: EksProvision[];
  configurationMessage?: string;
}

interface RegionOptions {
  versions: string[];
  subnets: EksSubnet[];
}

interface AwsSource {
  id: string;
  name: string;
}

@Component({
  selector: 'app-cloud-providers',
  imports: [FormsModule],
  templateUrl: './cloud-providers.html',
  styleUrls: ['./build-center.css', './deployments.css'],
})
export class CloudProviders implements OnInit {
  readonly deployTo = output<string>();
  readonly manageNodes = output<string>();
  private readonly session = inject(BuildCenterSession);
  protected readonly data = signal<CloudSettings>({ accounts: [], jobs: [] });
  protected readonly provisioningAccounts = computed(() => this.data().accounts.filter(account => account.provisioning));
  protected readonly accountId = signal('');
  protected readonly account = computed(() => this.provisioningAccounts().find(item => item.id === this.accountId()));
  protected readonly options = signal<RegionOptions | null>(null);
  protected readonly vpcs = computed(() => [...new Set(this.options()?.subnets.map(subnet => subnet.vpc))].sort());
  protected readonly vpc = signal('');
  protected readonly subnets = computed(() => this.options()?.subnets.filter(subnet => subnet.vpc === this.vpc()) ?? []);
  protected readonly selected = signal<string[]>([]);
  protected readonly hasZonePair = computed(() => new Set(
    this.subnets().filter(subnet => this.selected().includes(subnet.id)).map(subnet => subnet.zoneId),
  ).size >= 2);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly editorOpen = signal(false);
  protected readonly accountSetupOpen = signal(false);
  protected readonly sources = signal<AwsSource[] | null>(null);
  protected readonly notice = signal('');
  protected readonly endpointCidrs = signal<Record<string, string>>({});
  protected readonly workerCapacities = signal<Record<string, 'ON_DEMAND' | 'SPOT'>>({});
  protected awsAccount = {
    source: '', name: 'Greatley Poshley AWS', region: 'us-east-1', namespace: 'professy', domain: '', ingressClass: '',
    accessKeyId: '', secretAccessKey: '', sessionToken: '',
  };
  protected enableProvisioning = false;
  protected roles = { clusterRoleArn: '', nodeRoleArn: '', deploymentRoleArn: '' };
  protected draft: EksProvisionSettings = {
    accountId: '', region: '', cluster: '', namespace: '', kubernetesVersion: '', subnetIds: [],
    publicAccessCidr: '', nodeGroup: 'workers', instanceType: 't4g.large',
    capacityType: 'ON_DEMAND', minNodes: 1, desiredNodes: 1, maxNodes: 2, diskGiB: 20,
  };
  private refreshPending = false;
  private version = 0;

  constructor() {
    const poll = setInterval(() => {
      if (this.data().jobs.some(job => job.status === 'running')) void this.refresh();
    }, 5_000);
    inject(DestroyRef).onDestroy(() => clearInterval(poll));
  }

  ngOnInit(): void { void this.refresh(); }

  protected openEditor(): void {
    this.error.set('');
    this.accountSetupOpen.set(false);
    if (!this.account()) this.selectAccount(this.provisioningAccounts()[0]?.id ?? '');
    this.editorOpen.set(true);
  }

  protected async openAccountSetup(): Promise<void> {
    this.editorOpen.set(false);
    this.accountSetupOpen.set(true);
    this.sources.set(null);
    await this.act(async () => {
      const { sources } = await this.session.request<{ sources: AwsSource[] }>('/deployments/aws/setup');
      this.sources.set(sources);
      if (!sources.some(source => source.id === this.awsAccount.source)) this.awsAccount.source = sources[0]?.id ?? '';
    });
  }

  protected async connectAccount(form: NgForm): Promise<void> {
    if (!this.awsAccount.source || this.busy()) return;
    if (form.invalid) {
      form.control.markAllAsTouched();
      const labels: Record<string, string> = {
        awsSource: 'AWS authentication method',
        accessKeyId: 'AWS access key ID',
        secretAccessKey: 'AWS secret access key',
        sessionToken: 'AWS session token',
        awsName: 'Connection name',
        awsRegion: 'AWS region',
        awsNamespace: 'Kubernetes namespace',
        awsDomain: 'Base domain',
        awsIngress: 'IngressClass',
        clusterRole: 'EKS cluster role ARN',
        nodeRole: 'EC2 node role ARN',
        deployRole: 'Kubernetes deployment role ARN',
      };
      const missing = Object.entries(form.controls)
        .filter(([, control]) => control.invalid)
        .map(([name]) => labels[name] ?? name);
      this.error.set(missing.length ? 'Check these fields: ' + missing.join(', ') + '.' : 'Check the AWS connection fields.');
      return;
    }
    await this.act(async () => {
      const { accessKeyId, secretAccessKey, sessionToken, ...connection } = this.awsAccount;
      const account = await this.session.request<EksAccountOption>('/deployments/aws/setup', 'POST', {
        ...connection,
        ...(this.awsAccount.source === 'credentials' ? { accessKeyId, secretAccessKey, sessionToken } : {}),
        provisioning: this.enableProvisioning ? this.roles : undefined,
      });
      this.version++;
      this.data.update(data => ({
        ...data, accounts: [...data.accounts.filter(item => item.id !== account.id), account],
      }));
      this.accountSetupOpen.set(false);
      this.notice.set(account.name + ' connected.');
      this.awsAccount = { ...this.awsAccount, accessKeyId: '', secretAccessKey: '', sessionToken: '' };
    });
  }

  protected selectAwsSource(source: string): void {
    this.awsAccount.source = source;
    if (source !== 'credentials') {
      this.awsAccount.accessKeyId = '';
      this.awsAccount.secretAccessKey = '';
      this.awsAccount.sessionToken = '';
    }
  }

  protected setAwsNamespace(value: string, field: NgModel): void {
    const normalized = value.trim().toLowerCase();
    this.awsAccount.namespace = normalized;
    if (normalized !== value) {
      field.control.setValue(normalized, { emitEvent: false, emitViewToModelChange: false });
    }
  }

  protected closeAccountSetup(): void {
    this.awsAccount.accessKeyId = '';
    this.awsAccount.secretAccessKey = '';
    this.awsAccount.sessionToken = '';
    this.accountSetupOpen.set(false);
  }

  protected selectAccount(id: string): void {
    this.accountId.set(id);
    this.draft.namespace = this.account()?.namespaces[0] ?? '';
    this.selectRegion(this.account()?.regions[0] ?? '');
  }

  protected selectRegion(region: string): void {
    this.draft.region = region;
    this.draft.kubernetesVersion = '';
    this.options.set(null);
    this.selectVpc('');
  }

  protected selectVpc(vpc: string): void {
    this.vpc.set(vpc);
    this.selected.set([]);
  }

  protected selectSubnet(id: string, checked: boolean): void {
    this.selected.update(ids => checked ? [...ids, id] : ids.filter(item => item !== id));
  }

  protected async refresh(): Promise<void> {
    if (this.refreshPending) return;
    this.refreshPending = true;
    const version = this.version;
    try {
      const state = await this.session.request<CloudSettings>('/deployments/eks/provision');
      if (version === this.version) {
        this.data.set(state);
        if (this.editorOpen() && !this.account() && this.provisioningAccounts().length) {
          this.selectAccount(this.provisioningAccounts()[0].id);
        }
      }
    } catch (error) {
      this.displayError(error);
    } finally {
      this.refreshPending = false;
      this.loading.set(false);
    }
  }

  protected async loadOptions(): Promise<void> {
    const accountId = this.accountId();
    const region = this.draft.region;
    if (!accountId || !region) return;
    await this.act(async () => {
      const query = new URLSearchParams({ accountId, region });
      const options = await this.session.request<RegionOptions>('/deployments/eks/provision/options?' + query);
      this.options.set(options);
      this.draft.kubernetesVersion = options.versions[0] ?? '';
      this.selectVpc(this.vpcs().length === 1 ? this.vpcs()[0] : '');
    });
  }

  protected async create(form: NgForm): Promise<void> {
    if (this.busy()) return;
    if (form.invalid) {
      form.control.markAllAsTouched();
      const labels: Record<string, string> = {
        account: 'AWS account', region: 'AWS region', cluster: 'Cluster name', version: 'Kubernetes version',
        namespace: 'App namespace', vpc: 'VPC', nodes: 'Node group name', instance: 'EC2 instance type',
        capacity: 'Capacity type', disk: 'Worker disk', minNodes: 'Minimum workers',
        desiredNodes: 'Desired workers', maxNodes: 'Maximum workers',
      };
      const invalid = Object.entries(form.controls).filter(([, control]) => control.invalid)
        .map(([name]) => labels[name] ?? name);
      this.error.set(invalid.length ? 'Check these fields: ' + invalid.join(', ') + '.' : 'Check the cluster configuration fields.');
      return;
    }
    if (!this.hasZonePair()) {
      this.error.set('Select subnets from at least two different Availability Zones. One worker is enough; the EKS control plane still needs two subnet zones.');
      return;
    }
    await this.act(async () => {
      const job = await this.session.request<EksProvision>('/deployments/eks/provision', 'POST', {
        ...this.draft, accountId: this.accountId(), subnetIds: this.selected(),
      });
      this.remember(job);
      this.draft.cluster = '';
      this.editorOpen.set(false);
    });
  }

  protected async resume(job: EksProvision): Promise<void> {
    await this.act(async () => {
      const publicAccessCidr = this.endpointCidrs()[job.id]?.trim();
      this.remember(await this.session.request<EksProvision>('/deployments/eks/provision/' + job.id + '/resume', 'POST',
        publicAccessCidr ? { publicAccessCidr } : {}));
    });
  }

  protected async createWorkers(job: EksProvision): Promise<void> {
    await this.act(async () => {
      const result = await this.session.request<{ name: string; status: string; updateId?: string; desiredNodes: number;
        issues: EksProvision['workerGroupIssues']; workerNodePolicyAttached?: boolean; created: boolean }>(
        `/deployments/eks/provision/${job.id}/workers`, 'POST', { capacityType: this.workerCapacity(job) });
      this.remember({ ...job,
        settings: result.created ? { ...job.settings, capacityType: this.workerCapacity(job) } : job.settings,
        workerGroupStatus: result.status, workerGroupUpdateId: result.updateId, workerGroupIssues: result.issues,
        workerNodePolicyAttached: result.workerNodePolicyAttached ?? job.workerNodePolicyAttached });
      this.notice.set(result.issues?.length
        ? `AWS reports ${result.issues[0].code}: ${result.issues[0].message}`
        : result.status === 'ACTIVE'
        ? `Worker node group ${result.name} is ACTIVE with ${result.desiredNodes} desired worker${result.desiredNodes === 1 ? '' : 's'}. Resume setup after fixing Kubernetes API connectivity.`
        : `AWS accepted worker node group ${result.name}. Status: ${result.status}. EKS is provisioning ${result.desiredNodes} worker${result.desiredNodes === 1 ? '' : 's'}.`);
    });
  }

  protected needsNodeRolePolicy(job: EksProvision): boolean {
    return job.workerGroupIssues?.some(issue => issue.code === 'MissingWorkerNodePolicy') ?? false;
  }

  protected workerCapacity(job: EksProvision): 'ON_DEMAND' | 'SPOT' {
    return this.workerCapacities()[job.id] ?? job.settings.capacityType;
  }

  protected setWorkerCapacity(job: EksProvision, value: 'ON_DEMAND' | 'SPOT'): void {
    this.workerCapacities.update(current => ({ ...current, [job.id]: value }));
  }

  protected workerActionLabel(job: EksProvision): string {
    if (!job.workerGroupStatus) return 'Create worker group';
    if (job.workerGroupStatus === 'CREATE_FAILED') return 'Refresh failure details';
    if (job.workerGroupStatus === 'DELETING') return 'Check deletion status';
    return 'Refresh worker group status';
  }

  protected async attachWorkerPolicy(job: EksProvision): Promise<void> {
    await this.act(async () => {
      await this.session.request(`/deployments/eks/provision/${job.id}/node-role-policy`, 'POST');
      this.remember({ ...job, workerNodePolicyAttached: true,
        workerGroupIssues: job.workerGroupIssues?.filter(issue => issue.code !== 'MissingWorkerNodePolicy') ?? [] });
      this.notice.set('AmazonEKSWorkerNodePolicy is attached to the configured EC2 node role. Replace the failed group so new workers launch with this permission.');
    });
  }

  protected async deleteFailedWorkers(job: EksProvision): Promise<void> {
    const message = `Delete failed node group ${job.settings.nodeGroup}? AWS will remove the group and terminate its EC2 workers. You can then create a replacement group.`;
    if (!window.confirm(message) || this.busy()) return;
    await this.act(async () => {
      const result = await this.session.request<{ name: string; status: string }>(
        `/deployments/eks/provision/${job.id}/workers/delete`, 'POST');
      this.remember({ ...job, workerGroupStatus: result.status, workerGroupIssues: [] });
      this.notice.set(`Deletion submitted for ${result.name}. Refresh worker group status until AWS removes it, then create the replacement group.`);
    });
  }

  protected setEndpointCidr(id: string, value: string): void {
    this.endpointCidrs.update(values => ({ ...values, [id]: value }));
  }

  protected endpointCidr(id: string): string {
    return this.endpointCidrs()[id] ?? this.data().jobs.find(job => job.id === id)?.settings.publicAccessCidr ?? '';
  }

  protected stage(job: EksProvision): string {
    switch (job.status) {
      case 'ready': return 'Ready';
      case 'running': return 'Provisioning';
      case 'paused': return 'Paused';
      case 'failed': return 'Needs attention';
    }
  }

  protected jobMessage(job: EksProvision): string {
    const isWorkerPolicyWarning = job.message.includes('AmazonEKSWorkerNodeMinimalPolicy') &&
      job.message.includes('AmazonEKSWorkerNodePolicy');
    if (!isWorkerPolicyWarning) return job.message;
    if (job.workerNodePolicyAttached === true) {
      return job.workerGroupStatus
        ? `The earlier policy warning is cleared: AWS verifies AmazonEKSWorkerNodePolicy on the worker role. Node group status is ${job.workerGroupStatus}; review current AWS issues below.`
        : 'The earlier policy warning is cleared: AWS verifies AmazonEKSWorkerNodePolicy on the configured worker role.';
    }
    if (job.workerNodePolicyAttached === false) {
      return 'AWS still reports AmazonEKSWorkerNodePolicy missing from the worker role currently used by this node group.';
    }
    return 'This is the saved setup error. Build Center could not verify the current worker-role policy; check the role used by the node group and refresh status.';
  }

  protected workerPolicyStatus(job: EksProvision): string {
    if (job.workerNodePolicyAttached === true) return 'AmazonEKSWorkerNodePolicy is attached to the current worker role.';
    if (job.workerNodePolicyAttached === false) return 'AmazonEKSWorkerNodePolicy is not attached to the current worker role.';
    return 'Could not verify the current worker role. Check IAM read permissions and the node group role ARN.';
  }

  private remember(job: EksProvision): void {
    this.version++;
    this.data.update(data => ({ ...data, jobs: [job, ...data.jobs.filter(item => item.id !== job.id)] }));
  }

  private async act(action: () => Promise<void>): Promise<void> {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try { await action(); } catch (error) { this.displayError(error); } finally { this.busy.set(false); }
  }

  private displayError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'The AWS request failed.');
  }
}
