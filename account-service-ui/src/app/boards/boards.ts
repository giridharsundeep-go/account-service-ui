import {WorkspaceSettingsService} from '../shared/workspace-settings.service';
import { untracked } from '@angular/core';
import { WorkItemDialogService } from '../shared/work-item-dialog.service';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HttpClient } from '@angular/common/http';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environment';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { ProjectContextService } from '../project-context.service';
import { AuthService } from '../auth.service';
import { ApiCollectionService } from '../shared/api-collection.service';
import { PersonPickerComponent } from '../shared/person-picker';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { MatOptionModule } from '@angular/material/core';

interface Sprint {
  id: number;
  projectId?: number;
  project_id?: number;
  name: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

interface Project {
  id: number;
  name: string;
  [key: string]: any;
}

interface Team {
  id: number;
  name: string;
  description?: string;
  members?: User[];
  memberIds?: number[];
  [key: string]: any;
}

interface User {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  employeeCode?: string;
  team_id?: number;
  teamId?: number;
  [key: string]: any;
}

interface Board { id: number; projectId: number; ownerUserId?: number | null; name: string; description?: string; status?: string; [key: string]: any; }
interface BoardFilter { id?: number; boardId: number; filterType: string; filterValue: string; }

interface BoardCard {
  projectId?: number | null;
  key: string;
  type: 'EPIC' | 'STORY' | 'TASK' | 'ISSUE' | 'TEST_CASE';
  id: number;
  code: string;
  title: string;
  status: string;
  priority?: string;
  points?: number;
  assigneeId?: number | null;
  sprintId?: number | null;
  epicId?: number | null;
  storyId?: number | null;
  reporterId?: number | null;
  teamId?: number | null;
  raw?: any;
  description?: string;
  issues?: any[];
  testCases?: any[];
  parentEpicName?: string;
  parentEpicCode?: string;
  parentStoryTitle?: string;
  parentStoryCode?: string;
}

@Component({
  selector: 'app-boards',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WorkspaceHeroComponent,
    MatOptionModule,
    DragDropModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSidenavModule,
    MatToolbarModule,
    MatTabsModule,
    MatButtonToggleModule,
    MatMenuModule,
    MatDividerModule,
    MatBadgeModule,
    MatTooltipModule,
    MatExpansionModule,
    MatTableModule,
    MatProgressBarModule,
    MatListModule,
    PersonPickerComponent
  ],
  templateUrl: './boards.html',
  styleUrls: ['./boards.css', '../shared/field-controls.css', '../shared/board-surface.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Boards implements OnInit {
  private readonly collections = inject(ApiCollectionService);
  private workItemsRequestId = 0;
  private readonly itemDialog = inject(WorkItemDialogService);
  private lastItemRevision = this.itemDialog.revision();
  private readonly itemRefresh = effect(() => {
    const revision = this.itemDialog.revision();
    if (revision === this.lastItemRevision) return;
    this.lastItemRevision = revision;
    untracked(() => { if (!this.boardHome()) this.loadWorkItems(); });
  });
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly projectContext = inject(ProjectContextService);

  readonly baseUrl = environment.apiBaseUrlM;

  readonly workflow=inject(WorkspaceSettingsService);
  private readonly liveRefresh=effect(()=>{if(this.workflow.revision()>0)untracked(()=>{if(!this.boardHome())this.loadWorkItems();});});
  private readonly legacyColumns = [
    { id: 'BACKLOG', label: 'Backlog' },
    { id: 'TODO', label: 'To Do' },
    { id: 'IN_PROGRESS', label: 'In Progress' },
    { id: 'TESTING', label: 'Testing' },
    { id: 'COMPLETED', label: 'Completed' },
    { id: 'BLOCKED', label: 'Blocked' }
  ];

  get columns(){return this.workflow.statuses.filter(status=>status.active||this.cards().some(card=>this.workflow.code(card.status)===status.code)).map(status=>({id:status.code,label:status.name}));}
  projects = signal<Project[]>([]);
  private readonly projectContextSync = effect(() => {
    const sharedProjectId = this.projectContext.selectedProjectId();
    const projects = this.projects();
    if (!sharedProjectId || !projects.length || Number(this.selectedProjectId()) === sharedProjectId) return;
    if (projects.some(project => Number(project.id) === sharedProjectId)) this.onProjectChange(sharedProjectId);
  });
  sprints = signal<Sprint[]>([]);
  users = signal<User[]>([]);
  teams = signal<Team[]>([]);
  selectedTeamMemberId = signal<number | null>(null);
  cards = signal<BoardCard[]>([]);
  boards = signal<Board[]>([]);
  boardFilters = signal<Record<number, BoardFilter[]>>({});
  pinnedBoardIds = signal<number[]>(this.readPinnedBoardIds());
  activeBoardFilters = signal<BoardFilter[]>([]);

  selectedBoardId = signal<number | null>(null);
  activeView = signal<'BOARD' | 'ALL_ITEMS'>('BOARD');
  boardHome = signal(true);
  showCreateBoard = signal(false);
  showEditBoard = signal(false);
  showScrum = signal(false);
  boardSidebarOpen = signal(true);
  filterPanelOpen = signal(false);
  showScrumBoard = signal(false);
  boardSprintProgressOpen = signal(false);
  boardSprintProgress = signal<{
    sprint: Sprint; completionRate: number; completedItems: number; totalItems: number;
    completedPoints: number; totalPoints: number; byStatus: Record<string, number>
  } | null>(null);
  fullScreenBoardMode = signal<'BOARD' | 'SCRUM'>('BOARD');
  assigneeQuery = signal('');
  reporterQuery = signal('');
  createAssigneeQuery = signal('');
  createReporterQuery = signal('');
  assigneeAutocompleteOpen = signal(false);
  reporterAutocompleteOpen = signal(false);
  createAssigneeAutocompleteOpen = signal(false);
  createReporterAutocompleteOpen = signal(false);
  scrumSelectedUserId = signal<number | null>(null);
  boardItemModalOpen = signal(false);
  associatedTestsOpen = signal(false);
  workItemAssigneeQuery = signal('');
  workItemReporterQuery = signal('');
  workItemAssigneeAutocompleteOpen = signal(false);
  workItemReporterAutocompleteOpen = signal(false);
  filteredWorkItemAssignees = computed(() => this.workItemAssigneeQuery().trim() ? this.filterUsersForAutocomplete(this.workItemAssigneeQuery(), 'ALL') : []);
  filteredWorkItemReporters = computed(() => this.workItemReporterQuery().trim() ? this.filterUsersForAutocomplete(this.workItemReporterQuery(), 'ALL') : []);
  selectedBoardItem = signal<BoardCard | null>(null);
  workItemModalMode = signal<'VIEW' | 'EDIT' | 'CREATE'>('VIEW');
  workItemDraft = signal<any>({});
  workItemSaving = signal(false);
  private workItemAutoSavePending = false;
  savingBoard = signal(false);
  successMessage = signal('');
  scrumStartedAt = signal<Date | null>(null);
  boardName = signal('');
  boardDescription = signal('');
  boardStatus = signal('ACTIVE');
  createTeamFilter = signal<number | 'ALL'>('ALL');
  createSprintFilter = signal<number | 'ALL'>('ALL');
  createProjectFilter = signal<number | 'ALL'>('ALL');
  createAssigneeFilter = signal<number | 'ALL'>('ALL');
  createReporterFilter = signal<number | 'ALL'>('ALL');
  createPriorityFilter = signal<string>('ALL');
  createStatusFilter = signal<string>('ALL');
  createTypeFilter = signal<'ALL' | 'EPIC' | 'STORY' | 'TASK' | 'ISSUE' | 'TEST_CASE'>('ALL');

  selectedProjectId = signal<number | null>(null);
  selectedSprintId = signal<number | 'ALL'>('ALL');
  selectedTeamFilter = signal<number | 'ALL'>('ALL');
  selectedAssigneeFilter = signal<number | 'ALL'>('ALL');
  selectedReporterFilter = signal<number | 'ALL'>('ALL');
  selectedPriorityFilter = signal<string>('ALL');
  selectedStatusFilter = signal<string>('ALL');
  searchTerm = signal('');
  /** Board registry project tab. ALL is always the default on page load. */
  selectedBoardProjectTab = signal<number | 'ALL'>('ALL');
  selectedType = signal<'ALL' | 'EPIC' | 'STORY' | 'TASK' | 'ISSUE' | 'TEST_CASE'>('ALL');

  filteredAssigneeUsers = computed(() => this.filterUsersForAutocomplete(this.assigneeQuery(), this.selectedAssigneeFilter()));
  filteredReporterUsers = computed(() => this.filterUsersForAutocomplete(this.reporterQuery(), this.selectedReporterFilter()));
  filteredCreateAssigneeUsers = computed(() => this.filterUsersForAutocomplete(this.createAssigneeQuery(), this.createAssigneeFilter()));
  filteredCreateReporterUsers = computed(() => this.filterUsersForAutocomplete(this.createReporterQuery(), this.createReporterFilter()));
  boardPeopleOptions = computed(() => this.users().map(user => ({
    id: user.id, name: this.userName(user.id), initials: this.initials(user.id),
    email: user.email, designation: this.workItemUserDesignation(user),
  })));

  selectBoardPersonFilter(field: 'assignee' | 'reporter', id: number | null): void {
    if (field === 'assignee') this.selectedAssigneeFilter.set(id ?? 'ALL');
    else this.selectedReporterFilter.set(id ?? 'ALL');
    this.selectedTeamMemberId.set(null);
  }

  readonly priorities = [
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
  ];

  loading = signal(false);
  errorMessage = signal('');
  lastUpdated = signal<Date | null>(null);

  teamMembers = computed(() => {
    const teamId = this.activeTeamId();
    if (!teamId) return [];

    const team = this.teams().find(t => Number(t.id) === Number(teamId));
    const memberIds = new Set<number>();

    for (const id of team?.memberIds || []) {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) memberIds.add(n);
    }

    for (const member of team?.members || []) {
      const n = Number(member.id);
      if (Number.isFinite(n) && n > 0) memberIds.add(n);
    }

    return this.users().filter(user => memberIds.has(Number(user.id)));
  });

  activeTeamId = computed(() => {
    if (this.activeView() !== 'BOARD') return null;
    const filter = this.activeBoardFilters().find(
      f => String(f.filterType).toUpperCase() === 'TEAM'
    );
    if (!filter || String(filter.filterValue).toUpperCase() === 'ALL') return null;
    const id = Number(filter.filterValue);
    return Number.isFinite(id) && id > 0 ? id : null;
  });

  selectedTeam = computed(() => {
    const id = this.activeTeamId();
    return id ? this.teams().find(t => Number(t.id) === Number(id)) || null : null;
  });

  projectSprints = computed(() => {
    const projectId = this.selectedProjectId();

    return [...this.sprints()]
      .filter(s => {
        const pid = s.projectId ?? s.project_id;
        return !projectId || !pid || Number(pid) === Number(projectId);
      })
      .sort((a, b) => {
        if (a.startDate && b.startDate) {
          return new Date(a.startDate).getTime() -
            new Date(b.startDate).getTime();
        }
        return Number(a.id) - Number(b.id);
      });
  });

  selectedBoard = computed(() => this.boards().find(b => Number(b.id) === Number(this.selectedBoardId())) || null);

  // Board registry is global by default. The project tabs are the only
  // page-level board filter, with ALL selected on initial load.
  projectBoards = computed(() => {
    const tab = this.selectedBoardProjectTab();
    return this.boards()
      .filter(b => String(b.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED')
      .filter(b => tab === 'ALL' || Number(b.projectId) === Number(tab))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  });

  boardProjectTabs = computed(() => {
    const activeProjects = new Map<number, Project>();
    for (const board of this.boards()) {
      if (String(board.status || 'ACTIVE').toUpperCase() === 'ARCHIVED') continue;
      const project = this.projects().find(p => Number(p.id) === Number(board.projectId));
      if (project) activeProjects.set(Number(project.id), project);
    }
    return Array.from(activeProjects.values())
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  });

  setBoardProjectFilter(projectId: number | 'ALL'): void {
    this.selectedBoardProjectTab.set(projectId);
  }

  favoriteBoards = computed(() =>
    this.projectBoards().filter(board => this.isBoardPinned(board.id))
  );

  boardFilterSummary(board: Board): Array<{ icon: string; label: string; text: string }> {
    const filters = this.boardFilters()[Number(board.id)] || [];
    const project = this.projects().find(p => Number(p.id) === Number(board.projectId));
    const projectItem = project ? [{ icon: 'folder', label: `Project: ${project.name}`, text: `Project: ${project.name}` }] : [];
    const saved = filters
      .filter(f => !['ASSIGNEE', 'REPORTER'].includes(String(f.filterType || '').toUpperCase()) && String(f.filterValue ?? '').toUpperCase() !== 'ALL');
    return [...projectItem, ...saved]
      .map(f => {
        if (!('filterType' in f)) return f;
        const type = String(f.filterType || '').toUpperCase();
        const value = this.filterValueLabel(f);
        const config: Record<string, { icon: string; label: string }> = {
          SPRINT: { icon: 'event', label: 'Sprint' },
          TEAM: { icon: 'groups', label: 'Team' },
          ASSIGNEE: { icon: 'person', label: 'Assignee' },
          REPORTER: { icon: 'record_voice_over', label: 'Reporter' },
          PRIORITY: { icon: 'flag', label: 'Priority' },
          STATUS: { icon: 'check_circle', label: 'Status' },
          TYPE: { icon: 'category', label: 'Type' },
          WORK_TYPE: { icon: 'category', label: 'Work type' }
        };
        const item = config[type] || { icon: 'filter_alt', label: type.replace(/_/g, ' ') || 'Filter' };
        return { icon: item.icon, label: `${item.label}: ${value}`, text: `${item.label}: ${value}` };
      });
  }

  storyOptions = computed(() =>
    this.cards()
      .filter(card => card.type === 'STORY')
      .sort((a, b) => String(a.title).localeCompare(String(b.title)))
  );

  epicOptions = computed(() =>
    this.cards()
      .filter(card => card.type === 'EPIC')
      .sort((a, b) => String(a.title).localeCompare(String(b.title)))
  );

  taskOptions = computed(() =>
    this.cards()
      .filter(card => card.type === 'TASK')
      .sort((a, b) => String(a.title).localeCompare(String(b.title)))
  );

  selectedTeamMember = computed(() => {
    const id = this.selectedTeamMemberId();
    return id == null ? null : this.teamMembers().find(u => Number(u.id) === Number(id)) || null;
  });

  selectedProjectName = computed(() => {
    const project = this.projects().find(
      p => Number(p.id) === Number(this.selectedProjectId())
    );

    return project?.name || 'Workspace';
  });

  currentSprint = computed(() => {
    const sprints = this.projectSprints();

    const active = sprints.find(s =>
      (s.status || '').toUpperCase() === 'ACTIVE'
    );

    const byDate = sprints.find(s => {
      if (!s.startDate || !s.endDate) return false;

      const now = Date.now();
      return now >= new Date(s.startDate).getTime() &&
        now <= new Date(s.endDate).getTime();
    });

    return byDate || active || sprints[0] || null;
  });

  filteredCards = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const type = this.selectedType();
    const sprint = this.selectedSprintId();
    const team = this.selectedTeamFilter();
    const assignee = this.selectedAssigneeFilter();
    const reporter = this.selectedReporterFilter();
    const priority = this.selectedPriorityFilter();
    const status = this.selectedStatusFilter();
    const savedFilters = this.activeView() === 'BOARD' ? this.activeBoardFilters() : [];
    const selectedMemberId = this.selectedTeamMemberId();

    return this.cards().filter(card => {
      if (type !== 'ALL' && card.type !== type) return false;

      if (this.activeView() === 'BOARD' && sprint !== 'ALL' && Number(card.sprintId) !== Number(sprint)) return false;
      if (team !== 'ALL' && !this.cardBelongsToTeam(card, Number(team))) return false;
      if (assignee !== 'ALL' && Number(card.assigneeId) !== Number(assignee)) return false;
      if (reporter !== 'ALL' && Number(card.reporterId) !== Number(reporter)) return false;
      if (priority !== 'ALL' && String(card.priority || '').toUpperCase() !== String(priority).toUpperCase()) return false;
      if (status !== 'ALL' && this.normalizeStatus(card.status) !== this.normalizeStatus(status)) return false;

      if (this.activeView() === 'BOARD' && !this.matchesSavedFilters(card, savedFilters)) return false;
      if (this.activeView() === 'BOARD' && selectedMemberId !== null && Number(card.assigneeId) !== Number(selectedMemberId)) return false;

      if (!search) return true;

      return [
        card.code,
        card.title,
        card.type,
        card.status,
        card.priority || ''
      ].some(value =>
        String(value).toLowerCase().includes(search)
      );
    });
  });

  visibleCount = computed(() => this.filteredCards().length);

  columnCards = computed(() => {
  const grouped: Record<string, BoardCard[]> = {};

  for (const column of this.columns) {
    grouped[column.id] = [];
  }

  for (const card of this.filteredCards()) {
    const status = this.normalizeStatus(card.status);

    if (!grouped[status]) {
      grouped['BACKLOG'].push(card);
    } else {
      grouped[status].push(card);
    }
  }

  return grouped;
});

  ngOnInit(): void {
    this.loadBoard();
  }

  private headers() {
    return {
      headers: this.auth.getAuthHeaders()
    };
  }

  private extractArray(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== 'object') return [];

    // Support both plain arrays and common API envelopes, including nested
    // envelopes such as { data: { items: [...] } } / { data: { epics: [...] } }.
    const collectionKeys = [
      'items', 'results', 'content', 'projects', 'sprints', 'epics', 'stories',
      'tasks', 'issues', 'testCases', 'testcases', 'users', 'teams', 'records'
    ];
    for (const key of collectionKeys) {
      if (Array.isArray(response[key])) return response[key];
    }
    if (response.data !== undefined && response.data !== response) {
      const nested = this.extractArray(response.data);
      if (nested.length || Array.isArray(response.data)) return nested;
    }
    if (response._embedded && typeof response._embedded === 'object') {
      for (const value of Object.values(response._embedded)) {
        if (Array.isArray(value)) return value;
      }
    }
    return [];
  }

  normalizeStatus(status:any):string{const code=this.workflow.code(status);if(this.workflow.statuses.some(s=>s.code===code))return code;return ({DRAFT:'BACKLOG',READY:'TODO',PASSED:'COMPLETED',FAILED:'BLOCKED',SKIPPED:'BACKLOG'} as Record<string,string>)[code]||code;}

  private normalizeSprint(value: any): Sprint {
    return {
      ...value,
      id: Number(value.id),
      projectId: value.projectId ?? value.project_id ?? value.project?.id,
      project_id: value.project_id ?? value.projectId,
      name: value.name || value.title || `Sprint ${value.id}`,
      startDate: value.startDate ?? value.start_date,
      endDate: value.endDate ?? value.end_date,
      status: value.status
    };
  }

  private normalizeTeam(value: any): Team {
    const rawMembers = value?.members ?? value?.teamMembers ?? value?.team_members ?? value?.users ?? [];
    const members = Array.isArray(rawMembers)
      ? rawMembers.map((m: any) => this.normalizeUser(m.user ?? m.userAccount ?? m.member ?? m)) : [];
    const rawIds = value?.memberIds ?? value?.member_ids;
    const memberIds = Array.isArray(rawIds)
      ? rawIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
      : members.map((m: User) => Number(m.id));

    return {
      ...value,
      id: Number(value.id),
      name: value.name || value.title || `Team ${value.id}`,
      members,
      memberIds
    };
  }

  private normalizeUser(value: any): User {
    return {
      ...value,
      id: Number(value.user_account_id ?? value.userAccountId ?? value.user_id ?? value.id),
      name:
        value.name ||
        value.full_name ||
        [value.first_name ?? value.firstName, value.last_name ?? value.lastName].filter(Boolean).join(' ') ||
        value.email ||
        `User ${value.id}`,
      employeeCode: String(
        value.employeeCode ??
        value.employee_code ??
        value.empCode ??
        value.emp_code ??
        value.employeeId ??
        value.employee_id ??
        value.empId ??
        value.emp_id ??
        ''
      ).trim() || undefined,
      team_id: value.team_id ?? value.teamId ?? value.team?.id ?? value.team?.teamId
    };
  }

  private normalizeProject(value: any): Project {
    return {
      ...value,
      id: Number(value.id),
      name: value.name || value.title || `Project ${value.id}`
    };
  }

  private loadBoard(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    // The projects API is intentionally the first request. All subsequent
    // project-scoped work-item requests are created only after project IDs
    // have been received and normalized.
    this.http.get<any>(`${this.baseUrl}/projects`, this.headers())
      .pipe(catchError(error => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load projects.');
        return of(null);
      }))
      .subscribe(projectResponse => {
        if (projectResponse == null) return;

        const projects = this.extractArray(projectResponse)
          .map(v => this.normalizeProject(v))
          .filter(project => Number.isFinite(project.id) && project.id > 0);
        this.projects.set(projects);
        if (projects.length) {
          const sharedId = this.projectContext.selectedProjectId();
          const selected = projects.find(project => Number(project.id) === sharedId)
            ?? projects.find(project => Number(project.id) === Number(this.selectedProjectId()))
            ?? projects.find(project => Number(project.id) === 1)
            ?? projects[0];
          this.selectedProjectId.set(selected.id);
          this.projectContext.setSelectedProject(selected.id);
        }

        // Project IDs are now known. Load supporting board configuration next.
        forkJoin({
          sprints: this.http.get<any>(`${this.baseUrl}/sprints`, this.headers()).pipe(catchError(() => of([]))),
          users: this.collections.read(`${this.baseUrl}/users`).pipe(catchError(() => of([]))),
          teams: this.http.get<any>(`${this.baseUrl}/teams`, this.headers()).pipe(catchError(() => of([]))),
          boards: this.http.get<any>(`${this.baseUrl}/boards`, this.headers()).pipe(catchError(() => of([])))
        }).subscribe({
          next: result => {
            const sprints = this.extractArray(result.sprints).map(v => this.normalizeSprint(v));
            const users = this.extractArray(result.users).map(v => this.normalizeUser(v));
            const teams = this.extractArray(result.teams).map(v => this.normalizeTeam(v));
            const boards = this.extractArray(result.boards).map(v => ({
              ...v,
              id: Number(v.id),
              projectId: Number(v.projectId ?? v.project_id ?? v.project?.id),
              name: v.name || `Board ${v.id}`,
              status: v.status || 'ACTIVE'
            }));

            this.users.set(users);
            this.teams.set(teams);
            this.sprints.set(sprints);
            this.boards.set(boards);
            this.selectedBoardProjectTab.set('ALL');
            this.loadAllBoardFilters(boards);

            this.selectedSprintId.set('ALL');
            this.selectDefaultBoard();
            this.loadBoardFiltersAndItems();
          },
          error: () => {
            this.loading.set(false);
            this.errorMessage.set('Unable to load board configuration.');
          }
        });
      });
  }

  private selectCurrentSprintIfAvailable(): void {
    // Intentionally left as a no-op for Boards.
    // The Board's saved SPRINT filter is the source of truth; otherwise use ALL.
    this.selectedSprintId.set('ALL');
  }

  private selectDefaultBoard(): void {
    // Boards opens on the project landing page. A board is selected only
    // after the user explicitly clicks a board card/list entry.
    const boards = this.projectBoards();
    if (this.selectedBoardId() && !boards.some(b => Number(b.id) === Number(this.selectedBoardId()))) {
      this.selectedBoardId.set(null);
    }
  }


  openBoardFromHome(board: Board): void {
    // Board cards are the direct entry point into the full-screen Kanban.
    this.fullScreenBoardMode.set('BOARD');
    this.boardHome.set(false);
    this.activeView.set('BOARD');
    this.onBoardChange(board.id);
    this.showScrumBoard.set(true);
  }

  backToBoards(): void {
    this.showScrumBoard.set(false);
    this.fullScreenBoardMode.set('BOARD');
    this.boardHome.set(true);
    this.activeView.set('BOARD');
    this.searchTerm.set('');
    this.selectedBoardId.set(null);
    this.selectedTeamMemberId.set(null);
    this.cards.set([]);
    this.activeBoardFilters.set([]);
    this.filterPanelOpen.set(false);
  }

  onBoardChange(value: string | number | null): void {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) {
      this.backToBoards();
      return;
    }
    this.boardHome.set(false);
    this.activeView.set('BOARD');
    this.selectedBoardId.set(id);
    ++this.workItemsRequestId;
    this.cards.set([]);
    this.selectedTeamMemberId.set(null);
    this.selectedTeamFilter.set('ALL');
    this.selectedAssigneeFilter.set('ALL');
    this.selectedReporterFilter.set('ALL');
    this.selectedPriorityFilter.set('ALL');
    this.selectedStatusFilter.set('ALL');
    this.selectedType.set('ALL');
    this.loadBoardFiltersAndItems();
  }

  setView(view: 'BOARD' | 'ALL_ITEMS'): void {
    if (!this.selectedBoardId()) {
      this.boardHome.set(true);
      this.activeView.set('BOARD');
      return;
    }
    this.boardHome.set(false);
    this.activeView.set(view);
    this.searchTerm.set('');
    this.selectedTeamMemberId.set(null);
    if (view === 'BOARD') this.loadBoardFiltersAndItems();
    else this.loadWorkItems();
  }

  private resetViewFilters(): void {
    this.selectedSprintId.set('ALL');
    this.selectedTeamFilter.set('ALL');
    this.selectedAssigneeFilter.set('ALL');
    this.selectedReporterFilter.set('ALL');
    this.selectedPriorityFilter.set('ALL');
    this.selectedStatusFilter.set('ALL');
    this.selectedType.set('ALL');
    this.selectedTeamMemberId.set(null);
    this.assigneeQuery.set('');
    this.reporterQuery.set('');
    this.assigneeAutocompleteOpen.set(false);
    this.reporterAutocompleteOpen.set(false);
    this.searchTerm.set('');
  }

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.selectedSprintId() !== 'ALL') count++;
    if (this.selectedTeamFilter() !== 'ALL') count++;
    if (this.selectedAssigneeFilter() !== 'ALL') count++;
    if (this.selectedReporterFilter() !== 'ALL') count++;
    if (this.selectedType() !== 'ALL') count++;
    if (this.selectedPriorityFilter() !== 'ALL') count++;
    if (this.selectedStatusFilter() !== 'ALL') count++;
    if (this.searchTerm().trim()) count++;
    return count;
  });

  clearViewFilters(): void {
    this.resetViewFilters();
    if (this.activeView() === 'BOARD') {
      const sprintFilter = this.activeBoardFilters().find(f => String(f.filterType).toUpperCase() === 'SPRINT');
      this.selectedSprintId.set(sprintFilter ? Number(sprintFilter.filterValue) : 'ALL');
    }
  }

  private loadAllBoardFilters(boards: Board[]): void {
    if (!boards.length) {
      this.boardFilters.set({});
      return;
    }

    const requests: Record<string, any> = {};
    for (const board of boards) {
      requests[String(board.id)] = this.http
        .get<any>(`${this.baseUrl}/board-filters/board/${board.id}`, this.headers())
        .pipe(catchError(() => of([])));
    }

    forkJoin(requests).subscribe(result => {
      const map: Record<number, BoardFilter[]> = {};
      for (const board of boards) {
        map[Number(board.id)] = this.normalizeBoardFilters(result[String(board.id)]);
      }
      this.boardFilters.set(map);
    });
  }

  private loadBoardFiltersAndItems(): void {
    const boardId = this.selectedBoardId();
    if (this.activeView() === 'BOARD' && boardId) {
      this.loading.set(true);
      this.http.get<any>(`${this.baseUrl}/board-filters/board/${boardId}`, this.headers()).pipe(catchError(() => of([]))).subscribe({
        next: response => {
          if (boardId !== this.selectedBoardId()) return;
          const filters = this.normalizeBoardFilters(response);
          this.activeBoardFilters.set(filters);

          // Do not apply the current sprint unless the saved board explicitly
          // contains a SPRINT filter.
          const sprintFilters = filters.filter(f => f.filterType === 'SPRINT' && f.filterValue !== 'ALL');
          this.selectedSprintId.set(
            sprintFilters.length === 1
              ? Number(sprintFilters[0].filterValue)
              : 'ALL'
          );

          this.loadWorkItems();
        },
        error: () => { this.activeBoardFilters.set([]); this.loadWorkItems(); }
      });
    } else {
      this.activeBoardFilters.set([]);
      this.selectedTeamMemberId.set(null);
      this.loadWorkItems();
    }
  }

  private matchesSavedFilters(card: BoardCard, filters: BoardFilter[]): boolean {
    const matches = (type: string, actual: any) => {
      const values = filters.filter(f => String(f.filterType).toUpperCase() === type);
      const normalize = (value: any) => type === 'STATUS' ? this.normalizeStatus(value) : String(value ?? '').trim().toUpperCase();
      return !values.length || values.some(f => f.filterValue === 'ALL' || normalize(f.filterValue) === normalize(actual));
    };

    const teamFilters = filters.filter(f => String(f.filterType).toUpperCase() === 'TEAM');
    const teamMatches = !teamFilters.length || teamFilters.some(f => f.filterValue === 'ALL' || this.cardBelongsToTeam(card, Number(f.filterValue)));
    const boardProjectId = Number(this.selectedBoard()?.projectId);
    if (boardProjectId > 0 && Number(card.projectId) !== boardProjectId) return false;

    return matches('PROJECT', card.projectId) && matches('SPACE', card.projectId) && matches('TYPE', card.type) && matches('WORK_TYPE', card.type) &&
      matches('SPRINT', card.sprintId) && matches('ASSIGNEE', card.assigneeId) &&
      matches('REPORTER', card.reporterId) && teamMatches &&
      matches('PRIORITY', card.priority) && matches('STATUS', this.normalizeStatus(card.status));
  }

  private normalizeBoardFilters(response: any): BoardFilter[] {
    return this.collections.rows(response).map(filter => ({
      ...filter,
      boardId: Number(filter.boardId ?? filter.board_id),
      filterType: String(filter.filterType ?? filter.filter_type ?? '').trim().toUpperCase(),
      filterValue: String(filter.filterValue ?? filter.filter_value ?? '').trim(),
    }));
  }

  private cardBelongsToTeam(card: BoardCard, teamId: number): boolean {
    if (!Number.isFinite(teamId)) return false;
    if (Number(card.teamId) === teamId) return true;

    const team = this.teams().find(t => Number(t.id) === teamId);
    if (!team) return false;

    const memberIds = new Set<number>();
    for (const id of team.memberIds || []) {
      const n = Number(id);
      if (Number.isFinite(n)) memberIds.add(n);
    }
    for (const member of team.members || []) {
      const n = Number(member.id);
      if (Number.isFinite(n)) memberIds.add(n);
    }

    const assigneeId = Number(card.assigneeId);
    return Number.isFinite(assigneeId) && memberIds.has(assigneeId);
  }

  filterValueLabel(filter: BoardFilter): string {
    const type = String(filter.filterType || '').toUpperCase();
    const value = String(filter.filterValue || '');
    if (type === 'TEAM') return this.teams().find(t => Number(t.id) === Number(value))?.name || value;
    if (type === 'ASSIGNEE' || type === 'REPORTER') return this.userName(Number(value));
    if (type === 'SPRINT') return this.sprints().find(s => Number(s.id) === Number(value))?.name || value;
    if (type === 'STATUS') return this.columns.find(c => c.id === this.normalizeStatus(value))?.label || value;
    if (type === 'TYPE' || type === 'WORK_TYPE') return value;
    return value.replace(/_/g, ' ');
  }

  selectTeamMember(userId: number): void {
    this.selectedTeamMemberId.set(
      this.selectedTeamMemberId() === Number(userId) ? null : Number(userId)
    );
  }

  clearTeamMemberFilter(): void {
    this.selectedTeamMemberId.set(null);
  }

  onCreateProjectFilterChange(value: number | string): void {
    const projectId = Number(value);
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    this.createProjectFilter.set(projectId);
    this.selectedProjectId.set(projectId);
    this.projectContext.setSelectedProject(projectId);
    this.createSprintFilter.set('ALL');
  }

  openCreateBoard(): void {
    this.boardName.set(''); this.boardDescription.set(''); this.boardStatus.set('ACTIVE');
    this.resetBoardForm();
    // Project is selected inside Board Filters. Do not require a page-level project selection.
    this.createProjectFilter.set(Number(this.selectedProjectId()) || 'ALL');
    this.showCreateBoard.set(true);
  }

  openEditBoardFor(board: Board): void {
    this.selectedBoardId.set(Number(board.id));
    this.openEditBoard();
  }

  openEditBoard(): void {
    const board = this.selectedBoard(); if (!board) return;
    this.createProjectFilter.set(Number(board.projectId));
    this.selectedProjectId.set(Number(board.projectId));
    this.boardName.set(board.name); this.boardDescription.set(board.description || ''); this.boardStatus.set(board.status || 'ACTIVE');
    this.resetBoardForm();
    for (const f of this.activeBoardFilters()) {
      const v: any = Number.isNaN(Number(f.filterValue)) ? f.filterValue : Number(f.filterValue);
      switch (String(f.filterType).toUpperCase()) {
        case 'TEAM': this.createTeamFilter.set(v); break; case 'SPRINT': this.createSprintFilter.set(v); break;
        case 'PRIORITY': this.createPriorityFilter.set(v); break; case 'STATUS': this.createStatusFilter.set(v); break;
        case 'TYPE': case 'WORK_TYPE': this.createTypeFilter.set(v); break;
      }
    }
    this.showEditBoard.set(true);
  }

  closeBoardDialog(): void { this.showCreateBoard.set(false); this.showEditBoard.set(false); }

  private resetBoardForm(): void {
    this.createProjectFilter.set(Number(this.selectedProjectId()) || 'ALL');
    this.createTeamFilter.set('ALL'); this.createSprintFilter.set('ALL');
    this.createPriorityFilter.set('ALL'); this.createStatusFilter.set('ALL'); this.createTypeFilter.set('ALL');
  }

  private boardFilterPayload(boardId: number): BoardFilter[] {
    const out: BoardFilter[] = [];
    const add = (type: string, value: any) => { if (value !== 'ALL' && value !== null && value !== undefined && value !== '') out.push({ boardId, filterType: type, filterValue: String(value) }); };
    add('TEAM', this.createTeamFilter()); add('SPRINT', this.createSprintFilter());
    add('PRIORITY', this.createPriorityFilter()); add('STATUS', this.createStatusFilter()); add('TYPE', this.createTypeFilter());
    return out;
  }

  saveBoard(): void {
    const projectId = Number(this.createProjectFilter()); const name = this.boardName().trim();
    if (!projectId || !name) { this.errorMessage.set('Project and board name are required.'); return; }
    this.savingBoard.set(true);
    const existing = this.selectedBoard();
    const payload = { projectId, name, description: this.boardDescription().trim(), status: this.boardStatus(), ownerUserId: existing?.ownerUserId ?? null };
    const request$ = existing && this.showEditBoard() ? this.http.put<Board>(`${this.baseUrl}/boards/${existing.id}`, payload, this.headers()) : this.http.post<Board>(`${this.baseUrl}/boards`, payload, this.headers());
    request$.subscribe({
      next: board => {
        const b: Board = { ...board, id: Number(board.id), projectId: Number(board.projectId ?? board['project_id']) };
        const list = this.boards(); this.boards.set(existing && this.showEditBoard() ? list.map(x => x.id === b.id ? b : x) : [...list, b]);
        this.selectedBoardId.set(b.id);
        this.replaceBoardFilters(b.id);
      },
      error: e => { this.savingBoard.set(false); this.errorMessage.set(e?.error?.message || e?.error?.error || 'Could not save board.'); }
    });
  }

  private replaceBoardFilters(boardId: number): void {
    this.http.delete(`${this.baseUrl}/board-filters/board/${boardId}`, this.headers()).pipe(catchError(() => of(null))).subscribe(() => {
      const filters = this.boardFilterPayload(boardId);
      if (!filters.length) { this.finishBoardSave(filters); return; }
      forkJoin(filters.map(f => this.http.post(`${this.baseUrl}/board-filters`, f, this.headers()))).subscribe({
        next: () => this.finishBoardSave(filters),
        error: e => { this.savingBoard.set(false); this.errorMessage.set(e?.error?.message || 'Board saved but filters could not be saved.'); }
      });
    });
  }

  private finishBoardSave(filters: BoardFilter[]): void {
    this.activeBoardFilters.set(filters); this.savingBoard.set(false); this.closeBoardDialog(); this.successMessage.set('Board saved successfully.');
    this.loadBoardFiltersAndItems(); setTimeout(() => this.successMessage.set(''), 2500);
  }

  isBoardPinned(boardId: number): boolean {
    return this.pinnedBoardIds().includes(Number(boardId));
  }

  togglePinBoard(board: Board, event?: Event): void {
    event?.stopPropagation();
    const id = Number(board.id);
    const current = this.pinnedBoardIds();
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    this.pinnedBoardIds.set(next);
    try { localStorage.setItem('professy.pinnedBoards', JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  }

  private readPinnedBoardIds(): number[] {
    try {
      const value = JSON.parse(localStorage.getItem('professy.pinnedBoards') || '[]');
      return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  }

  onKanbanDrop(event: CdkDragDrop<BoardCard[]>, targetStatus: string): void {
    const card = event.item.data as BoardCard | undefined;
    if (!card) return;

    const nextStatus = this.normalizeStatus(targetStatus);
    if (this.normalizeStatus(card.status) === nextStatus) return;

    this.moveCard(card, nextStatus);
  }

  deleteSelectedBoard(): void {
    const board = this.selectedBoard(); if (!board || !confirm(`Delete board "${board.name}"?`)) return;
    this.http.delete(`${this.baseUrl}/boards/${board.id}`, this.headers()).subscribe({
      next: () => { const remaining = this.boards().filter(b => b.id !== board.id); this.boards.set(remaining); this.backToBoards(); },
      error: e => this.errorMessage.set(e?.error?.message || 'Could not delete board.')
    });
  }

  userEmployeeCode(userId: number | null | undefined): string {
    if (!userId) return '';
    const user = this.users().find(u => Number(u.id) === Number(userId));
    return user?.employeeCode || '';
  }

  userEmail(userId: number | null | undefined): string {
    if (!userId) return '';
    const user = this.users().find(u => Number(u.id) === Number(userId));
    return user?.email || '';
  }

  userAutocompleteLabel(user: User | null | undefined): string {
    if (!user) return '';
    return [user.name || `User ${user.id}`, user.employeeCode || user.email || ''].filter(Boolean).join(' · ');
  }

  selectedUserAutocompleteLabel(userId: number | 'ALL'): string {
    if (userId === 'ALL') return '';
    return this.userAutocompleteLabel(this.users().find(u => Number(u.id) === Number(userId)));
  }

  userAutocompleteDetail(user: User): string {
    return [user.employeeCode, user.email].filter(Boolean).join(' · ');
  }

  private filterUsersForAutocomplete(query: string, selectedId: number | 'ALL'): User[] {
    const normalized = String(query || '').trim().toLowerCase();
    const users = this.users();
    if (!normalized) return users.slice(0, 30);

    return users
      .filter(user => {
        const haystack = [
          user.name,
          user.employeeCode,
          user.email
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 30);
  }

  onAssigneeAutocompleteInput(value: string): void {
    this.assigneeQuery.set(value);
    this.assigneeAutocompleteOpen.set(true);
    if (this.selectedAssigneeFilter() !== 'ALL' && value !== this.selectedUserAutocompleteLabel(this.selectedAssigneeFilter())) {
      this.selectedAssigneeFilter.set('ALL');
    }
  }

  onReporterAutocompleteInput(value: string): void {
    this.reporterQuery.set(value);
    this.reporterAutocompleteOpen.set(true);
    if (this.selectedReporterFilter() !== 'ALL' && value !== this.selectedUserAutocompleteLabel(this.selectedReporterFilter())) {
      this.selectedReporterFilter.set('ALL');
    }
  }

  selectAssigneeFilterUser(user: User): void {
    this.selectedAssigneeFilter.set(user.id);
    this.assigneeQuery.set(this.userAutocompleteLabel(user));
    this.assigneeAutocompleteOpen.set(false);
  }

  selectReporterFilterUser(user: User): void {
    this.selectedReporterFilter.set(user.id);
    this.reporterQuery.set(this.userAutocompleteLabel(user));
    this.reporterAutocompleteOpen.set(false);
  }

  clearAssigneeFilter(): void {
    this.selectedAssigneeFilter.set('ALL');
    this.assigneeQuery.set('');
  }

  clearReporterFilter(): void {
    this.selectedReporterFilter.set('ALL');
    this.reporterQuery.set('');
  }

  onCreateAssigneeAutocompleteInput(value: string): void {
    this.createAssigneeQuery.set(value);
    this.createAssigneeAutocompleteOpen.set(true);
    if (this.createAssigneeFilter() !== 'ALL') this.createAssigneeFilter.set('ALL');
  }

  onCreateReporterAutocompleteInput(value: string): void {
    this.createReporterQuery.set(value);
    this.createReporterAutocompleteOpen.set(true);
    if (this.createReporterFilter() !== 'ALL') this.createReporterFilter.set('ALL');
  }

  selectCreateAssigneeUser(user: User): void {
    this.createAssigneeFilter.set(user.id);
    this.createAssigneeQuery.set(this.userAutocompleteLabel(user));
    this.createAssigneeAutocompleteOpen.set(false);
  }

  selectCreateReporterUser(user: User): void {
    this.createReporterFilter.set(user.id);
    this.createReporterQuery.set(this.userAutocompleteLabel(user));
    this.createReporterAutocompleteOpen.set(false);
  }

  openBoardSprintProgress(): void {
    const sprint = this.currentSprint();
    if (!sprint) return;

    const sprintCards = this.cards().filter(card => Number(card.sprintId) === Number(sprint.id));
    const byStatus: Record<string, number> = {};
    for (const column of this.columns) byStatus[column.id] = 0;

    for (const card of sprintCards) {
      const status = this.normalizeStatus(card.status);
      const key = byStatus[status] !== undefined ? status : 'BACKLOG';
      byStatus[key] = (byStatus[key] || 0) + 1;
    }

    const completedCards = sprintCards.filter(card => this.workflow.done(card.status));
    const totalPoints = sprintCards.reduce((sum, card) => sum + (Number(card.points) || 0), 0);
    const completedPoints = completedCards.reduce((sum, card) => sum + (Number(card.points) || 0), 0);
    this.boardSprintProgress.set({
      sprint, totalItems: sprintCards.length, completedItems: completedCards.length,
      completionRate: sprintCards.length ? Math.round(completedCards.length / sprintCards.length * 100) : 0,
      totalPoints, completedPoints, byStatus
    });
    this.boardSprintProgressOpen.set(true);
  }

  closeBoardSprintProgress(): void {
    this.boardSprintProgressOpen.set(false);
  }

  startScrumBoardView(): void {
    this.showScrum.set(false);
    this.fullScreenBoardMode.set('SCRUM');
    this.showScrumBoard.set(true);
  }

  closeScrumBoardView(): void {
    this.backToBoards();
  }

  toggleBoardSidebar(): void {
    this.boardSidebarOpen.update(open => !open);
  }
  toggleFilterPanel(): void {
    this.filterPanelOpen.update(open => !open);
  }


  startScrum(): void {
    this.scrumSelectedUserId.set(null);
    this.scrumStartedAt.set(new Date());
    this.showScrum.set(true);
  }

  closeScrum(): void {
    this.showScrum.set(false);
    this.scrumSelectedUserId.set(null);
  }
  scrumItems = computed(() => {
    const selectedUserId = this.scrumSelectedUserId();
    return this.filteredCards().filter(card => {
      if (selectedUserId === null) return true;
      return Number(card.assigneeId) === Number(selectedUserId);
    });
  });

  scrumParticipants = computed(() => {
    const ids = new Set<number>();
    for (const card of this.filteredCards()) {
      if (this.workflow.done(card.status)) continue;
      const id = Number(card.assigneeId);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
    return [...ids]
      .map(id => this.users().find(user => Number(user.id) === id))
      .filter((user): user is User => !!user)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  });

  /**
   * Members shown in the full-screen Board participant bar.
   * Unlike scrumParticipants(), this is intentionally based on ALL tickets
   * currently belonging to the board, including completed work. Every unique
   * assignee with a matching user record gets a chip.
   */
  /**
   * The set of work items that belongs to the selected board.
   *
   * IMPORTANT: this intentionally does NOT use filteredCards(). The latter
   * contains transient UI filters (assignee/team/search/member), which would
   * make the member quick-filter list shrink as soon as a filter is clicked.
   * Jira-style assignee quick filters are based on the board's own scope, not
   * on the currently selected quick filter.
   *
   * Most importantly, there is NO dependency on a board/team relationship
   * here. A board with no TEAM filter still gets members from its assigned
   * tickets.
   */
  boardScopedCards = computed(() => {
    const filters = this.activeView() === 'BOARD' ? this.activeBoardFilters() : [];
    return this.cards().filter(card => this.activeView() !== 'BOARD' || this.matchesSavedFilters(card, filters));
  });

  boardAssignedMembers = computed(() => {
    const ids = new Set<number>();

    for (const card of this.boardScopedCards()) {
      const id = Number(card.assigneeId);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }

    return [...ids]
      .map(id => this.users().find(user => Number(user.id) === id))
      .filter((user): user is User => !!user)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  });

  boardItemsForUser(userId: number): BoardCard[] {
    return this.boardScopedCards().filter(card => Number(card.assigneeId) === Number(userId));
  }

  selectScrumUser(userId: number | null): void {
    this.scrumSelectedUserId.set(userId);
  }

  scrumItemsForUser(userId: number): BoardCard[] {
    return this.filteredCards().filter(card => {
      if (this.workflow.done(card.status)) return false;
      return Number(card.assigneeId) === Number(userId);
    });
  }

  scrumColumnCards(columnId: string): BoardCard[] {
    return this.scrumItems().filter(card => this.normalizeStatus(card.status) === columnId);
  }

  /** Returns the linked Epics, Stories, Tasks and Issues for the current item. */
  linkedWorkItems(card: BoardCard): BoardCard[] {
    if (!card) return [];
    const all = this.cards();
    const linked = new Map<string, BoardCard>();
    const add = (item: BoardCard | undefined | null) => {
      if (item && item.key !== card.key && item.type !== 'TEST_CASE') linked.set(item.key, item);
    };
    const addById = (type: BoardCard['type'], id: unknown) => {
      const n = Number(id);
      if (!Number.isFinite(n) || n <= 0) return;
      add(all.find(item => item.type === type && Number(item.id) === n));
    };
    const addIssueChildren = () => {
      for (const issue of card.issues || []) {
        addById('ISSUE', issue?.id ?? issue?.issueId ?? issue?.issue_id);
      }
    };

    if (card.type === 'EPIC') {
      all.filter(item => item.type === 'STORY' && Number(item.epicId ?? item.raw?.epic_id ?? item.raw?.epicId ?? item.raw?.epic?.id ?? item.raw?.parentEpic?.id ?? item.raw?.parent_epic?.id) === Number(card.id)).forEach(add);
      const storyIds = new Set(all.filter(item => item.type === 'STORY' && Number(item.epicId ?? item.raw?.epic_id ?? item.raw?.epicId ?? item.raw?.epic?.id ?? item.raw?.parentEpic?.id ?? item.raw?.parent_epic?.id) === Number(card.id)).map(item => Number(item.id)));
      all.filter(item => item.type === 'TASK' && storyIds.has(Number(item.storyId ?? item.raw?.story_id ?? item.raw?.storyId ?? item.raw?.story?.id ?? item.raw?.parentStory?.id ?? item.raw?.parent_story?.id))).forEach(add);
      addIssueChildren();
    } else if (card.type === 'STORY') {
      addById('EPIC', card.epicId ?? card.raw?.epic_id ?? card.raw?.epicId ?? card.raw?.epic?.id ?? card.raw?.parentEpic?.id ?? card.raw?.parent_epic?.id);
      all.filter(item => item.type === 'TASK' && Number(item.storyId ?? item.raw?.story_id ?? item.raw?.storyId ?? item.raw?.story?.id ?? item.raw?.parentStory?.id ?? item.raw?.parent_story?.id) === Number(card.id)).forEach(add);
      addIssueChildren();
    } else if (card.type === 'TASK') {
      const parentStoryId = card.storyId ?? card.raw?.story_id ?? card.raw?.storyId ?? card.raw?.story?.id ?? card.raw?.parentStory?.id ?? card.raw?.parent_story?.id;
      addById('STORY', parentStoryId);
      const parentStory = all.find(item => item.type === 'STORY' && Number(item.id) === Number(parentStoryId));
      if (parentStory) addById('EPIC', parentStory.epicId ?? parentStory.raw?.epic_id ?? parentStory.raw?.epicId ?? parentStory.raw?.epic?.id ?? parentStory.raw?.parentEpic?.id ?? parentStory.raw?.parent_epic?.id);
      addIssueChildren();
    } else if (card.type === 'ISSUE') {
      const raw = card.raw || {};
      for (const id of this.issueLinkedIdsForDraft(raw, 'EPIC')) addById('EPIC', id);
      for (const id of this.issueLinkedIdsForDraft(raw, 'STORY')) addById('STORY', id);
      for (const id of this.issueLinkedIdsForDraft(raw, 'TASK')) addById('TASK', id);
    } else if (card.type === 'TEST_CASE') {
      const raw = card.raw || {};
      addById('EPIC', card.epicId ?? raw.epic_id ?? raw.epicId ?? raw.epic?.id);
      addById('STORY', card.storyId ?? raw.story_id ?? raw.storyId ?? raw.story?.id ?? raw.userStory?.id);
      addById('TASK', raw.task_id ?? raw.taskId ?? raw.task?.id);
    }

    return Array.from(linked.values()).sort((a, b) => {
      const order: Record<string, number> = { EPIC: 0, STORY: 1, TASK: 2, ISSUE: 3 };
      return (order[a.type] ?? 9) - (order[b.type] ?? 9) || Number(a.id) - Number(b.id);
    });
  }

  workItemTypeIcon(type: string): string {
    const icons: Record<string, string> = { EPIC: 'flag', STORY: 'bookmark', TASK: 'check_box', ISSUE: 'bug_report', TEST_CASE: 'science' };
    return icons[String(type || '').toUpperCase()] || 'work_outline';
  }

  workItemDate(card: BoardCard, kind: 'created' | 'updated'): Date | null {
    const raw = card?.raw || {};
    const value = kind === 'created'
      ? raw.createdAt ?? raw.created_at ?? raw.createdOn ?? raw.created_on ?? raw.creationDate ?? raw.creation_date
      : raw.updatedAt ?? raw.updated_at ?? raw.modifiedAt ?? raw.modified_at ?? raw.lastUpdated ?? raw.last_updated;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  openAssociatedTests(): void {
    this.associatedTestsOpen.set(true);
  }

  openBoardItemLink(card: BoardCard, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); this.openBoardItem(card);
  }

  openBoardItem(card: BoardCard): void {
    if (!card?.id) return;
    if (card.type === 'TEST_CASE') {
      this.selectedBoardItem.set(card);
      this.workItemDraft.set(this.toWorkItemDraft(card));
      this.syncWorkItemUserQueries(card.assigneeId, card.reporterId);
      this.workItemModalMode.set('EDIT');
      this.boardItemModalOpen.set(true);
      return;
    }
    const projectId=Number(card.projectId ?? card.raw?.project_id ?? card.raw?.projectId ?? card.raw?.project?.id ?? this.selectedBoard()?.projectId ?? this.selectedProjectId() ?? this.projectContext.selectedProjectId());
    if (!projectId) { this.errorMessage.set('This item has no project. Open it from Work Items to review its details.'); return; }
    this.itemDialog.open(projectId, card.type, card.id);
  }

  openCreateWorkItem(type: 'EPIC' | 'STORY' | 'TASK' | 'ISSUE' | 'TEST_CASE'): void {
    const projectId = this.selectedBoard()?.projectId || this.selectedProjectId();
    if (!projectId) {
      this.errorMessage.set('Select a project before creating a work item.');
      return;
    }

    if (type !== 'TEST_CASE') { this.itemDialog.create(projectId, type); return; }
    const currentSprint = this.currentSprint();
    const currentUserId = this.getAuthenticatedUserId();

    const draft: any = {
      type,
      id: null,
      code: '',
      title: '',
      description: '',
      status: 'DRAFT',
      priority: 'MEDIUM',
      points: 0,
      projectId,
      sprintId: currentSprint?.id ?? null,
      assigneeId: currentUserId,
      reporterId: currentUserId,
      epicId: null,
      storyId: null,
      raw: {},
      issueCode: '',
      testCaseCode: type === 'TEST_CASE' ? `TC-${Date.now().toString().slice(-6)}` : '',
      isBlocking: false, epicIds: [], storyIds: [], taskIds: [],
      preconditions: '', steps: '', expectedResult: '', actualResult: '', executionStatus: 'DRAFT'
    };

    this.selectedBoardItem.set({
      key: `NEW-${type}`,
      type,
      id: 0,
      code: draft.testCaseCode,
      title: 'New ' + type,
      status: draft.status,
      priority: draft.priority,
      points: 0,
      assigneeId: draft.assigneeId,
      reporterId: draft.reporterId,
      sprintId: draft.sprintId,
      epicId: draft.epicId,
      storyId: draft.storyId,
      raw: {}
    });
    this.workItemDraft.set(draft);
    this.syncWorkItemUserQueries(draft.assigneeId, draft.reporterId);
    this.workItemModalMode.set('CREATE');
    this.boardItemModalOpen.set(true);
  }

  openEditBoardItem(): void {
    const card = this.selectedBoardItem();
    if (!card) return;
    this.workItemDraft.set(this.toWorkItemDraft(card));
    this.syncWorkItemUserQueries(card.assigneeId, card.reporterId);
    this.workItemModalMode.set('EDIT');
  }

  closeBoardItem(): void {
    this.boardItemModalOpen.set(false);
    this.associatedTestsOpen.set(false);
    this.selectedBoardItem.set(null);
    this.workItemDraft.set({});
    this.workItemAssigneeQuery.set('');
    this.workItemReporterQuery.set('');
    this.workItemAssigneeAutocompleteOpen.set(false);
    this.workItemReporterAutocompleteOpen.set(false);
    this.workItemModalMode.set('VIEW');
    this.workItemSaving.set(false);
  }

  private toWorkItemDraft(card: BoardCard): any {
    const raw = card.raw || {};
    return {
      type: card.type,
      id: card.id,
      code: card.code,
      title: card.title,
      description: String(raw.description ?? raw.details ?? ''),
      status: (card.type === 'ISSUE' || card.type === 'TEST_CASE') ? String(raw.status || card.status || 'BACKLOG').toUpperCase() : this.normalizeStatus(card.status),
      priority: card.priority || 'MEDIUM',
      points: card.points || 0,
      projectId: Number(raw.project_id ?? raw.projectId ?? this.selectedProjectId() ?? 0),
      sprintId: card.sprintId ?? null,
      assigneeId: card.assigneeId ?? null,
      reporterId: card.reporterId ?? null,
      epicId: this.nullableNumber(card.epicId ?? raw.epic_id ?? raw.epicId ?? raw.epic?.id ?? raw.parentEpic?.id ?? raw.parent_epic?.id),
      storyId: this.nullableNumber(card.storyId ?? raw.story_id ?? raw.storyId ?? raw.story?.id ?? raw.parentStory?.id ?? raw.parent_story?.id),
      taskId: this.nullableNumber(raw.task_id ?? raw.taskId ?? raw.task?.id ?? raw.parentTask?.id ?? raw.parent_task?.id),
      issueCode: raw.issue_code ?? raw.issueCode ?? card.code ?? '',
      testCaseCode: raw.testCaseCode ?? raw.test_case_code ?? raw.code ?? card.code ?? '',
      isBlocking: Boolean(raw.isBlocking ?? raw.is_blocking),
      epicIds: this.issueLinkedIdsForDraft(raw, 'EPIC'),
      storyIds: this.issueLinkedIdsForDraft(raw, 'STORY'),
      taskIds: this.issueLinkedIdsForDraft(raw, 'TASK'),
      preconditions: String(raw.preconditions || ''), steps: String(raw.steps || ''),
      expectedResult: String(raw.expectedResult ?? raw.expected_result ?? ''),
      actualResult: String(raw.actualResult ?? raw.actual_result ?? ''),
      executionStatus: String(raw.executionStatus ?? raw.execution_status ?? raw.status ?? 'DRAFT'),
      comments: this.workItemComments(card), newComment: '',
      raw
    };
  }

  workItemStatuses(type: string): Array<{id: string; label: string}> {
    if (type === 'ISSUE') return ['OPEN','IN_PROGRESS','RESOLVED','CLOSED','BLOCKED'].map(id => ({ id, label: id.replace('_',' ') }));
    if (type === 'TEST_CASE') return ['DRAFT','READY','PASS','FAIL','BLOCKED'].map(id => ({ id, label: id.replace('_',' ') }));
    return this.columns;
  }

  updateBoardItemStatus(status: string): void {
    const card = this.selectedBoardItem();
    if (!card || !status) return;

    if (this.workItemModalMode() !== 'VIEW') {
      this.workItemDraft.update(d => ({ ...d, status }));
      return;
    }

    if (card.type === 'ISSUE' || card.type === 'TEST_CASE') {
      const url = card.type === 'ISSUE'
        ? `${this.baseUrl}/v1/issues/${card.id}`
        : `${environment.apiBaseUrl2 || environment.apiBaseUrl || this.baseUrl}/v1/testcases/${card.id}`;
      const payload = { ...(card.raw || {}), status };
      this.http.put<any>(url, payload, this.headers()).subscribe({
        next: response => {
          const raw = this.extractObject(response) || payload;
          const updated: BoardCard = { ...card, status: this.normalizeStatus(status), raw };
          this.cards.set(this.cards().map(item => item.key === card.key ? updated : item));
          this.selectedBoardItem.set(updated);
          this.workItemDraft.update(d => ({ ...d, status }));
          this.successMessage.set(`${card.type === 'TEST_CASE' ? 'Test case' : 'Issue'} #${card.id} updated.`);
          setTimeout(() => this.successMessage.set(''), 1800);
        },
        error: error => this.errorMessage.set(error?.error?.message || `Could not update ${card.type.toLowerCase()} status.`)
      });
      return;
    }

    this.moveCard(card, status);
    this.selectedBoardItem.set({ ...card, status: this.normalizeStatus(status) });
  }

  /** Persist the current editor draft after a field loses focus or a selection changes. */
  autoSaveWorkItemField(): void {
    if (this.workItemModalMode() !== 'EDIT') return;
    if (this.workItemSaving()) {
      this.workItemAutoSavePending = true;
      return;
    }
    this.workItemAutoSavePending = false;
    this.saveWorkItem(false);
  }

  saveWorkItem(closeAfterSave = true): void {
    const draft = this.workItemDraft();
    const type = draft?.type as BoardCard['type'];
    const id = Number(draft?.id);
    const isCreate = !Number.isFinite(id) || id <= 0;
    const supported = ['EPIC', 'STORY', 'TASK', 'ISSUE', 'TEST_CASE'];
    if (!type || !supported.includes(type)) {
      this.errorMessage.set('Invalid work item type.');
      return;
    }

    const title = String(draft.title || '').trim();
    if (!title) {
      this.errorMessage.set(`${type === 'EPIC' ? 'Epic name' : type === 'STORY' ? 'Story title' : type === 'TASK' ? 'Task title' : type === 'ISSUE' ? 'Issue title' : 'Test case title'} is required.`);
      return;
    }

    const projectId = Number(draft.projectId || this.selectedProjectId());
    if (!Number.isFinite(projectId) || projectId <= 0) {
      this.errorMessage.set('A valid project is required.');
      return;
    }
    if (type === 'EPIC' && isCreate && !String(draft.code || '').trim()) {
      this.errorMessage.set('Epic code is required when creating an Epic.'); return;
    }
    if (type === 'TASK' && !Number(draft.storyId)) {
      this.errorMessage.set('A parent Story is required when creating a Task.'); return;
    }
    if (type === 'ISSUE' && !String(draft.issueCode || draft.code || '').trim()) {
      this.errorMessage.set('Issue code is required.'); return;
    }
    if (type === 'TEST_CASE' && (!String(draft.steps || '').trim() || !String(draft.expectedResult || '').trim())) {
      this.errorMessage.set('Test steps and expected result are required.'); return;
    }

    const sprintId = this.nullableNumber(draft.sprintId);
    const assigneeId = this.nullableNumber(draft.assigneeId);
    const reporterId = this.nullableNumber(draft.reporterId);
    const status = String(draft.status || (type === 'ISSUE' ? 'OPEN' : type === 'TEST_CASE' ? 'DRAFT' : 'BACKLOG')).toUpperCase();
    const description = String(draft.description || '');
    const priority = String(draft.priority || 'MEDIUM').toUpperCase();
    let endpoint = '';
    let request: any;

    if (type === 'EPIC') {
      endpoint = `${this.baseUrl}/epics`;
      const payload = {
        name: title, description, status: this.normalizeStatus(status), sprint_id: sprintId, comments: draft.comments || [],
        assignee_user_id: assigneeId, reporter_user_id: reporterId,
        ...(isCreate ? { project_id: projectId, epic_code: String(draft.code || '').trim() } : {})
      };
      request = isCreate
        ? this.http.post<any>(`${endpoint}/create`, payload, this.headers())
        : this.http.put<any>(`${endpoint}/${id}`, payload, this.headers());
    } else if (type === 'STORY') {
      endpoint = `${this.baseUrl}/stories`;
      const payload = {
        title, description, story_points: Number(draft.points || 0), status: this.normalizeStatus(status), priority, comments: draft.comments || [],
        ...(isCreate ? { project_id: projectId } : {}), epic_id: this.nullableNumber(draft.epicId), sprint_id: sprintId,
        assignee_user_id: assigneeId, reporter_user_id: reporterId
      };
      request = isCreate
        ? this.http.post<any>(`${endpoint}/create`, payload, this.headers())
        : this.http.put<any>(`${endpoint}/${id}`, payload, this.headers());
    } else if (type === 'TASK') {
      endpoint = `${this.baseUrl}/tasks`;
      const payload = { title, description, status: this.normalizeStatus(status), story_id: Number(draft.storyId), sprint_id: sprintId, assignee_user_id: assigneeId, reporter_user_id: reporterId, comments: draft.comments || [] };
      request = isCreate
        ? this.http.post<any>(`${endpoint}/create`, payload, this.headers())
        : this.http.put<any>(`${endpoint}/${id}`, payload, this.headers());
    } else if (type === 'ISSUE') {
      endpoint = `${this.baseUrl}/v1/issues`;
      const issueCode = String(draft.issueCode || draft.code || '').trim();
      const epicIds = this.cleanIds(draft.epicIds);
      const storyIds = this.cleanIds(draft.storyIds);
      const taskIds = this.cleanIds(draft.taskIds);
      const creatorId = this.getAuthenticatedUserId();
      const isBlocking = Boolean(draft.isBlocking);
      const payload = {
        issue_code: issueCode, issueCode, project_id: projectId, projectId,
        sprint_id: sprintId, sprintId, user_id: creatorId, userId: creatorId,
        creator_user_id: creatorId, creatorUserId: creatorId,
        assignee_user_id: assigneeId, assigneeUserId: assigneeId,
        reporter_user_id: reporterId, reporterUserId: reporterId,
        title, description, status, isBlocking, is_blocking: isBlocking, comments: draft.comments || [],
        epicIds, storyIds, taskIds,
        allocations: [
          ...epicIds.map(allocatableId => ({ allocatableType: 'EPIC', allocatableId })),
          ...storyIds.map(allocatableId => ({ allocatableType: 'STORY', allocatableId })),
          ...taskIds.map(allocatableId => ({ allocatableType: 'TASK', allocatableId }))
        ],
        project: { id: projectId }, sprint: sprintId ? { id: sprintId } : null,
        creator: creatorId ? { id: creatorId } : null, assignee: assigneeId ? { id: assigneeId } : null,
        reporter: reporterId ? { id: reporterId } : null
      };
      request = isCreate
        ? this.http.post<any>(endpoint, payload, this.headers())
        : this.http.put<any>(`${endpoint}/${id}`, payload, this.headers());
    } else {
      endpoint = `${environment.apiBaseUrl2 || environment.apiBaseUrl || this.baseUrl}/v1/testcases`;
      const epicId = this.nullableNumber(draft.epicId);
      const storyId = this.nullableNumber(draft.storyId);
      const taskId = this.nullableNumber(draft.taskId);
      const payload = {
        testCaseCode: String(draft.testCaseCode || draft.code || '').trim() || null,
        title, description, preconditions: String(draft.preconditions || ''), steps: String(draft.steps || ''),
        expectedResult: String(draft.expectedResult || ''), actualResult: String(draft.actualResult || ''), comments: draft.comments || [],
        status: String(draft.executionStatus || status || 'DRAFT').toUpperCase(), priority,
        project: { id: projectId }, projectId, project_id: projectId,
        testPlan: draft.testPlanId ? { id: Number(draft.testPlanId) } : null,
        testSuite: draft.testSuiteId ? { id: Number(draft.testSuiteId) } : null,
        epic: epicId ? { id: epicId } : null, epicId, epic_id: epicId,
        story: storyId ? { id: storyId } : null, userStory: storyId ? { id: storyId } : null,
        storyId, story_id: storyId, user_story_id: storyId,
        task: taskId ? { id: taskId } : null, taskId, task_id: taskId,
        user: assigneeId ? { id: assigneeId } : null, userId: assigneeId, user_id: assigneeId
      };
      request = isCreate
        ? this.http.post<any>(endpoint, payload, this.headers())
        : this.http.put<any>(`${endpoint}/${id}`, payload, this.headers());
    }

    this.workItemSaving.set(true);
    request.subscribe({
      next: (response: any) => {
        this.workItemSaving.set(false);
        const returned = this.extractObject(response);
        const returnedId = Number(returned?.id ?? returned?.issueId ?? returned?.issue_id ?? returned?.testCaseId ?? returned?.test_case_id ?? id);
        this.successMessage.set(isCreate
          ? `${type === 'TEST_CASE' ? 'Test case' : type} ${Number.isFinite(returnedId) && returnedId > 0 ? '#' + returnedId + ' ' : ''}created successfully.`
          : `${type === 'TEST_CASE' ? 'Test case' : type} #${id} updated successfully.`);
        if (closeAfterSave) {
          this.closeBoardItem();
        } else {
          const current = this.selectedBoardItem();
          if (current) {
            const updated: BoardCard = { ...current, title, description, status: this.normalizeStatus(status), priority, points: Number(draft.points || 0), assigneeId, reporterId, sprintId, raw: { ...(current.raw || {}), ...draft, description, title, status, priority, comments: draft.comments || [] } };
            this.selectedBoardItem.set(updated);
            this.cards.set(this.cards().map(item => item.key === updated.key ? updated : item));
          }
        }
        this.loadWorkItems();
        if (!closeAfterSave && this.workItemAutoSavePending) {
          this.workItemAutoSavePending = false;
          setTimeout(() => this.saveWorkItem(false), 0);
        }
        setTimeout(() => this.successMessage.set(''), 2500);
      },
      error: (error: any) => {
        this.workItemSaving.set(false);
        this.errorMessage.set(error?.error?.message || error?.error?.error || (isCreate ? `Could not create ${type}.` : `Could not update ${type}.`));
      }
    });
  }

  private cleanIds(values: any): number[] {
    return Array.from(new Set((Array.isArray(values) ? values : []).map(Number).filter((id: number) => Number.isFinite(id) && id > 0)));
  }

  private issueLinkedIdsForDraft(item: any, type: 'EPIC' | 'STORY' | 'TASK'): number[] {
    const aliases: Record<'EPIC' | 'STORY' | 'TASK', string[]> = {
      EPIC: ['epicIds', 'epic_ids', 'epicId', 'epic_id'],
      STORY: ['storyIds', 'story_ids', 'storyId', 'story_id'],
      TASK: ['taskIds', 'task_ids', 'taskId', 'task_id']
    };
    const values: any[] = [];
    for (const key of aliases[type]) {
      const value = item?.[key];
      if (Array.isArray(value)) values.push(...value);
      else if (value !== undefined && value !== null && value !== '') values.push(value);
    }
    const nested = item?.[type.toLowerCase()];
    if (nested?.id != null) values.push(nested.id);
    const allocations = Array.isArray(item?.allocations)
      ? item.allocations
          .filter((a: any) => String(a?.allocatableType ?? a?.allocatable_type ?? '').toUpperCase().replace(/S$/, '') === type)
          .map((a: any) => a?.allocatableId ?? a?.allocatable_id ?? a?.id)
      : [];
    return this.cleanIds([...values, ...allocations]);
  }

  private syncWorkItemUserQueries(assigneeId: number | null | undefined, reporterId: number | null | undefined): void {
    const assignee = this.users().find(user => Number(user.id) === Number(assigneeId));
    const reporter = this.users().find(user => Number(user.id) === Number(reporterId));
    this.workItemAssigneeQuery.set(assignee ? this.workItemUserName(assignee) : '');
    this.workItemReporterQuery.set(reporter ? this.workItemUserName(reporter) : '');
    this.workItemAssigneeAutocompleteOpen.set(false);
    this.workItemReporterAutocompleteOpen.set(false);
  }

  workItemUserName(user: User | null | undefined): string {
    if (!user) return '';
    const fullName = user.name || [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' ');
    return String(fullName || `User ${user.id}`).trim();
  }

  workItemUserDesignation(user: User | null | undefined): string {
    if (!user) return 'Team member';
    return String(user['designation'] ?? user['job_title'] ?? user['jobTitle'] ?? user['role_name'] ?? user['roleName'] ?? user['role'] ?? 'Team member').trim() || 'Team member';
  }

  personToneClass(id: number | null | undefined): string {
    return `person-tone-${Math.abs(Number(id) || 0) % 4}`;
  }

  onWorkItemAssigneeInput(value: string): void {
    this.workItemAssigneeQuery.set(value);
    this.workItemAssigneeAutocompleteOpen.set(value.trim().length > 0);
    const selected = this.users().find(user => Number(user.id) === Number(this.workItemDraft().assigneeId));
    if (selected && value !== this.workItemUserName(selected)) this.workItemDraft.update(draft => ({ ...draft, assigneeId: null }));
  }

  onWorkItemReporterInput(value: string): void {
    this.workItemReporterQuery.set(value);
    this.workItemReporterAutocompleteOpen.set(value.trim().length > 0);
    const selected = this.users().find(user => Number(user.id) === Number(this.workItemDraft().reporterId));
    if (selected && value !== this.workItemUserName(selected)) this.workItemDraft.update(draft => ({ ...draft, reporterId: null }));
  }

  selectWorkItemAssignee(user: User): void {
    this.workItemDraft.update(draft => ({ ...draft, assigneeId: Number(user.id) }));
    this.workItemAssigneeQuery.set(this.workItemUserName(user));
    this.workItemAssigneeAutocompleteOpen.set(false);
    this.autoSaveWorkItemField();
  }

  selectWorkItemReporter(user: User): void {
    this.workItemDraft.update(draft => ({ ...draft, reporterId: Number(user.id) }));
    this.workItemReporterQuery.set(this.workItemUserName(user));
    this.workItemReporterAutocompleteOpen.set(false);
    this.autoSaveWorkItemField();
  }

  clearWorkItemAssignee(): void {
    this.workItemDraft.update(draft => ({ ...draft, assigneeId: null }));
    this.workItemAssigneeQuery.set('');
    this.workItemAssigneeAutocompleteOpen.set(false);
  }

  clearWorkItemReporter(): void {
    this.workItemDraft.update(draft => ({ ...draft, reporterId: null }));
    this.workItemReporterQuery.set('');
    this.workItemReporterAutocompleteOpen.set(false);
  }

  workItemComments(card: BoardCard | null | undefined): any[] {
    if (this.workItemModalMode() !== 'VIEW' && this.selectedBoardItem()?.key === card?.key && Array.isArray(this.workItemDraft()?.comments)) return this.workItemDraft().comments;
    const raw = card?.raw || {};
    const comments = raw.comments ?? raw.commentList ?? raw.comment_list;
    if (Array.isArray(comments)) return comments;
    if (typeof comments === 'string' && comments.trim()) return [{ text: comments }];
    return [];
  }

  addWorkItemCommentToDraft(): void {
    const draft = this.workItemDraft();
    const text = String(draft?.newComment || '').trim();
    if (!text) return;
    const existing = Array.isArray(draft.comments) ? draft.comments : this.workItemComments(this.selectedBoardItem());
    const comment = { text, authorId: this.getAuthenticatedUserId(), authorName: this.userName(this.getAuthenticatedUserId()), createdAt: new Date().toISOString() };
    this.workItemDraft.set({ ...draft, comments: [...existing, comment], newComment: '' });
  }

  updateWorkItemDraft(field: string, value: any): void {
    this.workItemDraft.update(draft => ({ ...draft, [field]: value }));
  }

  private nullableNumber(value: any): number | null {
    if (value === null || value === undefined || value === '' || value === 'ALL') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private extractObject(response: any): any {
    if (!response) return null;
    if (response.data && !Array.isArray(response.data)) return response.data;
    if (response.item && !Array.isArray(response.item)) return response.item;
    if (response.result && !Array.isArray(response.result)) return response.result;
    return response;
  }

  private getAuthenticatedUserId(): number | null {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const id = Number(payload?.user_id ?? payload?.userId ?? payload?.sub ?? payload?.id);
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }


  onProjectChange(value: string | number): void {
    const id = Number(value);

    this.selectedProjectId.set(Number.isFinite(id) ? id : null);
    if (Number.isFinite(id) && id > 0) this.projectContext.setSelectedProject(id);
    this.selectedBoardProjectTab.set('ALL');
    this.resetViewFilters();
    this.cards.set([]);
    this.selectedBoardId.set(null);
    this.boardHome.set(true);
    this.activeView.set('BOARD');
    this.activeBoardFilters.set([]);
    // Keep the Board view on ALL sprints until the selected board's saved
    // filters are loaded.
    this.selectedSprintId.set('ALL');
    this.selectDefaultBoard();
    this.loadBoardFiltersAndItems();
  }

  onSprintChange(value: string | number): void {
    this.selectedSprintId.set(
      value === 'ALL' ? 'ALL' : Number(value)
    );
  }

  refresh(): void {
    this.loadBoard();
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedType.set('ALL');

    // Clearing UI filters must not re-introduce the current sprint.
    // Board membership is controlled by the saved board filters.
    this.selectedSprintId.set('ALL');
  }

  private loadWorkItems(): void {
    const requestId = ++this.workItemsRequestId;
    const boardProjectId = Number(this.selectedBoard()?.projectId);
    const savedProjectIds = this.activeBoardFilters().filter(f => ['PROJECT', 'SPACE'].includes(f.filterType))
      .map(f => Number(f.filterValue)).filter(id => id > 0);
    const projects = this.projects()
      .filter(project => Number.isFinite(Number(project.id)) && Number(project.id) > 0)
      .filter(project => boardProjectId > 0 ? Number(project.id) === boardProjectId :
        savedProjectIds.length ? savedProjectIds.includes(Number(project.id)) : Number(project.id) === Number(this.selectedProjectId()));

    if (!projects.length) {
      this.cards.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    const testcaseBase = environment.apiBaseUrl2 || environment.apiBaseUrl || this.baseUrl;

    // Read only the board's project, then enforce its saved filters locally.
    // Tasks/test cases may ignore the project query, so also scope descendants.
    const projectRequests = projects.map(project => {
      const projectId = Number(project.id);
      return forkJoin({
        projectId: of(projectId),
        epics: this.collections.read(`${this.baseUrl}/projects/${projectId}/epics`).pipe(catchError(() => of([]))),
        stories: this.collections.read(`${this.baseUrl}/projects/${projectId}/stories`).pipe(catchError(() => of([]))),
        tasks: this.collections.read(`${this.baseUrl}/tasks?projectId=${projectId}`).pipe(catchError(() => of([]))),
        issues: this.collections.read(`${this.baseUrl}/v1/issues?projectId=${projectId}`).pipe(catchError(() => of([]))),
        testCases: this.collections.read(`${testcaseBase}/v1/testcases?projectId=${projectId}`).pipe(catchError(() => of([])))
      });
    });

    forkJoin(projectRequests).subscribe({
      next: projectResults => {
        if (requestId !== this.workItemsRequestId) return;
        const flattenUnique = (key: 'epics' | 'stories' | 'tasks' | 'issues' | 'testCases'): any[] => {
          const byId = new Map<string, any>();
          for (const projectResult of projectResults) {
            for (const item of this.extractArray((projectResult as any)[key])) {
              const id = item?.id ?? item?.issueId ?? item?.issue_id ?? item?.testCaseId ?? item?.test_case_id;
              if (id === null || id === undefined || id === '') continue;
              const stableKey = String(id);
              // Prefer the first complete object returned for this ID.
              if (!byId.has(stableKey)) byId.set(stableKey, ['epics', 'stories'].includes(key)
                ? { ...item, __boardProjectId: projectResult.projectId } : item);
            }
          }
          return Array.from(byId.values());
        };

        const allEpics = flattenUnique('epics');
        const allStories = flattenUnique('stories');
        const allTasks = flattenUnique('tasks');
        const allIssues = flattenUnique('issues');
        const allTestCases = flattenUnique('testCases');

        // Keep items belonging to known projects. If an endpoint omits project
        // identity, associate descendants through their parent Story/Epic IDs.
        const projectIds = new Set(projects.map(project => Number(project.id)));
        const epics = allEpics.filter(item => {
          const pid = item.project_id ?? item.projectId ?? item.project?.id;
          return pid == null || projectIds.has(Number(pid));
        });
        const stories = allStories.filter(item => {
          const pid = item.project_id ?? item.projectId ?? item.project?.id;
          return pid == null || projectIds.has(Number(pid));
        });
        const storyIds = new Set(stories.map((story: any) => Number(story.id)));
        const projectSprintIds = new Set(this.sprints().filter(sprint => projectIds.has(Number(sprint.projectId))).map(sprint => Number(sprint.id)));
        const tasks = allTasks.filter((task: any) => {
          const pid = task.project_id ?? task.projectId ?? task.project?.id;
          const sid = Number(task.story_id ?? task.storyId ?? task.story?.id ?? task.parentStory?.id ?? task.parent_story?.id);
          return (pid != null && projectIds.has(Number(pid))) || (pid == null &&
            (storyIds.has(sid) || projectSprintIds.has(Number(task.sprint_id ?? task.sprintId ?? task.sprint?.id))));
        });
        const issues = allIssues;
        const testCases = allTestCases;

        const epicCards: BoardCard[] = epics.map((epic: any) => ({
          key: `EPIC-${epic.id}`,
          type: 'EPIC',
          id: Number(epic.id),
          code: epic.epic_code || epic.code || `EPIC-${epic.id}`,
          title: epic.name || epic.title || 'Untitled Epic',
          status: this.normalizeStatus(epic.status),
          priority: epic.priority,
          points: Number(epic.story_points ?? epic.points ?? 0) || 0,
          assigneeId: epic.assignee_user_id ?? epic.assigneeUserId ?? epic.assignee_id ?? epic.assigneeId ?? null,
          sprintId: epic.sprint_id ?? epic.sprintId ?? null,
          reporterId: epic.reporter_user_id ?? epic.reporterUserId ?? epic.reporter_id ?? epic.reporterId ?? null,
          teamId: epic.team_id ?? epic.teamId ?? null,
          description: epic.description || '',
          raw: epic
        }));

        const storyCards: BoardCard[] = stories.map((story: any) => ({
          key: `STORY-${story.id}`,
          type: 'STORY',
          id: Number(story.id),
          code: story.story_code || story.code || `STORY-${story.id}`,
          title: story.title || story.name || 'Untitled Story',
          status: this.normalizeStatus(story.status),
          priority: story.priority,
          points: Number(story.story_points ?? story.points ?? 0) || 0,
          assigneeId: story.assignee_user_id ?? story.assigneeUserId ?? story.assignee_id ?? story.assigneeId ?? null,
          sprintId: story.sprint_id ?? story.sprintId ?? null,
          epicId: this.nullableNumber(story.epic_id ?? story.epicId ?? story.epic?.id ?? story.parentEpic?.id ?? story.parent_epic?.id),
          reporterId: story.reporter_user_id ?? story.reporterUserId ?? story.reporter_id ?? story.reporterId ?? null,
          teamId: story.team_id ?? story.teamId ?? null,
          description: story.description || '',
          raw: story
        }));

        const taskCards: BoardCard[] = tasks.map((task: any) => ({
            key: `TASK-${task.id}`,
            type: 'TASK',
            id: Number(task.id),
            code: task.task_code || task.code || `TASK-${task.id}`,
            title: task.title || task.name || 'Untitled Task',
            status: this.normalizeStatus(task.status),
            priority: task.priority,
            points: Number(task.story_points ?? task.points ?? 0) || 0,
            assigneeId: task.assignee_user_id ?? task.assigneeUserId ?? task.assignee_id ?? task.assigneeId ?? null,
            sprintId: task.sprint_id ?? task.sprintId ?? null,
            storyId: this.nullableNumber(task.story_id ?? task.storyId ?? task.story?.id ?? task.parentStory?.id ?? task.parent_story?.id),
            reporterId: task.reporter_user_id ?? task.reporterUserId ?? task.reporter_id ?? task.reporterId ?? null,
            teamId: task.team_id ?? task.teamId ?? null,
            description: task.description || '',
            raw: task
          }));

        // Match the Epics component hierarchy exactly:
        // - Epic issues include issues linked to the Epic, its Stories, or its Tasks.
        // - Story issues include issues linked to the Story or its Tasks.
        // - Task issues are linked directly to the Task.
        // - Test cases are attached to their direct Epic / Story / Task.
        // - Parent names/codes are carried onto Story/Task cards for the exact
        //   EPIC · parent and STORY · parent tags used by the Epics Kanban.
        const storyById = new Map(stories.map((story: any) => [Number(story.id), story]));
        const epicById = new Map(epics.map((epic: any) => [Number(epic.id), epic]));
        const tasksByStoryId = new Map<number, any[]>();
        for (const task of tasks) {
          const sid = Number(task.story_id ?? task.storyId ?? task.story?.id ?? task.parentStory?.id ?? task.parent_story?.id);
          if (!Number.isFinite(sid) || sid <= 0) continue;
          const list = tasksByStoryId.get(sid) || [];
          list.push(task);
          tasksByStoryId.set(sid, list);
        }

        const linkedIssues = (type: 'EPIC' | 'STORY' | 'TASK', id: number): any[] => {
          return issues.filter((issue: any) => this.isIssueLinkedToCard(issue, type, id));
        };

        const linkedTests = (type: 'EPIC' | 'STORY' | 'TASK', id: number): any[] => {
          return testCases.filter((tc: any) => {
            if (type === 'EPIC') return Number(tc.epicId ?? tc.epic_id ?? tc.epic?.id) === Number(id);
            if (type === 'STORY') return Number(tc.storyId ?? tc.story_id ?? tc.story?.id ?? tc.userStory?.id ?? tc.user_story?.id) === Number(id);
            return Number(tc.taskId ?? tc.task_id ?? tc.task?.id) === Number(id);
          });
        };

        for (const card of epicCards) {
          const descendantStories = stories.filter((story: any) => Number(story.epic_id ?? story.epicId) === Number(card.id));
          const descendantStoryIds = descendantStories.map((story: any) => Number(story.id)).filter(Number.isFinite);
          const descendantTaskIds = descendantStories.flatMap((story: any) =>
            (tasksByStoryId.get(Number(story.id)) || []).map((task: any) => Number(task.id))
          ).filter(Number.isFinite);

          card.issues = issues.filter((issue: any) =>
            this.isIssueLinkedToCard(issue, 'EPIC', card.id) ||
            descendantStoryIds.some(id => this.isIssueLinkedToCard(issue, 'STORY', id)) ||
            descendantTaskIds.some(id => this.isIssueLinkedToCard(issue, 'TASK', id))
          );
          card.testCases = linkedTests('EPIC', card.id);
        }

        for (const card of storyCards) {
          const parentEpic = epicById.get(Number(card.epicId ?? card.raw?.epic_id ?? card.raw?.epicId ?? card.raw?.epic?.id ?? card.raw?.parentEpic?.id ?? card.raw?.parent_epic?.id));
          const childTasks = tasksByStoryId.get(Number(card.id)) || [];
          card.parentEpicName = parentEpic?.name || parentEpic?.title || undefined;
          card.parentEpicCode = parentEpic?.epic_code || parentEpic?.code || undefined;
          card.issues = issues.filter((issue: any) =>
            this.isIssueLinkedToCard(issue, 'STORY', card.id) ||
            childTasks.some((task: any) => this.isIssueLinkedToCard(issue, 'TASK', Number(task.id)))
          );
          card.testCases = linkedTests('STORY', card.id);
        }

        for (const card of taskCards) {
          const parentStory = storyById.get(Number(card.storyId ?? card.raw?.story_id ?? card.raw?.storyId ?? card.raw?.story?.id ?? card.raw?.parentStory?.id ?? card.raw?.parent_story?.id));
          const parentEpic = parentStory ? epicById.get(Number(parentStory.epic_id ?? parentStory.epicId ?? parentStory.epic?.id ?? parentStory.parentEpic?.id ?? parentStory.parent_epic?.id)) : undefined;
          card.parentStoryTitle = parentStory?.title || parentStory?.name || undefined;
          card.parentStoryCode = parentStory?.story_code || parentStory?.code || (parentStory?.id != null ? `STORY-${parentStory.id}` : undefined);
          card.parentEpicName = parentEpic?.name || parentEpic?.title || undefined;
          card.parentEpicCode = parentEpic?.epic_code || parentEpic?.code || undefined;
          card.issues = linkedIssues('TASK', card.id);
          card.testCases = linkedTests('TASK', card.id);
        }

        const issueCards: BoardCard[] = issues.map((issue: any) => ({
          key: `ISSUE-${issue.id}`, type: 'ISSUE', id: Number(issue.id),
          code: issue.issue_code || issue.issueCode || `ISSUE-${issue.id}`,
          title: issue.title || issue.name || 'Untitled Issue',
          status: this.normalizeStatus(issue.status), priority: issue.priority || 'MEDIUM',
          assigneeId: issue.assignee_user_id ?? issue.assigneeUserId ?? issue.assignee?.id ?? null,
          sprintId: issue.sprint_id ?? issue.sprintId ?? issue.sprint?.id ?? null,
          reporterId: issue.reporter_user_id ?? issue.reporterUserId ?? issue.reporter?.id ?? null,
          teamId: issue.team_id ?? issue.teamId ?? null, description: issue.description || '', raw: issue,
          issues: [], testCases: []
        }));
        const testCaseCards: BoardCard[] = testCases.map((testCase: any) => ({
          key: `TEST_CASE-${testCase.id}`, type: 'TEST_CASE', id: Number(testCase.id),
          code: testCase.testCaseCode || testCase.test_case_code || testCase.code || `TC-${testCase.id}`,
          title: testCase.title || testCase.name || 'Untitled Test Case',
          status: this.normalizeStatus(testCase.status || testCase.executionStatus || testCase.execution_status),
          priority: testCase.priority || 'MEDIUM', points: undefined,
          assigneeId: testCase.user?.id ?? testCase.userId ?? testCase.user_id ?? testCase.assignee_user_id ?? null,
          sprintId: testCase.sprintId ?? testCase.sprint_id ?? testCase.sprint?.id ?? null,
          epicId: testCase.epicId ?? testCase.epic_id ?? testCase.epic?.id ?? null,
          storyId: testCase.storyId ?? testCase.story_id ?? testCase.story?.id ?? testCase.userStory?.id ?? null,
          reporterId: testCase.reporter_user_id ?? testCase.reporterUserId ?? null,
          teamId: testCase.team_id ?? testCase.teamId ?? null, description: testCase.description || '', raw: testCase,
          issues: [], testCases: []
        }));

        const cards: BoardCard[] = [
          ...epicCards,
          ...storyCards,
          ...taskCards,
          ...issueCards,
          ...testCaseCards
        ];
        // APIs return both flat foreign keys and nested entity references.
        // Resolve them before applying saved sprint/team/people filters.
        const relationId = (raw: any, name: string): number | null => this.nullableNumber(
          raw[`${name}_user_id`] ?? raw[`${name}UserId`] ?? raw[`${name}_user_account_id`] ?? raw[`${name}UserAccountId`] ??
          raw[`${name}_id`] ?? raw[`${name}Id`] ?? raw[name]?.user_account_id ?? raw[name]?.id);
        const taskById = new Map(tasks.map(task => [Number(task.id), task]));
        const projectFor = (raw: any, kind: string): number | null => {
          const task = taskById.get(Number(raw.task_id ?? raw.taskId ?? raw.task?.id));
          const story = storyById.get(Number(raw.story_id ?? raw.storyId ?? raw.story?.id ?? raw.userStory?.id ?? raw.user_story?.id));
          const epic = epicById.get(Number(raw.epic_id ?? raw.epicId ?? raw.epic?.id));
          const parent = kind === 'TASK' ? story : kind === 'STORY' ? epic : task ?? story ?? epic;
          const parentKind = kind === 'TASK' ? 'STORY' : kind === 'STORY' ? 'EPIC' : task ? 'TASK' : story ? 'STORY' : 'EPIC';
          return this.nullableNumber(raw.project_id ?? raw.projectId ?? raw.project?.id ?? raw.__boardProjectId) ??
            this.nullableNumber(this.sprints().find(sprint => Number(sprint.id) === relationId(raw, 'sprint'))?.projectId) ??
            (parent && parent !== raw ? projectFor(parent, parentKind) : null);
        };
        for (const card of cards) {
          const raw = card.raw ?? {};
          card.projectId = projectFor(raw, card.type);
          card.sprintId = relationId(raw, 'sprint') ?? card.sprintId;
          card.assigneeId = relationId(raw, 'assignee') ?? card.assigneeId;
          card.reporterId = relationId(raw, 'reporter') ?? card.reporterId;
          card.priority = String(card.priority || 'MEDIUM').toUpperCase();
          const parent = card.type === 'STORY' ? epicById.get(Number(card.epicId)) :
            card.type === 'TASK' ? storyById.get(Number(card.storyId)) : null;
          card.teamId = relationId(raw, 'team') ?? (parent ? relationId(parent, 'team') : null) ?? card.teamId;
        }
        this.cards.set(cards.filter(card => card.projectId != null && projectIds.has(Number(card.projectId))));

        this.lastUpdated.set(new Date());
        this.loading.set(false);
      },
      error: () => {
        if (requestId !== this.workItemsRequestId) return;
        this.cards.set([]);
        this.errorMessage.set('Unable to load board work items.');
        this.loading.set(false);
      }
    });
  }

  private extractLinkedIds(issue: any, type: 'EPIC' | 'STORY' | 'TASK'): number[] {
    // Keep the display and editor relationship logic identical so linked items
    // appear whether the API returns direct IDs, nested objects, or allocations.
    return this.issueLinkedIdsForDraft(issue, type);
  }

  private isIssueLinkedToCard(issue: any, type: 'EPIC' | 'STORY' | 'TASK', id: number): boolean {
    return this.extractLinkedIds(issue, type).includes(Number(id));
  }

  isBlockingBoardIssue(issue: any): boolean {
    return Boolean(issue?.isBlocking ?? issue?.is_blocking);
  }

  boardStatusClass(status: string): string {
    return `status-${this.normalizeStatus(status).toLowerCase().replace(/_/g, '-')}`;
  }

  cardBlockingIssues(card: BoardCard): any[] {
    return (card.issues || []).filter((issue: any) =>
      Boolean(issue?.isBlocking ?? issue?.is_blocking)
    );
  }

  cardIssueCodes(card: BoardCard): string {
    return this.cardBlockingIssues(card)
      .map((issue: any) => issue?.issueCode || issue?.issue_code || `#${issue?.id}`)
      .join(', ');
  }

  cardCompletedChildren(card: BoardCard): number {
    const childType = card.type === 'EPIC' ? 'STORY' : card.type === 'STORY' ? 'TASK' : null;
    if (!childType) return 0;
    return this.cards().filter(item =>
      item.type === childType &&
      Number(childType === 'STORY' ? item.epicId : item.storyId) === Number(card.id) &&
      this.normalizeStatus(item.status) === 'COMPLETED'
    ).length;
  }

  cardTotalChildren(card: BoardCard): number {
    const childType = card.type === 'EPIC' ? 'STORY' : card.type === 'STORY' ? 'TASK' : null;
    if (!childType) return 0;
    return this.cards().filter(item =>
      item.type === childType &&
      Number(childType === 'STORY' ? item.epicId : item.storyId) === Number(card.id)
    ).length;
  }

  moveCard(card: BoardCard, status: string): void {
    const nextStatus = this.normalizeStatus(status);
    const previousStatus = this.normalizeStatus(card.status);
    if (!card.id || !nextStatus || previousStatus === nextStatus) return;

    let url = '';
    if (card.type === 'EPIC') url = `${this.baseUrl}/epics/${card.id}`;
    if (card.type === 'STORY') url = `${this.baseUrl}/stories/${card.id}`;
    if (card.type === 'TASK') url = `${this.baseUrl}/tasks/${card.id}`;
    if (card.type === 'ISSUE') url = `${this.baseUrl}/v1/issues/${card.id}`;
    if (card.type === 'TEST_CASE') url = `${environment.apiBaseUrl2 || environment.apiBaseUrl || this.baseUrl}/v1/testcases/${card.id}`;
    if (!url) return;

    // Optimistic UI update keeps the Kanban responsive while the PUT is in flight.
    this.cards.set(this.cards().map(c =>
      c.key === card.key ? { ...c, status: nextStatus, raw: { ...(c.raw || {}), status: nextStatus } } : c
    ));

    const payload = { ...(card.raw || {}), status: nextStatus };
    const request=card.type==='TEST_CASE'?this.http.put(url,payload,this.headers()):this.http.patch(`${this.baseUrl}/tickets/${card.type}/${card.id}/placement`,{status:nextStatus},this.headers());
    request.subscribe({
      next: updated => {
        this.cards.set(this.cards().map(c =>
          c.key === card.key ? {...c,status:nextStatus,raw:{...c.raw,status:nextStatus}} : c
        ));
        this.errorMessage.set('');
        this.successMessage.set(`${card.code} moved to ${nextStatus.replace(/_/g, ' ')}.`);
        setTimeout(() => this.successMessage.set(''), 1800);
      },
      error: e => {
        this.cards.set(this.cards().map(c =>
          c.key === card.key ? { ...c, status: previousStatus, raw: { ...(c.raw || {}), status: previousStatus } } : c
        ));
        this.errorMessage.set(e?.error?.message || `Could not update ${card.type.toLowerCase()} status.`);
      }
    });
  }

  private toUpdatedCard(v: any, previous: BoardCard): BoardCard {
    return { ...previous, status: this.normalizeStatus(v?.status ?? previous.status), raw: v || previous.raw };
  }

  /**
   * Description shown by the work-item quick-view modal.
   *
   * Epics/Stories/Tasks use `description` in the API model. The additional
   * fallbacks keep the Board resilient to older API response shapes.
   */
  boardItemDescription(): string {
    const card = this.selectedBoardItem();
    if (!card) return '';

    const raw = card.raw ?? {};

    return String(
      raw.description ??
      raw.description_text ??
      raw.descriptionText ??
      raw.details ??
      ''
    ).trim();
  }

  /**
   * Resolves the team displayed in the work-item modal.
   *
   * The Epics model uses `team_id`; BoardCard normalizes that to `teamId`.
   * We also support nested/raw team representations returned by the API.
   */
  boardItemTeamName(card: BoardCard | null | undefined): string {
    if (!card) return 'No team';

    const raw = card.raw ?? {};
    const teamId =
      card.teamId ??
      raw.team_id ??
      raw.teamId ??
      raw.team?.id ??
      null;

    if (teamId !== null && teamId !== undefined && Number(teamId) > 0) {
      const team = this.teams().find(
        candidate => Number(candidate.id) === Number(teamId)
      );

      if (team?.name) {
        return String(team.name);
      }
    }

    const rawTeamName =
      raw.team_name ??
      raw.teamName ??
      raw.team?.name;

    return rawTeamName ? String(rawTeamName) : 'No team';
  }

  sprintName(sprintId: number | null | undefined): string {
    if (sprintId === null || sprintId === undefined || sprintId === 0) {
      return 'No sprint';
    }

    const sprint = this.sprints().find(
      s => Number(s.id) === Number(sprintId)
    );

    return sprint?.name || 'No sprint';
  }

  /** Returns the API-provided work-item URL when available, otherwise a stable app deep link. */
  workItemHref(card: BoardCard): string {
    const raw = card.raw || {};
    const suppliedUrl = raw.webUrl || raw.web_url || raw.href || raw.url || raw.selfUrl || raw.self_url;
    if (typeof suppliedUrl === 'string' && suppliedUrl.trim()) return suppliedUrl;

    const pathByType: Record<BoardCard['type'], string> = {
      EPIC: '/epics',
      STORY: '/stories',
      TASK: '/tasks',
      ISSUE: '/issues',
      TEST_CASE: '/testcases'
    };
    return `${pathByType[card.type]}?id=${encodeURIComponent(String(card.id))}`;
  }

  userName(userId: number | null | undefined): string {
    if (!userId) return 'Unassigned';

    const user = this.users().find(
      u => Number(u.id) === Number(userId)
    );

    return user?.name || 'Unassigned';
  }

  initials(userId: number | null | undefined): string {
    const name = this.userName(userId);

    if (name === 'Unassigned') return '?';

    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  columnCount(columnId: string): number {
    return this.columnCards()[columnId]?.length || 0;
  }

  trackByCard(_: number, card: BoardCard): string {
    return card.key;
  }
}
