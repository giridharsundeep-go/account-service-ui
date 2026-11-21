import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, input, OnChanges, OnInit, output, signal, SimpleChanges } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { BuildCenterSession } from './session';

interface AwsAccount { id: string; name: string; regions: string[]; }
interface ClusterTarget { id: string; name: string; namespace: string; platform: string; eks?: { region: string }; }
interface Queue {
  name: string; url: string; arn: string; fifo: boolean; visible: number; inFlight: number; delayed: number;
  retentionSeconds: number; visibilitySeconds: number; createdAt?: string; lastModified?: string;
}
interface Ec2Instance {
  id: string; name: string; type: string; state: string; launchTime?: string; availabilityZone: string;
  privateIp: string; publicIp: string; cpuAverage?: number; managedBy?: string; nodeGroup?: string;
  eksCluster?: string; autoScalingGroup?: string; eligibleForStartStop: boolean;
  networkInBytes?: number; networkOutBytes?: number; diskReadBytes?: number; diskWriteBytes?: number;
  systemStatus?: string; instanceStatus?: string;
}
interface EksNode {
  name: string; ready: boolean; instanceType: string; zone: string; internalIp: string;
  cpuCapacity?: string; memoryCapacity?: string; cpuAllocatable?: string; memoryAllocatable?: string;
  cpuUsage?: string; memoryUsage?: string;
}
interface EksPod {
  name: string; service: string; node: string; state: string; podIp: string;
  readyContainers: number; totalContainers: number; restarts: number; cpuUsage?: string; memoryUsage?: string;
}
interface NodeGroup { name: string; status: string; min: number; desired: number; max: number; }
interface NodeGroupSubnet { id: string; name: string; zone: string; zoneId: string; state: string; }
interface NodeGroupOptions { cluster: string; platform: string; roleConfigured: boolean; subnets: NodeGroupSubnet[]; }
interface EksOverview {
  cluster: string; namespace: string; nodes: EksNode[]; deployments: { name: string; app: string; desired: number; ready: number }[];
  pods: EksPod[]; nodeGroups: NodeGroup[];
  errors: { nodes: string; workloads: string; nodeMetrics: string; podMetrics: string; nodeGroups: string };
}

type ResourceTab = 'queues' | 'instances' | 'cluster';

@Component({
  selector: 'app-aws-resources',
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './aws-resources.html',
  styleUrls: ['./build-center.css', './deployments.css', './aws-resources.css'],
})
export class AwsResources implements OnChanges, OnInit {
  readonly initialTargetId = input('');
  readonly initialResource = input<ResourceTab>('queues');
  readonly resourceChange = output<ResourceTab>();
  private readonly session = inject(BuildCenterSession);
  private readonly timer = setInterval(() => void this.refreshActive(), 30_000);
  protected readonly tab = signal<ResourceTab>('queues');
  protected readonly accounts = signal<AwsAccount[]>([]);
  protected readonly targets = signal<ClusterTarget[]>([]);
  protected readonly accountId = signal('');
  protected readonly region = signal('');
  protected readonly targetId = signal('');
  protected readonly queues = signal<Queue[]>([]);
  protected readonly instances = signal<Ec2Instance[]>([]);
  protected readonly overview = signal<EksOverview | null>(null);
  protected readonly nodeGroupOptions = signal<NodeGroupOptions | null>(null);
  protected readonly selectedWorkerSubnets = signal<string[]>([]);
  protected readonly selectedWorkerZones = signal(0);
  protected readonly nodeGroupFormOpen = signal(false);
  protected readonly nodeGroupLoading = signal(false);
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly fifo = signal(false);
  protected readonly queueSearch = signal('');
  protected readonly queueFormOpen = signal(false);
  protected queueName = '';
  protected nodeGroupName = '';
  protected instanceType = 't4g.medium';
  protected capacityType: 'ON_DEMAND' | 'SPOT' = 'ON_DEMAND';
  protected diskGiB = 20;
  protected minNodes = 0;
  protected desiredNodes = 1;
  protected maxNodes = 2;
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialResource'] && !changes['initialResource'].firstChange && this.tab() !== this.initialResource()) {
      this.setTab(this.initialResource());
    }
  }

  ngOnInit(): void { this.tab.set(this.initialResource()); void this.initialize(); }

  protected availableRegions(): string[] {
    return this.accounts().find(account => account.id === this.accountId())?.regions ?? [];
  }

  protected resourceBreadcrumb(): string {
    return this.tab() === 'queues' ? 'Amazon SQS / Queues' : this.tab() === 'instances' ? 'Amazon EC2 / Instances' : 'Amazon EKS / Clusters';
  }

  protected resourceTitle(): string {
    return this.tab() === 'queues' ? 'Queues' : this.tab() === 'instances' ? 'Instances' : 'Clusters';
  }

  protected resourceDescription(): string {
    return this.tab() === 'queues' ? 'Review queue configuration and approximate message counts.' :
      this.tab() === 'instances' ? 'Inspect EC2 instance health, utilization, and runtime.' :
        'Inspect cluster health, worker capacity, and application workloads.';
  }

  focusQueueForm(): void {
    if (this.tab() !== 'queues') this.setTab('queues');
    this.queueFormOpen.set(true);
    queueMicrotask(() => document.getElementById('aws-queue-name')?.focus());
  }

  protected filteredQueues(): Queue[] {
    const query = this.queueSearch().trim().toLowerCase();
    return this.queues().filter(queue => !query || queue.name.toLowerCase().includes(query));
  }

  protected setTab(tab: ResourceTab): void {
    this.tab.set(tab);
    this.resourceChange.emit(tab);
    this.error.set('');
    this.notice.set('');
    if (tab === 'queues') void this.loadQueues();
    if (tab === 'instances') void this.loadInstances();
    if (tab === 'cluster') void this.loadCluster();
  }

  protected async selectAccount(id: string): Promise<void> {
    this.accountId.set(id);
    const account = this.accounts().find(item => item.id === id);
    this.region.set(account?.regions[0] ?? '');
    await this.refreshActive();
  }

  protected async selectRegion(region: string): Promise<void> {
    this.region.set(region);
    await this.refreshActive();
  }

  protected async refreshActive(): Promise<void> {
    if (this.tab() === 'queues') await this.loadQueues();
    else if (this.tab() === 'instances') await this.loadInstances();
    else await this.loadCluster();
  }

  createPrimaryAction(): void {
    if (this.tab() === 'queues') this.focusQueueForm();
    else if (this.tab() === 'instances') this.selectState('running');
    else void this.openNodeGroupForm();
  }

  protected async loadQueues(): Promise<void> {
    if (!this.accountId() || !this.region()) return;
    this.loading.set(true); this.error.set('');
    try {
      const query = new URLSearchParams({ accountId: this.accountId(), region: this.region() });
      const result = await this.session.request<{ queues: Queue[] }>('/deployments/aws/resources/sqs?' + query);
      this.queues.set(result.queues);
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.loading.set(false); }
  }

  protected async createQueue(): Promise<void> {
    if (!this.accountId() || !this.region() || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await this.session.request<{ name: string }>('/deployments/aws/resources/sqs', 'POST', {
        accountId: this.accountId(), region: this.region(), name: this.queueName.trim(), fifo: this.fifo(),
      });
      this.queueName = '';
      this.queueFormOpen.set(false);
      this.notice.set(`Queue ${result.name} created.`);
      await this.loadQueues();
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  protected async loadInstances(): Promise<void> {
    if (!this.accountId() || !this.region()) return;
    this.loading.set(true); this.error.set('');
    try {
      const query = new URLSearchParams({ accountId: this.accountId(), region: this.region() });
      const result = await this.session.request<{ instances: Ec2Instance[] }>('/deployments/aws/resources/instances?' + query);
      this.instances.set(result.instances);
      this.selectedIds.set(new Set([...this.selectedIds()].filter(id => result.instances.some(item => item.id === id))));
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.loading.set(false); }
  }

  protected uptime(instance: Ec2Instance): string {
    if (instance.state !== 'running' || !instance.launchTime) return '—';
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(instance.launchTime)) / 1000));
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor(seconds % 86_400 / 3_600);
    const minutes = Math.floor(seconds % 3_600 / 60);
    return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  protected isSelected(id: string): boolean { return this.selectedIds().has(id); }
  protected toggleSelected(id: string, checked: boolean): void {
    this.selectedIds.update(ids => { const next = new Set(ids); checked ? next.add(id) : next.delete(id); return next; });
  }

  protected selectState(state: 'running' | 'stopped'): void {
    this.selectedIds.set(new Set(this.instances().filter(item => item.state === state).map(item => item.id)));
  }

  protected selectedEligibleCount(state?: 'running' | 'stopped'): number {
    return this.instances().filter(item => this.selectedIds().has(item.id) && item.eligibleForStartStop && (!state || item.state === state)).length;
  }

  protected selectedManagedCount(): number {
    return this.instances().filter(item => this.selectedIds().has(item.id) && !item.eligibleForStartStop).length;
  }

  protected async changeInstances(action: 'start' | 'stop'): Promise<void> {
    const ids = this.instances().filter(item => this.selectedIds().has(item.id) && item.eligibleForStartStop &&
      item.state === (action === 'stop' ? 'running' : 'stopped')).map(item => item.id);
    if (!ids.length || this.busy()) return;
    const verb = action === 'stop' ? 'Stop' : 'Start';
    if (!window.confirm(`${verb} ${ids.length} selected EC2 instance${ids.length === 1 ? '' : 's'} in ${this.region()}? This changes their running state and may interrupt services.`)) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await this.session.request<{ instances: { id: string; state: string }[] }>(
        '/deployments/aws/resources/instances/action', 'POST', {
          accountId: this.accountId(), region: this.region(), instanceIds: ids, action,
        });
      this.notice.set(`${verb} request submitted for ${result.instances.length} instance${result.instances.length === 1 ? '' : 's'}.`);
      await this.loadInstances();
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  protected async selectTarget(id: string): Promise<void> { this.targetId.set(id); await this.loadCluster(); }

  protected async loadCluster(): Promise<void> {
    if (!this.targetId()) return;
    this.loading.set(true); this.error.set('');
    try {
      const query = new URLSearchParams({ targetId: this.targetId() });
      this.overview.set(await this.session.request<EksOverview>('/deployments/eks/overview?' + query));
    } catch (error) { this.error.set(this.message(error)); this.overview.set(null); }
    finally { this.loading.set(false); }
  }

  protected readyNodeCount(nodes: EksNode[]): number { return nodes.filter(node => node.ready).length; }
  protected runningPodCount(pods: EksPod[]): number { return pods.filter(pod => pod.state === 'Running').length; }

  protected formatCpu(value?: string): string {
    const milli = this.cpuMillicores(value);
    if (milli === undefined) return '—';
    return milli < 1000 ? `${Math.round(milli)}m` : `${(milli / 1000).toFixed(2)} cores`;
  }

  protected formatMemory(value?: string): string {
    const bytes = this.memoryBytes(value);
    if (bytes === undefined) return '—';
    return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GiB` : `${Math.round(bytes / 1024 ** 2)} MiB`;
  }

  protected metricPercent(usage: string | undefined, capacity: string | undefined, kind: 'cpu' | 'memory'): number | undefined {
    const used = kind === 'cpu' ? this.cpuMillicores(usage) : this.memoryBytes(usage);
    const total = kind === 'cpu' ? this.cpuMillicores(capacity) : this.memoryBytes(capacity);
    if (used === undefined || total === undefined || total <= 0) return;
    return Math.min(100, Math.round(used / total * 1000) / 10);
  }

  protected async setupMetrics(): Promise<void> {
    if (!this.targetId() || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await this.session.request<{ status: string; message: string }>(
        '/deployments/eks/metrics/setup', 'POST', { targetId: this.targetId() });
      this.notice.set(result.message);
      await this.loadCluster();
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  protected async openNodeGroupForm(): Promise<void> {
    this.nodeGroupFormOpen.set(true);
    this.nodeGroupOptions.set(null);
    this.selectedWorkerSubnets.set([]);
    this.error.set('');
    this.nodeGroupLoading.set(true);
    const target = this.targets().find(item => item.id === this.targetId());
    const existing = this.overview()?.nodeGroups.length ?? 0;
    const suffix = existing + 1;
    this.nodeGroupName = `${(target?.name ?? 'cluster').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 45)}-workers-${suffix}`;
    this.instanceType = target?.platform === 'linux/amd64' ? 't3.medium' : 't4g.medium';
    try {
      const query = new URLSearchParams({ targetId: this.targetId() });
      const options = await this.session.request<NodeGroupOptions>('/deployments/eks/nodegroups/options?' + query);
      this.nodeGroupOptions.set(options);
      this.selectedWorkerSubnets.set(options.subnets.filter(subnet => subnet.state === 'available').map(subnet => subnet.id));
      this.recountWorkerZones();
      if (!options.roleConfigured) {
        this.error.set('Add the EC2 node role ARN in Settings → Cloud providers before creating worker nodes.');
      }
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.nodeGroupLoading.set(false);
    }
  }

  protected toggleWorkerSubnet(id: string, checked: boolean): void {
    this.selectedWorkerSubnets.update(ids => checked ? [...ids, id] : ids.filter(value => value !== id));
    this.recountWorkerZones();
  }

  protected async createNodeGroup(form: NgForm): Promise<void> {
    if (this.busy() || form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    const options = this.nodeGroupOptions();
    const targetId = this.targetId();
    if (!options?.roleConfigured || this.selectedWorkerZones() < 2) {
      this.error.set(!options?.roleConfigured ? 'Configure an EC2 node role before creating workers.' :
        'Select available subnets in at least two Availability Zones.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const result = await this.session.request<{ name: string; status: string; desiredNodes: number }>(
        '/deployments/eks/nodegroups', 'POST', {
          targetId, name: this.nodeGroupName.trim(), instanceType: this.instanceType.trim(), capacityType: this.capacityType,
          diskGiB: this.diskGiB, minNodes: this.minNodes, desiredNodes: this.desiredNodes, maxNodes: this.maxNodes,
          subnetIds: this.selectedWorkerSubnets(),
        });
      this.notice.set(`AWS accepted node group ${result.name}. EKS is creating ${result.desiredNodes} worker${result.desiredNodes === 1 ? '' : 's'}; refresh cluster status to see them join.`);
      this.nodeGroupFormOpen.set(false);
      await this.loadCluster();
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected podsOnNode(name: string): number { return this.overview()?.pods.filter(pod => pod.node === name).length ?? 0; }

  protected async scaleNodeGroup(group: NodeGroup, action: 'start' | 'stop'): Promise<void> {
    const message = action === 'stop'
      ? `Set EKS node group ${group.name} to zero workers? Applications on these nodes will stop until workers are started again. The EKS control plane remains billable.`
      : `Start one worker in EKS node group ${group.name}?`;
    if (!window.confirm(message) || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      await this.session.request('/deployments/eks/nodegroups/' + encodeURIComponent(group.name) + '/scaling', 'POST', {
        targetId: this.targetId(), action,
      });
      this.notice.set(action === 'stop' ? `Scale-down submitted for ${group.name}.` : `Start submitted for ${group.name}.`);
      await this.loadCluster();
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  protected formatSeconds(value: number): string {
    if (!value) return '—';
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor(value % 3600 / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  protected formatBytes(value: number | undefined): string {
    if (value === undefined) return '—';
    if (value < 1024) return `${Math.round(value)} B`;
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);
    try {
      const [awsResult, deployResult] = await Promise.all([
        this.session.request<{ accounts: AwsAccount[] }>('/deployments/aws/accounts'),
        this.session.request<{ targets: ClusterTarget[] }>('/deployments'),
      ]);
      this.accounts.set(awsResult.accounts);
      this.targets.set(deployResult.targets.filter(item => Boolean(item.eks)));
      const first = awsResult.accounts[0];
      this.accountId.set(first?.id ?? ''); this.region.set(first?.regions[0] ?? '');
      const initialTarget = this.targets().find(target => target.id === this.initialTargetId());
      this.targetId.set(initialTarget?.id ?? this.targets()[0]?.id ?? '');
      if (initialTarget) this.tab.set('cluster');
      await this.refreshActive();
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.loading.set(false); }
  }

  private recountWorkerZones(): void {
    const selected = new Set(this.selectedWorkerSubnets());
    this.selectedWorkerZones.set(new Set((this.nodeGroupOptions()?.subnets ?? [])
      .filter(subnet => selected.has(subnet.id) && subnet.state === 'available').map(subnet => subnet.zoneId)).size);
  }

  private cpuMillicores(value?: string): number | undefined {
    if (!value) return;
    const values = value.split('+').map(part => {
      const match = /^\s*(\d+(?:\.\d+)?)(n|u|m)?\s*$/.exec(part);
      if (!match) return undefined;
      const quantity = Number(match[1]);
      return match[2] === 'n' ? quantity / 1_000_000 : match[2] === 'u' ? quantity / 1_000 :
        match[2] === 'm' ? quantity : quantity * 1000;
    });
    if (values.some(part => part === undefined)) return;
    return values.reduce<number>((total, part) => total + (part ?? 0), 0);
  }

  private memoryBytes(value?: string): number | undefined {
    if (!value) return;
    const scales: Record<string, number> = {
      Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6,
      k: 1000, M: 1000 ** 2, G: 1000 ** 3, T: 1000 ** 4, P: 1000 ** 5, E: 1000 ** 6,
    };
    const values = value.split('+').map(part => {
      const match = /^\s*(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?\s*$/.exec(part);
      return match ? Number(match[1]) * (match[2] ? scales[match[2]] : 1) : undefined;
    });
    if (values.some(part => part === undefined)) return;
    return values.reduce<number>((total, part) => total + (part ?? 0), 0);
  }

  private message(error: unknown): string { return error instanceof Error ? error.message : 'The AWS resources request failed.'; }
}
