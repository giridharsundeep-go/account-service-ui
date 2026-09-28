import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  Pipe,
  PipeTransform,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environment';
import { AuthService } from '../auth.service';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';

export interface Team {
  id: number;
  name: string;
}

export interface Sprint {
  id: number;
  projectId?: number;
  project_id?: number;
  name: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  capacity?: number;
}

export interface Issue {
  id: number;
  title: string;
  issueCode?: string;
  issue_code?: string;
  status?: string;
  isBlocking?: boolean;
  projectId?: number;
  project_id?: number;
  epicId?: number;
  epic_id?: number;
  storyId?: number;
  story_id?: number;
  taskId?: number;
  task_id?: number;
}

export interface TestCase {
  id: number;
  title?: string;
  name?: string;
  executionStatus?: string;
  projectId?: number;
  project_id?: number;
  epicId?: number;
  epic_id?: number;
  storyId?: number;
  story_id?: number;
  taskId?: number;
  task_id?: number;
}

export interface TaskNode {
  id?: number;
  story_id: number;
  sprint_id?: number | null;
  assignee_user_id?: number | null;
  reporter_user_id?: number | null;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  team_id?: number | null;
  expanded?: boolean;
  issues?: Issue[];
  testCases?: TestCase[];
}

export interface StoryNode {
  id?: number;
  project_id: number;
  epic_id?: number | null;
  sprint_id?: number | null;
  assignee_user_id?: number | null;
  reporter_user_id?: number | null;
  title: string;
  description?: string;
  story_points: number;
  status: string;
  priority: string;
  team_id?: number | null;
  expanded?: boolean;
  tasks?: TaskNode[];
  issues?: Issue[];
  testCases?: TestCase[];
}

export interface EpicNode {
  id?: number;
  project_id: number;
  sprint_id?: number | null;
  assignee_user_id?: number | null;
  reporter_user_id?: number | null;
  epic_code: string;
  name: string;
  description?: string;
  status: string;
  team_id?: number | null;
  expanded?: boolean;
  stories?: StoryNode[];
  issues?: Issue[];
  testCases?: TestCase[];
}

export interface SprintCycleGroup {
  sprint: Sprint;
  epics: EpicNode[];
  totalPoints: number;
}

export interface KanbanItem {
  type: 'EPIC' | 'STORY' | 'TASK';
  id?: number;
  title: string;
  code?: string;
  status: string;
  priority?: string;
  pointsOrHours?: number;
  assignee_user_id?: number | null;
  reporter_user_id?: number | null;
  issues?: Issue[];
  testCases?: TestCase[];
  originalItem: EpicNode | StoryNode | TaskNode;
}

@Pipe({
  name: 'resolveUser',
  standalone: true,
  pure: true
})
export class ResolveUserPipe implements PipeTransform {
  transform(userId: number | null | undefined, userMap: Map<number, any>): any {
    if (userId === null || userId === undefined) return null;
    return userMap.get(Number(userId)) || null;
  }
}

@Component({
  selector: 'app-epics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ResolveUserPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    DragDropModule
  ],
  templateUrl: './epics.html',
  styleUrls: ['./epics.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Epics implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly baseUrl = environment.apiBaseUrl;
  readonly baseUrl2 = environment.apiBaseUrl2;

  readonly statusPipeline = [
    'BACKLOG',
    'TODO',
    'IN_PROGRESS',
    'TESTING',
    'COMPLETED',
    'BLOCKED'
  ];

  readonly priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  projects = signal<any[]>([]);
  users = signal<any[]>([]);
  teams = signal<Team[]>([]);
  teamMembers = signal<any[]>([]);
  sprints = signal<Sprint[]>([]);
  hierarchyTree = signal<EpicNode[]>([]);
  projectTestcases = signal<TestCase[]>([]);
  projectIssues = signal<Issue[]>([]);
  storyModalEpics = signal<EpicNode[]>([]);
  projectStories = signal<StoryNode[]>([]);

  userMap = signal<Map<number, any>>(new Map());

  activeTab = signal<'TREE' | 'KANBAN'>('TREE');
  showFilters = signal(false);
  searchExpanded = signal(false);

  selectedProjectId = signal<number | null>(1);
  selectedSprintFilter = signal<number | 'ALL'>('ALL');
  selectedPriorityFilter = signal<string | 'ALL'>('ALL');
  selectedStatusFilter = signal<string | 'ALL'>('ALL');
  selectedTeamFilter = signal<number | 'ALL'>('ALL');
  selectedAssigneeFilter = signal<number | 'ALL'>('ALL');
  selectedReporterFilter = signal<number | 'ALL'>('ALL');
  selectedUserFilter = signal<number | null>(null);
  searchTerm = signal('');

  collapsedSprintIds = signal<Set<number>>(new Set());
  selectedItems = signal<Set<string>>(new Set());
  toastMessage = signal<string | null>(null);

  /*
   * Modal replaces the old side-drawer + external viewer flow.
   * VIEW, CREATE and EDIT all use the same centered Jira/Gmail-style card.
   */
  activeModal = signal<'NONE' | 'EPIC' | 'STORY' | 'TASK'>('NONE');
  modalMode = signal<'VIEW' | 'CREATE' | 'EDIT'>('VIEW');

  currentEpic: Partial<EpicNode> = {};
  currentStory: Partial<StoryNode> = {};
  currentTask: Partial<TaskNode> = {};

  testCasePopupOpen = signal(false);
  testCasePopupType = signal<'STORY' | 'TASK' | null>(null);
  testCasePopupTitle = signal('');
  testCasePopupItems = signal<TestCase[]>([]);

  availableStories = computed<StoryNode[]>(() => {
    const stories = this.projectStories();
    if (stories.length) return stories;
    const result: StoryNode[] = [];
    for (const epic of this.hierarchyTree()) {
      for (const story of epic.stories || []) result.push(story);
    }
    return result;
  });

  /*
   * Compatibility aliases for the currently attached HTML.
   * The template still calls these "drawer" names, while the component
   * internally uses the unified modal state.
   */
  readonly activeDrawer = this.activeModal;
  readonly drawerMode = this.modalMode;
  readonly isReadOnly = computed(() => this.modalMode() === 'VIEW');

  activeProjectName = computed(() => {
    const project = this.projects().find(
      p => Number(p.id) === Number(this.selectedProjectId())
    );
    return project?.name || 'Default Workspace';
  });

  projectSprints = computed(() => {
    const projectId = this.selectedProjectId();
    let list = [...this.sprints()];

    if (projectId) {
      list = list.filter(s => {
        const pid = s.projectId ?? s.project_id;
        return !pid || Number(pid) === Number(projectId);
      });
    }

    return list.sort((a, b) => {
      if (a.startDate && b.startDate) {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }
      return this.extractSprintNumber(a.name) - this.extractSprintNumber(b.name);
    });
  });

  activeCurrentSprint = computed<Sprint | null>(() => {
    const list = this.projectSprints();
    if (!list.length) return null;

    const now = Date.now();

    const dateActive = list.find(s => {
      if (!s.startDate || !s.endDate) return false;
      return now >= new Date(s.startDate).getTime() &&
        now <= new Date(s.endDate).getTime();
    });

    return dateActive ||
      list.find(s => (s.status || '').toUpperCase() === 'ACTIVE') ||
      list[0] ||
      null;
  });

  displayedKanbanSprint = computed<Sprint | null>(() => {
    const filter = this.selectedSprintFilter();
    const list = this.projectSprints();

    if (filter !== 'ALL') {
      return list.find(s => Number(s.id) === Number(filter)) ||
        this.activeCurrentSprint();
    }

    return this.activeCurrentSprint() ||
      list[0] ||
      { id: 0, name: 'All Sprint Cycles', status: 'ACTIVE' };
  });

  activeSprintUsers = computed(() => {
    const sprint = this.displayedKanbanSprint();
    if (!sprint) return [];

    const ids = new Set<number>();

    for (const epic of this.hierarchyTree()) {
      if (sprint.id === 0 || Number(epic.sprint_id) === Number(sprint.id)) {
        if (epic.assignee_user_id) ids.add(Number(epic.assignee_user_id));
      }

      for (const story of epic.stories || []) {
        if (sprint.id === 0 || Number(story.sprint_id) === Number(sprint.id)) {
          if (story.assignee_user_id) ids.add(Number(story.assignee_user_id));
        }

        for (const task of story.tasks || []) {
          if (sprint.id === 0 || Number(task.sprint_id) === Number(sprint.id)) {
            if (task.assignee_user_id) ids.add(Number(task.assignee_user_id));
          }
        }
      }
    }

    return [...ids]
      .map(id => this.userMap().get(id))
      .filter(Boolean);
  });

  sprintTreeGroups = computed<SprintCycleGroup[]>(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const sprintFilter = this.selectedSprintFilter();
    const priorityFilter = this.selectedPriorityFilter();
    const statusFilter = this.selectedStatusFilter();
    const teamFilter = this.selectedTeamFilter();
    const assigneeFilter = this.selectedAssigneeFilter();
    const reporterFilter = this.selectedReporterFilter();
    const userFilter = this.selectedUserFilter();

    const backlog: Sprint = {
      id: 0,
      name: 'Backlog / Unassigned',
      status: 'FUTURE'
    };

    const source = this.hierarchyTree();
    const allSprints = source.some(e => !e.sprint_id)
      ? [backlog, ...this.projectSprints()]
      : (this.projectSprints().length ? this.projectSprints() : [backlog]);

    const teamMatches = (item: any): boolean => {
      if (teamFilter === 'ALL') return true;
      if (Number(item.team_id) === Number(teamFilter)) return true;
      const user = item.assignee_user_id
        ? this.userMap().get(Number(item.assignee_user_id))
        : null;
      const userTeam = user?.team_id ?? user?.teamId ?? user?.team?.id;
      return Number(userTeam) === Number(teamFilter);
    };

    return allSprints
      .filter(s => sprintFilter === 'ALL' || Number(s.id) === Number(sprintFilter))
      .map(sprint => {
        const epics: EpicNode[] = [];
        let totalPoints = 0;

        for (const epic of source) {
          const epicSprint = epic.sprint_id ? Number(epic.sprint_id) : 0;
          if (epicSprint !== Number(sprint.id)) continue;

          if (statusFilter !== 'ALL' && epic.status !== statusFilter) continue;
          if (assigneeFilter !== 'ALL' &&
            Number(epic.assignee_user_id) !== Number(assigneeFilter)) continue;
          if (reporterFilter !== 'ALL' &&
            Number(epic.reporter_user_id) !== Number(reporterFilter)) continue;
          if (!teamMatches(epic)) continue;

          const epicSearch =
            !query ||
            (epic.name || '').toLowerCase().includes(query) ||
            (epic.epic_code || '').toLowerCase().includes(query);

          const stories = (epic.stories || []).filter(story => {
            if (priorityFilter !== 'ALL' && story.priority !== priorityFilter) return false;
            if (statusFilter !== 'ALL' && story.status !== statusFilter) return false;
            if (assigneeFilter !== 'ALL' &&
              Number(story.assignee_user_id) !== Number(assigneeFilter)) return false;
            if (reporterFilter !== 'ALL' &&
              Number(story.reporter_user_id) !== Number(reporterFilter)) return false;
            if (!teamMatches(story)) return false;
            if (userFilter !== null &&
              Number(story.assignee_user_id) !== Number(userFilter) &&
              !(story.tasks || []).some(t => Number(t.assignee_user_id) === Number(userFilter))) {
              return false;
            }

            const storySearch =
              !query ||
              (story.title || '').toLowerCase().includes(query);

            const tasks = (story.tasks || []).filter(task => {
              if (statusFilter !== 'ALL' && task.status !== statusFilter) return false;
              if (assigneeFilter !== 'ALL' &&
                Number(task.assignee_user_id) !== Number(assigneeFilter)) return false;
              if (reporterFilter !== 'ALL' &&
                Number(task.reporter_user_id) !== Number(reporterFilter)) return false;
              if (userFilter !== null &&
                Number(task.assignee_user_id) !== Number(userFilter)) return false;
              return !query || (task.title || '').toLowerCase().includes(query);
            });

            return storySearch || tasks.length > 0;
          });

          if (epicSearch || stories.length) {
            totalPoints += stories.reduce(
              (sum, s) => sum + Number(s.story_points || 0), 0
            );

            epics.push({
              ...epic,
              expanded: epic.expanded ?? true,
              stories: stories.map(s => ({
                ...s,
                expanded: s.expanded ?? true
              }))
            });
          }
        }

        return { sprint, epics, totalPoints };
      });
  });

  kanbanItemsByStatus = computed<Record<string, KanbanItem[]>>(() => {
    const map: Record<string, KanbanItem[]> = {};
    for (const status of this.statusPipeline) map[status] = [];

    for (const group of this.sprintTreeGroups()) {
      for (const epic of group.epics) {
        const epicStatus = (epic.status || 'BACKLOG').toUpperCase();

        if (map[epicStatus]) {
          map[epicStatus].push({
            type: 'EPIC',
            id: epic.id,
            title: epic.name,
            code: epic.epic_code,
            status: epicStatus,
            assignee_user_id: epic.assignee_user_id,
            reporter_user_id: epic.reporter_user_id,
            issues: epic.issues,
            testCases: epic.testCases,
            originalItem: epic
          });
        }

        for (const story of epic.stories || []) {
          const storyStatus = (story.status || 'BACKLOG').toUpperCase();

          if (map[storyStatus]) {
            map[storyStatus].push({
              type: 'STORY',
              id: story.id,
              title: story.title,
              code: `#${story.id}`,
              status: storyStatus,
              priority: story.priority,
              pointsOrHours: story.story_points,
              assignee_user_id: story.assignee_user_id,
              reporter_user_id: story.reporter_user_id,
              issues: story.issues,
              testCases: story.testCases,
              originalItem: story
            });
          }

          for (const task of story.tasks || []) {
            const taskStatus = (task.status || 'BACKLOG').toUpperCase();

            if (map[taskStatus]) {
              map[taskStatus].push({
                type: 'TASK',
                id: task.id,
                title: task.title,
                code: `#${task.id}`,
                status: taskStatus,
                priority: task.priority,
                assignee_user_id: task.assignee_user_id,
                reporter_user_id: task.reporter_user_id,
                issues: task.issues,
                testCases: task.testCases,
                originalItem: task
              });
            }
          }
        }
      }
    }

    return map;
  });

  ngOnInit(): void {
    this.fetchUsers();
    this.fetchTeams();
    this.fetchSprints(() => this.fetchProjects());
  }

  private headers() {
    return { headers: this.auth.getAuthHeaders() };
  }

  private extractArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (!res || typeof res !== 'object') return [];

    const preferredKeys = [
      'data', 'items', 'results', 'records',
      'projects', 'project',
      'users', 'user',
      'teams', 'team',
      'sprints', 'sprint',
      'epics', 'stories', 'tasks',
      'testCases', 'testcases', 'issues'
    ];

    for (const key of preferredKeys) {
      const value = (res as any)[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        const nested = this.extractArray(value);
        if (nested.length) return nested;
      }
    }

    return [];
  }

  private normalizeProject(raw: any): any {
    const id = Number(raw?.id ?? raw?.project_id ?? raw?.projectId);
    return {
      ...raw,
      id: Number.isFinite(id) ? id : raw?.id,
      name: raw?.name ?? raw?.project_name ?? raw?.projectName ?? raw?.title ?? `Project ${id || ''}`.trim()
    };
  }

  private normalizeTeam(raw: any): Team {
    const id = Number(raw?.id ?? raw?.team_id ?? raw?.teamId);
    return {
      ...raw,
      id,
      name: raw?.name ?? raw?.team_name ?? raw?.teamName ?? raw?.title ?? `Team ${id}`
    };
  }

  private normalizeSprint(raw: any): Sprint {
    const id = Number(raw?.id ?? raw?.sprint_id ?? raw?.sprintId);
    return {
      ...raw,
      id,
      projectId: this.nullableNumber(raw?.projectId ?? raw?.project_id ?? raw?.project?.id) ?? undefined,
      project_id: this.nullableNumber(raw?.project_id ?? raw?.projectId ?? raw?.project?.id) ?? undefined,
      name: raw?.name ?? raw?.sprint_name ?? raw?.sprintName ?? raw?.title ?? `Sprint ${id}`,
      startDate: raw?.startDate ?? raw?.start_date ?? raw?.start,
      endDate: raw?.endDate ?? raw?.end_date ?? raw?.end,
      status: String(raw?.status ?? 'FUTURE').toUpperCase(),
      capacity: Number(raw?.capacity ?? raw?.story_points_capacity ?? 30)
    };
  }

  private extractObject(res: any): any {
    if (!res || typeof res !== 'object') return res;
    if (res.data && !Array.isArray(res.data)) return res.data;
    if (res.item && typeof res.item === 'object') return res.item;
    if (res.result && typeof res.result === 'object' && !Array.isArray(res.result)) {
      return res.result;
    }
    return res;
  }

  private extractSprintNumber(name: string): number {
    const match = String(name || '').match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  private nullableNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private normalizeEpic(raw: any): EpicNode {
    const id = Number(raw?.id ?? raw?.epic_id ?? raw?.epicId);

    return {
      ...raw,
      id: Number.isFinite(id) && id > 0 ? id : undefined,
      project_id: Number(raw?.project_id ?? raw?.projectId ?? 0),
      sprint_id: this.nullableNumber(raw?.sprint_id ?? raw?.sprintId),
      epic_code: raw?.epic_code ?? raw?.epicCode ?? (id ? `EPIC-${id}` : ''),
      name: raw?.name ?? raw?.title ?? '',
      description: raw?.description ?? '',
      status: raw?.status ?? 'BACKLOG',
      assignee_user_id: this.nullableNumber(
        raw?.assignee_user_id ?? raw?.assigneeUserId
      ),
      reporter_user_id: this.nullableNumber(
        raw?.reporter_user_id ?? raw?.reporterUserId
      ),
      team_id: this.nullableNumber(raw?.team_id ?? raw?.teamId),
      issues: raw?.issues || [],
      testCases: raw?.testCases || [],
      stories: raw?.stories || []
    };
  }

  private normalizeStory(raw: any): StoryNode {
    const id = Number(raw?.id ?? raw?.story_id ?? raw?.storyId);

    return {
      ...raw,
      id: Number.isFinite(id) && id > 0 ? id : undefined,
      project_id: Number(raw?.project_id ?? raw?.projectId ?? 0),
      epic_id: this.nullableNumber(raw?.epic_id ?? raw?.epicId),
      sprint_id: this.nullableNumber(raw?.sprint_id ?? raw?.sprintId),
      title: raw?.title ?? '',
      description: raw?.description ?? '',
      story_points: Number(raw?.story_points ?? raw?.storyPoints ?? 0),
      status: raw?.status ?? 'BACKLOG',
      priority: raw?.priority ?? 'MEDIUM',
      assignee_user_id: this.nullableNumber(
        raw?.assignee_user_id ?? raw?.assigneeUserId
      ),
      reporter_user_id: this.nullableNumber(
        raw?.reporter_user_id ?? raw?.reporterUserId
      ),
      team_id: this.nullableNumber(raw?.team_id ?? raw?.teamId),
      expanded: raw?.expanded ?? true,
      issues: raw?.issues || [],
      testCases: raw?.testCases || [],
      tasks: raw?.tasks || []
    };
  }

  private normalizeTask(raw: any): TaskNode {
    const id = Number(raw?.id ?? raw?.task_id ?? raw?.taskId);

    return {
      ...raw,
      id: Number.isFinite(id) && id > 0 ? id : undefined,
      story_id: Number(raw?.story_id ?? raw?.storyId ?? 0),
      sprint_id: this.nullableNumber(raw?.sprint_id ?? raw?.sprintId),
      title: raw?.title ?? '',
      description: raw?.description ?? '',
      status: raw?.status ?? 'BACKLOG',
      priority: raw?.priority ?? 'MEDIUM',
      assignee_user_id: this.nullableNumber(
        raw?.assignee_user_id ?? raw?.assigneeUserId
      ),
      reporter_user_id: this.nullableNumber(
        raw?.reporter_user_id ?? raw?.reporterUserId
      ),
      team_id: this.nullableNumber(raw?.team_id ?? raw?.teamId),
      issues: raw?.issues || [],
      testCases: raw?.testCases || []
    };
  }

  private normalizeTestCase(raw: any): TestCase {
    return {
      ...raw,
      id: Number(raw?.id ?? raw?.testcase_id ?? raw?.testCaseId),
      title: raw?.title ?? raw?.name ?? '',
      name: raw?.name ?? raw?.title ?? '',
      executionStatus: raw?.executionStatus ?? raw?.execution_status ?? 'UNEXECUTED',
      projectId: this.nullableNumber(raw?.projectId ?? raw?.project_id) ?? undefined,
      epicId: this.nullableNumber(raw?.epicId ?? raw?.epic_id) ?? undefined,
      storyId: this.nullableNumber(raw?.storyId ?? raw?.story_id) ?? undefined,
      taskId: this.nullableNumber(raw?.taskId ?? raw?.task_id) ?? undefined
    };
  }

  private normalizeIssue(raw: any): Issue {
    return {
      ...raw,
      id: Number(raw?.id ?? raw?.issue_id ?? raw?.issueId),
      issueCode: raw?.issueCode ?? raw?.issue_code ?? raw?.code,
      projectId: this.nullableNumber(raw?.projectId ?? raw?.project_id) ?? undefined,
      epicId: this.nullableNumber(raw?.epicId ?? raw?.epic_id) ?? undefined,
      storyId: this.nullableNumber(raw?.storyId ?? raw?.story_id) ?? undefined,
      taskId: this.nullableNumber(raw?.taskId ?? raw?.task_id) ?? undefined
    };
  }

  private getCollection<T = any>(urls: string[]) {
    const tryNext = (index: number): any => {
      if (index >= urls.length) return of([] as T[]);
      return this.http.get<any>(urls[index], this.headers()).pipe(
        catchError(() => tryNext(index + 1))
      );
    };
    return tryNext(0);
  }

  fetchUsers(): void {
    this.getCollection([
      `${this.baseUrl}/user`,
      `${this.baseUrl}/users`
     ]).subscribe((res: any) => {
      const defaults = [
        'Lead Developer', 'Product Owner', 'Senior QA',
        'DevOps Lead', 'UX Designer'
      ];

      const users = this.extractArray(res)
        .map((u: any, index: number) => {
          const id = Number(u?.id ?? u?.user_id ?? u?.userId);
          return {
            ...u,
            id,
            user_id: id,
            team_id: this.nullableNumber(u?.team_id ?? u?.teamId ?? u?.team?.id),
            name: u?.name ?? u?.full_name ?? u?.fullName ?? u?.username ?? u?.email ?? `User ${index + 1}`,
            role: u?.role ?? u?.job_title ?? u?.jobTitle ?? u?.designation ?? defaults[index % defaults.length],
            avatarUrl: u?.avatarUrl ?? u?.avatar_url ?? u?.photoUrl ?? null
          };
        })
        .filter((u: any) => Number.isFinite(u.id) && u.id > 0);

      this.users.set(users);

      const map = new Map<number, any>();
      for (const user of users) map.set(Number(user.id), user);
      this.userMap.set(map);
    });
  }

  fetchTeams(): void {
    this.getCollection([
      `${this.baseUrl}/teams`,
      `${this.baseUrl}/team`
     ]).subscribe((res: any) => {
      const teams = this.extractArray(res)
        .map(v => this.normalizeTeam(v))
        .filter(t => Number.isFinite(t.id) && t.id > 0);
      this.teams.set(teams);
    });
  }

  fetchSprints(callback?: () => void): void {
    this.getCollection([
      `${this.baseUrl}/sprints`,
      `${this.baseUrl}/sprint`
     ]).subscribe((res: any) => {
      const sprints = this.extractArray(res)
        .map(v => this.normalizeSprint(v))
        .filter(s => Number.isFinite(s.id) && s.id > 0);

      this.sprints.set(sprints);

      const active = this.activeCurrentSprint();
      if (active && this.selectedSprintFilter() === 'ALL') {
        this.selectedSprintFilter.set(active.id);
      }

      callback?.();
    });
  }

  fetchProjects(): void {
    this.getCollection([
      `${this.baseUrl}/projects`,
      `${this.baseUrl}/project`
     ]).subscribe((res: any) => {
      const projects = this.extractArray(res)
        .map(v => this.normalizeProject(v))
        .filter((p: any) => Number.isFinite(Number(p.id)) && Number(p.id) > 0);

      this.projects.set(projects);

      if (!projects.length) {
        this.showToast('No projects returned by the Projects API');
        return;
      }

      const currentId = Number(this.selectedProjectId());
      const selected = projects.find((p: any) => Number(p.id) === currentId)
        ?? projects.find((p: any) => Number(p.id) === 1)
        ?? projects[0];

      this.selectedProjectId.set(Number(selected.id));
      this.selectedSprintFilter.set('ALL');
      this.loadFullHierarchy();
    });
  }

  loadFullHierarchy(): void {
    const projectId = this.selectedProjectId();
    if (!projectId) return;

    const epics$ = this.http
      .get<any>(`${this.baseUrl}/projects/${projectId}/epics`, this.headers())
      .pipe(catchError(() => of([])));

    const stories$ = this.http
      .get<any>(`${this.baseUrl}/projects/${projectId}/stories`, this.headers())
      .pipe(catchError(() => of([])));

    const tasks$ = this.http
      .get<any>(`${this.baseUrl}/tasks`, this.headers())
      .pipe(catchError(() => of([])));

    const testCases$ = this.http
      .get<any>(`${this.baseUrl2}/v1/testcases?projectId=${projectId}`, this.headers())
      .pipe(catchError(() => of([])));

    const issues$ = this.http
      .get<any>(`${this.baseUrl2}/v1/issues?projectId=${projectId}`, this.headers())
      .pipe(catchError(() => of([])));

    forkJoin([epics$, stories$, tasks$, testCases$, issues$])
      .subscribe(([epicRes, storyRes, taskRes, tcRes, issueRes]) => {
        const epics = this.extractArray(epicRes)
          .map(v => this.normalizeEpic(v))
          .filter(v => !!v.id);

        const stories = this.extractArray(storyRes)
          .map(v => this.normalizeStory(v))
          .filter(v => !!v.id);

        const tasks = this.extractArray(taskRes)
          .map(v => this.normalizeTask(v))
          .filter(v => !!v.id);

        const testCases = this.extractArray(tcRes)
          .map(v => this.normalizeTestCase(v));

        const issues = this.extractArray(issueRes)
          .map(v => this.normalizeIssue(v));

        this.projectTestcases.set(testCases);
        this.projectIssues.set(issues);
        this.projectStories.set(stories);

        const tree = epics.map(epic => ({
          ...epic,
          expanded: epic.expanded ?? true,
          issues: issues.filter(i => Number(i.epicId) === Number(epic.id)),
          testCases: testCases.filter(tc => Number(tc.epicId) === Number(epic.id)),
          stories: stories
            .filter(story => Number(story.epic_id) === Number(epic.id))
            .map(story => ({
              ...story,
              expanded: story.expanded ?? true,
              issues: issues.filter(i => Number(i.storyId) === Number(story.id)),
              testCases: testCases.filter(tc => Number(tc.storyId) === Number(story.id)),
              tasks: tasks
                .filter(task => Number(task.story_id) === Number(story.id))
                .map(task => ({
                  ...task,
                  issues: issues.filter(i => Number(i.taskId) === Number(task.id)),
                  testCases: testCases.filter(tc => Number(tc.taskId) === Number(task.id))
                }))
            }))
        }));

        this.hierarchyTree.set(tree);
      });
  }

  onProjectChange(projectId: number): void {
    const id = Number(projectId);
    if (!Number.isFinite(id) || id <= 0) return;

    this.selectedProjectId.set(id);
    this.selectedUserFilter.set(null);
    this.selectedAssigneeFilter.set('ALL');
    this.selectedReporterFilter.set('ALL');
    this.selectedTeamFilter.set('ALL');
    this.teamMembers.set([]);
    this.selectedSprintFilter.set('ALL');
    this.storyModalEpics.set([]);
    this.projectStories.set([]);

    this.fetchSprints(() => this.loadFullHierarchy());
  }

  onStoryProjectChange(projectId: number): void {
    const id = Number(projectId);
    if (!Number.isFinite(id) || id <= 0) {
      this.storyModalEpics.set([]);
      return;
    }

    this.currentStory.project_id = id;
    this.currentStory.epic_id = null;
    this.currentStory.sprint_id = null;
    this.loadEpicsForStoryProject(id);
  }

  onTeamFilterChange(teamId: number | 'ALL'): void {
    this.selectedTeamFilter.set(teamId);
    this.selectedUserFilter.set(null);

    if (teamId === 'ALL') {
      this.teamMembers.set([]);
      return;
    }

    this.http
      .get<any>(`${this.baseUrl}/team-members/team/${teamId}`, this.headers())
      .pipe(catchError(() => of([])))
      .subscribe(res => {
        const members = this.extractArray(res).map((m: any) => {
          const id = Number(m.user_id ?? m.id);
          const user = this.userMap().get(id);

          return {
            id,
            name: m.name ?? m.username ?? m.email ?? user?.name ?? `User ${id}`,
            role: m.role ?? user?.role ?? 'Member',
            avatarUrl: m.avatarUrl ?? m.avatar_url ?? user?.avatarUrl ?? null
          };
        });

        this.teamMembers.set(members);
      });
  }

  clearAllFilters(): void {
    this.selectedSprintFilter.set(this.activeCurrentSprint()?.id ?? 'ALL');
    this.selectedPriorityFilter.set('ALL');
    this.selectedStatusFilter.set('ALL');
    this.selectedTeamFilter.set('ALL');
    this.selectedAssigneeFilter.set('ALL');
    this.selectedReporterFilter.set('ALL');
    this.selectedUserFilter.set(null);
    this.searchTerm.set('');
    this.teamMembers.set([]);
    this.showToast('Filters reset');
  }

  filterByUser(userId: number | null): void {
    if (userId === null) {
      this.selectedUserFilter.set(null);
      return;
    }

    const current = this.selectedUserFilter();
    this.selectedUserFilter.set(
      current !== null && Number(current) === Number(userId)
        ? null
        : Number(userId)
    );
  }

  isUserSelected(userId: number): boolean {
    return this.selectedUserFilter() !== null &&
      Number(this.selectedUserFilter()) === Number(userId);
  }

  toggleSprintExpand(id: number): void {
    const set = new Set(this.collapsedSprintIds());

    if (set.has(id)) set.delete(id);
    else set.add(id);

    this.collapsedSprintIds.set(set);
  }

  isSprintExpanded(id: number): boolean {
    return !this.collapsedSprintIds().has(id);
  }

  toggleEpicExpand(epic: EpicNode): void {
    this.hierarchyTree.update(tree =>
      tree.map(e => e.id === epic.id
        ? { ...e, expanded: !e.expanded }
        : e
      )
    );
  }

  toggleStoryExpand(story: StoryNode): void {
    this.hierarchyTree.update(tree =>
      tree.map(epic => ({
        ...epic,
        stories: (epic.stories || []).map(s =>
          s.id === story.id
            ? { ...s, expanded: !s.expanded }
            : s
        )
      }))
    );
  }

  toggleItemSelection(type: string, id?: number): void {
    if (!id) return;

    const key = `${type}_${id}`;
    const next = new Set(this.selectedItems());

    if (next.has(key)) next.delete(key);
    else next.add(key);

    this.selectedItems.set(next);
  }

  isItemSelected(type: string, id?: number): boolean {
    return !!id && this.selectedItems().has(`${type}_${id}`);
  }

  toggleSelectAllForSprint(event: any, group: SprintCycleGroup): void {
    const next = new Set(this.selectedItems());

    for (const epic of group.epics) {
      if (epic.id) {
        event.checked
          ? next.add(`EPIC_${epic.id}`)
          : next.delete(`EPIC_${epic.id}`);
      }

      for (const story of epic.stories || []) {
        if (story.id) {
          event.checked
            ? next.add(`STORY_${story.id}`)
            : next.delete(`STORY_${story.id}`);
        }

        for (const task of story.tasks || []) {
          if (task.id) {
            event.checked
              ? next.add(`TASK_${task.id}`)
              : next.delete(`TASK_${task.id}`);
          }
        }
      }
    }

    this.selectedItems.set(next);
  }

  clearSelection(): void {
    this.selectedItems.set(new Set());
  }

  /*
   * ---------- MODAL / VIEWER ----------
   * No window.open(), no /viewer URL, no browser "Cannot GET".
   * The viewer is an in-app modal and uses the same layout as Edit.
   */


  private openViewerTab(
    type: 'EPIC' | 'STORY' | 'TASK' | 'ISSUE',
    id: number,
    projectId?: number | null
  ): void {
    const query = projectId
      ? `?projectId=${encodeURIComponent(projectId)}`
      : '';

    const url =
      `${window.location.origin}/viewer/${type}/${id}${query}`;

    const tab = window.open(url, '_blank', 'noopener,noreferrer');

    if (!tab) {
      this.showToast(
        'Please allow pop-ups to open the viewer in a new tab.'
      );
    }
  }

  openViewEpic(epic: EpicNode): void {
    const id = Number(epic?.id);

    if (!Number.isFinite(id) || id <= 0) {
      this.showToast('Invalid Epic ID');
      return;
    }

    this.openViewerTab(
      'EPIC',
      id,
      epic.project_id ?? this.selectedProjectId()
    );
  }

  openViewStory(story: StoryNode): void {
    const id = Number(story?.id);

    if (!Number.isFinite(id) || id <= 0) {
      this.showToast('Invalid Story ID');
      return;
    }

    this.openViewerTab(
      'STORY',
      id,
      story.project_id ?? this.selectedProjectId()
    );
  }

  openViewTask(task: TaskNode): void {
    const id = Number(task?.id);

    if (!Number.isFinite(id) || id <= 0) {
      this.showToast('Invalid Task ID');
      return;
    }

    this.openViewerTab(
      'TASK',
      id,
      this.selectedProjectId()
    );
  }

  openViewIssue(issue: Issue): void {
    const id = Number(issue?.id);
    if (!Number.isFinite(id) || id <= 0) {
      this.showToast('Invalid Issue ID');
      return;
    }
    const url = `${window.location.origin}/viewer/issue/${id}?projectId=${this.selectedProjectId()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private getAuthenticatedUserId(): number | null {
    const readValue = (value: any): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    const keys = ['user', 'currentUser', 'loggedInUser', 'authUser', 'user_id', 'userId'];
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of keys) {
        const raw = storage.getItem(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          const id = readValue(parsed?.id ?? parsed?.user_id ?? parsed?.userId);
          if (id) return id;
        } catch {
          const id = readValue(raw);
          if (id) return id;
        }
      }

      const token = storage.getItem('token') || storage.getItem('access_token') || storage.getItem('accessToken');
      if (token && token.split('.').length === 3) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          const id = readValue(payload?.id ?? payload?.user_id ?? payload?.userId ?? payload?.sub);
          if (id) return id;
        } catch {
          // Ignore malformed/non-JWT tokens and continue without auto assignment.
        }
      }
    }

    return null;
  }

  openCreateEpic(): void {
    this.currentEpic = {
      project_id: this.selectedProjectId() || 0,
      epic_code: '',
      name: '',
      description: '',
      status: 'BACKLOG',
      sprint_id: null,
      assignee_user_id: this.getAuthenticatedUserId(),
      reporter_user_id: this.getAuthenticatedUserId(),
      team_id: null,
      issues: [],
      stories: []
    };

    this.modalMode.set('CREATE');
    this.activeModal.set('EPIC');
  }

  openEditEpic(epic: EpicNode): void {
    this.currentEpic = { ...epic };
    this.modalMode.set('EDIT');
    this.activeModal.set('EPIC');
  }

  openCreateStory(epic?: EpicNode): void {
    const projectId = this.selectedProjectId() || 0;

    this.currentStory = {
      project_id: projectId,
      epic_id: epic?.id ?? null,
      sprint_id: epic?.sprint_id ?? null,
      title: '',
      description: '',
      story_points: 0,
      status: 'BACKLOG',
      priority: 'MEDIUM',
      assignee_user_id: this.getAuthenticatedUserId(),
      reporter_user_id: this.getAuthenticatedUserId(),
      team_id: null,
      issues: [],
      testCases: [],
      tasks: []
    };

    this.loadEpicsForStoryProject(projectId);
    this.modalMode.set('CREATE');
    this.activeModal.set('STORY');
  }

  openEditStory(story: StoryNode): void {
    const id = Number(story.id);

    if (!Number.isFinite(id) || id <= 0) {
      this.showToast('Invalid Story ID');
      return;
    }

    this.currentStory = {
      ...this.normalizeStory(story),
      id,
      testCases: this.getTestCasesForStory(id)
    };

    this.loadEpicsForStoryProject(Number(this.currentStory.project_id));
    this.modalMode.set('EDIT');
    this.activeModal.set('STORY');
  }

  openCreateTask(story?: StoryNode): void {
    this.currentTask = {
      story_id: Number(story?.id ?? 0),
      sprint_id: story?.sprint_id ?? null,
      title: '',
      description: '',
      status: 'BACKLOG',
      priority: 'MEDIUM',
      assignee_user_id: this.getAuthenticatedUserId(),
      reporter_user_id: this.getAuthenticatedUserId(),
      team_id: null,
      issues: [],
      testCases: []
    };

    this.modalMode.set('CREATE');
    this.activeModal.set('TASK');
  }

  openEditTask(task: TaskNode): void {
    const id = Number(task.id);

    if (!Number.isFinite(id) || id <= 0) {
      this.showToast('Invalid Task ID');
      return;
    }

    this.currentTask = {
      ...this.normalizeTask(task),
      id,
      testCases: this.getTestCasesForTask(id)
    };

    this.modalMode.set('EDIT');
    this.activeModal.set('TASK');
  }

  openEditKanbanItem(item: KanbanItem): void {
    if (item.type === 'EPIC') this.openViewEpic(item.originalItem as EpicNode);
    if (item.type === 'STORY') this.openViewStory(item.originalItem as StoryNode);
    if (item.type === 'TASK') this.openViewTask(item.originalItem as TaskNode);
  }

  enableEditMode(): void {
    this.modalMode.set('EDIT');

    if (this.activeModal() === 'STORY' && this.currentStory.project_id) {
      this.loadEpicsForStoryProject(Number(this.currentStory.project_id));
    }
  }

  closeModal(): void {
    this.activeModal.set('NONE');
    this.modalMode.set('VIEW');
    this.currentEpic = {};
    this.currentStory = {};
    this.currentTask = {};
  }

  closeDrawers(): void {
    this.closeModal();
  }

  /*
   * ---------- SAVE ----------
   */

  saveEpic(): void {
    const name = String(this.currentEpic.name || '').trim();
    const projectId = Number(this.currentEpic.project_id);

    if (!name || !projectId) {
      this.showToast('Epic name and project are required');
      return;
    }

    const id = this.currentEpic.id ? Number(this.currentEpic.id) : null;

    const payload = {
      project_id: projectId,
      epic_code: this.currentEpic.epic_code || null,
      name,
      description: this.currentEpic.description || '',
      status: this.currentEpic.status || 'BACKLOG',
      sprint_id: this.nullableNumber(this.currentEpic.sprint_id),
      assignee_user_id: this.nullableNumber(this.currentEpic.assignee_user_id),
      reporter_user_id: this.nullableNumber(this.currentEpic.reporter_user_id),
      team_id: this.nullableNumber(this.currentEpic.team_id)
    };

    const request = id
      ? this.http.put(`${this.baseUrl}/epics/${id}`, payload, this.headers())
      : this.http.post(`${this.baseUrl}/epics/create`, payload, this.headers());

    request.subscribe({
      next: () => {
        this.showToast(id ? `Epic #${id} updated` : 'Epic created successfully');
        this.closeModal();
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Epic save failed', error);
        this.showToast(
          error?.error?.message ||
          error?.error?.error ||
          'Could not save Epic'
        );
      }
    });
  }

  saveStory(): void {
    const title = String(this.currentStory.title || '').trim();
    const projectId = Number(this.currentStory.project_id);
    const id = this.currentStory.id != null
      ? Number(this.currentStory.id)
      : null;

    if (!title) {
      this.showToast('Story title is required');
      return;
    }

    if (!Number.isFinite(projectId) || projectId <= 0) {
      this.showToast('Please select a valid project');
      return;
    }

    const isCreate = id === null || !Number.isFinite(id) || id <= 0;

    const payload = {
      title,
      description: String(this.currentStory.description || ''),
      story_points: Number(this.currentStory.story_points || 0),
      status: this.currentStory.status || 'BACKLOG',
      priority: this.currentStory.priority || 'MEDIUM',
      project_id: projectId,
      epic_id: this.nullableNumber(this.currentStory.epic_id),
      sprint_id: this.nullableNumber(this.currentStory.sprint_id),
      assignee_user_id: this.nullableNumber(this.currentStory.assignee_user_id),
      reporter_user_id: this.nullableNumber(this.currentStory.reporter_user_id),
      team_id: this.nullableNumber(this.currentStory.team_id)
    };

    const url = isCreate
      ? `${this.baseUrl}/stories/create`
      : `${this.baseUrl}/stories/${id}`;

    const request = isCreate
      ? this.http.post<any>(url, payload, this.headers())
      : this.http.put<any>(url, payload, this.headers());

    request.subscribe({
      next: response => {
        const entity = this.extractObject(response);
        const returnedId = Number(
          entity?.id ??
          entity?.story_id ??
          entity?.storyId ??
          id
        );

        /*
         * UPDATE succeeds even when the API returns 200/204 without an ID.
         */
        if (!isCreate && id) {
          this.showToast(`Story #${id} updated successfully`);
        } else if (Number.isFinite(returnedId) && returnedId > 0) {
          this.showToast(`Story #${returnedId} created successfully`);
        } else {
          this.showToast('Story created successfully');
        }

        this.closeModal();
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Story save failed', {
          status: error?.status,
          url: error?.url,
          error: error?.error
        });

        this.showToast(
          error?.error?.message ||
          error?.error?.error ||
          (isCreate ? 'Could not create Story' : 'Could not update Story')
        );
      }
    });
  }

  saveTask(): void {
    const title = String(this.currentTask.title || '').trim();
    const storyId = Number(this.currentTask.story_id);
    const id = this.currentTask.id != null
      ? Number(this.currentTask.id)
      : null;

    if (!title || !storyId) {
      this.showToast('Task title and parent Story are required');
      return;
    }

    const isCreate = id === null || !Number.isFinite(id) || id <= 0;

    const payload = {
      title,
      description: String(this.currentTask.description || ''),
      status: this.currentTask.status || 'BACKLOG',
      priority: this.currentTask.priority || 'MEDIUM',
      story_id: storyId,
      sprint_id: this.nullableNumber(this.currentTask.sprint_id),
      assignee_user_id: this.nullableNumber(this.currentTask.assignee_user_id),
      reporter_user_id: this.nullableNumber(this.currentTask.reporter_user_id),
      team_id: this.nullableNumber(this.currentTask.team_id)
    };

    const url = isCreate
      ? `${this.baseUrl}/tasks/create`
      : `${this.baseUrl}/tasks/${id}`;

    const request = isCreate
      ? this.http.post<any>(url, payload, this.headers())
      : this.http.put<any>(url, payload, this.headers());

    request.subscribe({
      next: response => {
        const entity = this.extractObject(response);
        const returnedId = Number(
          entity?.id ??
          entity?.task_id ??
          entity?.taskId ??
          id
        );

        this.showToast(
          isCreate
            ? (returnedId > 0 ? `Task #${returnedId} created successfully` : 'Task created successfully')
            : `Task #${id} updated successfully`
        );

        this.closeModal();
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Task save failed', error);
        this.showToast(
          error?.error?.message ||
          error?.error?.error ||
          (isCreate ? 'Could not create Task' : 'Could not update Task')
        );
      }
    });
  }

  /*
   * ---------- STATUS / BULK ----------
   */

  updateEpicStatus(epic: EpicNode, status: string): void {
    if (!epic.id) return;

    this.http.put(
      `${this.baseUrl}/epics/${epic.id}`,
      { status },
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`Epic updated to ${status}`);
        this.loadFullHierarchy();
      },
      error: () => this.showToast('Could not update Epic status')
    });
  }

  updateStoryStatus(story: StoryNode, status: string): void {
    if (!story.id) return;

    this.http.put(
      `${this.baseUrl}/stories/${story.id}`,
      { status },
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`Story #${story.id} updated to ${status}`);
        this.loadFullHierarchy();
      },
      error: () => this.showToast('Could not update Story status')
    });
  }

  updateTaskStatus(task: TaskNode, status: string): void {
    if (!task.id) return;

    this.http.put(
      `${this.baseUrl}/tasks/${task.id}`,
      { status },
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`Task #${task.id} updated to ${status}`);
        this.loadFullHierarchy();
      },
      error: () => this.showToast('Could not update Task status')
    });
  }

  bulkUpdateStatus(status: string): void {
    const selected = [...this.selectedItems()];
    if (!selected.length) return;

    const requests = selected.map(key => {
      const [type, idText] = key.split('_');
      const id = Number(idText);

      if (type === 'EPIC') {
        return this.http.put(`${this.baseUrl}/epics/${id}`, { status }, this.headers());
      }

      if (type === 'STORY') {
        return this.http.put(`${this.baseUrl}/stories/${id}`, { status }, this.headers());
      }

      return this.http.put(`${this.baseUrl}/tasks/${id}`, { status }, this.headers());
    });

    forkJoin(requests).subscribe({
      next: () => {
        this.showToast(`Updated ${selected.length} items`);
        this.clearSelection();
        this.loadFullHierarchy();
      },
      error: () => this.showToast('Bulk update failed')
    });
  }

  bulkMoveSprint(sprintId: number): void {
    const selected = [...this.selectedItems()];
    if (!selected.length) return;

    const requests = selected.map(key => {
      const [type, idText] = key.split('_');
      const id = Number(idText);

      if (type === 'EPIC') {
        return this.http.put(`${this.baseUrl}/epics/${id}`, { sprint_id: sprintId }, this.headers());
      }

      if (type === 'STORY') {
        return this.http.put(`${this.baseUrl}/stories/${id}`, { sprint_id: sprintId }, this.headers());
      }

      return this.http.put(`${this.baseUrl}/tasks/${id}`, { sprint_id: sprintId }, this.headers());
    });

    forkJoin(requests).subscribe({
      next: () => {
        this.showToast(`Moved ${selected.length} items`);
        this.clearSelection();
        this.loadFullHierarchy();
      },
      error: () => this.showToast('Bulk sprint move failed')
    });
  }

  bulkDeleteSelected(): void {
    if (!confirm('Delete the selected items?')) return;

    const selected = [...this.selectedItems()];

    const requests = selected.map(key => {
      const [type, idText] = key.split('_');
      const id = Number(idText);

      if (type === 'EPIC') {
        return this.http.delete(`${this.baseUrl}/epics/${id}`, this.headers());
      }

      if (type === 'STORY') {
        return this.http.delete(`${this.baseUrl}/stories/${id}`, this.headers());
      }

      return this.http.delete(`${this.baseUrl}/tasks/${id}`, this.headers());
    });

    forkJoin(requests).subscribe({
      next: () => {
        this.showToast(`Deleted ${selected.length} items`);
        this.clearSelection();
        this.loadFullHierarchy();
      },
      error: () => this.showToast('Bulk delete failed')
    });
  }

  /*
   * ---------- DRAG / SPRINT ----------
   */

  onSprintDrop(
    event: CdkDragDrop<EpicNode[]>,
    sprintId: number
  ): void {
    const epic = event.previousContainer.data[event.previousIndex];
    if (!epic?.id) return;

    const target = sprintId === 0 ? null : sprintId;

    this.http.put(
      `${this.baseUrl}/epics/${epic.id}`,
      { sprint_id: target },
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`Moved ${epic.epic_code} to sprint`);
        this.loadFullHierarchy();
      },
      error: () => this.showToast('Could not move Epic')
    });
  }

  onKanbanDrop(
    event: CdkDragDrop<KanbanItem[]>,
    status: string
  ): void {
    const item = event.previousContainer.data[event.previousIndex];
    if (!item) return;

    if (item.type === 'EPIC') {
      this.updateEpicStatus(item.originalItem as EpicNode, status);
    } else if (item.type === 'STORY') {
      this.updateStoryStatus(item.originalItem as StoryNode, status);
    } else {
      this.updateTaskStatus(item.originalItem as TaskNode, status);
    }
  }

  startSprint(sprint: Sprint): void {
    this.http.put(
      `${this.baseUrl}/sprints/${sprint.id}`,
      { ...sprint, status: 'ACTIVE' },
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`${sprint.name} started`);
        this.fetchSprints();
      }
    });
  }

  completeSprint(sprint: Sprint): void {
    this.http.put(
      `${this.baseUrl}/sprints/${sprint.id}`,
      { ...sprint, status: 'CLOSED' },
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`${sprint.name} completed`);
        this.fetchSprints();
      }
    });
  }

  /*
   * ---------- ISSUES / TEST CASES ----------
   */

  removeIssueFromItem(item: any, issue: Issue, type: string): void {
    this.http.put(
      `${this.baseUrl2}/v1/issues/${issue.id}/unassign`,
      { type, id: item.id },
      this.headers()
    ).pipe(
      catchError(() => of(null))
    ).subscribe(() => {
      item.issues = (item.issues || []).filter((i: Issue) => i.id !== issue.id);
      this.showToast(`Removed ${issue.issueCode || issue.id}`);
      this.loadFullHierarchy();
    });
  }

  loadEpicsForStoryProject(projectId: number): void {
    if (!projectId) {
      this.storyModalEpics.set([]);
      return;
    }

    this.http
      .get<any>(`${this.baseUrl}/projects/${projectId}/epics`, this.headers())
      .pipe(catchError(() => of([])))
      .subscribe(res => {
        this.storyModalEpics.set(
          this.extractArray(res).map(v => this.normalizeEpic(v))
        );
      });
  }

  getTestCasesForStory(id?: number | null): TestCase[] {
    if (!id) return [];

    return this.projectTestcases()
      .filter(tc => Number(tc.storyId ?? tc.story_id) === Number(id))
      .map(tc => ({ ...tc }));
  }

  getTestCasesForTask(id?: number | null): TestCase[] {
    if (!id) return [];

    return this.projectTestcases()
      .filter(tc => Number(tc.taskId ?? tc.task_id) === Number(id))
      .map(tc => ({ ...tc }));
  }

  openTestCasesPopup(
    item: Partial<StoryNode> | Partial<TaskNode>,
    type: 'STORY' | 'TASK'
  ): void {
    const id = Number(item.id);

    this.testCasePopupType.set(type);
    this.testCasePopupTitle.set(
      `${type === 'STORY' ? 'Story' : 'Task'} #${id} · Test Cases`
    );

    this.testCasePopupItems.set(
      type === 'STORY'
        ? this.getTestCasesForStory(id)
        : this.getTestCasesForTask(id)
    );

    this.testCasePopupOpen.set(true);
  }

  closeTestCasesPopup(): void {
    this.testCasePopupOpen.set(false);
    this.testCasePopupType.set(null);
    this.testCasePopupTitle.set('');
    this.testCasePopupItems.set([]);
  }

  getTestCaseCode(tc: TestCase): string {
    return (tc as any).testCaseCode ||
      (tc as any).code ||
      `TC-${tc.id}`;
  }

  /*
   * ---------- CSV ----------
   */

  exportToCSV(): void {
    const rows: string[][] = [
      ['Type', 'Code', 'Title', 'Status', 'Priority', 'Points', 'Sprint']
    ];

    for (const epic of this.hierarchyTree()) {
      rows.push([
        'EPIC',
        epic.epic_code,
        epic.name,
        epic.status,
        '',
        '',
        String(epic.sprint_id ?? 'Unassigned')
      ]);

      for (const story of epic.stories || []) {
        rows.push([
          'STORY',
          `#${story.id}`,
          story.title,
          story.status,
          story.priority,
          String(story.story_points || 0),
          String(story.sprint_id ?? 'Unassigned')
        ]);

        for (const task of story.tasks || []) {
          rows.push([
            'TASK',
            `#${task.id}`,
            task.title,
            task.status,
            task.priority || '',
            '',
            String(task.sprint_id ?? 'Unassigned')
          ]);
        }
      }
    }

    const csv = rows
      .map(row => row.map(cell =>
        `"${String(cell).replace(/"/g, '""')}"`
      ).join(','))
      .join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `workspace-${Date.now()}.csv`;
    link.click();

    URL.revokeObjectURL(url);

    this.showToast('Workspace exported');
  }

  triggerCSVImport(event: any): void {
    const file = event?.target?.files?.[0];
    if (!file) return;

    /*
     * The previous implementation only read the file and did not actually
     * import anything. Keep this safe: the UI acknowledges the file without
     * pretending that backend rows were created.
     */
    const reader = new FileReader();

    reader.onload = () => {
      this.showToast(
        'CSV loaded. Use the Create actions to persist imported rows.'
      );
    };

    reader.readAsText(file);
    event.target.value = '';
  }

  /*
   * ---------- HELPERS ----------
   */

  getUserInitials(name?: string): string {
    const value = String(name || 'U').trim();
    if (!value) return 'U';

    const parts = value.split(/\s+/);

    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return value.substring(0, 2).toUpperCase();
  }

  trackByUserId(index: number, user: any): number {
    return Number(user?.id ?? user?.user_id ?? index);
  }

  trackByStoryId(index: number, story: StoryNode): number {
    return Number(story.id ?? index);
  }

  trackByTestCaseId(index: number, tc: TestCase): number {
    return Number(tc.id ?? index);
  }

  execEditor(command: string, value?: string): void {
    try {
      document.execCommand(command, false, value);
    } catch (error) {
      console.warn('Editor command failed:', error);
    }
  }

  insertEditorLink(): void {
    const url = window.prompt('Enter URL');
    if (!url) return;
    this.execEditor('createLink', url);
  }

  showToast(message: string): void {
    this.toastMessage.set(message);

    window.setTimeout(() => {
      this.toastMessage.set(null);
    }, 3200);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcuts(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;

    if (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.tagName === 'MAT-SELECT'
    ) {
      return;
    }

    if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      this.openCreateStory();
    }

    if (event.key === '/') {
      event.preventDefault();
      this.showFilters.set(true);
      this.searchExpanded.set(true);

      setTimeout(() => {
        document.querySelector<HTMLInputElement>('.search-input')?.focus();
      });
    }

    if (event.key === 'Escape') {
      if (this.testCasePopupOpen()) {
        this.closeTestCasesPopup();
      } else if (this.activeModal() !== 'NONE') {
        this.closeModal();
      }
    }
  }

  openViewer(type: 'epic' | 'story' | 'task', id?: number): void {
    if (!id) {
      this.showToast(`Invalid ${type} ID`);
      return;
    }

    const url = `${window.location.origin}/viewer/${type}/${id}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  }

   toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  statusClass(value: unknown): string {
    return String(value ?? 'BACKLOG')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/_/g, '-');
  }

}
