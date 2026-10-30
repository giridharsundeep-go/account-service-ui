import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnInit, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { forkJoin, from, Observable, of } from 'rxjs';
import { catchError, map, mergeMap, switchMap, toArray } from 'rxjs/operators';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';

import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';

type WorkItemKind = 'EPIC' | 'STORY' | 'TASK' | 'ISSUE';
type FilterKey = 'project' | 'assignee' | 'kind' | 'status' | 'reporter' | 'sprint' | 'priority' | 'resolution';
type FilterValue = number | string;
type FilterOperator = 'equals' | 'not-equals';

interface WorkItemFilterOption {
  value: FilterValue;
  label: string;
  initials?: string;
  avatarUrl?: string | null;
  kindClass?: string;
}

interface WorkItemProject {
  id: number;
  name: string;
  avatarUrl?: string | null;
}

interface WorkItemSprint {
  id: number;
  name: string;
  projectId: number | null;
  status: string;
}

interface WorkItemPerson {
  id: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
}

interface WorkItemRow {
  id: string;
  sourceId: number;
  kind: WorkItemKind;
  key: string;
  title: string;
  projectId: number | null;
  projectName: string;
  sprintId: number | null;
  sprintName: string;
  assigneeId: number | null;
  assigneeName: string;
  assigneeAvatarUrl: string | null;
  reporterId: number | null;
  reporterName: string;
  reporterAvatarUrl: string | null;
  priority: string;
  status: string;
  resolution: string;
  createdAt: string | null;
  raw: any;
}

interface ProjectWorkCollections {
  project: WorkItemProject;
  epics: any;
  stories: any;
}

@Component({
  selector: 'app-work-items',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCheckboxModule, MatTableModule],
  templateUrl: './work-items.html',
  styleUrls: ['./work-items.css', '../shared/field-controls.css']
})
export class WorkItems implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly projectContext = inject(ProjectContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly baseUrl = environment.apiBaseUrlM.replace(/\/$/, '');

  readonly displayedColumns = ['select', 'work', 'assignee', 'reporter', 'priority', 'status', 'resolution', 'created'];
  readonly kindOptions: WorkItemKind[] = ['EPIC', 'STORY', 'TASK', 'ISSUE'];
  readonly primaryFilterKeys: FilterKey[] = ['project', 'assignee', 'kind', 'status', 'sprint', 'reporter'];
  readonly extraFilterKeys: FilterKey[] = ['priority', 'resolution'];
  readonly filterLabels: Record<FilterKey, string> = {
    project: 'Space', assignee: 'Assignee', kind: 'Type', status: 'Status',
    reporter: 'Reporter', sprint: 'Sprint', priority: 'Priority', resolution: 'Resolution'
  };

  projects: WorkItemProject[] = [];
  sprints: WorkItemSprint[] = [];
  users: WorkItemPerson[] = [];
  items: WorkItemRow[] = [];
  selectedItemIds = new Set<string>();
  selectedProjectIds = new Set<FilterValue>();
  selectedAssigneeIds = new Set<FilterValue>();
  selectedReporterIds = new Set<FilterValue>();
  selectedSprintIds = new Set<FilterValue>();
  selectedKinds = new Set<FilterValue>();
  selectedStatuses = new Set<FilterValue>();
  selectedPriorities = new Set<FilterValue>();
  selectedResolutions = new Set<FilterValue>();
  searchTerm = '';
  moreFiltersOpen = false;
  activeFilter: FilterKey | null = null;
  filterSearch = '';
  operatorMenuOpen = false;
  expandedFilterLists = new Set<FilterKey>();
  filterOperators: Record<FilterKey, FilterOperator> = {
    project: 'equals', assignee: 'equals', kind: 'equals', status: 'equals',
    reporter: 'equals', sprint: 'equals', priority: 'equals', resolution: 'equals'
  };
  loading = false;
  bulkUpdating = false;
  errorMessage = '';
  actionMessage = '';
  actionMessageIsError = false;
  bulkStatusValue = '';
  bulkStatusMenuOpen = false;
  readonly bulkStatusOptions = ['Backlog', 'To Do', 'In Progress', 'In Review', 'Testing', 'Done', 'Blocked'];
  visibleItemCount = 50;
  readonly pageSize = 50;
  private readonly projectContextSync = effect(() => {
    const sharedProjectId = this.projectContext.selectedProjectId();
    const sharedProjects = this.projectContext.projects();
    if (!sharedProjectId || !sharedProjects.length || !this.projects.length) return;
    if (this.projects.some(project => project.id === sharedProjectId)) this.applyGlobalProjectFilter(sharedProjectId);
  });

  @HostListener('document:click')
  closeFilterPopover(): void {
    this.activeFilter = null;
    this.operatorMenuOpen = false;
    this.bulkStatusMenuOpen = false;
  }

  @HostListener('window:scroll')
  closeFilterOnPageScroll(): void {
    if (this.activeFilter) this.activeFilter = null;
  }

  ngOnInit(): void {
    this.loadWorkItems();
  }

  private headers() {
    return { headers: this.auth.getAuthHeaders() };
  }

  private extractArray(value: any, depth = 0): any[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object' || depth > 5) return [];
    for (const key of ['content', 'data', 'items', 'results', 'records', 'projects', 'epics', 'stories', 'tasks', 'issues', 'users']) {
      const child = value[key];
      if (Array.isArray(child)) return child;
      if (child && typeof child === 'object') {
        const rows = this.extractArray(child, depth + 1);
        if (rows.length) return rows;
      }
    }
    return [];
  }

  private flattenResponses(value: any): any[] {
    if (!Array.isArray(value)) return this.extractArray(value);
    return value.flatMap(entry => {
      if (Array.isArray(entry)) return entry;
      const nested = this.extractArray(entry);
      return nested.length ? nested : [entry];
    });
  }

  private collection(urls: string[]): Observable<any> {
    const attempt = (index: number): Observable<any> => {
      if (index >= urls.length) return of([]);
      return this.http.get<any>(urls[index], this.headers()).pipe(
        switchMap(response => this.extractArray(response).length ? of(response) : attempt(index + 1)),
        catchError(() => attempt(index + 1))
      );
    };
    return attempt(0);
  }

  private projectCollections(projects: WorkItemProject[]): Observable<ProjectWorkCollections[]> {
    if (!projects.length) return of([]);
    return from(projects).pipe(
      mergeMap(project => forkJoin({
        project: of(project),
        epics: this.collection([`${this.baseUrl}/projects/${project.id}/epics`]),
        stories: this.collection([`${this.baseUrl}/projects/${project.id}/stories`])
      }), 4),
      toArray()
    );
  }

  private scopedIssues(projects: WorkItemProject[]): Observable<any[]> {
    if (!projects.length) return of([]);
    const issueBaseUrls = [...new Set([
      this.baseUrl,
      environment.apiBaseUrl2?.replace(/\/$/, ''),
      environment.apiBaseUrl?.replace(/\/$/, '')
    ].filter((url): url is string => Boolean(url)))];
    return from(projects).pipe(
      mergeMap(project => this.collection(issueBaseUrls.map(url => `${url}/v1/issues?projectId=${project.id}`)), 4),
      toArray()
    );
  }

  loadWorkItems(): void {
    this.loading = true;
    this.errorMessage = '';
    forkJoin({
      projects: this.collection([`${this.baseUrl}/projects`, `${this.baseUrl}/project`]),
      users: this.collection([`${this.baseUrl}/users`]),
      tasks: this.collection([`${this.baseUrl}/tasks`]),
      sprints: this.collection([`${this.baseUrl}/sprints`]),
      issues: this.collection([...new Set([
        `${this.baseUrl}/v1/issues`,
        `${environment.apiBaseUrl2 || ''}/v1/issues`,
        `${environment.apiBaseUrl || ''}/v1/issues`
      ].filter(Boolean))])
    }).pipe(
      switchMap(({ projects, users, tasks, sprints, issues }) => {
        this.projects = this.extractArray(projects).map(row => ({
          id: Number(row?.id ?? row?.project_id ?? row?.projectId ?? row?.project?.id),
          name: this.text(row?.name ?? row?.project_name ?? row?.projectName ?? row?.title ?? row?.project, `Project ${row?.id ?? ''}`),
          avatarUrl: this.text(row?.avatar_url ?? row?.avatarUrl ?? row?.icon_url ?? row?.iconUrl ?? row?.logo_url ?? row?.logoUrl, '') || null
        })).filter(project => Number.isFinite(project.id) && project.id > 0);
        const sharedProjectId = this.projectContext.selectedProjectId();
        if (sharedProjectId && this.projects.some(project => project.id === sharedProjectId)) this.applyGlobalProjectFilter(sharedProjectId);
        this.sprints = this.extractArray(sprints).map(row => ({
          id: Number(row?.id ?? row?.sprint_id ?? row?.sprintId),
          name: this.text(row?.name ?? row?.sprint_name ?? row?.sprintName ?? row?.title, `Sprint ${row?.id ?? ''}`),
          projectId: this.number(row?.project_id ?? row?.projectId ?? row?.project?.id),
          status: this.label(row?.status ?? row?.state, 'Planned')
        })).filter(sprint => Number.isFinite(sprint.id) && sprint.id > 0);
        this.users = this.extractArray(users).map((row, index) => this.normalizePerson(row, index)).filter((person): person is WorkItemPerson => Boolean(person));
        const globalIssues = this.extractArray(issues);
        const issues$ = globalIssues.length ? of(issues) : this.scopedIssues(this.projects);
        return forkJoin({
          projectCollections: this.projectCollections(this.projects),
          tasks: of(tasks),
          sprints: of(this.sprints),
          issues: issues$
        });
      })
    ).subscribe({
      next: ({ projectCollections, tasks, sprints, issues }) => {
        const projectById = new Map(this.projects.map(project => [project.id, project]));
        const sprintById = new Map(sprints.map((sprint: WorkItemSprint) => [sprint.id, sprint]));
        const epics = projectCollections.flatMap(collection => this.extractArray(collection.epics).map(row => ({ ...row, __projectId: collection.project.id })));
        const stories = projectCollections.flatMap(collection => this.extractArray(collection.stories).map(row => ({ ...row, __projectId: collection.project.id })));
        const taskRows = this.extractArray(tasks);
        const issueRows = this.flattenResponses(issues);
        const epicById = new Map<number, any>(epics.map(row => [this.sourceId(row), row]));
        const storyById = new Map<number, any>(stories.map(row => [this.sourceId(row), row]));
        const rows: WorkItemRow[] = [];

        for (const epic of epics) rows.push(this.normalizeItem(epic, 'EPIC', epic.__projectId, projectById, sprintById));
        for (const story of stories) {
          const parentEpic = epicById.get(this.number(story?.epic_id ?? story?.epicId ?? story?.epic?.id) ?? -1);
          const projectId = this.number(story?.project_id ?? story?.projectId ?? story?.project?.id ?? story.__projectId) ?? this.number(parentEpic?.project_id ?? parentEpic?.projectId ?? parentEpic?.__projectId);
          rows.push(this.normalizeItem(story, 'STORY', projectId, projectById, sprintById));
        }
        for (const task of taskRows) {
          const parentStory = storyById.get(this.number(task?.story_id ?? task?.storyId ?? task?.story?.id) ?? -1);
          const parentEpic = parentStory ? epicById.get(this.number(parentStory?.epic_id ?? parentStory?.epicId ?? parentStory?.epic?.id) ?? -1) : undefined;
          const projectId = this.number(task?.project_id ?? task?.projectId ?? task?.project?.id) ?? this.number(parentStory?.project_id ?? parentStory?.projectId ?? parentStory?.__projectId) ?? this.number(parentEpic?.project_id ?? parentEpic?.projectId ?? parentEpic?.__projectId);
          rows.push(this.normalizeItem(task, 'TASK', projectId, projectById, sprintById));
        }
        for (const issue of issueRows) {
          const projectId = this.number(issue?.project_id ?? issue?.projectId ?? issue?.project?.id);
          rows.push(this.normalizeItem(issue, 'ISSUE', projectId, projectById, sprintById));
        }

        const unique = new Map<string, WorkItemRow>();
        for (const row of rows) if (row.sourceId > 0) unique.set(row.id, row);
        this.items = [...unique.values()].sort((a, b) => this.createdTime(b.createdAt) - this.createdTime(a.createdAt) || a.key.localeCompare(b.key));
        this.visibleItemCount = this.pageSize;
        this.loading = false;
        if (!this.items.length) this.errorMessage = 'No Epics, Stories, Tasks, or Issues were found.';
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.items = [];
        this.errorMessage = 'Could not load work items. Refresh the page and try again.';
        this.cdr.markForCheck();
      }
    });
  }

  private normalizePerson(raw: any, index = 0): WorkItemPerson | null {
    const id = this.number(raw?.id ?? raw?.user_id ?? raw?.userId ?? raw?.user_account_id ?? raw?.userAccountId);
    if (id === null) return null;
    const first = this.text(raw?.first_name ?? raw?.firstName, '');
    const last = this.text(raw?.last_name ?? raw?.lastName, '');
    const name = this.text(raw?.full_name ?? raw?.fullName ?? raw?.display_name ?? raw?.displayName ?? raw?.name ?? raw?.username ?? raw?.user_name, `${first} ${last}`.trim() || `User ${id}`);
    return {
      id,
      name,
      initials: this.makeInitials(name || `U${index + 1}`),
      avatarUrl: this.text(raw?.profile_picture_url ?? raw?.profilePictureUrl ?? raw?.avatar_url ?? raw?.avatarUrl ?? raw?.photo_url, '') || null
    };
  }

  private normalizeItem(
    raw: any,
    kind: WorkItemKind,
    inheritedProjectId: number | null,
    projectById: Map<number, WorkItemProject>,
    sprintById: Map<number, WorkItemSprint>
  ): WorkItemRow {
    const sourceId = this.sourceId(raw);
    const projectId = this.number(raw?.project_id ?? raw?.projectId ?? raw?.project?.id) ?? inheritedProjectId;
    const project = projectId === null ? undefined : projectById.get(projectId);
    const sprintId = this.number(raw?.sprint_id ?? raw?.sprintId ?? raw?.sprint?.id);
    const sprint = sprintId === null ? undefined : sprintById.get(sprintId);
    const assigneeRaw = raw?.assignee_user ?? raw?.assigneeUser ?? raw?.assignee ?? raw?.assigned_user ?? raw?.assignedUser ?? raw?.assigned_to ?? raw?.assignedTo;
    const reporterRaw = raw?.reporter_user ?? raw?.reporterUser ?? raw?.reporter ?? raw?.reported_by ?? raw?.reportedBy;
    const assigneeId = this.personId(raw, 'assignee', assigneeRaw);
    const reporterId = this.personId(raw, 'reporter', reporterRaw);
    const assignee = this.resolvePerson(assigneeId, assigneeRaw);
    const reporter = this.resolvePerson(reporterId, reporterRaw);
    const title = this.text(raw?.title ?? raw?.name ?? raw?.summary, `${this.kindLabel(kind)} ${sourceId}`);
    const key = this.text(raw?.epic_code ?? raw?.epicCode ?? raw?.story_code ?? raw?.storyCode ?? raw?.task_code ?? raw?.taskCode ?? raw?.issue_code ?? raw?.issueCode ?? raw?.key, `${kind}-${sourceId}`);
    const status = this.label(raw?.status ?? raw?.workflow_status ?? raw?.workflowStatus ?? raw?.state, 'Unknown');
    const rawResolution = raw?.resolution?.name ?? raw?.resolution_name ?? raw?.resolutionName ?? raw?.resolution;
    const resolution = rawResolution ? this.label(rawResolution, 'Unresolved') : (/done|complete|resolved|closed/i.test(status) ? 'Done' : 'Unresolved');
    return {
      id: `${kind}-${sourceId}`,
      sourceId,
      kind,
      key,
      title,
      projectId,
      projectName: project?.name ?? this.text(raw?.project?.name ?? raw?.project_name ?? raw?.projectName, 'Unknown space'),
      sprintId,
      sprintName: sprint?.name ?? this.text(raw?.sprint?.name ?? raw?.sprint_name ?? raw?.sprintName, 'Backlog / Unassigned'),
      assigneeId,
      assigneeName: assignee?.name ?? 'Unassigned',
      assigneeAvatarUrl: assignee?.avatarUrl ?? null,
      reporterId,
      reporterName: reporter?.name ?? '—',
      reporterAvatarUrl: reporter?.avatarUrl ?? null,
      priority: this.label(raw?.priority ?? raw?.severity, 'None'),
      status,
      resolution,
      createdAt: this.text(raw?.created_at ?? raw?.createdAt ?? raw?.created_date ?? raw?.createdDate, '') || null,
      raw
    };
  }

  private personId(raw: any, role: 'assignee' | 'reporter', nested: any): number | null {
    const values = role === 'assignee'
      ? [raw?.assignee_user_id, raw?.assigneeUserId, raw?.assignee_id, raw?.assigneeId, raw?.assigned_user_id, raw?.assignedUserId, nested?.user_account_id, nested?.userAccountId, nested?.user_id, nested?.userId, nested?.id, typeof nested === 'number' || typeof nested === 'string' ? nested : null]
      : [raw?.reporter_user_id, raw?.reporterUserId, raw?.reporter_id, raw?.reporterId, raw?.reported_by_user_id, raw?.reportedByUserId, nested?.user_account_id, nested?.userAccountId, nested?.user_id, nested?.userId, nested?.id, typeof nested === 'number' || typeof nested === 'string' ? nested : null];
    for (const value of values) {
      const id = this.number(value);
      if (id !== null) return id;
    }
    return null;
  }

  private resolvePerson(id: number | null, nested: any): WorkItemPerson | undefined {
    if (id !== null) {
      const user = this.users.find(candidate => candidate.id === id);
      if (user) return user;
    }
    if (nested && typeof nested === 'object') return this.normalizePerson(nested) ?? undefined;
    return undefined;
  }

  private sourceId(raw: any): number {
    return Number(raw?.id ?? raw?.epic_id ?? raw?.epicId ?? raw?.story_id ?? raw?.storyId ?? raw?.task_id ?? raw?.taskId ?? raw?.issue_id ?? raw?.issueId);
  }

  private number(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  private text(value: any, fallback: string): string {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      for (const key of ['name', 'title', 'label', 'displayName', 'display_name', 'fullName', 'full_name', 'username', 'user_name', 'value']) {
        if (value[key] !== null && value[key] !== undefined && typeof value[key] !== 'object') return String(value[key]);
      }
    }
    return fallback;
  }

  private label(value: any, fallback: string): string {
    return this.text(value, fallback).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  private makeInitials(name: string): string {
    return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || '—';
  }

  private createdTime(value: string | null): number {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  get filteredItems(): WorkItemRow[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.items.filter(item => {
      if (!this.matchesFilter('project', item.projectId ?? '__no_space')) return false;
      if (!this.matchesFilter('assignee', item.assigneeId ?? '__unassigned')) return false;
      if (!this.matchesFilter('kind', item.kind)) return false;
      if (!this.matchesFilter('status', item.status)) return false;
      if (!this.matchesFilter('reporter', item.reporterId ?? '__no_reporter')) return false;
      if (!this.matchesFilter('sprint', item.sprintId ?? '__no_sprint')) return false;
      if (!this.matchesFilter('priority', item.priority)) return false;
      if (!this.matchesFilter('resolution', item.resolution)) return false;
      return !query || [item.key, item.title, item.projectName, item.sprintName, item.assigneeName, item.reporterName, item.status, item.priority, item.resolution]
        .some(value => value.toLowerCase().includes(query));
    });
  }

  get visibleItems(): WorkItemRow[] { return this.filteredItems.slice(0, this.visibleItemCount); }
  get hasMoreItems(): boolean { return this.visibleItemCount < this.filteredItems.length; }
  get selectedCount(): number { return this.selectedItemIds.size; }
  get allVisibleSelected(): boolean { return this.visibleItems.length > 0 && this.visibleItems.every(item => this.selectedItemIds.has(item.id)); }
  get partiallyVisibleSelected(): boolean { return this.visibleItems.some(item => this.selectedItemIds.has(item.id)); }

  get statusOptions(): string[] { return [...new Set(this.items.map(item => item.status))].sort((a, b) => a.localeCompare(b)); }
  get priorityOptions(): string[] { return [...new Set(this.items.map(item => item.priority))].sort((a, b) => a.localeCompare(b)); }
  get resolutionOptions(): string[] { return [...new Set(this.items.map(item => item.resolution))].sort((a, b) => a.localeCompare(b)); }
  get assigneeOptions(): WorkItemPerson[] { return this.peopleOptions('assigneeId'); }
  get reporterOptions(): WorkItemPerson[] { return this.peopleOptions('reporterId'); }
  get hasActiveFilters(): boolean {
    return this.primaryFilterKeys.concat(this.extraFilterKeys).some(key => this.selectionFor(key).size > 0)
      || Boolean(this.searchTerm.trim());
  }

  filterOptions(key: FilterKey): WorkItemFilterOption[] {
    switch (key) {
      case 'project':
        return [
          ...this.projects.map(project => ({ value: project.id, label: project.name, initials: this.makeInitials(project.name), avatarUrl: project.avatarUrl, kindClass: 'filter-project' })),
          { value: '__no_space', label: 'Unknown space', initials: '?' }
        ];
      case 'assignee':
        return [
          ...this.assigneeOptions.map(person => ({ value: person.id, label: person.name, initials: person.initials, avatarUrl: person.avatarUrl, kindClass: 'filter-person' })),
          { value: '__unassigned', label: 'Unassigned', initials: '—' }
        ];
      case 'reporter':
        return [
          ...this.reporterOptions.map(person => ({ value: person.id, label: person.name, initials: person.initials, avatarUrl: person.avatarUrl, kindClass: 'filter-person' })),
          { value: '__no_reporter', label: 'No reporter', initials: '—' }
        ];
      case 'sprint':
        return [
          ...this.sprints.map(sprint => ({ value: sprint.id, label: sprint.name, initials: this.makeInitials(sprint.name), kindClass: 'filter-sprint' })),
          { value: '__no_sprint', label: 'Backlog / Unassigned', initials: 'B', kindClass: 'filter-sprint' }
        ];
      case 'kind':
        return this.kindOptions.map(kind => ({ value: kind, label: this.kindLabel(kind), kindClass: this.kindClass(kind) }));
      case 'status':
        return this.statusOptions.map(status => ({ value: status, label: status }));
      case 'priority':
        return this.priorityOptions.map(priority => ({ value: priority, label: priority }));
      case 'resolution':
        return this.resolutionOptions.map(resolution => ({ value: resolution, label: resolution }));
    }
  }

  filterHeading(key: FilterKey): string {
    if (key === 'project') return 'Recent spaces';
    if (key === 'assignee' || key === 'reporter') return 'People';
    if (key === 'sprint') return 'Project sprints';
    return `${this.filterLabels[key]} options`;
  }

  filterButtonText(key: FilterKey): string {
    const selected = this.selectionFor(key);
    if (!selected.size) return this.filterLabels[key];
    const labels = this.filterOptions(key).filter(option => selected.has(option.value)).map(option => option.label);
    return labels.length === 1 ? labels[0] : `${this.filterLabels[key]} · ${labels.length}`;
  }

  visibleFilterOptions(key: FilterKey): WorkItemFilterOption[] {
    const query = this.filterSearch.trim().toLowerCase();
    const matches = this.filterOptions(key).filter(option => option.label.toLowerCase().includes(query));
    return this.expandedFilterLists.has(key) ? matches : matches.slice(0, 3);
  }

  hasMoreFilterOptions(key: FilterKey): boolean {
    const query = this.filterSearch.trim().toLowerCase();
    return this.filterOptions(key).filter(option => option.label.toLowerCase().includes(query)).length > 3;
  }

  isFilterOptionSelected(key: FilterKey, value: FilterValue): boolean {
    return this.selectionFor(key).has(value);
  }

  selectionForTemplate(key: FilterKey): Set<FilterValue> {
    return this.selectionFor(key);
  }

  toggleFilterPopover(key: FilterKey, event: MouseEvent): void {
    event.stopPropagation();
    if (this.activeFilter === key) {
      this.closeFilterPopover();
      return;
    }
    this.activeFilter = key;
    this.filterSearch = '';
    this.operatorMenuOpen = false;
  }

  toggleFilterOption(key: FilterKey, value: FilterValue, event: MouseEvent): void {
    event.stopPropagation();
    const next = new Set(this.selectionFor(key));
    next.has(value) ? next.delete(value) : next.add(value);
    this.setSelection(key, next);
    this.resetVisibleItemCount();
  }

  setFilterOperator(key: FilterKey, operator: FilterOperator, event: MouseEvent): void {
    event.stopPropagation();
    this.filterOperators = { ...this.filterOperators, [key]: operator };
    this.operatorMenuOpen = false;
  }

  toggleFilterList(key: FilterKey, event: MouseEvent): void {
    event.stopPropagation();
    const next = new Set(this.expandedFilterLists);
    next.has(key) ? next.delete(key) : next.add(key);
    this.expandedFilterLists = next;
  }

  filterOperatorLabel(key: FilterKey): string {
    return this.filterOperators[key] === 'equals' ? '= (equals)' : '≠ (not equals)';
  }

  private matchesFilter(key: FilterKey, value: FilterValue): boolean {
    const selected = this.selectionFor(key);
    if (!selected.size) return true;
    const isMatch = selected.has(value);
    return this.filterOperators[key] === 'equals' ? isMatch : !isMatch;
  }

  private selectionFor(key: FilterKey): Set<FilterValue> {
    switch (key) {
      case 'project': return this.selectedProjectIds;
      case 'assignee': return this.selectedAssigneeIds;
      case 'reporter': return this.selectedReporterIds;
      case 'sprint': return this.selectedSprintIds;
      case 'kind': return this.selectedKinds;
      case 'status': return this.selectedStatuses;
      case 'priority': return this.selectedPriorities;
      case 'resolution': return this.selectedResolutions;
    }
  }

  private setSelection(key: FilterKey, selection: Set<FilterValue>): void {
    switch (key) {
      case 'project': this.selectedProjectIds = selection; break;
      case 'assignee': this.selectedAssigneeIds = selection; break;
      case 'reporter': this.selectedReporterIds = selection; break;
      case 'sprint': this.selectedSprintIds = selection; break;
      case 'kind': this.selectedKinds = selection; break;
      case 'status': this.selectedStatuses = selection; break;
      case 'priority': this.selectedPriorities = selection; break;
      case 'resolution': this.selectedResolutions = selection; break;
    }
  }

  private peopleOptions(field: 'assigneeId' | 'reporterId'): WorkItemPerson[] {
    const ids = new Set(this.items.map(item => item[field]).filter((id): id is number => id !== null));
    return [...ids].map(id => {
      const directoryPerson = this.users.find(user => user.id === id);
      if (directoryPerson) return directoryPerson;
      const item = this.items.find(candidate => candidate[field] === id);
      if (!item) return null;
      const name = field === 'assigneeId' ? item.assigneeName : item.reporterName;
      return {
        id,
        name,
        initials: this.makeInitials(name),
        avatarUrl: field === 'assigneeId' ? item.assigneeAvatarUrl : item.reporterAvatarUrl
      };
    }).filter((person): person is WorkItemPerson => Boolean(person)).sort((a, b) => a.name.localeCompare(b.name));
  }

  clearFilters(): void {
    this.selectedProjectIds = new Set();
    this.selectedAssigneeIds = new Set();
    this.selectedReporterIds = new Set();
    this.selectedSprintIds = new Set();
    this.selectedKinds = new Set();
    this.selectedStatuses = new Set();
    this.selectedPriorities = new Set();
    this.selectedResolutions = new Set();
    this.searchTerm = '';
    this.selectedItemIds.clear();
    this.visibleItemCount = this.pageSize;
    this.filterOperators = {
      project: 'equals', assignee: 'equals', kind: 'equals', status: 'equals',
      reporter: 'equals', sprint: 'equals', priority: 'equals', resolution: 'equals'
    };
  }

  toggleVisibleSelection(checked: boolean): void {
    for (const item of this.visibleItems) checked ? this.selectedItemIds.add(item.id) : this.selectedItemIds.delete(item.id);
  }

  toggleItemSelection(item: WorkItemRow, checked: boolean): void {
    checked ? this.selectedItemIds.add(item.id) : this.selectedItemIds.delete(item.id);
  }

  resetVisibleItemCount(): void { this.visibleItemCount = this.pageSize; }

  private applyGlobalProjectFilter(projectId: number): void {
    if (this.selectedProjectIds.size === 1 && this.selectedProjectIds.has(projectId)) return;
    this.selectedProjectIds = new Set([projectId]);
    this.visibleItemCount = this.pageSize;
    this.selectedItemIds.clear();
  }

  loadMoreItems(): void { this.visibleItemCount += this.pageSize; }

  filterPopoverPosition(key: FilterKey): Record<string, string> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return {};
    const trigger = document.querySelector<HTMLElement>(`.work-filter-control[data-filter="${key}"] .work-items-filter-trigger`);
    if (!trigger) return {};
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(302, Math.max(240, window.innerWidth - 24));
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const maxHeight = Math.max(220, Math.min(420, window.innerHeight - 28));
    const top = rect.bottom + maxHeight + 8 > window.innerHeight && rect.top > maxHeight
      ? rect.top - maxHeight - 8
      : Math.min(rect.bottom + 8, window.innerHeight - maxHeight - 12);
    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${Math.max(8, top)}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`
    };
  }

  toggleBulkStatusMenu(event: Event): void {
    event.stopPropagation();
    this.bulkStatusMenuOpen = !this.bulkStatusMenuOpen;
  }

  chooseBulkStatus(status: string, event: Event): void {
    event.stopPropagation();
    this.bulkStatusValue = status;
    this.bulkStatusMenuOpen = false;
  }

  applyBulkStatus(): void {
    if (!this.bulkStatusValue || !this.selectedItemIds.size || this.bulkUpdating) return;
    const requestedStatus = this.bulkStatusValue;
    this.bulkStatusMenuOpen = false;
    const targetStatus = this.backendStatus(requestedStatus);
    const selectedItems = this.items.filter(item => this.selectedItemIds.has(item.id));
    if (!selectedItems.length) return;

    this.bulkUpdating = true;
    this.actionMessage = '';
    this.actionMessageIsError = false;
    forkJoin(selectedItems.map(item => this.bulkStatusRequest(item, targetStatus).pipe(
      map(() => true),
      catchError(() => of(false))
    ))).subscribe(outcomes => {
      const successful = outcomes.filter(Boolean).length;
      selectedItems.forEach((item, index) => {
        if (!outcomes[index]) return;
        item.status = this.label(requestedStatus, requestedStatus);
        if (/done|complete|resolved|closed/i.test(item.status)) item.resolution = 'Done';
        else if (/backlog|to do|todo|in progress|testing|blocked/i.test(item.status)) item.resolution = 'Unresolved';
        this.selectedItemIds.delete(item.id);
      });
      this.bulkUpdating = false;
      this.actionMessage = successful === selectedItems.length
        ? `Updated status for ${successful} selected ${successful === 1 ? 'item' : 'items'}.`
        : `Updated ${successful} of ${selectedItems.length} items. Failed items remain selected.`;
      this.actionMessageIsError = successful !== selectedItems.length;
      this.bulkStatusValue = '';
      this.cdr.markForCheck();
    });
  }

  private bulkStatusRequest(item: WorkItemRow, status: string): Observable<any> {
    const raw = item.raw ?? {};
    const assigneeId = this.number(raw?.assignee_user_id ?? raw?.assigneeUserId ?? raw?.assignee_id ?? raw?.assigneeId);
    const reporterId = this.number(raw?.reporter_user_id ?? raw?.reporterUserId ?? raw?.reporter_id ?? raw?.reporterId);
    const sprintId = this.number(raw?.sprint_id ?? raw?.sprintId ?? raw?.sprint?.id);
    const common = { status, sprint_id: sprintId, assignee_user_id: assigneeId, reporter_user_id: reporterId };
    if (item.kind === 'EPIC') {
      return this.http.put(`${this.baseUrl}/epics/${item.sourceId}`, {
        ...common, name: raw?.name ?? item.title, description: raw?.description ?? ''
      }, this.headers());
    }
    if (item.kind === 'STORY') {
      return this.http.put(`${this.baseUrl}/stories/${item.sourceId}`, {
        ...common, title: raw?.title ?? item.title, description: raw?.description ?? '',
        story_points: Number(raw?.story_points ?? raw?.storyPoints ?? 0),
        priority: raw?.priority ?? 'MEDIUM',
        epic_id: this.number(raw?.epic_id ?? raw?.epicId ?? raw?.epic?.id)
      }, this.headers());
    }
    if (item.kind === 'TASK') {
      return this.http.put(`${this.baseUrl}/tasks/${item.sourceId}`, {
        ...common, title: raw?.title ?? item.title, description: raw?.description ?? ''
      }, this.headers());
    }
    return this.http.put(`${this.baseUrl}/v1/issues/${item.sourceId}`, { ...raw, status }, this.headers());
  }

  private backendStatus(status: string): string {
    const normalized = status.trim().toLowerCase();
    const aliases: Record<string, string> = {
      'to do': 'TODO', 'todo': 'TODO', 'in progress': 'IN_PROGRESS',
      'in review': 'IN_REVIEW', 'completed': 'COMPLETED', 'done': 'DONE',
      'backlog': 'BACKLOG', 'blocked': 'BLOCKED', 'testing': 'TESTING'
    };
    return aliases[normalized] ?? normalized.replace(/[^a-z0-9]+/g, '_').toUpperCase();
  }

  openWorkItem(item: WorkItemRow): void {
    this.router.navigate(['/user-home'], {
      queryParams: {
        menu: 'kanban-board',
        openType: item.kind,
        openId: item.sourceId,
        ...(item.projectId === null ? {} : { projectId: item.projectId })
      }
    });
  }

  initials(name: string): string { return this.makeInitials(name); }
  kindLabel(kind: WorkItemKind): string { return kind[0] + kind.slice(1).toLowerCase(); }
  kindClass(kind: WorkItemKind): string { return `work-type-${kind.toLowerCase()}`; }
  statusClass(status: string): string { return `work-status-${status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }
  priorityClass(priority: string): string { return `work-priority-${priority.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }
  formatDate(date: string | null): string {
    if (!date) return '—';
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
  }
  trackByItem(_index: number, item: WorkItemRow): string { return item.id; }
}
