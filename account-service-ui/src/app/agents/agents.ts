import {AgentRuntimeConfig} from '../shared/agent-runtime-config';
import { ActorIconComponent } from '../shared/actor-icon';
import {
  Component,
  OnChanges,
  OnDestroy,
  Input,
  inject,
  ChangeDetectorRef,
  effect,
  untracked,
} from '@angular/core';
import { Subscription, timeout } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { environment } from '../../environment';
import { ProjectContextService } from '../project-context.service';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { UserAccessPanel } from '../shared/user-access-panel';
import { WorkItemDialogService } from '../shared/work-item-dialog.service';
import { appUrl } from '@greatley-poshley/suite';
@Component({
  selector: 'app-agents',
  standalone: true,
  imports: [AgentRuntimeConfig, ActorIconComponent, CommonModule, FormsModule, WorkspaceHeroComponent, UserAccessPanel],
  styleUrls: ['./agents.css', '../shared/field-controls.css'],
  templateUrl: './agents.html',
})
export class Agents implements OnChanges, OnDestroy {
  @Input() projectId = 0;
  @Input() embedded = false;
  ngOnChanges() {
    this.load();
  }
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  readonly projects = inject(ProjectContextService);
  private item = inject(WorkItemDialogService);
  private base = environment.apiBaseUrlM + '/workspace/agents';
  runtime:any=null;
  agents: any[] = [];
  selected: any = null;
  editing = false;
  draft: any = {};
  query = '';
  error = '';
  loading = false;
  saving = false;
  work: any[] = [];
  tab = 'overview';
  private request?: Subscription;
  private readonly context = effect(() => {
    this.projects.selectedProjectId();
    untracked(() => this.load());
  });
  private normalize(value: any) {
    return {
      ...value,
      id: Number(value?.id),
      name: String(value?.name || value?.display_name || 'Unnamed agent'),
      projectIds: Array.isArray(value?.projectIds) ? value.projectIds.map(Number) : [],
    };
  }
  private options() {
    return { headers: this.auth.getAuthHeaders() };
  }
  private fail(e: any) {
    this.loading = false;
    this.saving = false;
    this.error = e.error?.message || e.error?.detail || 'Unable to complete this request.';
    this.cdr.markForCheck();
  }
  load() {
    this.request?.unsubscribe();
    this.loading = true;
    this.error = '';
    const projectId = this.projectId || this.projects.selectedProjectId() || 0;
    this.request = this.http
      .get<any>(
        this.base + '?projectId=' + projectId + '&q=' + encodeURIComponent(this.query),
        this.options(),
      )
      .pipe(timeout(15000))
      .subscribe({
        next: (response) => {
          const rows = Array.isArray(response)
            ? response
            : (response?.data ?? response?.items ?? []);
          this.agents = (Array.isArray(rows) ? rows : [])
            .filter((row) => row && Number(row.id) > 0)
            .map((row) => this.normalize(row));
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (e) => this.fail(e),
      });
  }
  create() {
    this.selected = null;
    this.draft = {
      name: '',
      designation: '',
      description: '',
      instructions: '',
      model: '',
      status: 'ACTIVE',
      projectIds: this.projectId || this.projects.selectedProjectId()
        ? [this.projectId || this.projects.selectedProjectId()]
        : [],
    };
    this.editing = true;
    this.tab = 'overview';
  }
  open(agent: any) {
    this.error = '';
    this.http.get(this.base + '/' + agent.id, this.options()).subscribe({
      next: (a) => {
        this.selected = this.normalize(a);
        this.http.get<any>(location.protocol+'//'+location.hostname+':8092/api/agent-runtime/status',this.options()).pipe(timeout(6000)).subscribe({next:value=>{this.runtime=value;this.cdr.markForCheck();},error:()=>{this.runtime=null;this.cdr.markForCheck();}});
        this.editing = false;
        this.tab = 'overview';
        this.cdr.markForCheck();
      },
      error: (e) => this.fail(e),
    });
  }
  edit() {
    this.draft = structuredClone(this.selected);
    this.editing = true;
  }
  cancel() {
    this.editing = false;
    this.error = '';
  }
  save() {
    if (this.saving || !this.draft.name.trim()) return;
    this.saving = true;
    const request = this.selected
      ? this.http.put(this.base + '/' + this.selected.id, this.draft, this.options())
      : this.http.post(this.base, this.draft, this.options());
    request.subscribe({
      next: (a) => {
        this.selected = this.normalize(a);
        this.editing = false;
        this.saving = false;
        this.load();
      },
      error: (e) => this.fail(e),
    });
  }
  selectTab(tab: string) {
    this.tab = tab;
    if (tab === 'work')
      this.http.get<any[]>(this.base + '/' + this.selected.id + '/work', this.options()).subscribe({
        next: (rows) => {
          this.work = rows;
          this.cdr.markForCheck();
        },
        error: (e) => this.fail(e),
      });
  }
  openItem(row: any) {
    this.item.open(row.projectId, row.kind, row.id);
  }
  openWorkLogs(row:any) { this.item.openAgentWork(row.projectId,row.kind,row.id); }
  chat() {
    window.open(appUrl('chatly', { agentId: this.selected.id }), '_blank', 'noopener');
  }
  showRuntime=false;
  configureRuntime() {this.showRuntime=!this.showRuntime;}
  toggleProject(id: number, checked: boolean) {
    this.draft.projectIds = checked
      ? [...this.draft.projectIds, id]
      : this.draft.projectIds.filter((value: number) => value !== id);
  }
  initials(name: string) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
  }
}
