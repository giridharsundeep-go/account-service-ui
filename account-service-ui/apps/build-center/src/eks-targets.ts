import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BuildPlatform, DeploymentTarget, EksAccountOption } from './models';
import { BuildCenterSession } from './session';

@Component({
  selector: 'app-eks-targets',
  imports: [FormsModule],
  templateUrl: './eks-targets.html',
  styleUrls: ['./build-center.css', './deployments.css'],
})
export class EksTargets {
  readonly accounts = input.required<EksAccountOption[]>();
  readonly targets = input.required<DeploymentTarget[]>();
  readonly configurationMessage = input('');
  readonly connected = output<DeploymentTarget>();
  readonly refreshAccounts = output<void>();
  private readonly session = inject(BuildCenterSession);
  protected readonly opened = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly clusters = signal<string[] | null>(null);
  protected readonly accountId = signal('');
  protected readonly account = computed(() => this.accounts().find(item => item.id === this.accountId()));
  protected region = '';
  protected cluster = '';
  protected namespace = '';
  protected platform: BuildPlatform = 'linux/amd64';

  constructor() {
    effect(() => {
      const first = this.accounts()[0];
      if (this.opened() && first && !this.account()) this.selectAccount(first.id);
    });
  }

  open(): void {
    this.error.set('');
    this.notice.set('');
    if (!this.account()) this.selectAccount(this.accounts()[0]?.id ?? '');
    this.opened.set(true);
  }

  protected selectAccount(id: string): void {
    this.accountId.set(id);
    this.namespace = this.account()?.namespaces[0] ?? '';
    this.selectRegion(this.account()?.regions[0] ?? '');
  }

  protected selectRegion(region: string): void {
    this.region = region;
    this.cluster = '';
    this.clusters.set(null);
    this.error.set('');
  }

  protected async discover(): Promise<void> {
    const account = this.account();
    if (!account || !this.region) return;
    await this.act(async () => {
      const query = new URLSearchParams({ region: this.region });
      const { clusters } = await this.session.request<{ clusters: string[] }>(
        '/deployments/eks/accounts/' + account.id + '/clusters?' + query,
      );
      this.clusters.set(clusters);
      this.cluster = clusters.length === 1 ? clusters[0] : '';
    });
  }

  protected async connect(): Promise<void> {
    if (!this.cluster || !this.namespace) return;
    await this.act(async () => {
      const target = await this.session.request<DeploymentTarget>('/deployments/eks/connect', 'POST', {
        accountId: this.accountId(), region: this.region, cluster: this.cluster,
        namespace: this.namespace, platform: this.platform,
      });
      this.connected.emit(target);
      this.notice.set(target.name + ' connected in namespace ' + target.namespace + '.');
      this.opened.set(false);
    });
  }

  protected async check(target: DeploymentTarget): Promise<void> {
    await this.act(async () => {
      await this.session.request('/deployments/targets/' + target.id + '/check', 'POST');
      this.notice.set(target.name + ' is reachable with deployment access in ' + target.namespace + '.');
    });
  }

  private async act(work: () => Promise<void>): Promise<void> {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      await work();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not complete the AWS request.');
    } finally {
      this.busy.set(false);
    }
  }
}
