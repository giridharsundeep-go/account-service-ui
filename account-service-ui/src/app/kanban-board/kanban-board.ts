import {WorkspaceSettingsService} from '../shared/workspace-settings.service';
import {untracked} from '@angular/core';
import { TicketCollaborationComponent } from '../shared/ticket-collaboration';
import { RecentWorkService } from '../shared/recent-work.service';
import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output, OnInit, HostListener, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';
import { WorkItemDialogRequest } from '../shared/work-item-dialog.service';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { PersonPickerComponent } from '../shared/person-picker';
import { ApiCollectionService } from '../shared/api-collection.service';

type WorkStatus = string;
type WorkPriority = 'Low' | 'Medium' | 'High' | 'Critical';
type ItemType = 'Epic' | 'Story' | 'Task' | 'Bug';
type FilterField = 'Parent' | 'Assignee' | 'Status' | 'Work type' | 'Labels' | 'Sprint' | 'Priority';

interface ProjectOption { id: number; name: string; [key: string]: any; }
interface SprintOption {
  id: number; name: string; projectId?: number; startDate?: string; endDate?: string;
  status?: string; [key: string]: any;
}
interface PersonOption { id: number; lookupIds?: number[]; name: string; initials: string; designation?: string; avatarUrl?: string | null; email?: string; }
interface WorkItem {
  /** Stable unique key also used for drag/drop; IDs can overlap between item types. */
  id: string;
  sourceId: number;
  sourceType: 'EPIC' | 'STORY' | 'TASK' | 'ISSUE';
  key: string;
  title: string;
  description: string;
  type: ItemType;
  status: WorkStatus;
  priority: WorkPriority;
  points?: number;
  issueCount: number;
  assignee: string;
  assigneeId: number | null;
  reporterId: number | null;
  reporterName?: string;
  initials: string;
  sprintId: number | null;
  sprint: string;
  parentEpic?: string;
  labels: string[];
  projectId: number;
  raw: any;
}

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [TicketCollaborationComponent, CommonModule, A11yModule, FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, WorkspaceHeroComponent, PersonPickerComponent],
  templateUrl: './kanban-board.html',
  styleUrls: ['./kanban-board.css', '../shared/field-controls.css', '../shared/board-surface.css']
})
export class KanbanBoard implements OnInit {
  @Input() dialogRequest: WorkItemDialogRequest | null = null;
  fullscreenMode = false;
  @HostListener('document:keydown.escape') closeOnEscape(): void {
    if (this.dialogRequest) return;
    if (this.sprintProgressOpen) { this.sprintProgressOpen = false; return; }
    if (!this.selectedItem && !this.showCreateForm) this.fullscreenMode = false;
  }
  @Output() dialogClosed = new EventEmitter<void>();
  private readonly recentWork = inject(RecentWorkService);
  private readonly http = inject(HttpClient);
  private readonly collections = inject(ApiCollectionService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly projectContext = inject(ProjectContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly baseUrl = environment.apiBaseUrlM;

  readonly workflow=inject(WorkspaceSettingsService);
  get statuses():string[]{return [...new Set([...this.workflow.names,...this.items.map(item=>this.workflow.label(item.raw?.status??item.status))])];}
  private readonly liveRefresh=effect(()=>{if(this.workflow.revision()>0)untracked(()=>{if(this.selectedProjectId&&!this.detailSaving&&!this.editingDetailField)this.loadProjectData();});});
  sprintStatusCount(status: WorkStatus): number { return this.sprintItems.filter(item => item.status === status).length; }
  readonly descriptionColors = ['#202124', '#2563eb', '#7c3aed', '#16834a', '#c2410c'];
  readonly issueRelationFields = [
    { field: 'epicIds', type: 'EPIC', label: 'Linked Epics' },
    { field: 'storyIds', type: 'STORY', label: 'Linked Stories' },
    { field: 'taskIds', type: 'TASK', label: 'Linked Tasks' }
  ] as const;
  projects: ProjectOption[] = [];
  sprints: SprintOption[] = [];
  people: PersonOption[] = [];
  private personDirectory: PersonOption[] = [];
  selectedProjectId: number | null = null;
  selectedSprintId: number | 'ALL' = 'ALL';
  private currentProjectSprintId: number | null = null;
  searchQuery = '';
  filterPanelOpen = false;
  activeFilterField: FilterField | null = null;
  addFilterMenuOpen = false;
  readonly baseFilterFields: FilterField[] = ['Parent', 'Assignee', 'Status', 'Work type', 'Labels'];
  extraFilterFields: FilterField[] = [];
  sprintProgressOpen = false;
  peopleListOpen = false;
  selectedItem: WorkItem | null = null;
  ticketPermissions={canEdit:false,canComment:false,canAttach:false};
  ticketRevision=0;
  detailEditError = '';
  detailEditMode = false;
  detailSaving = false;
  detailDraft: any = null;
  editingDetailField: string | null = null;
  assigneeSearchText = '';
  reporterSearchText = '';
  activityTab: 'All' | 'Comments' | 'History' | 'Work log' = 'Comments';
  commentText = '';
  savingComment = false;
  copiedItemKey = false;
  selectedAssignee = 'All people';
  selectedPersonId: number | null = null;
  selectedParent = 'All parents';
  selectedStatus = 'All statuses';
  selectedLabel = 'All labels';
  selectedPriority = 'All priorities';
  selectedType = 'All types';
  draggedItemId: string | null = null;
  showCreateForm = false;
  newTitle = '';
  newType: ItemType = 'Task';
  newEpicCode = '';
  newIssueCode = '';
  newDescription = '';
  newStatus: WorkStatus = 'Backlog';
  newPriority: WorkPriority = 'Medium';
  newSprintId: number | null = null;
  newAssigneeId: number | null = null;
  newReporterId: number | null = null;
  newEpicId: number | null = null;
  newStoryId: number | null = null;
  newEpicIds: number[] = [];
  newStoryIds: number[] = [];
  newTaskIds: number[] = [];
  newIsBlocking = false;
  newPoints: number | null = null;
  newLabelsText = '';
  newAssigneeSearchText = '';
  newReporterSearchText = '';
  createError = '';
  creatingItem = false;
  loading = false;
  loadError = '';
  items: WorkItem[] = [];
  private projectStoryIds: number[] = [];
  private boardScrollY = 0;
  private pendingOpenItem: { type: WorkItem['sourceType']; id: number } | null = null;
  private pendingCreateType: ItemType | null = null;
  private lastHandledOpenToken = '';
  private lastHandledCreateType = '';
  private requestedProjectId: number | null = null;
  private readonly projectContextSync = effect(() => {
    const sharedProjectId = this.projectContext.selectedProjectId();
    if (this.dialogRequest) return;
    if (!sharedProjectId || !this.projects.length || sharedProjectId === this.selectedProjectId) return;
    if (this.projects.some(project => project.id === sharedProjectId)) this.onProjectChange(sharedProjectId);
  });

  ngOnInit(): void {
    if (this.dialogRequest) {
      this.requestedProjectId = this.dialogRequest.projectId;
      if (this.dialogRequest.create) this.pendingCreateType = this.dialogRequest.type === 'ISSUE' ? 'Bug' : this.dialogRequest.type === 'EPIC' ? 'Epic' : this.dialogRequest.type === 'STORY' ? 'Story' : 'Task';
      else this.pendingOpenItem = { type: this.dialogRequest.type, id: this.dialogRequest.id };
      this.selectedProjectId = this.dialogRequest.projectId;
      this.projects = [...this.projectContext.projects()];
      if (!this.projects.some(project => project.id === this.selectedProjectId)) {
        this.projects.push({ id: this.selectedProjectId, name: `Project ${this.selectedProjectId}` });
      }
      this.loadProjectContext();
      return;
    }
    this.route.queryParamMap.subscribe(params => {
      const requestedType = String(params.get('openType') || '').toUpperCase();
      const requestedId = Number(params.get('openId'));
      const requestedProjectId = Number(params.get('projectId'));
      if (Number.isFinite(requestedProjectId) && requestedProjectId > 0) {
        this.requestedProjectId = requestedProjectId;
        if (this.projects.length && requestedProjectId !== this.selectedProjectId) this.onProjectChange(requestedProjectId);
      }

      const openToken = ['EPIC', 'STORY', 'TASK', 'ISSUE'].includes(requestedType) && Number.isFinite(requestedId) && requestedId > 0
        ? `${requestedType}:${requestedId}:${requestedProjectId || this.selectedProjectId || ''}`
        : '';
      if (openToken && openToken !== this.lastHandledOpenToken) {
        this.lastHandledOpenToken = openToken;
        this.pendingOpenItem = { type: requestedType as WorkItem['sourceType'], id: requestedId };
      } else if (!openToken) {
        this.lastHandledOpenToken = '';
        this.pendingOpenItem = null;
      }

      const requestedCreate = String(params.get('createType') || '').toLowerCase();
      const createType = requestedCreate === 'issue' ? 'Bug'
        : requestedCreate === 'epic' ? 'Epic'
          : requestedCreate === 'story' ? 'Story'
            : requestedCreate === 'task' ? 'Task' : null;
      if (createType && requestedCreate !== this.lastHandledCreateType) {
        this.lastHandledCreateType = requestedCreate;
        this.pendingCreateType = createType;
      } else if (!createType) {
        this.lastHandledCreateType = '';
        this.pendingCreateType = null;
      }
      if (!this.loading && this.selectedProjectId && (this.pendingOpenItem || this.pendingCreateType)) this.openPendingNavigation();
    });
    this.loading = true;
    this.loadProjects();
  }

  private openPendingNavigation(): void {
    if (this.loading || !this.selectedProjectId) return;
    if (this.pendingOpenItem) {
      const requested = this.pendingOpenItem;
      const item = this.items.find(candidate => candidate.sourceType === requested.type && candidate.sourceId === requested.id);
      if (item) {
        this.pendingOpenItem = null;
        this.openItemDetails(item);
        return;
      }
    }
    if (this.pendingCreateType) {
      const type = this.pendingCreateType;
      this.pendingCreateType = null;
      this.openCreateFor(type);
    }
  }

  private headers() {
    return { headers: this.auth.getAuthHeaders() };
  }

  private extractArray(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== 'object') return [];
    for (const key of [
      'content', 'data', 'items', 'results', 'records', 'projects', 'project',
      'users', 'user', 'individuals', 'projectIndividuals', 'project_individuals',
      'members', 'teamMembers', 'team_members', 'sprints', 'sprint', 'epics',
      'stories', 'tasks', 'issues'
    ]) {
      const value = response[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        // Some APIs wrap a collection as { data: { projects: [...] } } or
        // { data: { items: [...] } }. Keep walking until the actual array.
        const nested = this.extractArray(value);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  /** Resolve API fields that may arrive as nested objects instead of strings. */
  private displayText(value: any, fallback = ''): string {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      for (const key of ['name', 'title', 'label', 'displayName', 'display_name', 'fullName', 'full_name', 'username', 'sprint_name', 'project_name', 'value']) {
        const candidate = value[key];
        if (candidate !== null && candidate !== undefined && typeof candidate !== 'object') return String(candidate);
      }
    }
    return fallback;
  }

  private personDisplayName(value: any): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') return '';
    if (typeof value === 'string') {
      const text = value.trim();
      return /^\d+$/.test(text) ? '' : text;
    }
    if (typeof value !== 'object' || Array.isArray(value)) return '';
    const direct = this.displayText(value, '').trim();
    if (direct) return direct;
    const first = value.first_name ?? value.firstName ?? value.given_name ?? value.givenName;
    const last = value.last_name ?? value.lastName ?? value.family_name ?? value.familyName;
    const fullName = [first, last].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    for (const key of ['user', 'individual', 'member', 'profile', 'person', 'reporter']) {
      if (value[key] && value[key] !== value) {
        const nestedName = this.personDisplayName(value[key]);
        if (nestedName) return nestedName;
      }
    }
    return '';
  }

  private collection(urls: string[]): Observable<any> {
    const tryUrl = (index: number): Observable<any> => {
      if (index >= urls.length) return of([]);
      return this.http.get<any>(urls[index], this.headers()).pipe(
        catchError((): Observable<any> => tryUrl(index + 1))
      );
    };
    return tryUrl(0);
  }

  private loadProjects(): void {
    this.collection([`${this.baseUrl}/projects`, `${this.baseUrl}/project`]).subscribe({
      next: (response: any) => {
        this.projects = this.extractArray(response)
          .map(p => ({
            ...p,
            id: Number(p?.id ?? p?.project_id ?? p?.projectId ?? p?.project?.id),
            name: this.displayText(p?.name ?? p?.project_name ?? p?.projectName ?? p?.title ?? p?.project, `Project ${p?.id ?? ''}`)
          }))
          .filter(p => Number.isFinite(p.id) && p.id > 0 && !!p.name);
        if (!this.projects.length) {
          this.loading = false;
          this.loadError = 'No projects were returned by the Projects API.';
          this.cdr.markForCheck();
          return;
        }
        // Opening an item from the unified work list keeps its project context;
        // otherwise use the shared project selected in the application header.
        this.selectedProjectId = this.projects.find(project => project.id === this.requestedProjectId)?.id ??
          this.projects.find(project => project.id === this.projectContext.selectedProjectId())?.id ?? this.projects[0].id;
        if (!this.dialogRequest) this.projectContext.setSelectedProject(this.selectedProjectId);
        this.cdr.markForCheck();
        this.loadProjectContext();
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Could not load projects. Please check your access and try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /** Load project-scoped reference data first, choose the current cycle, then load its work items.
   * This mirrors Epics: /projects -> selected project -> /sprints + project members -> hierarchy.
   */
  private loadProjectContext(): void {
    const projectId = this.selectedProjectId;
    if (!projectId) return;

    this.loading = true;
    this.loadError = '';
    forkJoin({
      project: this.dialogRequest ? this.http.get<any>(`${this.baseUrl}/projects/${projectId}`, this.headers()).pipe(catchError(() => of(null))) : of(null),
      users: this.http.get<any>(`${this.baseUrl}/project-individuals/${projectId}`, this.headers()).pipe(catchError(() => of([]))),
      allUsers: this.collections.read(`${this.baseUrl}/users`).pipe(catchError(() => of([]))),
      roles: this.http.get<any>(`${this.baseUrl}/roles`, this.headers()).pipe(catchError(() => of([]))),
      sprints: this.http.get<any>(`${this.baseUrl}/sprints`, this.headers()).pipe(catchError(() => of([])))
    }).subscribe(({ project, users, allUsers, roles, sprints }) => {
      // Ignore late responses if the user switched projects while requests were in flight.
      if (projectId !== this.selectedProjectId) return;
      const profile = project?.data ?? project?.project ?? project;
      if (profile && !Array.isArray(profile)) {
        const name = this.displayText(profile.name ?? profile.project_name ?? profile.projectName, '');
        if (name) this.projects = this.projects.map(item => item.id === projectId ? { ...item, ...profile, id: projectId, name } : item);
      }

      const normalizePerson = (u: any, index: number): PersonOption | null => {
        const profile = u?.user ?? u?.individual ?? u?.member?.user ?? u?.member ?? u;
        const role = this.extractArray(roles).find(role => Number(role.id ?? role.role_id) === Number(profile?.role_id ?? profile?.roleId ?? u?.role_id ?? u?.roleId));
        const hasAccountReference = u?.user_account_id != null || u?.userAccountId != null;
        const name = String(profile?.name || profile?.display_name || profile?.displayName || profile?.full_name || profile?.fullName || profile?.user_name || profile?.userName ||
          [profile?.first_name ?? profile?.firstName, profile?.last_name ?? profile?.lastName].filter(Boolean).join(' ') ||
          profile?.username || u?.name || u?.username || `User ${index + 1}`).trim();
        const lookupIds = [...new Set([
          profile?.user_account_id, profile?.userAccountId, profile?.user_id, profile?.userId,
          profile?.uid, ...(profile === u && hasAccountReference ? [] : [profile?.id]),
          profile?.user?.user_account_id, profile?.user?.userAccountId,
          profile?.user?.user_id, profile?.user?.userId, profile?.user?.id,
          u?.user_account_id, u?.userAccountId, u?.user_id, u?.userId, u?.uid,
          ...(hasAccountReference ? [] : [u?.id])
        ].map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0))];
        const id = Number(
          u?.user_account_id ?? u?.userAccountId ?? u?.user_id ?? u?.userId ??
          profile?.user_account_id ?? profile?.userAccountId ?? profile?.user_id ?? profile?.userId ?? profile?.uid ?? profile?.id ??
          profile?.user?.user_account_id ?? profile?.user?.userAccountId ?? profile?.user?.user_id ?? profile?.user?.userId ?? profile?.user?.id ??
          u?.uid ?? u?.id
        );
        if (!Number.isFinite(id) || id <= 0) return null;
        return {
          ...u,
          id,
          lookupIds,
          name,
          email: String(profile?.email ?? u?.email ?? ''),
          initials: this.initials(name),
          designation: String(profile?.designation ?? profile?.job_title ?? profile?.jobTitle ?? profile?.role_name ?? profile?.roleName ?? profile?.role?.name ?? profile?.title ?? u?.designation ?? u?.job_title ?? u?.jobTitle ?? role?.name ?? role?.role_name ?? 'Team member').trim() || 'Team member',
          avatarUrl: profile?.avatarUrl ?? profile?.avatar_url ?? profile?.photoUrl ??
            profile?.user?.avatarUrl ?? profile?.user?.avatar_url ?? profile?.user?.photoUrl ??
            u?.avatarUrl ?? u?.avatar_url ?? u?.photoUrl ?? null
        };
      };
      const projectPeople = this.extractArray(users).map(normalizePerson).filter((person): person is PersonOption => Boolean(person));
      const directoryPeople = this.extractArray(allUsers).map(normalizePerson).filter((person): person is PersonOption => Boolean(person));
      this.personDirectory = this.mergePeople(directoryPeople, projectPeople);
      this.people = this.mergePeople(projectPeople, directoryPeople);

      const normalizedSprints: SprintOption[] = this.extractArray(sprints).map(s => ({
        ...s,
        id: Number(s?.id ?? s?.sprint_id ?? s?.sprintId),
        projectId: this.numberOrNull(s?.project_id ?? s?.projectId ?? s?.project?.id) ?? undefined,
        name: this.displayText(s?.name ?? s?.sprint_name ?? s?.sprintName ?? s?.title ?? s?.sprint, `Sprint ${s?.id ?? ''}`),
        startDate: s?.scheduled_start_date ?? s?.scheduledStartDate ?? s?.startDate ?? s?.start_date ?? s?.start,
        endDate: s?.scheduled_end_date ?? s?.scheduledEndDate ?? s?.endDate ?? s?.end_date ?? s?.end,
        status: this.displayText(s?.status ?? s?.state, '').toUpperCase()
      })).filter(s => Number.isFinite(s.id) && s.id > 0);

      // Match Epics' projectSprints scope: if the API omits project ownership,
      // treat the returned sprint collection as applicable to the selected project.
      this.sprints = normalizedSprints
        .filter(s => s.projectId == null || Number(s.projectId) === projectId)
        .sort((a, b) => {
          if (a.startDate && b.startDate) {
            const diff = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
            if (Number.isFinite(diff) && diff !== 0) return diff;
          }
          return this.extractSprintNumber(a.name) - this.extractSprintNumber(b.name);
        });
      const currentCycle = this.resolveCurrentCycle(this.sprints);
      this.currentProjectSprintId = currentCycle?.id ?? null;
      this.selectedSprintId = this.currentProjectSprintId ?? 'ALL';
      this.cdr.markForCheck();
      this.loadProjectData();
    }, () => {
      this.loading = false;
      this.loadError = 'Could not load sprint and team details for this project.';
      this.cdr.markForCheck();
    });
  }

  /** Same precedence as Epics: ACTIVE, current date range, first non-completed, then first sprint. */
  private resolveCurrentCycle(sprints: SprintOption[]): SprintOption | undefined {
    if (!sprints.length) return undefined;
    const active = sprints.find(s => ['ACTIVE', 'CURRENT', 'IN_PROGRESS'].includes(String(s.status || '').toUpperCase()));
    if (active) return active;

    const now = Date.now();
    const inDateRange = sprints.find(s => {
      if (!s.startDate || !s.endDate) return false;
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
    });
    if (inDateRange) return inDateRange;

    const byStartDate = [...sprints].sort((a, b) => {
      const aTime = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.name).localeCompare(String(b.name));
    });
    return byStartDate.find(s => String(s.status || '').toUpperCase() !== 'COMPLETED') || byStartDate[0];
  }

  private extractSprintNumber(name: string): number {
    const match = String(name || '').match(/(?:sprint|cycle|iteration)\s*#?([0-9]+)/i);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  onProjectChange(projectId: number | string): void {
    const id = Number(projectId);
    if (!Number.isFinite(id) || id <= 0 || id === this.selectedProjectId) return;
    this.selectedProjectId = id;
    this.projectContext.setSelectedProject(id);
    this.currentProjectSprintId = null;
    this.selectedSprintId = 'ALL';
    this.selectedAssignee = 'All people';
    this.selectedPersonId = null;
    this.peopleListOpen = false;
    this.selectedItem = null;
    this.selectedParent = 'All parents';
    this.selectedStatus = 'All statuses';
    this.selectedLabel = 'All labels';
    this.selectedPriority = 'All priorities';
    this.selectedType = 'All types';
    this.searchQuery = '';
    this.people = [];
    this.personDirectory = [];
    this.sprints = [];
    this.items = [];
    this.projectStoryIds = [];
    this.extraFilterFields = [];
    this.activeFilterField = null;
    this.addFilterMenuOpen = false;
    this.loadProjectContext();
  }

  private loadProjectData(): void {
    if (!this.selectedProjectId) return;
    this.loading = true;
    this.loadError = '';
    const projectId = this.selectedProjectId;
    forkJoin({
      requested: this.dialogRequest && !this.dialogRequest.create ? this.http.get<any>(`${this.baseUrl}/${this.dialogRequest.type === 'ISSUE' ? 'v1/issues' : this.dialogRequest.type.toLowerCase() + 's'}/${this.dialogRequest.id}`, this.headers()).pipe(catchError(() => of(null))) : of(null),
      epics: this.http.get<any>(`${this.baseUrl}/projects/${projectId}/epics`, this.headers()).pipe(catchError(() => of([]))),
      stories: this.http.get<any>(`${this.baseUrl}/projects/${projectId}/stories`, this.headers()).pipe(catchError(() => of([]))),
      tasks: this.http.get<any>(`${this.baseUrl}/tasks`, this.headers()).pipe(catchError(() => of([]))),
      issues: this.collection([
        `${this.baseUrl}/v1/issues?projectId=${projectId}`,
        `${environment.apiBaseUrl2 || ''}/v1/issues?projectId=${projectId}`,
        `${environment.apiBaseUrl || ''}/v1/issues?projectId=${projectId}`
      ].filter(Boolean))
    }).subscribe({
      next: ({ epics, stories, tasks, issues, requested }) => {
        if (projectId !== this.selectedProjectId) return;
        const epicRows = this.extractArray(epics);
        const storyRows = this.extractArray(stories);
        const taskRows = this.extractArray(tasks);
        const issueRows = this.extractArray(issues);
        const projectStoryIds = new Set(storyRows.map(s => Number(s?.id ?? s?.story_id ?? s?.storyId)).filter(Number.isFinite));
        this.projectStoryIds = [...projectStoryIds];
        const projectEpicIds = new Set(epicRows.map(e => Number(e?.id ?? e?.epic_id ?? e?.epicId)).filter(Number.isFinite));
        const projectTasks = taskRows.filter(t => {
          const pid = this.numberOrNull(t?.project_id ?? t?.projectId ?? t?.project?.id);
          const storyId = this.numberOrNull(t?.story_id ?? t?.storyId);
          return pid === projectId || (pid === null && storyId !== null && projectStoryIds.has(storyId));
        });
        const storyById = new Map<number, any>(storyRows.map(s => [Number(s?.id ?? s?.story_id ?? s?.storyId), s]));
        const epicById = new Map<number, any>(epicRows.map(e => [Number(e?.id ?? e?.epic_id ?? e?.epicId), e]));
        const storyByEpic = new Map<number, any>();
        for (const story of storyRows) storyByEpic.set(Number(story?.id ?? story?.story_id ?? story?.storyId), epicById.get(Number(story?.epic_id ?? story?.epicId)));
        const sprintById = new Map<number, SprintOption>(this.sprints.map(s => [s.id, s]));
        const next: WorkItem[] = [];

        const addItem = (raw: any, sourceType: WorkItem['sourceType'], parent?: any, fallbackSprint?: any) => {
          const sourceId = Number(raw?.id ?? raw?.epic_id ?? raw?.epicId ?? raw?.story_id ?? raw?.storyId ?? raw?.task_id ?? raw?.taskId ?? raw?.issue_id ?? raw?.issueId);
          if (!Number.isFinite(sourceId) || sourceId <= 0) return;
          const pid = Number(raw?.project_id ?? raw?.projectId ?? raw?.project?.id ?? parent?.project_id ?? projectId);
          if (pid && pid !== projectId) return;
          const assignedProfile = raw?.assignee_user ?? raw?.assigneeUser ?? raw?.assignee ??
            raw?.assigned_user ?? raw?.assignedUser ?? raw?.assigned_to ?? raw?.assignedTo;
          const assigneeId = this.numberOrNull(
            raw?.assignee_user_id ?? raw?.assigneeUserId ?? raw?.assignee_user_account_id ?? raw?.assigneeUserAccountId ?? raw?.assignee_id ?? raw?.assigneeId ??
            raw?.assigned_user_id ?? raw?.assignedUserId ?? raw?.assigned_to_id ?? raw?.assignedToId ??
            assignedProfile?.user_account_id ?? assignedProfile?.userAccountId ?? assignedProfile?.user_id ?? assignedProfile?.userId ?? assignedProfile?.id ??
            assignedProfile?.user?.id
          );
          const assigneeName = raw?.assignee_name ?? raw?.assigneeName ?? raw?.assigned_to_name ??
            raw?.assignedToName ?? this.displayText(assignedProfile?.user ?? assignedProfile, '');
          const reporterProfile = raw?.reporter_user ?? raw?.reporterUser ?? raw?.reporter ?? raw?.reported_by ?? raw?.reportedBy;
          const reporterId = this.numberOrNull(
            raw?.reporter_user_id ?? raw?.reporterUserId ?? raw?.reporter_user_account_id ?? raw?.reporterUserAccountId ?? raw?.reporter_id ?? raw?.reporterId ??
            raw?.reported_by_user_id ?? raw?.reportedByUserId ?? reporterProfile?.user?.user_id ??
            reporterProfile?.user?.userId ?? reporterProfile?.user?.user_account_id ?? reporterProfile?.user?.userAccountId ??
            reporterProfile?.user_account_id ?? reporterProfile?.userAccountId ?? reporterProfile?.user_id ??
            reporterProfile?.userId ?? reporterProfile?.id ??
            (typeof reporterProfile === 'number' || typeof reporterProfile === 'string' ? reporterProfile : null)
          );
          const reporterName = this.personDisplayName(
            raw?.reporter_name ?? raw?.reporterName ?? raw?.reporter_full_name ?? raw?.reporterFullName ??
            raw?.reporter_display_name ?? raw?.reporterDisplayName ?? raw?.reporter_user_name ?? raw?.reporterUserName ?? reporterProfile
          );
          const reporterPerson = this.findPersonById(reporterId) ??
            (reporterName ? this.people.find(person => person.name.trim().toLowerCase() === reporterName.trim().toLowerCase()) : undefined);
          const resolvedReporterId = reporterPerson?.id ?? reporterId;
          const resolvedReporterName = reporterPerson?.name ?? reporterName;
          const person = this.findPersonById(assigneeId) ??
            (assigneeName ? this.people.find(p => p.name.trim().toLowerCase() === String(assigneeName).trim().toLowerCase()) : undefined);
          const resolvedAssigneeId = person?.id ?? assigneeId;
          const assignee = person?.name ?? (assigneeName ? String(assigneeName) : 'Unassigned');
          const status = this.mapStatus(raw?.status ?? raw?.workflow_status ?? raw?.state);
          const priority = this.mapPriority(raw?.priority ?? raw?.severity);
          const type: ItemType = sourceType === 'EPIC' ? 'Epic' : sourceType === 'STORY' ? 'Story' : sourceType === 'TASK' ? 'Task' : 'Bug';
          const sprintId = this.numberOrNull(raw?.sprint_id ?? raw?.sprintId ?? fallbackSprint?.sprint_id ?? fallbackSprint?.sprintId);
          const sprint = sprintById.get(Number(sprintId));
          const title = String(raw?.name ?? raw?.title ?? raw?.summary ?? raw?.description ?? `${type} ${sourceId}`);
          const code = String(raw?.epic_code ?? raw?.epicCode ?? raw?.issue_code ?? raw?.issueCode ?? raw?.key ?? `${type.toUpperCase()}-${sourceId}`);
          const key = `${sourceType}-${sourceId}`;
          next.push({
            id: key, sourceId, sourceType, key: code, title,
            description: String(raw?.description ?? raw?.summary ?? ''),
            type, status, priority,
            points: this.numberOrNull(raw?.story_points ?? raw?.storyPoints ?? raw?.points ?? raw?.estimated_hours) ?? undefined,
            issueCount: Array.isArray(raw?.issues) ? raw.issues.length : 0,
            assignee, assigneeId: resolvedAssigneeId, reporterId: resolvedReporterId, reporterName: resolvedReporterName, initials: person?.initials ?? this.initials(assignee),
            sprintId, sprint: sprint?.name ?? 'Backlog / Unassigned',
            parentEpic: parent?.name ?? parent?.epic_name ?? raw?.parent?.name ?? raw?.parent_epic ?? raw?.parentEpic ?? undefined,
            labels: this.normalizeLabels(raw?.labels ?? raw?.label ?? raw?.tags),
            projectId, raw
          });
        };

        for (const epic of epicRows) addItem(epic, 'EPIC');
        for (const story of storyRows) addItem(story, 'STORY', storyByEpic.get(Number(story?.id ?? story?.story_id ?? story?.storyId)));
        for (const task of projectTasks) {
          const storyId = Number(task?.story_id ?? task?.storyId);
          const story = storyById.get(storyId);
          const epic = story ? storyByEpic.get(storyId) : undefined;
          addItem(task, 'TASK', epic, story);
        }
        for (const issue of issueRows) {
          const issueProjectId = this.numberOrNull(issue?.projectId ?? issue?.project_id ?? issue?.project?.id);
          if (issueProjectId !== null && issueProjectId !== projectId) continue;
          addItem(issue, 'ISSUE');
        }

        // A linked item may be outside the collection's first page. Load its
        // canonical record directly so every entry point can still open it.
        if (this.dialogRequest && requested) {
          const raw = requested?.data ?? requested;
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const type = this.dialogRequest.type;
            const record = { ...raw, id: raw.id ?? this.dialogRequest.id };
            const parent = type === 'TASK' ? storyById.get(Number(record.story_id ?? record.storyId))
              : type === 'STORY' ? epicById.get(Number(record.epic_id ?? record.epicId)) : undefined;
            const existing = next.findIndex(item => item.sourceType === type && item.sourceId === this.dialogRequest!.id);
            if (existing >= 0) next.splice(existing, 1);
            addItem(record, type, parent, type === 'TASK' ? parent : undefined);
          }
        }

        this.items = next;
        this.loading = false;
        if (typeof this.selectedSprintId === 'number' && !this.sprints.some(s => s.id === this.selectedSprintId)) {
          this.selectedSprintId = this.currentProjectSprintId ?? 'ALL';
        }
        this.openPendingNavigation();
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Could not load work items for this project.';
        this.items = [];
        this.cdr.markForCheck();
      }
    });
  }

  get projectSprints(): SprintOption[] {
    return this.sprints.filter(s => s.projectId == null || s.projectId === this.selectedProjectId);
  }

  get selectedProject(): ProjectOption | undefined {
    return this.projects.find(p => p.id === this.selectedProjectId);
  }

  /** People shown in the chip row are limited to assignees with work on this board cycle. */
  get assignedPeople(): PersonOption[] {
    const byId = new Map<number, PersonOption>();
    for (const item of this.sprintItems) {
      if (item.assigneeId === null || item.assignee === 'Unassigned') continue;
      if (byId.has(item.assigneeId)) continue;
      const knownPerson = this.people.find(person => person.id === item.assigneeId);
      byId.set(item.assigneeId, knownPerson ?? {
        id: item.assigneeId,
        name: item.assignee,
        initials: item.initials,
        avatarUrl: null
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get selectedSprint(): string {
    if (this.selectedSprintId === 'ALL') return 'All sprints';
    return this.sprints.find(s => s.id === this.selectedSprintId)?.name ?? 'All sprints';
  }

  set selectedSprint(value: string) {
    const sprint = this.sprints.find(s => s.name === value);
    this.selectedSprintId = sprint?.id ?? 'ALL';
  }

  private get sprintFilterId(): number | null {
    if (this.selectedSprintId === 'ALL') return null;
    return this.selectedSprintId;
  }

  get parentOptions(): string[] {
    return [...new Set(this.items.map(item => item.parentEpic).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b));
  }

  get labelOptions(): string[] {
    return [...new Set(this.items.flatMap(item => item.labels))].sort((a, b) => a.localeCompare(b));
  }

  get availableFilterFields(): FilterField[] {
    return (['Sprint', 'Priority'] as FilterField[]).filter(field => !this.visibleFilterFields.includes(field));
  }

  get visibleFilterFields(): FilterField[] {
    return [...this.baseFilterFields, ...this.extraFilterFields];
  }

  selectFilterField(field: FilterField): void {
    this.activeFilterField = field;
    this.addFilterMenuOpen = false;
  }

  addFilterField(field: FilterField): void {
    if (!this.visibleFilterFields.includes(field)) this.extraFilterFields = [...this.extraFilterFields, field];
    this.selectFilterField(field);
  }

  isFilterFieldActive(field: FilterField): boolean {
    switch (field) {
      case 'Parent': return this.selectedParent !== 'All parents';
      case 'Assignee': return this.selectedAssignee !== 'All people';
      case 'Status': return this.selectedStatus !== 'All statuses';
      case 'Work type': return this.selectedType !== 'All types';
      case 'Labels': return this.selectedLabel !== 'All labels';
      case 'Sprint': return this.selectedSprintId !== 'ALL';
      case 'Priority': return this.selectedPriority !== 'All priorities';
    }
    return false;
  }

  get filteredItems(): WorkItem[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.items.filter(item => {
      const matchesQuery = !query || `${item.key} ${item.title} ${item.description} ${item.assignee} ${item.parentEpic ?? ''}`.toLowerCase().includes(query);
      const matchesSprint = this.selectedSprintId === 'ALL' || item.sprintId === this.sprintFilterId;
      const matchesPerson = this.selectedPersonId === null || item.assigneeId === this.selectedPersonId;
      const matchesAssignee = this.selectedAssignee === 'All people' || (this.selectedAssignee === 'Unassigned' ? item.assignee === 'Unassigned' : item.assignee === this.selectedAssignee);
      const matchesParent = this.selectedParent === 'All parents' || item.parentEpic === this.selectedParent;
      const matchesStatus = this.selectedStatus === 'All statuses' || item.status === this.selectedStatus;
      const matchesLabel = this.selectedLabel === 'All labels' || item.labels.includes(this.selectedLabel);
      const matchesPriority = this.selectedPriority === 'All priorities' || item.priority === this.selectedPriority;
      const matchesType = this.selectedType === 'All types' || item.type === this.selectedType;
      return matchesQuery && matchesSprint && matchesPerson && matchesAssignee && matchesParent && matchesStatus && matchesLabel && matchesPriority && matchesType;
    });
  }

  itemsFor(status: WorkStatus): WorkItem[] { return this.filteredItems.filter(item => this.workflow.code(item.raw?.status??item.status) === this.workflow.code(status)); }

  selectPerson(personId: number | null): void {
    this.selectedPersonId = this.selectedPersonId === personId ? null : personId;
    this.selectedAssignee = 'All people';
  }

  isPersonSelected(personId: number): boolean { return this.selectedPersonId === personId; }

  itemsAssignedTo(personId: number): number {
    return this.sprintItems.filter(item => item.assigneeId === personId).length;
  }
  get sprintItems(): WorkItem[] { return this.items.filter(item => this.selectedSprintId === 'ALL' || item.sprintId === this.sprintFilterId); }
  get completedCount(): number { return this.sprintItems.filter(item => this.workflow.done(item.raw?.status??item.status)).length; }
  get progressPercent(): number { return this.sprintItems.length ? Math.round(this.completedCount / this.sprintItems.length * 100) : 0; }
  get activeFilterCount(): number {
    return Number(this.selectedSprintId !== 'ALL') + Number(this.selectedPersonId !== null) +
      Number(this.selectedAssignee !== 'All people') + Number(this.selectedParent !== 'All parents') +
      Number(this.selectedStatus !== 'All statuses') + Number(this.selectedLabel !== 'All labels') +
      Number(this.selectedPriority !== 'All priorities') + Number(this.selectedType !== 'All types') +
      Number(!!this.searchQuery.trim());
  }

  get cycleDates(): string {
    const sprint = this.selectedSprintId === 'ALL'
      ? undefined
      : this.sprints.find(s => s.id === this.selectedSprintId);
    if (this.selectedSprintId === 'ALL') return 'All sprint dates';
    if (!sprint) return 'Choose a sprint to view its dates';
    const format = (value?: string) => {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    };
    const start = format(sprint.startDate);
    const end = format(sprint.endDate);
    return start && end ? `${start} – ${end}` : start || end || 'Dates not set';
  }

  get currentSprintName(): string {
    const selected = this.selectedSprintId === 'ALL'
      ? undefined
      : this.projectSprints.find(s => Number(s.id) === Number(this.selectedSprintId));
    return selected?.name || 'All sprints';
  }

  get currentCycleSprintId(): number | null {
    return this.currentProjectSprintId;
  }

  private mapStatus(value:any):WorkStatus{return this.workflow.label(value);}

  private mapPriority(value: any): WorkPriority {
    const priority = String(value ?? 'MEDIUM').trim().toUpperCase();
    if (priority === 'CRITICAL' || priority === 'URGENT' || priority === 'P0') return 'Critical';
    if (priority === 'HIGH' || priority === 'P1') return 'High';
    if (priority === 'LOW' || priority === 'P3') return 'Low';
    return 'Medium';
  }

  private initials(name: string): string {
    if (!name || name === 'Unassigned') return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }

  private numberOrNull(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private normalizeLabels(value: any): string[] {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value == null ? [] : [value];
    return [...new Set(values.map(label => this.displayText(label, String(label ?? '')).trim()).filter(Boolean))];
  }

  toggleFilters(): void { this.filterPanelOpen = !this.filterPanelOpen; }
  toggleProgress(): void { this.sprintProgressOpen = !this.sprintProgressOpen; }
  resetFilters(): void {
    this.selectedSprintId = this.currentProjectSprintId ?? 'ALL';
    this.selectedAssignee = 'All people';
    this.selectedPersonId = null;
    this.selectedParent = 'All parents';
    this.selectedStatus = 'All statuses';
    this.selectedLabel = 'All labels';
    this.selectedPriority = 'All priorities';
    this.selectedType = 'All types';
    this.searchQuery = '';
    this.extraFilterFields = [];
    this.activeFilterField = null;
    this.addFilterMenuOpen = false;
  }
  openCreate(): void {
    if (this.showCreateForm) this.cancelCreate();
    else this.openCreateFor(this.newType);
  }

  openCreateFor(type: ItemType, initialStatus: WorkStatus = 'Backlog'): void {
    if (!this.selectedProjectId) return;
    if (!this.selectedItem) this.boardScrollY = window.scrollY;
    this.newType = type;
    this.newTitle = '';
    this.newEpicCode = '';
    this.newIssueCode = `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`;
    this.newDescription = '';
    this.newStatus = initialStatus;
    this.newPriority = 'Medium';
    this.newSprintId = typeof this.selectedSprintId === 'number' ? this.selectedSprintId : this.currentProjectSprintId;
    this.newAssigneeId = null;
    this.newReporterId = null;
    this.newEpicId = null;
    this.newStoryId = this.projectStoryIds[0] ?? null;
    this.newEpicIds = [];
    this.newStoryIds = [];
    this.newTaskIds = [];
    this.newIsBlocking = false;
    this.newPoints = null;
    this.newLabelsText = '';
    this.newAssigneeSearchText = 'Unassigned';
    this.newReporterSearchText = 'No reporter';
    this.createError = '';
    this.creatingItem = false;
    this.showCreateForm = true;
    window.scrollTo(0, 0);
  }

  onCreateTypeChange(type: ItemType): void {
    this.newType = type;
    this.createError = '';
    if (type === 'Task' && this.newStoryId === null) this.newStoryId = this.projectStoryIds[0] ?? null;
    if (type === 'Bug' && !this.newIssueCode) this.newIssueCode = `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  cancelCreate(): void {
    if (this.creatingItem) return;
    this.showCreateForm = false;
    this.createError = '';
    if (this.dialogRequest) { this.dialogClosed.emit(); return; }
    this.clearCreateTypeQueryParam();
    window.setTimeout(() => window.scrollTo(0, this.boardScrollY), 0);
  }

  private clearCreateTypeQueryParam(): void {
    if (!this.route.snapshot.queryParamMap.has('createType')) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { createType: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  selectCreatePerson(field: 'assignee' | 'reporter', id: number | null): void {
    const text = id === null ? (field === 'assignee' ? 'Unassigned' : 'No reporter') : this.detailPersonName(id);
    if (field === 'assignee') {
      this.newAssigneeId = id;
      this.newAssigneeSearchText = text;
    } else {
      this.newReporterId = id;
      this.newReporterSearchText = text;
    }
  }

  newSprintLabel(): string {
    return this.projectSprints.find(sprint => sprint.id === this.newSprintId)?.name ?? 'Selected sprint';
  }

  onNewDescriptionInput(event: Event): void {
    this.newDescription = (event.currentTarget as HTMLElement | null)?.innerHTML ?? '';
  }

  formatNewDescription(command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'foreColor', value?: string): void {
    document.execCommand(command, false, value);
    const editor = document.querySelector<HTMLElement>('.kb-new-description-editable');
    if (editor) this.newDescription = editor.innerHTML;
  }

  openItemDetails(item: WorkItem): void {
    if (!this.selectedItem) this.boardScrollY = window.scrollY;
    this.recentWork.remember({id:item.sourceId,type:item.sourceType,projectId:item.projectId,key:item.key,title:item.title});
    this.selectedItem = item;
    this.ticketPermissions={canEdit:false,canComment:false,canAttach:false};
    this.detailEditError = '';
    this.detailEditMode = false;
    this.editingDetailField = null;
    this.activityTab = 'Comments';
    this.commentText = '';
    this.copiedItemKey = false;
    this.detailDraft = this.toDetailDraft(item);
    if (!this.dialogRequest) this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        menu: 'kanban-board',
        openType: item.sourceType,
        openId: item.sourceId,
        projectId: item.projectId
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    window.scrollTo(0, 0);
  }

  closeItemDetails(): void {
    const restoreBoardScroll = this.boardScrollY;
    this.selectedItem = null;
    this.detailEditError = '';
    this.detailEditMode = false;
    this.detailDraft = null;
    this.detailSaving = false;
    this.editingDetailField = null;
    this.commentText = '';
    this.savingComment = false;
    this.pendingOpenItem = null;
    if (this.dialogRequest) { this.dialogClosed.emit(); return; }
    if (this.route.snapshot.queryParamMap.has('openId') || this.route.snapshot.queryParamMap.has('openType')) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { openId: null, openType: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
    window.setTimeout(() => window.scrollTo(0, restoreBoardScroll), 0);
  }

  copyItemKey(key: string): void {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(key).then(() => {
      this.copiedItemKey = true;
      window.setTimeout(() => {
        this.copiedItemKey = false;
        this.cdr.markForCheck();
      }, 1600);
    }).catch(() => {
      this.copiedItemKey = false;
    });
  }

  beginDetailEdit(): void {
    this.beginDetailFieldEdit('title');
  }

  cancelDetailEdit(): void {
    this.cancelDetailFieldEdit();
  }

  beginDetailFieldEdit(field: string): void {
    if (!this.ticketPermissions.canEdit || !this.selectedItem || this.detailSaving || (this.editingDetailField && this.editingDetailField !== field)) return;
    this.detailDraft = this.toDetailDraft(this.selectedItem);
    this.editingDetailField = field;
    this.detailEditError = '';
    this.assigneeSearchText = this.detailPersonName(this.detailDraft.assigneeId);
    this.reporterSearchText = this.detailDraft.reporterId === null
      ? (this.detailReporter(this.selectedItem) === '—' ? 'No reporter' : this.detailReporter(this.selectedItem))
      : this.detailPersonName(this.detailDraft.reporterId);
  }

  cancelDetailFieldEdit(): void {
    if (this.detailSaving || !this.selectedItem) return;
    this.detailDraft = this.toDetailDraft(this.selectedItem);
    this.editingDetailField = null;
    this.detailEditError = '';
    this.assigneeSearchText = '';
    this.reporterSearchText = '';
  }

  saveDetailField(item: WorkItem, field: string): void {
    if (this.editingDetailField !== field || this.detailSaving) return;
    if (field === 'assigneeId') {
      const selected = this.detailDraft?.assigneeId == null ? 'Unassigned' : this.detailPersonName(Number(this.detailDraft.assigneeId));
      if (this.assigneeSearchText.trim().toLowerCase() !== selected.toLowerCase()) {
        this.detailEditError = 'Choose an assignee from the suggestions before saving.';
        return;
      }
    }
    if (field === 'reporterId') {
      const selected = this.detailDraft?.reporterId == null ? 'No reporter' : this.detailPersonName(Number(this.detailDraft.reporterId));
      if (this.reporterSearchText.trim().toLowerCase() !== selected.toLowerCase()) {
        this.detailEditError = 'Choose a reporter from the suggestions before saving.';
        return;
      }
    }
    if (field.startsWith('raw:')) {
      const key = field.slice(4);
      const original = item.raw?.[key];
      const value = String(this.detailDraft?.extraFieldText?.[key] ?? '').trim();
      if (typeof original === 'number' && value && !Number.isFinite(Number(value))) {
        this.detailEditError = 'Enter a valid number before saving.';
        return;
      }
      if (typeof original === 'boolean' && !['true', 'false'].includes(value.toLowerCase())) {
        this.detailEditError = 'Enter true or false before saving this field.';
        return;
      }
      if (original && typeof original === 'object') {
        try { JSON.parse(value); } catch {
          this.detailEditError = 'Enter valid JSON before saving this field.';
          return;
        }
      }
    }
    this.saveDetailEdit(item, field);
  }

  selectDetailPerson(field: 'assigneeId' | 'reporterId', id: number | null): void {
    this.updateDetailDraft(field, id);
    if (field === 'assigneeId') this.assigneeSearchText = id === null ? 'Unassigned' : this.detailPersonName(id);
    else this.reporterSearchText = id === null ? 'No reporter' : this.detailPersonName(id);
  }

  selectActivityTab(tab: string): void {
    if (['All', 'Comments', 'History', 'Work log'].includes(tab)) {
      this.activityTab = tab as 'All' | 'Comments' | 'History' | 'Work log';
    }
  }

  cancelComment(): void {
    if (this.detailSaving) return;
    this.commentText = '';
  }

  postDetailComment(item: WorkItem): void {
    const text = this.commentText.trim();
    if (!text || this.detailSaving) return;
    this.detailDraft = this.toDetailDraft(item);
    this.detailDraft.newComment = text;
    this.addDetailComment();
    this.savingComment = true;
    this.saveDetailEdit(item);
  }

  updateDetailDraft(field: string, value: any): void {
    this.detailDraft = { ...(this.detailDraft || {}), [field]: value };
  }

  onDescriptionInput(event: Event): void {
    const editor = event.currentTarget as HTMLElement | null;
    this.updateDetailDraft('description', editor?.innerHTML ?? '');
  }

  formatDescription(command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'foreColor', value?: string): void {
    document.execCommand(command, false, value);
    const editor = document.querySelector<HTMLElement>('.kb-description-editable');
    if (editor) this.updateDetailDraft('description', editor.innerHTML);
  }

  updateExtraFieldDraft(key: string, value: string): void {
    this.detailDraft = {
      ...(this.detailDraft || {}),
      extraFieldText: { ...(this.detailDraft?.extraFieldText || {}), [key]: value }
    };
  }

  addDetailComment(): void {
    const text = String(this.detailDraft?.newComment || '').trim();
    if (!text || !this.detailDraft) return;
    const comments = Array.isArray(this.detailDraft.comments) ? this.detailDraft.comments : [];
    this.detailDraft = {
      ...this.detailDraft,
      comments: [...comments, {
        text,
        authorId: this.authenticatedUserId(),
        authorName: 'You',
        createdAt: new Date().toISOString()
      }],
      newComment: ''
    };
  }

  private toDetailDraft(item: WorkItem): any {
    const raw = item.raw || {};
    const commentsValue = raw.comments ?? raw.commentList ?? raw.comment_list;
    return {
      ...raw,
      title: item.title,
      description: item.description || '',
      status: item.status,
      priority: item.priority,
      points: item.points ?? 0,
      sprintId: item.sprintId,
      assigneeId: item.assigneeId,
      reporterId: item.reporterId,
      epicId: this.numberOrNull(raw.epic_id ?? raw.epicId ?? raw.epic?.id ?? raw.parentEpic?.id ?? raw.parent_epic?.id),
      storyId: this.numberOrNull(raw.story_id ?? raw.storyId ?? raw.story?.id ?? raw.parentStory?.id ?? raw.parent_story?.id),
      epicIds: this.issueLinkedIds(raw, 'EPIC'),
      storyIds: this.issueLinkedIds(raw, 'STORY'),
      taskIds: this.issueLinkedIds(raw, 'TASK'),
      isBlocking: Boolean(raw.isBlocking ?? raw.is_blocking),
      labelsText: this.normalizeLabels(raw.labels ?? raw.label ?? raw.tags).join(', '),
      createdAtInput: this.dateInputValue(item, 'created'),
      updatedAtInput: this.dateInputValue(item, 'updated'),
      extraFieldText: Object.fromEntries(this.detailExtraFields(item).map(field => [
        field.key,
        field.rawValue && typeof field.rawValue === 'object'
          ? JSON.stringify(field.rawValue, null, 2)
          : String(field.rawValue ?? '')
      ])),
      comments: Array.isArray(commentsValue) ? [...commentsValue] : typeof commentsValue === 'string' && commentsValue.trim() ? [{ text: commentsValue }] : [],
      newComment: ''
    };
  }

  private issueLinkedIds(raw: any, type: 'EPIC' | 'STORY' | 'TASK'): number[] {
    const aliases: Record<'EPIC' | 'STORY' | 'TASK', string[]> = {
      EPIC: ['epicIds', 'epic_ids', 'epicId', 'epic_id'],
      STORY: ['storyIds', 'story_ids', 'storyId', 'story_id'],
      TASK: ['taskIds', 'task_ids', 'taskId', 'task_id']
    };
    const values: any[] = [];
    for (const key of aliases[type]) {
      const value = raw?.[key];
      if (Array.isArray(value)) values.push(...value);
      else if (value !== null && value !== undefined && value !== '') values.push(value);
    }
    const nested = raw?.[type.toLowerCase()];
    if (nested?.id != null) values.push(nested.id);
    if (Array.isArray(raw?.allocations)) {
      values.push(...raw.allocations
        .filter((allocation: any) => String(allocation?.allocatableType ?? allocation?.allocatable_type ?? '').toUpperCase().replace(/S$/, '') === type)
        .map((allocation: any) => allocation?.allocatableId ?? allocation?.allocatable_id ?? allocation?.id));
    }
    return [...new Set(values.map(Number).filter((id: number) => Number.isFinite(id) && id > 0))];
  }

  get detailEpics(): WorkItem[] { return this.items.filter(item => item.sourceType === 'EPIC'); }
  get detailStories(): WorkItem[] { return this.items.filter(item => item.sourceType === 'STORY'); }
  get detailTasks(): WorkItem[] { return this.items.filter(item => item.sourceType === 'TASK'); }

  private mergePeople(primary: PersonOption[], secondary: PersonOption[]): PersonOption[] {
    const merged = primary.map(person => ({
      ...person,
      lookupIds: [...new Set([person.id, ...(person.lookupIds ?? [])])]
    }));
    for (const person of secondary) {
      const personIds = new Set([person.id, ...(person.lookupIds ?? [])]);
      const index = merged.findIndex(existing => [existing.id, ...(existing.lookupIds ?? [])].some(id => personIds.has(id)));
      if (index < 0) {
        merged.push({ ...person, lookupIds: [...personIds] });
        continue;
      }
      const existing = merged[index];
      const existingHasPlaceholderName = !existing.name || /^(?:user\s+\d+|unknown user)$/i.test(existing.name.trim());
      merged[index] = {
        ...person,
        ...existing,
        id: existing.id,
        name: existingHasPlaceholderName && person.name ? person.name : existing.name,
        avatarUrl: existing.avatarUrl || person.avatarUrl,
        lookupIds: [...new Set([...personIds, existing.id, ...(existing.lookupIds ?? [])])]
      };
    }
    return merged;
  }

  private findPersonById(id: number | null | undefined): PersonOption | undefined {
    if (id === null || id === undefined || !Number.isFinite(Number(id))) return undefined;
    const numericId = Number(id);
    return [...this.people, ...this.personDirectory].find(person =>
      person.id === numericId || person.lookupIds?.includes(numericId)
    );
  }

  detailPersonAvatarUrl(id: number | null): string | null {
    return this.findPersonById(id)?.avatarUrl ?? null;
  }

  detailReporterInitials(item: WorkItem): string {
    return this.initials(this.detailReporter(item));
  }

  detailAssigneeInitials(item: WorkItem): string {
    return this.initials(item.assignee || 'Unassigned');
  }

  detailPersonName(id: number | null): string {
    return id === null ? 'Unassigned' : this.findPersonById(id)?.name ?? `User ${id}`;
  }

  detailComments(item: WorkItem): any[] {
    if (this.savingComment && this.selectedItem?.id === item.id && Array.isArray(this.detailDraft?.comments)) return this.detailDraft.comments;
    const comments = item.raw?.comments ?? item.raw?.commentList ?? item.raw?.comment_list;
    if (Array.isArray(comments)) return comments;
    return typeof comments === 'string' && comments.trim() ? [{ text: comments }] : [];
  }

  detailParentName(item: WorkItem, type: 'EPIC' | 'STORY'): string {
    const raw = item.raw || {};
    const id = this.numberOrNull(type === 'EPIC'
      ? raw.epic_id ?? raw.epicId ?? raw.epic?.id ?? raw.parentEpic?.id ?? raw.parent_epic?.id
      : raw.story_id ?? raw.storyId ?? raw.story?.id ?? raw.parentStory?.id ?? raw.parent_story?.id);
    const nestedName = type === 'EPIC'
      ? this.displayText(raw.epic ?? raw.parentEpic ?? raw.parent_epic, '')
      : this.displayText(raw.story ?? raw.parentStory ?? raw.parent_story, '');
    if (nestedName) return nestedName;
    const parent = this.items.find(candidate => candidate.sourceType === type && candidate.sourceId === id);
    return parent ? `${parent.key} · ${parent.title}` : id === null ? '—' : `#${id}`;
  }

  detailLinkedNames(type: 'EPIC' | 'STORY' | 'TASK', ids: number[]): string {
    if (!ids?.length) return '—';
    return ids.map(id => {
      const linked = this.items.find(candidate => candidate.sourceType === type && candidate.sourceId === Number(id));
      return linked ? `${linked.key} · ${linked.title}` : `#${id}`;
    }).join(', ');
  }

  detailIssueLinkedNames(item: WorkItem, type: 'EPIC' | 'STORY' | 'TASK'): string {
    return this.detailLinkedNames(type, this.issueLinkedIds(item.raw, type));
  }

  detailRelatedItems(item: WorkItem): WorkItem[] {
    return this.items.filter(candidate => {
      if (candidate.id === item.id) return false;
      const raw = candidate.raw || {};
      if (item.sourceType === 'EPIC') {
        return (candidate.sourceType === 'STORY' && this.numberOrNull(raw.epic_id ?? raw.epicId ?? raw.epic?.id) === item.sourceId) ||
          (candidate.sourceType === 'ISSUE' && this.issueLinkedIds(raw, 'EPIC').includes(item.sourceId));
      }
      if (item.sourceType === 'STORY') {
        return (candidate.sourceType === 'TASK' && this.numberOrNull(raw.story_id ?? raw.storyId ?? raw.story?.id) === item.sourceId) ||
          (candidate.sourceType === 'ISSUE' && this.issueLinkedIds(raw, 'STORY').includes(item.sourceId));
      }
      if (item.sourceType === 'TASK') return candidate.sourceType === 'ISSUE' && this.issueLinkedIds(raw, 'TASK').includes(item.sourceId);
      return candidate.sourceType === 'EPIC' && this.issueLinkedIds(item.raw, 'EPIC').includes(candidate.sourceId) ||
        candidate.sourceType === 'STORY' && this.issueLinkedIds(item.raw, 'STORY').includes(candidate.sourceId) ||
        candidate.sourceType === 'TASK' && this.issueLinkedIds(item.raw, 'TASK').includes(candidate.sourceId);
    });
  }

  detailLinkedWorkItems(item: WorkItem): WorkItem[] {
    return this.detailRelatedItems(item).filter(candidate => candidate.sourceType !== 'ISSUE');
  }

  detailLinkedIssues(item: WorkItem): WorkItem[] {
    return this.detailRelatedItems(item).filter(candidate => candidate.sourceType === 'ISSUE');
  }

  detailExtraFields(item: WorkItem): Array<{ key: string; label: string; value: string; rawValue: any }> {
    const known = new Set([
      'id', 'epic_id', 'epicId', 'epic_code', 'epicCode', 'issue_id', 'issueId', 'issue_code', 'issueCode',
      'story_id', 'storyId', 'task_id', 'taskId', 'title', 'name', 'summary', 'description', 'details',
      'status', 'workflow_status', 'state', 'priority', 'severity', 'story_points', 'storyPoints', 'points', 'estimated_hours',
      'sprint_id', 'sprintId', 'sprint', 'assignee_user_id', 'assigneeUserId', 'assignee_id', 'assigneeId',
      'assignee_user', 'assigneeUser', 'assignee', 'assignee_name', 'assigneeName', 'reporter_user_id', 'reporterUserId',
      'reporter_id', 'reporterId', 'reporter_user', 'reporterUser', 'reporter', 'reporter_name', 'reporterName',
      'reporter_full_name', 'reporterFullName', 'reporter_display_name', 'reporterDisplayName', 'reporter_user_name', 'reporterUserName',
      'reported_by', 'reportedBy', 'reported_by_user_id', 'reportedByUserId',
      'project_id', 'projectId', 'project', 'comments', 'commentList', 'comment_list', 'labels', 'label', 'tags',
      'allocations', 'epicIds', 'epic_ids', 'storyIds', 'story_ids', 'taskIds', 'task_ids', 'isBlocking', 'is_blocking',
      'created_at', 'createdAt', 'created_on', 'createdOn', 'created', 'updated_at', 'updatedAt', 'modified_on', 'modifiedOn', 'updated'
    ]);
    return Object.entries(item.raw || {})
      .filter(([key, value]) => !known.has(key) && value !== null && value !== undefined && value !== '')
      .map(([key, value]) => ({ key, label: this.fieldLabel(key), value: this.formatDetailValue(value), rawValue: value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  private fieldLabel(key: string): string {
    return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  private formatDetailValue(value: any): string {
    if (Array.isArray(value)) return value.map(item => this.displayText(item, typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ') || '—';
    if (value && typeof value === 'object') {
      const text = this.displayText(value, '');
      if (text) return text;
      try { return JSON.stringify(value); } catch { return '[Object]'; }
    }
    return String(value);
  }

  private authenticatedUserId(): number | null {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const id = Number(payload?.user_id ?? payload?.userId ?? payload?.sub ?? payload?.id);
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch { return null; }
  }

  togglePeopleList(): void {
    this.peopleListOpen = !this.peopleListOpen;
  }

  detailValue(item: WorkItem, ...keys: string[]): string {
    for (const key of keys) {
      const value = item.raw?.[key];
      const text = this.displayText(value, '');
      if (text) return text;
    }
    return '—';
  }

  detailReporter(item: WorkItem): string {
    if (item.reporterId !== null) {
      const matched = this.findPersonById(item.reporterId);
      if (matched) return matched.name;
    }
    if (item.reporterName) return item.reporterName;
    const raw = item.raw || {};
    const name = this.personDisplayName(
      raw.reporter_name ?? raw.reporterName ?? raw.reporter_full_name ?? raw.reporterFullName ??
      raw.reporter_display_name ?? raw.reporterDisplayName ?? raw.reporter_user_name ?? raw.reporterUserName ??
      raw.reporter_user ?? raw.reporterUser ?? raw.reporter ?? raw.reported_by ?? raw.reportedBy
    );
    if (name) return name;
    return item.reporterId === null ? '—' : this.detailPersonName(item.reporterId);
  }

  detailDate(item: WorkItem, kind: 'created' | 'updated'): string {
    const keys = kind === 'created'
      ? ['created_at', 'createdAt', 'created_on', 'createdOn', 'created']
      : ['updated_at', 'updatedAt', 'modified_on', 'modifiedOn', 'updated'];
    const value = keys.map(key => item.raw?.[key]).find(candidate => candidate !== null && candidate !== undefined && candidate !== '');
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return this.displayText(value, '—');
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
  }

  private dateInputValue(item: WorkItem, kind: 'created' | 'updated'): string {
    const keys = kind === 'created'
      ? ['created_at', 'createdAt', 'created_on', 'createdOn', 'created']
      : ['updated_at', 'updatedAt', 'modified_on', 'modifiedOn', 'updated'];
    const value = keys.map(key => item.raw?.[key]).find(candidate => candidate !== null && candidate !== undefined && candidate !== '');
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  private dateFieldPatch(item: WorkItem, draft: any, field?: string): Record<string, string | null> {
    const kind = field === 'createdAtInput' ? 'created' : field === 'updatedAtInput' ? 'updated' : null;
    if (!kind) return {};
    const value = String(draft?.[field!] || '');
    const parsed = value ? new Date(value) : null;
    const iso = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    const aliases = kind === 'created'
      ? ['created_at', 'createdAt', 'created_on', 'createdOn', 'created']
      : ['updated_at', 'updatedAt', 'modified_on', 'modifiedOn', 'updated'];
    const existing = aliases.filter(key => Object.prototype.hasOwnProperty.call(item.raw || {}, key));
    const keys = [...new Set([aliases[0], ...existing])];
    return Object.fromEntries(keys.map(key => [key, iso]));
  }

  private rawFieldPatch(item: WorkItem, draft: any, field?: string): Record<string, any> {
    if (!field?.startsWith('raw:')) return {};
    const key = field.slice(4);
    const original = item.raw?.[key];
    const text = String(draft?.extraFieldText?.[key] ?? '');
    let value: any = text;
    if (typeof original === 'number') value = text.trim() ? Number(text) : null;
    else if (typeof original === 'boolean') value = text.trim().toLowerCase() === 'true';
    else if (original && typeof original === 'object') {
      try { value = JSON.parse(text); } catch { value = text; }
    }
    return { [key]: value };
  }

  saveDetailEdit(item: WorkItem, field?: string): void {
    if (!this.ticketPermissions.canEdit || !this.detailDraft || this.detailSaving) return;
    const draft = this.detailDraft;
    const title = String(draft.title || '').trim();
    if (!title) { this.detailEditError = 'A title is required.'; return; }
    const status = draft.status as WorkStatus;
    const sprintId = this.numberOrNull(draft.sprintId);
    const assigneeId = this.numberOrNull(draft.assigneeId);
    const reporterId = this.numberOrNull(draft.reporterId);
    const comments = Array.isArray(draft.comments) ? draft.comments : [];
    const labels = this.normalizeLabels(String(draft.labelsText || ''));
    const priority = String(draft.priority || 'MEDIUM').toUpperCase();
    const epicIds = [...new Set((draft.epicIds || []).map(Number).filter((id: number) => Number.isFinite(id) && id > 0))];
    const storyIds = [...new Set((draft.storyIds || []).map(Number).filter((id: number) => Number.isFinite(id) && id > 0))];
    const taskIds = [...new Set((draft.taskIds || []).map(Number).filter((id: number) => Number.isFinite(id) && id > 0))];
    const common = {
      ...item.raw,
      ...this.dateFieldPatch(item, draft, field),
      ...this.rawFieldPatch(item, draft, field),
      title,
      description: String(draft.description || ''),
      status: this.backendStatus(status),
      priority,
      sprint_id: sprintId,
      assignee_user_id: assigneeId,
      reporter_user_id: reporterId,
      labels,
      ...(Object.prototype.hasOwnProperty.call(item.raw || {}, 'tags') ? { tags: labels } : {}),
      ...(Object.prototype.hasOwnProperty.call(item.raw || {}, 'label') ? { label: labels } : {}),
      comments
    };
    let request: Observable<any>;
    if (item.sourceType === 'EPIC') {
      request = this.http.put<any>(`${this.baseUrl}/epics/${item.sourceId}`, {
        ...common, name: title, status: this.backendStatus(status), priority
      }, this.headers());
    } else if (item.sourceType === 'STORY') {
      request = this.http.put<any>(`${this.baseUrl}/stories/${item.sourceId}`, {
        ...common, title, priority, project_id: item.projectId, epic_id: this.numberOrNull(draft.epicId),
        story_points: Number(draft.points || 0)
      }, this.headers());
    } else if (item.sourceType === 'TASK') {
      request = this.http.put<any>(`${this.baseUrl}/tasks/${item.sourceId}`, {
        ...common, title, priority, story_id: this.numberOrNull(draft.storyId), story_points: Number(draft.points || 0)
      }, this.headers());
    } else {
      const issueStatus = this.backendStatus(status);
      const isBlocking = Boolean(draft.isBlocking);
      request = this.http.put<any>(`${this.baseUrl}/v1/issues/${item.sourceId}`, {
        ...common,
        title,
        status: issueStatus,
        priority,
        sprintId: sprintId,
        assigneeUserId: assigneeId,
        assigneeId,
        reporterUserId: reporterId,
        reporterId,
        issue_code: item.raw?.issue_code ?? item.key,
        issueCode: item.raw?.issueCode ?? item.raw?.issue_code ?? item.key,
        isBlocking,
        is_blocking: isBlocking,
        epicIds, storyIds, taskIds,
        allocations: [
          ...epicIds.map(allocatableId => ({ allocatableType: 'EPIC', allocatableId })),
          ...storyIds.map(allocatableId => ({ allocatableType: 'STORY', allocatableId })),
          ...taskIds.map(allocatableId => ({ allocatableType: 'TASK', allocatableId }))
        ]
      }, this.headers());
    }

    this.detailSaving = true;
    this.detailEditError = '';
    request.pipe(catchError(error => {
      this.detailSaving = false;
      this.savingComment = false;
      this.detailEditError = error?.error?.message || error?.error?.error || 'Could not save this work item.';
      this.cdr.markForCheck();
      return of({ __kanbanSaveFailed: true });
    })).subscribe(response => {
      if (response?.__kanbanSaveFailed) return;
      const returned = response?.data ?? response?.item ?? response?.result ?? response;
      const updatedRaw = { ...common, ...(returned && typeof returned === 'object' ? returned : {}) };
      if (item.sourceType === 'EPIC') updatedRaw.name = title;
      if (item.sourceType === 'STORY') { updatedRaw.epic_id = this.numberOrNull(draft.epicId); updatedRaw.story_points = Number(draft.points || 0); updatedRaw.priority = priority; }
      if (item.sourceType === 'TASK') { updatedRaw.story_id = this.numberOrNull(draft.storyId); updatedRaw.story_points = Number(draft.points || 0); updatedRaw.priority = priority; }
      if (item.sourceType === 'ISSUE') Object.assign(updatedRaw, {
        priority, sprintId, assigneeUserId: assigneeId, assigneeId, reporterUserId: reporterId, reporterId,
        epicIds, storyIds, taskIds, isBlocking: Boolean(draft.isBlocking), is_blocking: Boolean(draft.isBlocking)
      });
      updatedRaw.labels = labels;
      updatedRaw.comments = comments;
      item.title = title;
      item.description = String(draft.description || '');
      item.status = status;
      item.priority = draft.priority as WorkPriority;
      item.points = Number(draft.points || 0) || undefined;
      item.sprintId = sprintId;
      item.sprint = this.projectSprints.find(sprint => sprint.id === sprintId)?.name ?? 'Backlog / Unassigned';
      item.assigneeId = assigneeId;
      item.assignee = this.detailPersonName(assigneeId);
      item.initials = this.initials(item.assignee);
      item.reporterId = reporterId;
      item.reporterName = reporterId === null ? '' : this.detailPersonName(reporterId);
      item.labels = labels;
      item.raw = updatedRaw;
      if (item.sourceType === 'STORY') {
        item.parentEpic = this.detailEpics.find(epic => epic.sourceId === this.numberOrNull(draft.epicId))?.title;
      } else if (item.sourceType === 'TASK') {
        item.parentEpic = this.detailStories.find(story => story.sourceId === this.numberOrNull(draft.storyId))?.parentEpic;
      }
      this.items = this.items.map(existing => existing.id === item.id ? item : existing);
      this.selectedItem = item;
      this.ticketRevision++;
      this.detailDraft = this.toDetailDraft(item);
      this.recentWork.remember({id:item.sourceId,type:item.sourceType,projectId:item.projectId,key:item.key,title:item.title,action:'Updated'});
      this.detailEditMode = false;
      this.editingDetailField = null;
      this.detailSaving = false;
      if (this.savingComment) this.commentText = '';
      this.savingComment = false;
      this.cdr.markForCheck();
    });
  }

  createItem(): void {
    const title = this.newTitle.trim();
    if (!title || !this.selectedProjectId || this.creatingItem) return;
    if (this.newType === 'Epic' && !this.newEpicCode.trim()) {
      this.createError = 'Enter an Epic code before creating this item.';
      return;
    }
    if (this.newType === 'Task' && !this.newStoryId) {
      this.createError = 'Choose a parent Story before creating this Task.';
      return;
    }
    const selectedAssignee = this.newAssigneeId === null ? 'Unassigned' : this.detailPersonName(this.newAssigneeId);
    const selectedReporter = this.newReporterId === null ? 'No reporter' : this.detailPersonName(this.newReporterId);
    if (this.newAssigneeSearchText.trim().toLowerCase() !== selectedAssignee.toLowerCase()) {
      this.createError = 'Choose an assignee from the suggestions, or clear the field.';
      return;
    }
    if (this.newReporterSearchText.trim().toLowerCase() !== selectedReporter.toLowerCase()) {
      this.createError = 'Choose a reporter from the suggestions, or clear the field.';
      return;
    }

    const projectId = this.selectedProjectId;
    const sprintId = this.newSprintId;
    const status = this.backendStatus(this.newStatus);
    const priority = this.newPriority.toUpperCase();
    const labels = this.normalizeLabels(this.newLabelsText);
    const common = {
      title,
      description: this.newDescription,
      status,
      priority,
      sprint_id: sprintId,
      project_id: projectId,
      assignee_user_id: this.newAssigneeId,
      reporter_user_id: this.newReporterId,
      labels
    };
    let request: Observable<any>;
    if (this.newType === 'Epic') {
      request = this.http.post<any>(`${this.baseUrl}/epics/create`, {
        ...common,
        name: title,
        epic_code: this.newEpicCode.trim()
      }, this.headers());
    } else if (this.newType === 'Story') {
      request = this.http.post<any>(`${this.baseUrl}/stories/create`, {
        ...common,
        epic_id: this.newEpicId,
        story_points: Number(this.newPoints || 0)
      }, this.headers());
    } else if (this.newType === 'Bug') {
      const issueCode = this.newIssueCode.trim() || `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`;
      const currentUserId = this.authenticatedUserId();
      const allocations = [
        ...this.newEpicIds.map(allocatableId => ({ allocatableType: 'EPIC', allocatableId })),
        ...this.newStoryIds.map(allocatableId => ({ allocatableType: 'STORY', allocatableId })),
        ...this.newTaskIds.map(allocatableId => ({ allocatableType: 'TASK', allocatableId }))
      ];
      request = this.http.post<any>(`${this.baseUrl}/v1/issues`, {
        ...common,
        issue_code: issueCode,
        issueCode,
        projectId: projectId,
        project: { id: projectId },
        sprintId: sprintId,
        sprint: sprintId === null ? null : { id: sprintId },
        user_id: currentUserId,
        userId: currentUserId,
        creator_user_id: currentUserId,
        creatorUserId: currentUserId,
        assigneeUserId: this.newAssigneeId,
        reporterUserId: this.newReporterId,
        assignee: this.newAssigneeId === null ? null : { id: this.newAssigneeId },
        reporter: this.newReporterId === null ? null : { id: this.newReporterId },
        isBlocking: this.newIsBlocking,
        is_blocking: this.newIsBlocking,
        epicIds: this.newEpicIds,
        storyIds: this.newStoryIds,
        taskIds: this.newTaskIds,
        allocations
      }, this.headers());
    } else {
      request = this.http.post<any>(`${this.baseUrl}/tasks/create`, {
        ...common,
        story_id: this.newStoryId,
        story_points: Number(this.newPoints || 0)
      }, this.headers());
    }

    this.creatingItem = true;
    this.createError = '';
    request.pipe(catchError(error => {
      this.createError = error?.error?.message || error?.error?.error || `Could not create ${this.newType === 'Bug' ? 'issue' : this.newType.toLowerCase()}.`;
      this.cdr.markForCheck();
      return of(null);
    })).subscribe(result => {
      this.creatingItem = false;
      this.cdr.markForCheck();
      if (result === null) return;
      this.showCreateForm = false;
      if (this.dialogRequest) { this.dialogClosed.emit(); return; }
      this.clearCreateTypeQueryParam();
      this.cdr.markForCheck();
      this.loadProjectData();
      window.setTimeout(() => window.scrollTo(0, this.boardScrollY), 0);
    });
  }

  onDragStart(item: WorkItem, event: DragEvent): void {
    this.draggedItemId = item.id;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.effectAllowed = 'move';
    }
  }
  allowDrop(event: DragEvent): void { event.preventDefault(); }

  onDrop(status: WorkStatus, event: DragEvent): void {
    event.preventDefault();
    const key = event.dataTransfer?.getData('text/plain') || this.draggedItemId;
    if (!key) return;
    const item = this.items.find(candidate => candidate.id === key);
    if (!item || item.status === status) { this.draggedItemId = null; return; }
    const previousStatus = item.status;
    item.status = status;
    const backendStatus = this.backendStatus(status);
    const request=this.http.patch(`${this.baseUrl}/tickets/${item.sourceType}/${item.sourceId}/placement`,{status:backendStatus},this.headers());

    request.pipe(catchError(error => {
      item.status = previousStatus;
      this.loadError = error?.error?.message || 'Could not update work-item status.';
      this.cdr.markForCheck();
      return of(null);
    }))
      .subscribe(result => { if (result !== null) this.loadProjectData(); });
    this.draggedItemId = null;
  }

  private backendStatus(status:WorkStatus):string{return this.workflow.code(status);}

  statusClass(status: WorkStatus): string { return status.toLowerCase().replace(/\s+/g, '-'); }
  trackById(_index: number, item: WorkItem): string { return item.id; }
  trackByPersonId(_index: number, person: PersonOption): number { return person.id; }

  personToneClass(id: number): string {
    return `person-tone-${((Math.trunc(Number(id) || 0) % 4) + 4) % 4}`;
  }
}
