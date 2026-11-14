import {FilterMenu} from '../shared/filter-menu';
import { A11yModule } from '@angular/cdk/a11y';
import { Component, ChangeDetectorRef, inject, effect, untracked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, timeout } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { WorkspaceSettingsService } from '../shared/workspace-settings.service';
import { ProjectWorkService, ProjectWorkItem } from '../shared/project-work.service';
import { PersonPickerComponent } from '../shared/person-picker';
import { WorkItemDialogService } from '../shared/work-item-dialog.service';
import { environment } from '../../environment';
@Component({
  selector: 'app-roadmap',
  standalone: true,
  imports: [FilterMenu,
    A11yModule,
    CommonModule,
    FormsModule,
    WorkspaceHeroComponent,
    PersonPickerComponent,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './roadmap.html',
  styleUrls: ['./roadmap.css', '../shared/field-controls.css'],
})
export class Roadmap implements OnDestroy {
  readonly projects = inject(ProjectContextService);
  readonly settings = inject(WorkspaceSettingsService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private work = inject(ProjectWorkService);
  private dialogs = inject(WorkItemDialogService);
  private cdr = inject(ChangeDetectorRef);
  private request?: Subscription;
  private generation = 0;
  initiatives: any[] = [];
  items: ProjectWorkItem[] = [];
  people: any[] = [];
  loading = false;
  busy = false;
  error = '';
  query = '';
  status = '';
  view = 'timeline';
  draft: any = null;
  ticketQuery = '';
  ticketLimit = 50;
  strategyOpen = false;
  year = new Date().getFullYear();
  years = [this.year, this.year + 1, this.year + 2];
  startYear = this.year;
  startMonth = new Date().getMonth();
  statuses = ['PLANNED', 'IN_PROGRESS', 'AT_RISK', 'COMPLETED', 'PAUSED'];
  readonly phases = [
    {
      quarter: 'Q4 2026',
      title: 'Reliable collaboration foundation',
      owner: 'Engineering lead',
      outcome:
        'Stable sign-in, organization access, project membership, chat attachments and shared work-item views.',
      gate: 'No open access-control regressions; supported application flows recover from service outages.',
    },
    {
      quarter: 'Q1 2027',
      title: 'Consistent planning and delivery',
      owner: 'Product owner + scrum master',
      outcome:
        'Roadmaps linked to tickets, sprint lifecycle, releases, test tags and team planning.',
      gate: 'Every initiative has an owner, target date and measurable acceptance criteria.',
    },
    {
      quarter: 'Q2 2027',
      title: 'Connected knowledge and conversations',
      owner: 'Collaboration lead',
      outcome:
        'Docsy sharing, revisions, ticket links, chat discovery, mentions and searchable activity.',
      gate: 'Document permissions match in Docsy, Chatly and ticket attachments.',
    },
    {
      quarter: 'Q3 2027',
      title: 'Operational readiness',
      owner: 'Platform lead',
      outcome:
        'Service health, traces, backups, restore drills, Kafka replay and delivery monitoring.',
      gate: 'Demonstrated restore and failure recovery; publish measured latency and delivery targets.',
    },
    {
      quarter: 'Q4 2027',
      title: 'Human and agent identity design',
      owner: 'Security + AI lead',
      outcome:
        'Separate human and agent identities, explicit scopes, creator attribution and approval rules.',
      gate: 'Threat model, tenant isolation and human approval policy reviewed before execution.',
    },
    {
      quarter: 'Q1 2028',
      title: 'Agent recommendations pilot',
      owner: 'Product + AI lead',
      outcome:
        'Agents suggest ticket breakdowns, documentation drafts and triage with human review.',
      gate: 'Suggestions are labelled; no autonomous writes; quality evaluated on a consented pilot.',
    },
    {
      quarter: 'Q2 2028',
      title: 'Supervised agent assignments',
      owner: 'AI engineering lead',
      outcome:
        'Assign narrowly scoped tasks to agents with sandbox runs, budgets and audit trails.',
      gate: 'Human approval required for external actions; stop, retry and rollback exercised.',
    },
    {
      quarter: 'Q3 2028',
      title: 'Evidence-based delivery insights',
      owner: 'Analytics lead',
      outcome:
        'Flow, predictability, release readiness and workload trends with clear definitions.',
      gate: 'Metrics trace to source records and support team improvement without individual ranking.',
    },
    {
      quarter: 'Q4 2028',
      title: 'Enterprise governance',
      owner: 'Security + platform lead',
      outcome:
        'Retention, exports, delegated administration, audit access and integration governance.',
      gate: 'Access reviews and organization isolation tests pass; retention is configurable.',
    },
    {
      quarter: 'Q1 2029',
      title: 'Integration ecosystem',
      owner: 'Developer experience lead',
      outcome: 'Versioned APIs, webhooks, integration credentials and installation permissions.',
      gate: 'Contract tests, idempotency and rate limits documented and verified.',
    },
    {
      quarter: 'Q2 2029',
      title: 'Scale validated by workload',
      owner: 'SRE lead',
      outcome:
        'Profile realistic usage, partition hot data, tune search and scale services independently.',
      gate: 'Capacity and availability targets proven by controlled load and recovery exercises.',
    },
    {
      quarter: 'Q3 2029',
      title: 'Trusted agent collaboration expansion',
      owner: 'Product + security + AI leads',
      outcome: 'Expand approved agent capabilities based on pilot evidence and customer controls.',
      gate: 'Auditability, attribution, approval gates and measured quality remain release criteria.',
    },
  ];
  private readonly context = effect(() => {
    const id = this.projects.selectedProjectId();
    untracked(() => this.load(id));
  });
  private readonly live = effect(() => {
    const event = this.settings.lastEvent();
    if (event?.type === 'ROADMAP_UPDATED' && !this.draft)
      untracked(() => this.load(this.projects.selectedProjectId()));
  });
  get options() {
    return { headers: this.auth.getAuthHeaders() };
  }
  get url() {
    return environment.apiBaseUrlM + '/workspace/roadmap';
  }
  get canManage() {
    return this.settings.can('PROJECTS.UPDATE');
  }
  get filtered() {
    return this.initiatives.filter(
      (row) =>
        (!this.status || row.status === this.status) &&
        (!this.query ||
          [row.title, row.description, row.owner_name]
            .join(' ')
            .toLowerCase()
            .includes(this.query.toLowerCase())),
    );
  }
  get quarters() {
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(this.startYear, this.startMonth + i * 3, 1),
        end = new Date(this.startYear, this.startMonth + i * 3 + 2, 1);
      return {
        label:
          start.toLocaleDateString('en', { month: 'short', year: '2-digit' }) +
          ' – ' +
          end.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
      };
    });
  }
  load(id: number | null) {
    this.request?.unsubscribe();
    this.request = new Subscription();
    const generation = ++this.generation;
    this.draft = null;
    this.initiatives = [];
    this.items = [];
    this.people = [];
    this.error = '';
    this.loading = !!id;
    if (!id) return;
    // Render initiatives independently of a large project's ticket directory.
    this.request.add(
      this.http
        .get<any>(this.url + '?projectId=' + id, this.options)
        .pipe(timeout(15000))
        .subscribe({
          next: (response) => {
            if (generation !== this.generation) return;
            const rows = Array.isArray(response)
              ? response
              : (response?.data ?? response?.items ?? []);
            this.initiatives = (Array.isArray(rows) ? rows : [])
              .filter((row) => row && row.id)
              .map((row) => ({
                ...row,
                title: String(row.title || 'Untitled initiative'),
                status: String(row.status || 'PLANNED'),
                tickets: Array.isArray(row.tickets) ? row.tickets : [],
              }));
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: (e) => {
            if (generation !== this.generation) return;
            this.loading = false;
            this.error =
              e?.error?.message ||
              'Unable to load the project roadmap. Check the workspace service and retry.';
            this.cdr.markForCheck();
          },
        }),
    );
    this.request.add(
      this.work
        .load(id)
        .pipe(timeout(30000))
        .subscribe({
          next: (result) => {
            if (generation !== this.generation) return;
            this.items = result.items || [];
            this.people = (result.users || []).map((u) => ({
              ...u,
              id: Number(u.id),
              name:
                u.fullName ||
                u.name ||
                [u.firstName || u.first_name, u.lastName || u.last_name].filter(Boolean).join(' '),
              designation: u.role_name || u.roleName || u.designation,
              email: u.email,
            }));
            this.cdr.markForCheck();
          },
          error: () => {
            if (generation === this.generation) {
              this.error =
                this.error ||
                'The roadmap is available, but linked work could not be loaded. Retry to refresh ticket details.';
              this.cdr.markForCheck();
            }
          },
        }),
    );
  }
  openDraft(row?: any) {
    if (!this.canManage) return;
    this.ticketQuery = '';
    this.ticketLimit = 50;
    this.draft = row
      ? {
          ...row,
          startsOn: String(row.starts_on).slice(0, 10),
          targetOn: String(row.target_on).slice(0, 10),
          ownerId: row.owner_id,
          tickets: [...row.tickets],
        }
      : {
          title: '',
          description: '',
          status: 'PLANNED',
          ownerId: null,
          startsOn: new Date().toISOString().slice(0, 10),
          targetOn: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
          tickets: [],
        };
  }
  usePhase(phase: any) {
    this.strategyOpen = false;
    this.openDraft();
    this.draft.title = phase.title;
    this.draft.description =
      phase.outcome + '\n\nAccountable role: ' + phase.owner + '\n\nAcceptance gate: ' + phase.gate;
    const q = Number(phase.quarter[1]),
      y = Number(phase.quarter.slice(3));
    this.draft.startsOn = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
    this.draft.targetOn = new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10);
    if (phase === this.phases[0]) this.draft.startsOn = '2026-11-01';
    if (phase === this.phases[this.phases.length - 1]) this.draft.targetOn = '2029-10-31';
  }
  get matchingTickets() {
    return this.items.filter(
      (item) =>
        !this.ticketQuery ||
        [item.title, item.key, item.assignee]
          .join(' ')
          .toLowerCase()
          .includes(this.ticketQuery.toLowerCase()),
    );
  }
  hasTicket(item: ProjectWorkItem) {
    return this.draft?.tickets.some((r: any) => r.kind === item.kind && Number(r.id) === item.id);
  }
  toggleTicket(item: ProjectWorkItem) {
    if (!this.hasTicket(item) && this.draft.tickets.length >= 200) {
      this.error = 'Link up to 200 tickets to an initiative.';
      return;
    }
    this.draft.tickets = this.hasTicket(item)
      ? this.draft.tickets.filter((r: any) => !(r.kind === item.kind && Number(r.id) === item.id))
      : [...this.draft.tickets, { kind: item.kind, id: item.id }];
  }
  linked(row: any) {
    return (Array.isArray(row.tickets) ? row.tickets : [])
      .map((ref: any) =>
        this.items.find((item) => item.kind === ref.kind && item.id === Number(ref.id)),
      )
      .filter(Boolean) as ProjectWorkItem[];
  }
  progress(row: any) {
    const work = this.linked(row);
    return work.length
      ? Math.round(
          (work.filter((item) => this.settings.done(item.status)).length / work.length) * 100,
        )
      : 0;
  }
  openItem(item: ProjectWorkItem) {
    this.dialogs.open(item.projectId, item.kind, item.id);
  }
  bar(row: any) {
    const from = new Date(this.startYear, this.startMonth, 1).getTime(),
      to = new Date(this.startYear + 3, this.startMonth, 1).getTime(),
      start = new Date(row.starts_on).getTime(),
      end = new Date(row.target_on).getTime();
    return {
      left: Math.max(0, ((start - from) / (to - from)) * 100) + '%',
      width: (Math.max(0, Math.min(to, end) - Math.max(from, start)) / (to - from)) * 100 + '%',
    };
  }
  color(status: string) {
    return (
      (
        {
          PLANNED: '#316bd7',
          IN_PROGRESS: '#7356cb',
          AT_RISK: '#c7790b',
          COMPLETED: '#24845d',
          PAUSED: '#64748b',
        } as Record<string, string>
      )[status] || '#316bd7'
    );
  }
  save() {
    if (this.busy || !this.draft) return;
    this.busy = true;
    this.error = '';
    const id = this.draft.id,
      projectId = this.projects.selectedProjectId(),
      generation = this.generation;
    const body = { ...this.draft, projectId };
    const request = id
      ? this.http.put<any[]>(this.url + '/' + id, body, this.options)
      : this.http.post<any[]>(this.url, body, this.options);
    request.subscribe({
      next: (rows) => {
        this.busy = false;
        if (generation !== this.generation) return;
        this.initiatives = rows;
        this.draft = null;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.message || 'Unable to save initiative.';
        this.cdr.markForCheck();
      },
    });
  }
  remove(row: any) {
    if (this.busy || !confirm('Delete this initiative? Linked tickets will remain.')) return;
    this.busy = true;
    this.http.delete(this.url + '/' + row.id, this.options).subscribe({
      next: () => {
        this.busy = false;
        this.load(this.projects.selectedProjectId());
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.message || 'Unable to delete initiative.';
        this.cdr.markForCheck();
      },
    });
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
  }
}
