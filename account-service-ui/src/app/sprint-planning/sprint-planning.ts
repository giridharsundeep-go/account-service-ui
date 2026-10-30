import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';

type WorkKind = 'EPIC' | 'STORY' | 'TASK' | 'ISSUE';
type TypeFilter = 'ALL' | WorkKind;

interface ProjectOption {
  id: number;
  name: string;
}

interface SprintOption {
  id: number;
  name: string;
  sprintNumber?: number;
  status: string;
  projectId: number | null;
  goal?: string;
  capacityPoints?: number | null;
  startDate?: string;
  endDate?: string;
}

interface TeamOption {
  id: number;
  name: string;
  description?: string;
  members: PlanningPerson[];
}

interface PlanningPerson {
  id: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
}

interface PlanningItem {
  id: string;
  sourceId: number;
  kind: WorkKind;
  key: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  points: number | null;
  teamId: number | null;
  assigneeId: number | null;
  assigneeName: string;
  assigneeAvatarUrl: string | null;
  sprintId: number | null;
  sprintName: string;
  parentName: string;
  raw: any;
}

interface PlanningAssigneeGroup {
  key: string;
  personId: number | null;
  name: string;
  initials: string;
  avatarUrl: string | null;
  items: PlanningItem[];
  totalPoints: number;
}

interface PlanningSprintGroup {
  key: string;
  sprintId: number | null;
  name: string;
  sprint?: SprintOption;
  items: PlanningItem[];
  assigneeGroups: PlanningAssigneeGroup[];
  totalPoints: number;
  isBacklog: boolean;
  isFocus: boolean;
}

@Component({
  selector: 'app-sprint-planning',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatSelectModule, MatCheckboxModule, MatTableModule],
  templateUrl: './sprint-planning.html',
  styleUrls: ['../kanban-board/kanban-board.css', './sprint-planning.css', '../shared/field-controls.css'],
})
export class SprintPlanning implements OnInit {
  @ViewChild('planningRoot', { static: true }) private planningRoot!: ElementRef<HTMLElement>;
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly projectContext = inject(ProjectContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly baseUrl = environment.apiBaseUrlM;

  projects: ProjectOption[] = [];
  teams: TeamOption[] = [];
  sprints: SprintOption[] = [];
  items: PlanningItem[] = [];
  selectedProjectId: number | null = null;
  selectedTeamId: number | null = null;
  selectedSprintId: number | null = null;
  fullscreenMode = false;
  fullscreenFallback = false;
  teamMembers: PlanningPerson[] = [];
  private userDirectory: PlanningPerson[] = [];
  loadingTeamMembers = false;
  typeFilter: TypeFilter = 'ALL';
  searchQuery = '';
  selectedItemIds = new Set<string>();
  collapsedSprintGroupKeys = new Set<string>();
  expandedAssigneeGroupKeys = new Set<string>();
  readonly displayedColumns = ['select', 'workItem', 'status', 'sprint', 'priority', 'points'];
  moveDestinationSprintId: number | null = null;
  loadingProjects = false;
  loadingItems = false;
  saving = false;
  loadError = '';
  saveError = '';
  notice = '';
  createDialogOpen = false;
  sprintDialogOpen = false;
  creatingSprint = false;
  sprintError = '';
  newSprintName = '';
  newSprintStartDate = '';
  newSprintEndDate = '';
  newSprintCapacity: number | null = null;
  creatingWorkItem = false;
  createError = '';
  createKind: WorkKind = 'TASK';
  createTitle = '';
  createDescription = '';
  createStatus = 'Backlog';
  createPriority = 'Medium';
  createSprintId: number | null = null;
  createAssigneeId: number | null = null;
  createReporterId: number | null = null;
  createEpicId: number | null = null;
  createStoryId: number | null = null;
  createEpicIds: number[] = [];
  createStoryIds: number[] = [];
  createTaskIds: number[] = [];
  createPoints: number | null = null;
  createEpicCode = '';
  createIssueCode = '';
  createLabels = '';
  createIssueBlocking = false;
  createAssigneeSearchText = 'Unassigned';
  createReporterSearchText = 'No reporter';
  readonly createStatuses = ['Backlog', 'To Do', 'In Progress', 'Testing', 'Completed', 'Blocked'];
  readonly descriptionColors = ['#202124', '#2563eb', '#7c3aed', '#16834a', '#c2410c'];
  draggedItemId: string | null = null;
  dropTarget: 'backlog' | number | null = null;
  private readonly projectContextSync = effect(() => {
    const sharedProjectId = this.projectContext.selectedProjectId();
    if (!sharedProjectId || !this.projects.length || sharedProjectId === this.selectedProjectId) return;
    if (this.projects.some(project => project.id === sharedProjectId)) this.onProjectChange(sharedProjectId);
  });

  ngOnInit(): void {
    this.loadProjects();
  }

  private headers() {
    return { headers: this.auth.getAuthHeaders() };
  }

  private extractArray(response: any, depth = 0): any[] {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== 'object' || depth > 5) return [];
    let emptyArray: any[] | null = null;
    for (const key of ['content', 'data', 'items', 'results', 'records', 'projects', 'project', 'sprints', 'sprint', 'epics', 'stories', 'tasks', 'teams', 'team', 'team_ids', 'teamIds', 'users', 'user', 'members', 'teamMembers', 'team_members', 'teamUsers', 'team_users', 'memberships', 'teamMemberships', 'team_memberships', 'individuals']) {
      const value = response[key];
      if (Array.isArray(value)) {
        if (value.length) return value;
        emptyArray ??= value;
      }
      if (value && typeof value === 'object') {
        const rows = this.extractArray(value, depth + 1);
        if (rows.length) return rows;
      }
    }
    return emptyArray ?? [];
  }

  private displayText(value: any, fallback = ''): string {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      for (const key of ['name', 'title', 'label', 'displayName', 'display_name', 'fullName', 'full_name', 'userName', 'user_name', 'username', 'value']) {
        if (value[key] !== null && value[key] !== undefined && typeof value[key] !== 'object') return String(value[key]);
      }
    }
    return fallback;
  }

  private numberOrNull(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  initials(name: string): string {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : (parts[0]?.slice(0, 2) || 'U').toUpperCase();
  }

  private normalizePerson(raw: any, index = 0): PlanningPerson | null {
    const profile = raw?.user ?? raw?.individual ?? raw?.member?.user ?? raw?.member ?? raw;
    const id = this.numberOrNull(
      raw?.user_account_id ?? raw?.userAccountId ?? raw?.user_id ?? raw?.userId ?? raw?.memberId ??
      profile?.user_account_id ?? profile?.userAccountId ?? profile?.user_id ?? profile?.userId ?? profile?.id ?? raw?.id ??
      (typeof raw === 'number' || typeof raw === 'string' ? raw : null)
    );
    if (id === null || id <= 0) return null;
    const firstLast = [profile?.first_name ?? profile?.firstName, profile?.last_name ?? profile?.lastName].filter(Boolean).join(' ');
    const name = this.displayText(
      profile?.name ?? profile?.display_name ?? profile?.displayName ?? profile?.full_name ?? profile?.fullName ?? profile?.user_name ?? profile?.userName,
      firstLast || profile?.username || raw?.name || raw?.username || `User ${index + 1}`
    ).trim();
    return {
      id,
      name,
      initials: this.initials(name),
      avatarUrl: profile?.avatarUrl ?? profile?.avatar_url ?? profile?.profilePictureUrl ?? profile?.profile_picture_url ??
        profile?.photoUrl ?? profile?.photo_url ?? raw?.avatarUrl ?? raw?.avatar_url ?? raw?.profilePictureUrl ?? raw?.profile_picture_url ?? null
    };
  }

  private normalizeTeam(raw: any): TeamOption | null {
    const id = this.numberOrNull(raw?.team_id ?? raw?.teamId ?? raw?.team?.id ?? raw?.id ?? raw);
    if (id === null || id <= 0) return null;
    const team = raw?.team ?? raw;
    const rawMembers = team?.members ?? team?.teamMembers ?? team?.team_members ?? team?.teamUsers ?? team?.team_users ??
      team?.memberships ?? team?.teamMemberships ?? team?.team_memberships ?? team?.users ?? team?.memberIds ?? team?.member_ids ?? [];
    return {
      id,
      name: this.displayText(team?.name ?? team?.team_name ?? team?.teamName ?? raw?.name, `Team ${id}`),
      description: this.displayText(team?.description ?? team?.team_description ?? team?.teamDescription, ''),
      members: (Array.isArray(rawMembers) ? rawMembers : []).map((member: any, index: number) => this.normalizePerson(member, index)).filter((person: PlanningPerson | null): person is PlanningPerson => Boolean(person))
    };
  }

  private itemTeamId(raw: any): number | null {
    return this.numberOrNull(raw?.team_id ?? raw?.teamId ?? raw?.team?.id ?? raw?.team?.team_id ?? raw?.team?.teamId);
  }

  private findPerson(id: number | null): PlanningPerson | undefined {
    if (id === null) return undefined;
    return [...this.teamMembers, ...this.userDirectory].find(person => person.id === id);
  }

  private mergePeople(primary: PlanningPerson[], secondary: PlanningPerson[]): PlanningPerson[] {
    const merged = new Map<number, PlanningPerson>();
    for (const person of [...secondary, ...primary]) {
      const existing = merged.get(person.id);
      const placeholderName = !person.name || /^user\s+\d+$/i.test(person.name.trim());
      merged.set(person.id, existing ? {
        ...person,
        name: placeholderName ? existing.name : person.name,
        initials: placeholderName ? existing.initials : person.initials,
        avatarUrl: person.avatarUrl || existing.avatarUrl
      } : person);
    }
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  onTeamChange(value: number | string | null): void {
    const teamId = Number(value);
    this.selectedTeamId = Number.isFinite(teamId) && teamId > 0 ? teamId : null;
    this.selectedItemIds.clear();
    this.collapsedSprintGroupKeys.clear();
    this.expandedAssigneeGroupKeys.clear();
    this.notice = '';
    this.saveError = '';
    this.loadingTeamMembers = false;
    const team = this.selectedTeam;
    this.teamMembers = this.mergePeople(team?.members ?? [], this.userDirectory);
    const initiallyExpandedSprint = this.selectedSprint ?? this.activeSprint ?? this.planningSprints[0];
    for (const sprint of this.sprints) {
      if (sprint.id !== initiallyExpandedSprint?.id) this.collapsedSprintGroupKeys.add(this.sprintGroupKey(sprint.id));
    }
    if (this.selectedTeamId !== null) this.loadTeamMembers(this.selectedTeamId);
  }

  private loadTeamMembers(teamId: number): void {
    this.loadingTeamMembers = true;
    this.collection([
      `${this.baseUrl}/teams/${teamId}/members`,
      `${this.baseUrl}/teams/${teamId}/users`
    ]).subscribe(response => {
      if (this.selectedTeamId !== teamId) return;
      const loaded = this.extractArray(response)
        .map((row, index) => this.normalizePerson(row, index))
        .filter((person): person is PlanningPerson => Boolean(person));
      this.teamMembers = this.mergePeople(loaded, this.mergePeople(this.selectedTeam?.members ?? [], this.userDirectory));
      this.loadingTeamMembers = false;
      this.cdr.markForCheck();
    });
  }

  private loadProjects(): void {
    this.loadingProjects = true;
    this.loadError = '';
    this.collection([`${this.baseUrl}/projects`, `${this.baseUrl}/project`]).subscribe({
      next: response => {
        this.projects = this.extractArray(response).map(row => ({
          id: Number(row?.id ?? row?.project_id ?? row?.projectId ?? row?.project?.id),
          name: this.displayText(row?.name ?? row?.project_name ?? row?.projectName ?? row?.title ?? row?.project, `Project ${row?.id ?? ''}`)
        })).filter(project => Number.isFinite(project.id) && project.id > 0);
        this.loadingProjects = false;
        if (!this.projects.length) this.loadError = 'No projects are available for sprint planning.';
        else {
          const sharedProjectId = this.projectContext.selectedProjectId();
          const preferred = this.projects.find(project => project.id === sharedProjectId) ?? this.projects[0];
          if (preferred.id !== this.selectedProjectId) this.onProjectChange(preferred.id);
          else this.projectContext.setSelectedProject(preferred.id);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingProjects = false;
        this.loadError = 'Could not load projects. Check your access and try again.';
        this.cdr.markForCheck();
      }
    });
  }

  private collection(urls: string[]): Observable<any> {
    const tryUrl = (index: number): Observable<any> => {
      if (index >= urls.length) return of([]);
      return this.http.get<any>(urls[index], this.headers()).pipe(
        switchMap(response => this.extractArray(response).length ? of(response) : tryUrl(index + 1)),
        catchError(() => tryUrl(index + 1))
      );
    };
    return tryUrl(0);
  }

  onProjectChange(value: number | string | null): void {
    const projectId = Number(value);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      this.selectedProjectId = null;
      this.selectedTeamId = null;
      this.sprints = [];
      this.teams = [];
      this.teamMembers = [];
      this.items = [];
      this.selectedSprintId = null;
      this.loadingTeamMembers = false;
      this.loadingItems = false;
      this.selectedItemIds.clear();
      this.collapsedSprintGroupKeys.clear();
      this.expandedAssigneeGroupKeys.clear();
      this.loadError = '';
      this.notice = '';
      this.saveError = '';
      return;
    }
    if (projectId === this.selectedProjectId) return;
    this.selectedProjectId = projectId;
    this.projectContext.setSelectedProject(projectId);
    this.selectedTeamId = null;
    this.selectedSprintId = null;
    this.loadingTeamMembers = false;
    this.teams = [];
    this.teamMembers = [];
    this.sprints = [];
    this.items = [];
    this.searchQuery = '';
    this.typeFilter = 'ALL';
    this.selectedItemIds.clear();
    this.collapsedSprintGroupKeys.clear();
    this.expandedAssigneeGroupKeys.clear();
    this.notice = '';
    this.loadProjectItems(projectId);
  }

  onSprintChange(value: number | string | null): void {
    const sprintId = Number(value);
    this.selectedSprintId = Number.isFinite(sprintId) && sprintId > 0 ? sprintId : null;
    if (this.selectedSprintId !== null) this.collapsedSprintGroupKeys.delete(this.sprintGroupKey(this.selectedSprintId));
    this.selectedItemIds.clear();
    this.notice = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.createDialogOpen) this.closeCreateDialog();
    if (this.sprintDialogOpen) this.closeSprintDialog();
  }

  @HostListener('document:fullscreenchange')
  syncFullscreenMode(): void {
    const root = this.planningRoot?.nativeElement;
    if (!root) return;
    this.fullscreenMode = root.ownerDocument.fullscreenElement === root || this.fullscreenFallback;
  }

  async toggleFullscreen(): Promise<void> {
    const root = this.planningRoot?.nativeElement;
    if (!root) return;
    if (this.fullscreenFallback) {
      this.fullscreenFallback = false;
      this.fullscreenMode = false;
      return;
    }
    const doc = root.ownerDocument;
    if (doc.fullscreenElement === root) {
      await doc.exitFullscreen();
      return;
    }
    try {
      if (!root.requestFullscreen) throw new Error('Fullscreen is not supported in this browser.');
      await root.requestFullscreen();
    } catch {
      this.fullscreenFallback = true;
      this.fullscreenMode = true;
    }
  }

  get createPeople(): PlanningPerson[] {
    return this.teamMembers.length ? this.teamMembers : this.userDirectory;
  }

  filteredCreatePeople(field: 'assignee' | 'reporter'): PlanningPerson[] {
    const query = (field === 'assignee' ? this.createAssigneeSearchText : this.createReporterSearchText).trim().toLowerCase();
    return this.createPeople.filter(person => !query || person.name.toLowerCase().includes(query)).slice(0, 50);
  }

  filterCreatePeople(field: 'assignee' | 'reporter', query: string): void {
    if (field === 'assignee') this.createAssigneeSearchText = query;
    else this.createReporterSearchText = query;
  }

  selectCreatePerson(field: 'assignee' | 'reporter', id: number | null): void {
    const text = id === null ? (field === 'assignee' ? 'Unassigned' : 'No reporter') : this.findPerson(id)?.name ?? `User ${id}`;
    if (field === 'assignee') {
      this.createAssigneeId = id;
      this.createAssigneeSearchText = text;
    } else {
      this.createReporterId = id;
      this.createReporterSearchText = text;
    }
  }

  onCreateKindChange(kind: WorkKind): void {
    this.createKind = kind;
    this.createError = '';
    if (kind === 'TASK' && this.createStoryId === null) this.createStoryId = this.createStories[0]?.sourceId ?? null;
    if (kind === 'ISSUE' && !this.createIssueCode) this.createIssueCode = `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  createStatusClass(status: string): string {
    return String(status || '').toLowerCase().replace(/\s+/g, '-');
  }

  onCreateDescriptionInput(event: Event): void {
    this.createDescription = (event.currentTarget as HTMLElement | null)?.innerHTML ?? '';
  }

  formatCreateDescription(command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'foreColor', value?: string): void {
    document.execCommand(command, false, value);
    const editor = document.querySelector<HTMLElement>('.planning-new-description-editable');
    if (editor) this.createDescription = editor.innerHTML;
  }

  get createSprintLabel(): string {
    return this.sprints.find(sprint => sprint.id === this.createSprintId)?.name ?? 'Selected sprint';
  }

  openCreateDialog(kind: WorkKind): void {
    if (!this.selectedProjectId || !this.selectedTeamId) return;
    this.createKind = kind;
    this.createTitle = '';
    this.createDescription = '';
    this.createStatus = this.selectedSprintId !== null ? 'To Do' : 'Backlog';
    this.createPriority = 'Medium';
    this.createSprintId = this.selectedSprintId;
    this.createAssigneeId = null;
    this.createReporterId = null;
    this.createAssigneeSearchText = 'Unassigned';
    this.createReporterSearchText = 'No reporter';
    this.createEpicId = this.teamItems.find(item => item.kind === 'EPIC')?.sourceId ?? null;
    this.createStoryId = this.teamItems.find(item => item.kind === 'STORY')?.sourceId ?? null;
    this.createEpicIds = [];
    this.createStoryIds = [];
    this.createTaskIds = [];
    this.createPoints = 0;
    this.createEpicCode = '';
    this.createIssueCode = `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`;
    this.createLabels = '';
    this.createIssueBlocking = false;
    this.createError = '';
    this.notice = '';
    this.createDialogOpen = true;
  }

  closeCreateDialog(): void {
    if (this.creatingWorkItem) return;
    this.createDialogOpen = false;
    this.createError = '';
  }

  createWorkItem(): void {
    const title = this.createTitle.trim();
    if (!title || !this.selectedProjectId || !this.selectedTeamId || this.creatingWorkItem) return;
    if (this.createKind === 'EPIC' && !this.createEpicCode.trim()) {
      this.createError = 'Enter an Epic code before creating this item.';
      return;
    }
    if (this.createKind === 'TASK' && !this.createStoryId) {
      this.createError = 'Choose a parent Story before creating this Task.';
      return;
    }
    const assigneeLabel = this.createAssigneeId === null ? 'Unassigned' : this.findPerson(this.createAssigneeId)?.name ?? `User ${this.createAssigneeId}`;
    const reporterLabel = this.createReporterId === null ? 'No reporter' : this.findPerson(this.createReporterId)?.name ?? `User ${this.createReporterId}`;
    if (this.createAssigneeSearchText.trim().toLowerCase() !== assigneeLabel.toLowerCase()) {
      this.createError = 'Choose an assignee from the suggestions, or clear the field.';
      return;
    }
    if (this.createReporterSearchText.trim().toLowerCase() !== reporterLabel.toLowerCase()) {
      this.createError = 'Choose a reporter from the suggestions, or clear the field.';
      return;
    }

    const status = this.backendStatus(this.createStatus);
    const priority = this.createPriority.toUpperCase();
    const labels = [...new Set(this.createLabels.split(',').map(label => label.trim()).filter(Boolean))];
    const projectId = this.selectedProjectId;
    const sprintId = this.createSprintId;
    const teamId = this.selectedTeamId;
    const common = {
      title,
      description: this.createDescription.trim(),
      status,
      priority,
      sprint_id: sprintId,
      project_id: projectId,
      team_id: teamId,
      assignee_user_id: this.createAssigneeId,
      reporter_user_id: this.createReporterId,
      labels
    };

    let request: Observable<any>;
    if (this.createKind === 'EPIC') {
      request = this.http.post<any>(`${this.baseUrl}/epics/create`, {
        ...common,
        name: title,
        epic_code: this.createEpicCode.trim()
      }, this.headers());
    } else if (this.createKind === 'STORY') {
      request = this.http.post<any>(`${this.baseUrl}/stories/create`, {
        ...common,
        epic_id: this.createEpicId,
        story_points: Number(this.createPoints || 0)
      }, this.headers());
    } else if (this.createKind === 'TASK') {
      request = this.http.post<any>(`${this.baseUrl}/tasks/create`, {
        ...common,
        story_id: this.createStoryId,
        story_points: Number(this.createPoints || 0)
      }, this.headers());
    } else {
      const currentUserId = this.authenticatedUserId();
      const allocations = [
        ...this.createEpicIds.map(allocatableId => ({ allocatableType: 'EPIC', allocatableId })),
        ...this.createStoryIds.map(allocatableId => ({ allocatableType: 'STORY', allocatableId })),
        ...this.createTaskIds.map(allocatableId => ({ allocatableType: 'TASK', allocatableId }))
      ];
      request = this.http.post<any>(`${this.baseUrl}/v1/issues`, {
        ...common,
        issue_code: this.createIssueCode.trim(),
        issueCode: this.createIssueCode.trim(),
        projectId,
        project: { id: projectId },
        teamId,
        sprintId,
        sprint: sprintId === null ? null : { id: sprintId },
        user_id: currentUserId,
        userId: currentUserId,
        creator_user_id: currentUserId,
        creatorUserId: currentUserId,
        assigneeUserId: this.createAssigneeId,
        reporterUserId: this.createReporterId,
        assignee: this.createAssigneeId === null ? null : { id: this.createAssigneeId },
        reporter: this.createReporterId === null ? null : { id: this.createReporterId },
        isBlocking: this.createIssueBlocking,
        is_blocking: this.createIssueBlocking,
        epicIds: this.createEpicIds,
        storyIds: this.createStoryIds,
        taskIds: this.createTaskIds,
        allocations
      }, this.headers());
    }

    this.creatingWorkItem = true;
    this.createError = '';
    request.pipe(catchError(error => {
      this.createError = error?.error?.message || error?.error?.error || `Could not create ${this.typeLabel(this.createKind).toLowerCase()}.`;
      this.creatingWorkItem = false;
      this.cdr.markForCheck();
      return of(null);
    })).subscribe(result => {
      if (result === null) return;
      this.creatingWorkItem = false;
      this.createDialogOpen = false;
      this.notice = `${this.typeLabel(this.createKind)} created successfully.`;
      this.cdr.markForCheck();
      if (this.selectedProjectId !== null) this.loadProjectItems(this.selectedProjectId);
    });
  }

  private authenticatedUserId(): number | null {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) return null;
      const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(encoded));
      const id = Number(payload?.user_id ?? payload?.userId ?? payload?.sub ?? payload?.id);
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch { return null; }
  }

  onDragStart(item: PlanningItem, event: DragEvent): void {
    if (this.saving) { event.preventDefault(); return; }
    this.draggedItemId = item.id;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(target: 'backlog' | number, event: DragEvent): void {
    if (target !== 'backlog' && target <= 0) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropTarget = target;
  }

  onDragLeave(target: 'backlog' | number, event: DragEvent): void {
    const current = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget as Node | null;
    if (current && next && current.contains(next)) return;
    if (this.dropTarget === target) this.dropTarget = null;
  }

  onDrop(target: 'backlog' | number, event: DragEvent): void {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain') || this.draggedItemId;
    const item = this.items.find(candidate => candidate.id === id);
    const destination = target === 'backlog' ? null : target;
    this.dropTarget = null;
    this.draggedItemId = null;
    if (!item || destination === item.sprintId) return;
    this.moveItem(item, destination);
  }

  onDragEnd(): void {
    this.draggedItemId = null;
    this.dropTarget = null;
  }

  private loadProjectItems(projectId: number): void {
    this.loadingItems = true;
    this.loadError = '';
    const projectAtRequest = projectId;
    forkJoin({
      epics: this.http.get<any>(`${this.baseUrl}/projects/${projectId}/epics`, this.headers()).pipe(catchError(() => of([]))),
      stories: this.http.get<any>(`${this.baseUrl}/projects/${projectId}/stories`, this.headers()).pipe(catchError(() => of([]))),
      tasks: this.http.get<any>(`${this.baseUrl}/tasks`, this.headers()).pipe(catchError(() => of([]))),
      issues: this.collection([
        `${this.baseUrl}/v1/issues?projectId=${projectId}`,
        `${environment.apiBaseUrl2 || ''}/v1/issues?projectId=${projectId}`,
        `${environment.apiBaseUrl || ''}/v1/issues?projectId=${projectId}`
      ]),
      sprints: this.collection([`${this.baseUrl}/sprints?project_id=${projectId}`, `${this.baseUrl}/sprints`]),
      teams: this.http.get<any>(`${this.baseUrl}/teams`, this.headers()).pipe(catchError(() => of([]))),
      projectTeams: this.http.get<any>(`${this.baseUrl}/project-teams/${projectId}`, this.headers()).pipe(catchError(() => of([]))),
      users: this.http.get<any>(`${this.baseUrl}/users`, this.headers()).pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ epics, stories, tasks, issues, sprints, teams, projectTeams, users }) => {
        if (projectAtRequest !== this.selectedProjectId) return;
        this.sprints = this.extractArray(sprints).map(raw => ({
          id: Number(raw?.id ?? raw?.sprint_id ?? raw?.sprintId),
          name: this.displayText(raw?.name ?? raw?.sprint_name ?? raw?.sprintName ?? raw?.title ?? raw?.sprint, `Sprint ${raw?.id ?? ''}`),
          sprintNumber: this.numberOrNull(raw?.sprint_number ?? raw?.sprintNumber) ?? undefined,
          status: this.displayText(raw?.status ?? raw?.state, '').toUpperCase(),
          projectId: this.numberOrNull(raw?.project_id ?? raw?.projectId ?? raw?.project?.id),
          goal: this.displayText(raw?.goal ?? raw?.sprint_goal ?? raw?.sprintGoal ?? raw?.goal_description ?? raw?.goalDescription, ''),
          capacityPoints: this.numberOrNull(raw?.capacity_points ?? raw?.capacityPoints ?? raw?.team_capacity_points ?? raw?.teamCapacityPoints ?? raw?.target_velocity ?? raw?.targetVelocity),
          startDate: raw?.scheduled_start_date ?? raw?.scheduledStartDate ?? raw?.start_date ?? raw?.startDate,
          endDate: raw?.scheduled_end_date ?? raw?.scheduledEndDate ?? raw?.end_date ?? raw?.endDate
        })).filter(sprint => Number.isFinite(sprint.id) && sprint.id > 0 && (sprint.projectId === null || sprint.projectId <= 0 || sprint.projectId === projectId))
          .sort((a, b) => {
            const aStart = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
            const bStart = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
            return aStart - bStart || a.name.localeCompare(b.name);
          });
        if (this.selectedSprintId !== null && !this.planningSprints.some(sprint => sprint.id === this.selectedSprintId)) {
          this.selectedSprintId = null;
        }

        const epicRows = this.extractArray(epics);
        const storyRows = this.extractArray(stories);
        const taskRows = this.extractArray(tasks);
        const issueRows = this.extractArray(issues).filter(row => {
          const rowProjectId = this.numberOrNull(row?.project_id ?? row?.projectId ?? row?.project?.id);
          return rowProjectId === null || rowProjectId <= 0 || rowProjectId === projectId;
        });
        const projectTeamRows = this.extractArray(projectTeams);
        const projectTeamIds = new Set(projectTeamRows.map(row => this.numberOrNull(row?.team_id ?? row?.teamId ?? row?.team?.id ?? row?.id ?? row)).filter((id): id is number => id !== null && id > 0));
        const normalizedTeams = this.extractArray(teams).map(row => this.normalizeTeam(row)).filter((team): team is TeamOption => Boolean(team));
        const linkedTeams = projectTeamRows.map(row => this.normalizeTeam(row)).filter((team): team is TeamOption => Boolean(team));
        const teamById = new Map<number, TeamOption>();
        for (const team of normalizedTeams) teamById.set(team.id, team);
        for (const team of linkedTeams) {
          const directoryTeam = teamById.get(team.id);
          teamById.set(team.id, directoryTeam ? { ...team, ...directoryTeam, members: directoryTeam.members.length ? directoryTeam.members : team.members } : team);
        }
        const allPeople = this.extractArray(users).map((row, index) => this.normalizePerson(row, index)).filter((person): person is PlanningPerson => Boolean(person));
        this.userDirectory = allPeople;
        const projectStoryIds = new Set(storyRows.map(row => Number(row?.id ?? row?.story_id ?? row?.storyId)).filter(Number.isFinite));
        const epicById = new Map<number, any>(epicRows.map(row => [Number(row?.id ?? row?.epic_id ?? row?.epicId), row]));
        const storyById = new Map<number, any>(storyRows.map(row => [Number(row?.id ?? row?.story_id ?? row?.storyId), row]));
        const sprintById = new Map<number, SprintOption>(this.sprints.map(sprint => [sprint.id, sprint]));
        const projectTasks = taskRows.filter(row => {
          const rowProjectId = this.numberOrNull(row?.project_id ?? row?.projectId ?? row?.project?.id);
          const storyId = this.numberOrNull(row?.story_id ?? row?.storyId);
          return rowProjectId === projectId || ((rowProjectId === null || rowProjectId <= 0) && storyId !== null && projectStoryIds.has(storyId));
        });

        const inferredTeamIds = [
          ...epicRows.map(row => this.itemTeamId(row)),
          ...storyRows.map(row => this.itemTeamId(row)),
          ...projectTasks.map(row => this.itemTeamId(row)),
          ...issueRows.map(row => this.itemTeamId(row))
        ].filter((id): id is number => id !== null && id > 0);
        for (const row of [...epicRows, ...storyRows, ...projectTasks, ...issueRows]) {
          const teamId = this.itemTeamId(row);
          if (teamId === null || teamById.has(teamId)) continue;
          const rawTeam = row?.team;
          teamById.set(teamId, {
            id: teamId,
            name: this.displayText(rawTeam?.name ?? rawTeam?.team_name ?? row?.team_name ?? row?.teamName, `Team ${teamId}`),
            description: '',
            members: []
          });
        }
        const availableTeamIds = projectTeamIds.size ? projectTeamIds : new Set(inferredTeamIds);
        this.teams = [...teamById.values()]
          .filter(team => !availableTeamIds.size || availableTeamIds.has(team.id))
          .sort((a, b) => a.name.localeCompare(b.name));

        const next: PlanningItem[] = [];
        const addItem = (raw: any, kind: WorkKind, parentName = '', inheritedTeamId: number | null = null) => {
          const sourceId = Number(raw?.id ?? raw?.epic_id ?? raw?.epicId ?? raw?.story_id ?? raw?.storyId ?? raw?.task_id ?? raw?.taskId ?? raw?.issue_id ?? raw?.issueId);
          if (!Number.isFinite(sourceId) || sourceId <= 0) return;
          const rowProjectId = this.numberOrNull(raw?.project_id ?? raw?.projectId ?? raw?.project?.id);
          if (rowProjectId !== null && rowProjectId > 0 && rowProjectId !== projectId) return;
          const sprintId = this.numberOrNull(raw?.sprint_id ?? raw?.sprintId ?? raw?.sprint?.id);
          const sprint = sprintId === null ? undefined : sprintById.get(sprintId);
          const teamId = this.itemTeamId(raw) ?? inheritedTeamId;
          const assigned = raw?.assignee_user ?? raw?.assigneeUser ?? raw?.assignee ?? raw?.assigned_user ?? raw?.assignedUser ?? raw?.assigned_to ?? raw?.assignedTo;
          const assigneeId = this.numberOrNull(
            raw?.assignee_user_id ?? raw?.assigneeUserId ?? raw?.assignee_user_account_id ?? raw?.assigneeUserAccountId ?? raw?.assignee_id ?? raw?.assigneeId ??
            raw?.assigned_user_id ?? raw?.assignedUserId ?? raw?.assigned_to_id ?? raw?.assignedToId ??
            assigned?.user_account_id ?? assigned?.userAccountId ?? assigned?.user_id ?? assigned?.userId ?? assigned?.id ?? assigned?.user?.id ??
            (typeof assigned === 'number' || typeof assigned === 'string' ? assigned : null)
          );
          const resolvedAssignee = this.findPerson(assigneeId);
          const assigneeName = resolvedAssignee?.name ?? this.displayText(
            raw?.assignee_name ?? raw?.assigneeName ?? raw?.assigned_to_name ?? raw?.assignedToName ?? assigned?.user ?? assigned,
            assigneeId === null ? 'Unassigned' : `User ${assigneeId}`
          );
          const title = this.displayText(raw?.name ?? raw?.title ?? raw?.summary, `${kind[0]}${kind.slice(1).toLowerCase()} ${sourceId}`);
          const typeName = kind[0] + kind.slice(1).toLowerCase();
          const key = this.displayText(raw?.epic_code ?? raw?.epicCode ?? raw?.story_code ?? raw?.storyCode ?? raw?.task_code ?? raw?.taskCode ?? raw?.issue_code ?? raw?.issueCode ?? raw?.key,
            `${typeName.toUpperCase()}-${sourceId}`);
          next.push({
            id: `${kind}-${sourceId}`,
            sourceId,
            kind,
            key,
            title,
            description: this.displayText(raw?.description, ''),
            status: this.statusLabel(raw?.status ?? raw?.workflow_status ?? raw?.state),
            priority: this.priorityLabel(raw?.priority ?? raw?.severity),
            points: this.numberOrNull(raw?.story_points ?? raw?.storyPoints ?? raw?.points),
            teamId,
            assigneeId,
            assigneeName,
            assigneeAvatarUrl: resolvedAssignee?.avatarUrl ?? null,
            sprintId,
            sprintName: sprint?.name ?? (sprintId === null ? 'Backlog' : 'Other sprint'),
            parentName,
            raw
          });
        };

        for (const epic of epicRows) addItem(epic, 'EPIC');
        for (const story of storyRows) {
          const parent = epicById.get(Number(story?.epic_id ?? story?.epicId));
          addItem(story, 'STORY', this.displayText(parent?.name ?? parent?.title ?? story?.epic_name ?? story?.epicName, ''), this.itemTeamId(parent));
        }
        for (const task of projectTasks) {
          const story = storyById.get(Number(task?.story_id ?? task?.storyId));
          const epic = story ? epicById.get(Number(story?.epic_id ?? story?.epicId)) : undefined;
          const parentName = [
            this.displayText(epic?.name ?? epic?.title, ''),
            this.displayText(story?.title ?? story?.name, '')
          ].filter(Boolean).join(' · ');
          addItem(task, 'TASK', parentName, this.itemTeamId(story) ?? this.itemTeamId(epic));
        }
        for (const issue of issueRows) addItem(issue, 'ISSUE');

        this.items = next.sort((a, b) => {
          const order: Record<WorkKind, number> = { EPIC: 0, STORY: 1, TASK: 2, ISSUE: 3 };
          return order[a.kind] - order[b.kind] || a.title.localeCompare(b.title);
        });
        this.loadingItems = false;
        this.selectedItemIds.clear();
        if (!this.items.length) this.loadError = 'This project has no Epics, Stories, Tasks, or Issues yet.';
        this.cdr.markForCheck();
      },
      error: () => {
        if (projectAtRequest !== this.selectedProjectId) return;
        this.loadingItems = false;
        this.items = [];
        this.loadError = 'Could not load work items for this project.';
        this.cdr.markForCheck();
      }
    });
  }

  get projectName(): string {
    return this.projects.find(project => project.id === this.selectedProjectId)?.name ?? '';
  }

  get selectedSprint(): SprintOption | undefined {
    return this.sprints.find(sprint => sprint.id === this.selectedSprintId);
  }

  get selectedTeam(): TeamOption | undefined {
    return this.teams.find(team => team.id === this.selectedTeamId);
  }

  get teamInitials(): string {
    return this.initials(this.selectedTeam?.name || 'Sprint planning');
  }

  get teamItems(): PlanningItem[] {
    if (this.selectedTeamId === null) return [];
    const memberIds = new Set(this.teamMembers.map(person => person.id));
    return this.items.filter(item => item.teamId === this.selectedTeamId || (item.teamId === null && item.assigneeId !== null && memberIds.has(item.assigneeId)));
  }

  get filteredItems(): PlanningItem[] {
    const query = this.searchQuery.trim().toLowerCase();
    const kindOrder: Record<WorkKind, number> = { EPIC: 0, STORY: 1, TASK: 2, ISSUE: 3 };
    return this.teamItems.filter(item => {
      const typeMatches = this.typeFilter === 'ALL' || item.kind === this.typeFilter;
      const queryMatches = !query || [item.key, item.title, item.description, item.parentName, item.status, item.priority]
        .some(value => value.toLowerCase().includes(query));
      return typeMatches && queryMatches;
    }).sort((a, b) => {
      return kindOrder[a.kind] - kindOrder[b.kind] || a.key.localeCompare(b.key) || a.title.localeCompare(b.title);
    });
  }

  get filteredSprintGroups(): PlanningSprintGroup[] {
    const visibleItems = this.filteredItems;
    const itemsBySprint = new Map<number | null, PlanningItem[]>();
    for (const item of visibleItems) {
      const groupItems = itemsBySprint.get(item.sprintId) ?? [];
      groupItems.push(item);
      itemsBySprint.set(item.sprintId, groupItems);
    }

    const hasFilters = this.typeFilter !== 'ALL' || Boolean(this.searchQuery.trim());
    const groups: PlanningSprintGroup[] = [];
    const backlogItems = itemsBySprint.get(null) ?? [];
    if (!hasFilters || backlogItems.length) {
      groups.push(this.createSprintGroup(null, 'Backlog', backlogItems));
    }

    const orderedSprints = [...this.sprints].sort((a, b) => {
      const activeFirst = Number(this.isSprintActive(b)) - Number(this.isSprintActive(a));
      if (activeFirst) return activeFirst;
      const aStart = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aStart - bStart || a.name.localeCompare(b.name);
    });
    const knownSprintIds = new Set(orderedSprints.map(sprint => sprint.id));
    for (const sprint of orderedSprints) {
      const sprintItems = itemsBySprint.get(sprint.id) ?? [];
      if (hasFilters && !sprintItems.length && sprint.id !== this.selectedSprintId) continue;
      groups.push(this.createSprintGroup(sprint.id, sprint.name, sprintItems, sprint));
    }

    const unknownSprintIds = [...itemsBySprint.keys()]
      .filter((id): id is number => id !== null && !knownSprintIds.has(id))
      .sort((a, b) => a - b);
    for (const sprintId of unknownSprintIds) {
      const sprintItems = itemsBySprint.get(sprintId) ?? [];
      groups.push(this.createSprintGroup(sprintId, sprintItems[0]?.sprintName || `Sprint ${sprintId}`, sprintItems));
    }
    return groups;
  }

  private createSprintGroup(sprintId: number | null, name: string, items: PlanningItem[], sprint?: SprintOption): PlanningSprintGroup {
    const key = sprintId === null ? 'backlog' : this.sprintGroupKey(sprintId);
    return {
      key,
      sprintId,
      name,
      sprint,
      items,
      assigneeGroups: this.createAssigneeGroups(items, key),
      totalPoints: items.reduce((total, item) => total + (item.points ?? 0), 0),
      isBacklog: sprintId === null,
      isFocus: sprintId !== null && sprintId === this.selectedSprintId
    };
  }

  private createAssigneeGroups(items: PlanningItem[], sprintGroupKey: string): PlanningAssigneeGroup[] {
    const byPerson = new Map<number | null, PlanningItem[]>();
    for (const item of items) {
      const personItems = byPerson.get(item.assigneeId) ?? [];
      personItems.push(item);
      byPerson.set(item.assigneeId, personItems);
    }
    return [...byPerson.entries()].map(([personId, personItems]) => {
      const name = personId === null ? 'Unassigned' : personItems[0]?.assigneeName || `User ${personId}`;
      return {
        key: `${sprintGroupKey}:${personId === null ? 'unassigned' : `person-${personId}`}`,
        personId,
        name,
        initials: personId === null ? '—' : this.initials(name),
        avatarUrl: personItems[0]?.assigneeAvatarUrl ?? null,
        items: personItems,
        totalPoints: personItems.reduce((total, item) => total + (item.points ?? 0), 0)
      };
    }).sort((a, b) => {
      if (a.personId === null) return 1;
      if (b.personId === null) return -1;
      return a.name.localeCompare(b.name);
    });
  }

  private sprintGroupKey(sprintId: number): string { return `sprint-${sprintId}`; }

  isSprintGroupExpanded(group: PlanningSprintGroup): boolean {
    return !this.collapsedSprintGroupKeys.has(group.key);
  }

  toggleSprintGroup(group: PlanningSprintGroup): void {
    if (this.isSprintGroupExpanded(group)) this.collapsedSprintGroupKeys.add(group.key);
    else this.collapsedSprintGroupKeys.delete(group.key);
  }

  setSprintGroupsExpanded(expanded: boolean): void {
    for (const group of this.filteredSprintGroups) {
      if (expanded) this.collapsedSprintGroupKeys.delete(group.key);
      else this.collapsedSprintGroupKeys.add(group.key);
      for (const personGroup of group.assigneeGroups) {
        if (expanded) this.expandedAssigneeGroupKeys.add(personGroup.key);
        else this.expandedAssigneeGroupKeys.delete(personGroup.key);
      }
    }
  }

  isAssigneeGroupExpanded(group: PlanningAssigneeGroup): boolean {
    return this.expandedAssigneeGroupKeys.has(group.key);
  }

  toggleAssigneeGroup(group: PlanningAssigneeGroup): void {
    if (this.isAssigneeGroupExpanded(group)) this.expandedAssigneeGroupKeys.delete(group.key);
    else this.expandedAssigneeGroupKeys.add(group.key);
  }

  isSprintGroupSelected(group: PlanningSprintGroup): boolean {
    return group.items.length > 0 && group.items.every(item => this.selectedItemIds.has(item.id));
  }

  hasPartiallySelectedSprintGroup(group: PlanningSprintGroup): boolean {
    return group.items.some(item => this.selectedItemIds.has(item.id)) && !this.isSprintGroupSelected(group);
  }

  toggleSprintGroupSelection(group: PlanningSprintGroup, checked: boolean): void {
    for (const item of group.items) checked ? this.selectedItemIds.add(item.id) : this.selectedItemIds.delete(item.id);
  }

  isAssigneeGroupSelected(group: PlanningAssigneeGroup): boolean {
    return group.items.length > 0 && group.items.every(item => this.selectedItemIds.has(item.id));
  }

  hasPartiallySelectedAssigneeGroup(group: PlanningAssigneeGroup): boolean {
    return group.items.some(item => this.selectedItemIds.has(item.id)) && !this.isAssigneeGroupSelected(group);
  }

  toggleAssigneeGroupSelection(group: PlanningAssigneeGroup, checked: boolean): void {
    for (const item of group.items) checked ? this.selectedItemIds.add(item.id) : this.selectedItemIds.delete(item.id);
  }

  get planningSprints(): SprintOption[] {
    return this.sprints.filter(sprint => !/complete|closed|done|archived|cancelled|canceled/i.test(sprint.status)).sort((a, b) => {
      const activeFirst = Number(this.isSprintActive(b)) - Number(this.isSprintActive(a));
      if (activeFirst) return activeFirst;
      const aStart = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aStart - bStart || a.name.localeCompare(b.name);
    });
  }

  isSprintActive(sprint: SprintOption): boolean {
    return /active|current|started|in.?progress/i.test(sprint.status);
  }

  canStartSprint(sprint: SprintOption): boolean {
    return !this.isSprintActive(sprint) && !/complete|closed|done|archived|cancelled|canceled/i.test(sprint.status);
  }

  get activeSprint(): SprintOption | undefined {
    return this.sprints.find(sprint => this.isSprintActive(sprint));
  }

  startSprint(sprint: SprintOption): void {
    if (!this.canStartSprint(sprint) || this.saving) return;
    const active = this.activeSprint;
    if (active && active.id !== sprint.id) {
      this.saveError = `${active.name} is already active. Complete it before starting another sprint.`;
      this.notice = '';
      return;
    }

    this.saving = true;
    this.saveError = '';
    this.notice = '';
    this.http.put(`${this.baseUrl}/sprints/${sprint.id}`, {
      name: sprint.name,
      status: 'ACTIVE',
      start_date: sprint.startDate ?? null,
      end_date: sprint.endDate ?? null,
      scheduled_start_date: sprint.startDate ?? null,
      scheduled_end_date: sprint.endDate ?? null
    }, this.headers()).subscribe({
      next: () => {
        this.saving = false;
        this.notice = `${sprint.name} is now active.`;
        this.cdr.markForCheck();
        if (this.selectedProjectId !== null) this.loadProjectItems(this.selectedProjectId);
      },
      error: error => {
        this.saving = false;
        this.saveError = error?.error?.message || `Could not start ${sprint.name}.`;
        this.cdr.markForCheck();
      }
    });
  }

  openSprintDialog(): void {
    if (!this.selectedProjectId || this.creatingSprint) return;
    const nextNumber = this.nextSprintNumber;
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    this.newSprintName = `Sprint ${nextNumber}`;
    this.newSprintStartDate = this.dateInputValue(start);
    this.newSprintEndDate = this.dateInputValue(end);
    this.newSprintCapacity = null;
    this.sprintError = '';
    this.sprintDialogOpen = true;
  }

  closeSprintDialog(): void {
    if (this.creatingSprint) return;
    this.sprintDialogOpen = false;
    this.sprintError = '';
  }

  createSprint(): void {
    if (!this.selectedProjectId || !this.newSprintName.trim() || this.creatingSprint) return;
    if (this.newSprintStartDate && this.newSprintEndDate && this.newSprintEndDate < this.newSprintStartDate) {
      this.sprintError = 'The end date must be on or after the start date.';
      return;
    }

    const projectId = this.selectedProjectId;
    const nextNumber = this.nextSprintNumber;
    const start = this.newSprintStartDate || null;
    const end = this.newSprintEndDate || null;
    const durationWeeks = start && end
      ? Math.max(1, Math.ceil((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / (7 * 86400000)))
      : 2;
    const payload = {
      project_id: projectId,
      sprint_number: nextNumber,
      name: this.newSprintName.trim(),
      status: 'PLANNED',
      start_date: start,
      end_date: end,
      scheduled_start_date: start,
      scheduled_end_date: end,
      duration_weeks: durationWeeks,
      target_velocity: this.newSprintCapacity ?? 0,
      activation_type: 'MANUAL'
    };

    this.creatingSprint = true;
    this.sprintError = '';
    this.http.post<any>(`${this.baseUrl}/sprints/create`, payload, this.headers()).subscribe({
      next: response => {
        this.creatingSprint = false;
        this.sprintDialogOpen = false;
        this.notice = `${payload.name} created. Add backlog work to begin planning.`;
        const created = response?.data ?? response?.sprint ?? response;
        this.selectedSprintId = this.numberOrNull(created?.id ?? created?.sprint_id ?? created?.sprintId);
        this.cdr.markForCheck();
        this.loadProjectItems(projectId);
      },
      error: error => {
        this.creatingSprint = false;
        this.sprintError = error?.error?.message || `Could not create ${payload.name}.`;
        this.cdr.markForCheck();
      }
    });
  }

  private dateInputValue(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  private get nextSprintNumber(): number {
    return Math.max(0, ...this.sprints.map(sprint => (sprint.sprintNumber ?? Number(sprint.name.match(/\d+/)?.[0])) || 0)) + 1;
  }

  statusPillClass(status: string): string {
    const normalized = String(status || 'backlog').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const aliases: Record<string, string> = {
      todo: 'to-do', open: 'to-do', new: 'to-do', ready: 'to-do',
      inprogress: 'in-progress', doing: 'in-progress', active: 'in-progress',
      test: 'testing', qa: 'testing',
      done: 'completed', complete: 'completed', resolved: 'completed', closed: 'completed',
      'on-hold': 'blocked'
    };
    return `status-${aliases[normalized] ?? normalized}`;
  }

  priorityPillClass(priority: string): string {
    return `priority-${String(priority || 'medium').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }

  get epicCount(): number { return this.teamItems.filter(item => item.kind === 'EPIC').length; }
  get storyCount(): number { return this.teamItems.filter(item => item.kind === 'STORY').length; }
  get taskCount(): number { return this.teamItems.filter(item => item.kind === 'TASK').length; }
  get issueCount(): number { return this.teamItems.filter(item => item.kind === 'ISSUE').length; }
  get createEpics(): PlanningItem[] { return this.teamItems.filter(item => item.kind === 'EPIC'); }
  get createStories(): PlanningItem[] { return this.teamItems.filter(item => item.kind === 'STORY'); }
  get createTasks(): PlanningItem[] { return this.teamItems.filter(item => item.kind === 'TASK'); }
  get plannedCount(): number { return this.selectedSprintId === null ? 0 : this.teamItems.filter(item => item.sprintId === this.selectedSprintId).length; }
  get sprintItemCount(): number { return this.plannedCount; }
  get plannedPoints(): number {
    if (this.selectedSprintId === null) return 0;
    return this.teamItems.filter(item => item.sprintId === this.selectedSprintId).reduce((total, item) => total + (item.points ?? 0), 0);
  }
  get unestimatedSprintItemCount(): number {
    if (this.selectedSprintId === null) return 0;
    return this.teamItems.filter(item => item.sprintId === this.selectedSprintId && item.points === null).length;
  }
  get capacityPercent(): number {
    const capacity = this.selectedSprint?.capacityPoints;
    return capacity && capacity > 0 ? Math.min(100, Math.round(this.plannedPoints / capacity * 100)) : 0;
  }
  get selectedItems(): PlanningItem[] { return this.teamItems.filter(item => this.selectedItemIds.has(item.id)); }
  get selectedItemCount(): number { return this.selectedItems.length; }
  get selectedBacklogCount(): number { return this.selectedItems.filter(item => item.sprintId !== null).length; }
  get selectedNextSprintCount(): number {
    return this.nextPlanningSprint ? this.selectedItems.filter(item => item.sprintId !== this.nextPlanningSprint?.id).length : 0;
  }
  get selectedDestinationCount(): number {
    return this.moveDestinationSprintId === null ? 0 : this.selectedItems.filter(item => item.sprintId !== this.moveDestinationSprintId).length;
  }
  get nextPlanningSprint(): SprintOption | undefined {
    const upcoming = this.planningSprints.filter(sprint => !this.isSprintActive(sprint));
    const selectedIndex = upcoming.findIndex(sprint => sprint.id === this.selectedSprintId);
    return selectedIndex >= 0 ? upcoming[selectedIndex + 1] : upcoming[0];
  }

  onSearchChange(value: string): void {
    this.searchQuery = value;
    this.selectedItemIds.clear();
  }

  setTypeFilter(filter: TypeFilter): void {
    this.typeFilter = filter;
    this.selectedItemIds.clear();
  }

  toggleItemSelection(id: string, checked: boolean): void {
    checked ? this.selectedItemIds.add(id) : this.selectedItemIds.delete(id);
  }

  toggleVisibleSelection(checked: boolean): void {
    for (const item of this.filteredItems) {
      checked ? this.selectedItemIds.add(item.id) : this.selectedItemIds.delete(item.id);
    }
  }

  clearItemSelection(): void {
    this.selectedItemIds.clear();
    this.moveDestinationSprintId = null;
  }

  moveSelectedToBacklog(): void {
    this.updateItems(this.selectedItems.filter(item => item.sprintId !== null), null);
  }

  moveSelectedToNextSprint(): void {
    if (!this.nextPlanningSprint) return;
    this.moveSelectedToSprint(this.nextPlanningSprint.id);
  }

  moveSelectedToChosenSprint(): void {
    if (this.moveDestinationSprintId === null) return;
    this.moveSelectedToSprint(this.moveDestinationSprintId);
  }

  private moveSelectedToSprint(sprintId: number): void {
    this.updateItems(this.selectedItems.filter(item => item.sprintId !== sprintId), sprintId);
  }

  private moveItem(item: PlanningItem, sprintId: number | null): void {
    this.updateItems([item], sprintId);
  }

  private updateItems(items: PlanningItem[], sprintId: number | null): void {
    if (!items.length || this.saving) return;
    this.saving = true;
    this.saveError = '';
    this.notice = '';
    const requests = items.map(item => this.updateRequest(item, sprintId).pipe(catchError(error => of({ __planningError: error, item }))));
    forkJoin(requests).subscribe(results => {
      this.saving = false;
      const failed = results.filter(result => result?.__planningError);
      this.selectedItemIds.clear();
      if (failed.length) {
        this.saveError = `${failed.length} item${failed.length === 1 ? '' : 's'} could not be updated. The board has been refreshed with the latest saved values.`;
      } else {
        const destination = sprintId === null ? 'the backlog' : this.sprints.find(sprint => sprint.id === sprintId)?.name ?? 'the selected sprint';
        this.notice = `${items.length} item${items.length === 1 ? '' : 's'} moved to ${destination}.`;
      }
      this.moveDestinationSprintId = null;
      this.cdr.markForCheck();
      if (this.selectedProjectId !== null) this.loadProjectItems(this.selectedProjectId);
    });
  }

  private updateRequest(item: PlanningItem, sprintId: number | null): Observable<any> {
    const raw = item.raw ?? {};
    const status = raw?.status ?? 'BACKLOG';
    const priority = raw?.priority ?? 'MEDIUM';
    const assigneeId = this.numberOrNull(raw?.assignee_user_id ?? raw?.assigneeUserId ?? raw?.assignee_id ?? raw?.assigneeId);
    const reporterId = this.numberOrNull(raw?.reporter_user_id ?? raw?.reporterUserId ?? raw?.reporter_id ?? raw?.reporterId);
    const teamPatch = raw?.team_id !== undefined || raw?.teamId !== undefined
      ? { team_id: this.itemTeamId(raw) }
      : {};
    let url: string;
    let payload: Record<string, any>;

    if (item.kind === 'EPIC') {
      url = `${this.baseUrl}/epics/${item.sourceId}`;
      payload = {
        name: raw?.name ?? raw?.title ?? item.title,
        description: raw?.description ?? '',
        status,
        priority,
        project_id: this.numberOrNull(raw?.project_id ?? raw?.projectId) ?? this.selectedProjectId,
        ...teamPatch,
        sprint_id: sprintId,
        assignee_user_id: assigneeId,
        reporter_user_id: reporterId
      };
    } else if (item.kind === 'STORY') {
      url = `${this.baseUrl}/stories/${item.sourceId}`;
      payload = {
        title: raw?.title ?? raw?.name ?? item.title,
        description: raw?.description ?? '',
        status,
        priority,
        project_id: this.numberOrNull(raw?.project_id ?? raw?.projectId) ?? this.selectedProjectId,
        ...teamPatch,
        epic_id: this.numberOrNull(raw?.epic_id ?? raw?.epicId),
        story_points: this.numberOrNull(raw?.story_points ?? raw?.storyPoints) ?? 0,
        sprint_id: sprintId,
        assignee_user_id: assigneeId,
        reporter_user_id: reporterId
      };
    } else if (item.kind === 'TASK') {
      url = `${this.baseUrl}/tasks/${item.sourceId}`;
      payload = {
        title: raw?.title ?? raw?.name ?? item.title,
        description: raw?.description ?? '',
        status,
        priority,
        ...teamPatch,
        story_id: this.numberOrNull(raw?.story_id ?? raw?.storyId),
        story_points: this.numberOrNull(raw?.story_points ?? raw?.storyPoints) ?? 0,
        sprint_id: sprintId,
        assignee_user_id: assigneeId,
        reporter_user_id: reporterId
      };
    } else {
      url = `${this.baseUrl}/v1/issues/${item.sourceId}`;
      payload = {
        ...raw,
        status,
        priority,
        sprint_id: sprintId,
        sprintId,
        sprint: sprintId === null ? null : { id: sprintId },
        project_id: this.numberOrNull(raw?.project_id ?? raw?.projectId) ?? this.selectedProjectId,
        projectId: this.numberOrNull(raw?.project_id ?? raw?.projectId) ?? this.selectedProjectId,
        ...(item.teamId !== null ? { team_id: item.teamId, teamId: item.teamId } : {}),
        assignee_user_id: assigneeId,
        assigneeUserId: assigneeId,
        reporter_user_id: reporterId,
        reporterUserId: reporterId
      };
    }
    return this.http.put<any>(url, payload, this.headers());
  }

  private statusLabel(value: any): string {
    const status = this.displayText(value, 'Backlog').trim().replace(/[_-]+/g, ' ').toLowerCase();
    return status.replace(/\b\w/g, letter => letter.toUpperCase());
  }

  private backendStatus(value: string): string {
    const status = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const map: Record<string, string> = { BACKLOG: 'BACKLOG', TODO: 'TODO', TO_DO: 'TODO', IN_PROGRESS: 'IN_PROGRESS', TESTING: 'TESTING', COMPLETED: 'COMPLETED', BLOCKED: 'BLOCKED' };
    return map[status] ?? 'BACKLOG';
  }

  private priorityLabel(value: any): string {
    const priority = this.displayText(value, 'Medium').trim().replace(/[_-]+/g, ' ').toLowerCase();
    return priority.replace(/\b\w/g, letter => letter.toUpperCase());
  }

  typeLabel(kind: WorkKind): string {
    return kind[0] + kind.slice(1).toLowerCase();
  }

  sprintDateRange(sprint: SprintOption | undefined): string {
    if (!sprint?.startDate && !sprint?.endDate) return 'No dates set';
    const format = (date: string | undefined) => date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(date)) : 'TBD';
    return `${format(sprint.startDate)} – ${format(sprint.endDate)}`;
  }

  trackByItem(_index: number, item: PlanningItem): string { return item.id; }
  trackBySprintGroup(_index: number, group: PlanningSprintGroup): string { return group.key; }
  trackByAssigneeGroup(_index: number, group: PlanningAssigneeGroup): string { return group.key; }
}
