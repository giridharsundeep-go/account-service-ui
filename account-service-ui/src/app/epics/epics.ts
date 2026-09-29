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
  description?: string;
  issueCode?: string;
  issue_code?: string;
  status?: string;
  isBlocking?: boolean;
  is_blocking?: boolean;
  projectId?: number;
  project_id?: number;
  sprintId?: number | null;
  sprint_id?: number | null;
  assignee_user_id?: number | null;
  assigneeUserId?: number | null;
  reporter_user_id?: number | null;
  reporterUserId?: number | null;
  user_id?: number | null;
  userId?: number | null;
  creator_user_id?: number | null;
  creatorUserId?: number | null;
  epicId?: number;
  epic_id?: number;
  storyId?: number;
  story_id?: number;
  taskId?: number;
  task_id?: number;
  epicIds?: number[];
  storyIds?: number[];
  taskIds?: number[];
  allocations?: Array<{
    id?: number;
    allocatableType?: string;
    allocatable_type?: string;
    allocatableId?: number;
    allocatable_id?: number;
  }>;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
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

export interface EpicDirectoryItem {
  epic: EpicNode;
  storyCount: number;
  completedStoryCount: number;
  taskCount: number;
  completedTaskCount: number;
  issueCount: number;
  points: number;
}

export interface StoryDirectoryItem {
  story: StoryNode;
  epicName: string;
  epicCode: string;
  taskCount: number;
  completedTaskCount: number;
}

export interface TaskDirectoryItem {
  task: TaskNode;
  storyTitle: string;
  epicName: string;
}

export interface EpicDirectoryGroup {
  sprint: Sprint;
  items: EpicDirectoryItem[];
}

export interface StoryDirectoryGroup {
  sprint: Sprint;
  items: StoryDirectoryItem[];
}

export interface TaskDirectoryGroup {
  sprint: Sprint;
  items: TaskDirectoryItem[];
}

export interface ProgressStatusMetrics {
  total: number;
  completed: number;
  inProgress: number;
  testing: number;
  blocked: number;
  backlog: number;
  todo: number;
  completionRate: number;
}

export interface SprintProgress {
  sprint: Sprint;
  overallCompletionRate: number;
  completedWorkItems: number;
  totalWorkItems: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
  epics: ProgressStatusMetrics;
  stories: ProgressStatusMetrics;
  tasks: ProgressStatusMetrics;
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
  parentStoryTitle?: string;
  parentEpicName?: string;
  parentEpicCode?: string;
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

  readonly baseUrl = environment.apiBaseUrlM;
  readonly baseUrl2 = environment.apiBaseUrlM;

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

  /**
   * Primary workspace presentation:
   * EPICS  = only Epics
   * STORIES = only Stories
   * TASKS = only Tasks
   * ALL = complete Epic -> Story -> Task hierarchy grouped by Sprint
   */
  workItemMode = signal<'EPICS' | 'STORIES' | 'TASKS' | 'ALL' | 'ISSUES'>('EPICS');

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
  activeModal = signal<'NONE' | 'EPIC' | 'STORY' | 'TASK' | 'ISSUE'>('NONE');
  modalMode = signal<'VIEW' | 'CREATE' | 'EDIT'>('VIEW');

  currentEpic: Partial<EpicNode> = {};
  currentStory: Partial<StoryNode> = {};
  currentTask: Partial<TaskNode> = {};
  currentIssue: Partial<Issue> = {};

  /** Linked work state for the integrated Issues tab. */
  selectedIssueEpicIds = signal<number[]>([]);
  selectedIssueStoryIds = signal<number[]>([]);
  selectedIssueTaskIds = signal<number[]>([]);
  issueDraftSprintId = signal<number | null>(null);

  /** Optional Issues-tab scope opened from a specific Epic / Story / Task. */
  issueLinkFilter = signal<{ type: 'EPIC' | 'STORY' | 'TASK'; id: number } | null>(null);

  /** Person autocomplete state for Assignee / Reporter fields. */
  assigneeSearchTerm = signal('');
  reporterSearchTerm = signal('');
  personAutocompleteOpen = signal<'ASSIGNEE' | 'REPORTER' | null>(null);

  filteredAssigneeUsers = computed(() => this.filterUsers(this.assigneeSearchTerm()));
  filteredReporterUsers = computed(() => this.filterUsers(this.reporterSearchTerm()));

  testCasePopupOpen = signal(false);
  testCasePopupType = signal<'STORY' | 'TASK' | null>(null);
  testCasePopupTitle = signal('');
  testCasePopupItems = signal<TestCase[]>([]);

  sprintProgressOpen = signal(false);
  sprintProgress = signal<SprintProgress | null>(null);

  availableStories = computed<StoryNode[]>(() => {
    const stories = this.projectStories();
    if (stories.length) return stories;
    const result: StoryNode[] = [];
    for (const epic of this.hierarchyTree()) {
      for (const story of epic.stories || []) result.push(story);
    }
    return result;
  });

  issueAvailableEpics = computed<EpicNode[]>(() => {
    return [...this.hierarchyTree()];
  });

  issueAvailableStories = computed<StoryNode[]>(() => {
    const selected = new Set(
      this.selectedIssueEpicIds().map(Number)
    );

    const all = this.availableStories();
    if (!selected.size) return all;

    return all.filter(story =>
      story.epic_id != null && selected.has(Number(story.epic_id))
    );
  });

  issueAvailableTasks = computed<TaskNode[]>(() => {
    const selected = new Set(
      this.selectedIssueStoryIds().map(Number)
    );

    const all = this.hierarchyTree()
      .flatMap(epic => epic.stories || [])
      .flatMap(story => story.tasks || []);

    if (!selected.size) return all;

    return all.filter(task =>
      task.story_id != null && selected.has(Number(task.story_id))
    );
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


  private matchesTeamFilter(item: any): boolean {
    const teamFilter = this.selectedTeamFilter();

    if (teamFilter === 'ALL') return true;
    if (Number(item?.team_id) === Number(teamFilter)) return true;

    const userId = item?.assignee_user_id;
    const user = userId
      ? this.userMap().get(Number(userId))
      : null;

    const userTeam = user?.team_id ?? user?.teamId ?? user?.team?.id;
    return Number(userTeam) === Number(teamFilter);
  }

  private matchesSprintFilter(item: any): boolean {
    const sprintFilter = this.selectedSprintFilter();

    if (sprintFilter === 'ALL') return true;

    const sprintId = item?.sprint_id ?? item?.sprintId ?? null;

    return Number(sprintId || 0) === Number(sprintFilter);
  }

  private matchesCommonDirectoryFilters(item: any): boolean {
    const statusFilter = this.selectedStatusFilter();
    const assigneeFilter = this.selectedAssigneeFilter();
    const reporterFilter = this.selectedReporterFilter();
    const userFilter = this.selectedUserFilter();

    if (!this.matchesSprintFilter(item)) return false;

    if (
      statusFilter !== 'ALL' &&
      String(item?.status || '').toUpperCase() !== String(statusFilter).toUpperCase()
    ) {
      return false;
    }

    if (
      assigneeFilter !== 'ALL' &&
      Number(item?.assignee_user_id) !== Number(assigneeFilter)
    ) {
      return false;
    }

    if (
      reporterFilter !== 'ALL' &&
      Number(item?.reporter_user_id) !== Number(reporterFilter)
    ) {
      return false;
    }

    if (
      userFilter !== null &&
      Number(item?.assignee_user_id) !== Number(userFilter)
    ) {
      return false;
    }

    return this.matchesTeamFilter(item);
  }

  private modeSearchMatches(values: unknown[]): boolean {
    const query = this.searchTerm().trim().toLowerCase();

    if (!query) return true;

    return values.some(value =>
      String(value ?? '').toLowerCase().includes(query)
    );
  }

  epicDirectoryGroups = computed<EpicDirectoryGroup[]>(() => {
    const grouped = new Map<number, EpicDirectoryItem[]>();

    for (const epic of this.hierarchyTree()) {
      if (!this.matchesCommonDirectoryFilters(epic)) continue;

      if (!this.modeSearchMatches([
        epic.epic_code,
        epic.name,
        epic.description,
        epic.status
      ])) {
        continue;
      }

      const storyItems = epic.stories || [];
      const points = storyItems.reduce(
        (sum, story) => sum + Number(story.story_points || 0),
        0
      );

      const item: EpicDirectoryItem = {
        epic,
        storyCount: storyItems.length,
        completedStoryCount: storyItems.filter(story => String(story.status || '').toUpperCase() === 'COMPLETED').length,
        taskCount: storyItems.reduce(
          (sum, story) => sum + (story.tasks?.length || 0),
          0
        ),
        completedTaskCount: storyItems.reduce(
          (sum, story) => sum + (story.tasks || []).filter(task => String(task.status || '').toUpperCase() === 'COMPLETED').length,
          0
        ),
        issueCount: epic.issues?.length || 0,
        points
      };

      const sprintId = Number(epic.sprint_id || 0);
      const list = grouped.get(sprintId) || [];
      list.push(item);
      grouped.set(sprintId, list);
    }

    return this.directoryGroupsFromMap(grouped);
  });

  storyDirectoryGroups = computed<StoryDirectoryGroup[]>(() => {
    const grouped = new Map<number, StoryDirectoryItem[]>();

    for (const epic of this.hierarchyTree()) {
      for (const story of epic.stories || []) {
        if (!this.matchesCommonDirectoryFilters(story)) continue;

        if (
          this.selectedPriorityFilter() !== 'ALL' &&
          String(story.priority || '').toUpperCase() !==
            String(this.selectedPriorityFilter()).toUpperCase()
        ) {
          continue;
        }

        if (!this.modeSearchMatches([
          story.title,
          story.description,
          story.status,
          story.priority,
          epic.name,
          epic.epic_code
        ])) {
          continue;
        }

        const sprintId = Number(story.sprint_id || 0);
        const list = grouped.get(sprintId) || [];

        list.push({
          story,
          epicName: epic.name,
          epicCode: epic.epic_code,
          taskCount: story.tasks?.length || 0,
          completedTaskCount: (story.tasks || []).filter(task => String(task.status || '').toUpperCase() === 'COMPLETED').length
        });

        grouped.set(sprintId, list);
      }
    }

    return this.directoryGroupsFromMap(grouped);
  });

  taskDirectoryGroups = computed<TaskDirectoryGroup[]>(() => {
    const grouped = new Map<number, TaskDirectoryItem[]>();

    for (const epic of this.hierarchyTree()) {
      for (const story of epic.stories || []) {
        for (const task of story.tasks || []) {
          if (!this.matchesCommonDirectoryFilters(task)) continue;

          if (
            this.selectedPriorityFilter() !== 'ALL' &&
            String(task.priority || '').toUpperCase() !==
              String(this.selectedPriorityFilter()).toUpperCase()
          ) {
            continue;
          }

          if (!this.modeSearchMatches([
            task.title,
            task.description,
            task.status,
            task.priority,
            story.title,
            epic.name
          ])) {
            continue;
          }

          const sprintId = Number(task.sprint_id || story.sprint_id || epic.sprint_id || 0);
          const list = grouped.get(sprintId) || [];

          list.push({
            task,
            storyTitle: story.title,
            epicName: epic.name
          });

          grouped.set(sprintId, list);
        }
      }
    }

    return this.directoryGroupsFromMap(grouped);
  });

  private directoryGroupsFromMap(
    grouped: Map<number, any[]>
  ): Array<{ sprint: Sprint; items: any[] }> {
    const backlog: Sprint = {
      id: 0,
      name: 'Backlog / Unassigned',
      status: 'FUTURE'
    };

    const sprintById = new Map<number, Sprint>();
    for (const sprint of this.projectSprints()) {
      sprintById.set(Number(sprint.id), sprint);
    }

    const groups: Array<{ sprint: Sprint; items: any[] }> = [];

    for (const [sprintId, items] of grouped.entries()) {
      if (!items.length) continue;

      groups.push({
        sprint: sprintById.get(sprintId) || backlog,
        items
      });
    }

    groups.sort((a, b) => {
      if (a.sprint.id === 0) return -1;
      if (b.sprint.id === 0) return 1;

      const aDate = a.sprint.startDate
        ? new Date(a.sprint.startDate).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bDate = b.sprint.startDate
        ? new Date(b.sprint.startDate).getTime()
        : Number.MAX_SAFE_INTEGER;

      if (aDate !== bDate) return aDate - bDate;

      return this.extractSprintNumber(a.sprint.name) -
        this.extractSprintNumber(b.sprint.name);
    });

    return groups;
  }

  setWorkItemMode(
    mode: 'EPICS' | 'STORIES' | 'TASKS' | 'ALL' | 'ISSUES'
  ): void {
    this.workItemMode.set(mode);
    this.activeTab.set('TREE');
    this.issueLinkFilter.set(null);
    this.clearSelection();
  }

  /** Open the Issues tab scoped to the selected work item's linked issues. */
  viewIssuesForItem(
    type: 'EPIC' | 'STORY' | 'TASK',
    item: EpicNode | StoryNode | TaskNode
  ): void {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      this.showToast('Invalid work item ID');
      return;
    }

    this.issueLinkFilter.set({ type, id });
    this.workItemMode.set('ISSUES');
    this.activeTab.set('TREE');
    this.clearSelection();
  }

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
              parentEpicName: epic.name,
              parentEpicCode: epic.epic_code,
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
                parentStoryTitle: story.title,
                parentEpicName: epic.name,
                parentEpicCode: epic.epic_code,
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
      projectId: this.nullableNumber(
        raw?.project_id ?? raw?.projectId ?? raw?.project?.id
      ) ?? undefined,
      project_id: this.nullableNumber(
        raw?.project_id ?? raw?.projectId ?? raw?.project?.id
      ) ?? undefined,
      name: raw?.name ?? raw?.sprint_name ?? raw?.sprintName ?? raw?.title ?? `Sprint ${id}`,
      startDate: raw?.scheduled_start_date ?? raw?.scheduledStartDate ?? raw?.startDate ?? raw?.start_date ?? raw?.start,
      endDate: raw?.scheduled_end_date ?? raw?.scheduledEndDate ?? raw?.endDate ?? raw?.end_date ?? raw?.end,
      status: String(raw?.status ?? 'PLANNED').toUpperCase(),
      capacity: Number(raw?.target_velocity ?? raw?.capacity ?? raw?.story_points_capacity ?? 30)
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
      taskId: this.nullableNumber(raw?.taskId ?? raw?.task_id) ?? undefined,
      isBlocking: Boolean(raw?.isBlocking ?? raw?.is_blocking ?? false),
      is_blocking: Boolean(raw?.isBlocking ?? raw?.is_blocking ?? false)
    };
  }

  getBlockingIssues(issues: Array<Issue | Partial<Issue>> | undefined): Array<Issue | Partial<Issue>> {
    return (issues || []).filter(issue =>
      Boolean((issue as any)?.isBlocking ?? (issue as any)?.is_blocking)
    );
  }

  isBlockingIssue(issue: Issue | Partial<Issue> | null | undefined): boolean {
    return Boolean((issue as any)?.isBlocking ?? (issue as any)?.is_blocking);
  }

  getBlockingIssueCodes(issues: Array<Issue | Partial<Issue>> | undefined): string {
    return this.getBlockingIssues(issues)
      .map(issue => issue.issueCode || issue.issue_code || `#${issue.id}`)
      .join(', ');
  }

  getBlockingIssueCount(issues: Array<Issue | Partial<Issue>> | undefined): number {
    return this.getBlockingIssues(issues).length;
  }

  private normalizeIssue(raw: any): Issue {
    const id = Number(raw?.id ?? raw?.issue_id ?? raw?.issueId);
    const projectId = this.nullableNumber(raw?.project?.id ?? raw?.project_id ?? raw?.projectId);
    const sprintId = this.nullableNumber(raw?.sprint?.id ?? raw?.sprint_id ?? raw?.sprintId);
    const assigneeId = this.nullableNumber(
      raw?.assignee?.id ?? raw?.assignee_user_id ?? raw?.assigneeUserId
    );
    const reporterId = this.nullableNumber(
      raw?.reporter?.id ?? raw?.reporter_user_id ?? raw?.reporterUserId
    );
    const creatorId = this.nullableNumber(
      raw?.creator?.id ?? raw?.creator_user_id ?? raw?.creatorUserId ?? raw?.user_id ?? raw?.userId
    );

    const rawAllocations = Array.isArray(raw?.allocations) ? raw.allocations : [];
    const allocations = rawAllocations.map((allocation: any) => ({
      ...allocation,
      allocatableType: String(
        allocation?.allocatableType ??
        allocation?.allocatable_type ??
        ''
      ).toUpperCase(),
      allocatableId: Number(
        allocation?.allocatableId ??
        allocation?.allocatable_id
      )
    }));

    const epicIds = Array.from(new Set(
      [
        ...(raw?.epicIds ?? raw?.epic_ids ?? []),
        ...allocations
          .filter((a: any) => a.allocatableType === 'EPIC')
          .map((a: any) => a.allocatableId),
        ...[raw?.epicId ?? raw?.epic_id]
      ]
        .filter(v => v !== null && v !== undefined && v !== '')
        .map(Number)
        .filter(v => Number.isFinite(v) && v > 0)
    ));

    const storyIds = Array.from(new Set(
      [
        ...(raw?.storyIds ?? raw?.story_ids ?? []),
        ...allocations
          .filter((a: any) => a.allocatableType === 'STORY')
          .map((a: any) => a.allocatableId),
        ...[raw?.storyId ?? raw?.story_id]
      ]
        .filter(v => v !== null && v !== undefined && v !== '')
        .map(Number)
        .filter(v => Number.isFinite(v) && v > 0)
    ));

    const taskIds = Array.from(new Set(
      [
        ...(raw?.taskIds ?? raw?.task_ids ?? []),
        ...allocations
          .filter((a: any) => a.allocatableType === 'TASK')
          .map((a: any) => a.allocatableId),
        ...[raw?.taskId ?? raw?.task_id]
      ]
        .filter(v => v !== null && v !== undefined && v !== '')
        .map(Number)
        .filter(v => Number.isFinite(v) && v > 0)
    ));

    const isBlocking = Boolean(raw?.isBlocking ?? raw?.is_blocking ?? false);

    return {
      ...raw,
      id: Number.isFinite(id) ? id : 0,
      title: raw?.title ?? raw?.name ?? '',
      description: raw?.description ?? '',
      issueCode: raw?.issueCode ?? raw?.issue_code ?? raw?.code ?? (id ? `ISSUE-${id}` : ''),
      issue_code: raw?.issue_code ?? raw?.issueCode ?? raw?.code ?? (id ? `ISSUE-${id}` : ''),
      status: String(raw?.status ?? 'OPEN').toUpperCase(),
      isBlocking,
      is_blocking: isBlocking,
      projectId: projectId ?? undefined,
      project_id: projectId ?? undefined,
      sprintId,
      sprint_id: sprintId,
      assignee_user_id: assigneeId,
      assigneeUserId: assigneeId,
      reporter_user_id: reporterId,
      reporterUserId: reporterId,
      user_id: creatorId,
      userId: creatorId,
      creator_user_id: creatorId,
      creatorUserId: creatorId,
      epicIds,
      storyIds,
      taskIds,
      epicId: epicIds[0],
      storyId: storyIds[0],
      taskId: taskIds[0],
      allocations
    };
  }

  getIssueLinkedIds(
    issue: Issue | Partial<Issue> | null | undefined,
    type: 'EPIC' | 'STORY' | 'TASK'
  ): number[] {
    if (!issue) return [];

    const allocations = Array.isArray(issue.allocations)
      ? issue.allocations
          .filter((a: any) =>
            String(a?.allocatableType ?? a?.allocatable_type ?? '').toUpperCase() === type
          )
          .map((a: any) => Number(a?.allocatableId ?? a?.allocatable_id))
          : [];

    const direct = type === 'EPIC'
      ? (issue.epicIds ?? [issue.epicId ?? issue.epic_id])
      : type === 'STORY'
        ? (issue.storyIds ?? [issue.storyId ?? issue.story_id])
        : (issue.taskIds ?? [issue.taskId ?? issue.task_id]);

    return Array.from(new Set(
      [...allocations, ...(direct || [])]
        .filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0)
        .map(Number)
    ));
  }

  private isIssueLinkedTo(
    issue: Issue | Partial<Issue> | null | undefined,
    type: 'EPIC' | 'STORY' | 'TASK',
    id: number | undefined
  ): boolean {
    if (!issue || !id) return false;
    return this.getIssueLinkedIds(issue, type).includes(Number(id));
  }

  private issueSprintId(issue: Issue | Partial<Issue>): number {
    const direct = this.nullableNumber(
      issue?.sprint_id ?? issue?.sprintId
    );
    if (direct) return direct;

    const taskIds = this.getIssueLinkedIds(issue, 'TASK');
    const task = this.hierarchyTree()
      .flatMap(epic => (epic.stories || []).flatMap(story => story.tasks || []))
      .find(candidate => taskIds.includes(Number(candidate.id)));
    if (task?.sprint_id) return Number(task.sprint_id);

    const storyIds = this.getIssueLinkedIds(issue, 'STORY');
    const story = this.hierarchyTree()
      .flatMap(epic => epic.stories || [])
      .find(candidate => storyIds.includes(Number(candidate.id)));
    if (story?.sprint_id) return Number(story.sprint_id);

    const epicIds = this.getIssueLinkedIds(issue, 'EPIC');
    const epic = this.hierarchyTree().find(candidate => epicIds.includes(Number(candidate.id)));
    return epic?.sprint_id ? Number(epic.sprint_id) : 0;
  }

  getIssueLinkedEpicNames(issue: Issue | Partial<Issue>): string {
    const ids = this.getIssueLinkedIds(issue, 'EPIC');
    return ids.length
      ? this.hierarchyTree()
          .filter(epic => ids.includes(Number(epic.id)))
          .map(epic => `${epic.epic_code} · ${epic.name}`)
          .join(', ')
      : '—';
  }

  getIssueLinkedStoryNames(issue: Issue | Partial<Issue>): string {
    const ids = this.getIssueLinkedIds(issue, 'STORY');
    return ids.length
      ? this.hierarchyTree()
          .flatMap(epic => epic.stories || [])
          .filter(story => ids.includes(Number(story.id)))
          .map(story => story.title)
          .join(', ')
      : '—';
  }

  getIssueLinkedTaskNames(issue: Issue | Partial<Issue>): string {
    const ids = this.getIssueLinkedIds(issue, 'TASK');
    return ids.length
      ? this.hierarchyTree()
          .flatMap(epic => epic.stories || [])
          .flatMap(story => story.tasks || [])
          .filter(task => ids.includes(Number(task.id)))
          .map(task => task.title)
          .join(', ')
      : '—';
  }

  getIssueLinkSummary(issue: Issue | Partial<Issue>): string {
    const parts = [
      this.getIssueLinkedEpicNames(issue),
      this.getIssueLinkedStoryNames(issue),
      this.getIssueLinkedTaskNames(issue)
    ].filter(value => value && value !== '—');
    return parts.join(' · ');
  }

  getIssueListSprintName(issue: Issue | Partial<Issue>): string {
    const sprintId = this.issueSprintId(issue);
    return this.projectSprints().find(s => Number(s.id) === sprintId)?.name || 'Backlog / Unassigned';
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
    this.http
      .get<any>(`${this.baseUrl}/users`, this.headers())
      .subscribe((res: any) => {
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

      if (this.activeModal() !== 'NONE') {
        this.syncPersonSearchFields();
      }
    });
  }

  fetchTeams(): void {
    this.http
      .get<any>(`${this.baseUrl}/teams`, this.headers())
      .subscribe((res: any) => {
      const teams = this.extractArray(res)
        .map(v => this.normalizeTeam(v))
        .filter(t => Number.isFinite(t.id) && t.id > 0);
      this.teams.set(teams);
    });
  }

  fetchSprints(callback?: () => void): void {
    this.http
      .get<any>(`${this.baseUrl}/sprints`, this.headers())
      .subscribe((res: any) => {
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

        const tree = epics.map(epic => {
          const epicStories = stories
            .filter(story => Number(story.epic_id) === Number(epic.id))
            .map(story => ({
              ...story,
              expanded: story.expanded ?? true,
              testCases: testCases.filter(tc => Number(tc.storyId) === Number(story.id)),
              tasks: tasks
                .filter(task => Number(task.story_id) === Number(story.id))
                .map(task => ({
                  ...task,
                  issues: issues.filter(issue => this.isIssueLinkedTo(issue, 'TASK', task.id)),
                  testCases: testCases.filter(tc => Number(tc.taskId) === Number(task.id))
                }))
            }));

          const descendantStoryIds = epicStories
            .map(story => Number(story.id))
            .filter(Number.isFinite);

          const descendantTaskIds = epicStories
            .flatMap(story => (story.tasks || []).map(task => Number(task.id)))
            .filter(Number.isFinite);

          const epicIssues = issues.filter(issue =>
            this.isIssueLinkedTo(issue, 'EPIC', epic.id) ||
            descendantStoryIds.some(id => this.isIssueLinkedTo(issue, 'STORY', id)) ||
            descendantTaskIds.some(id => this.isIssueLinkedTo(issue, 'TASK', id))
          );

          const mappedStories = epicStories.map(story => {
            const storyTaskIds = (story.tasks || [])
              .map(task => Number(task.id))
              .filter(Number.isFinite);

            const storyIssues = issues.filter(issue =>
              this.isIssueLinkedTo(issue, 'STORY', story.id) ||
              storyTaskIds.some(id => this.isIssueLinkedTo(issue, 'TASK', id))
            );

            return {
              ...story,
              issues: storyIssues
            };
          });

          return {
            ...epic,
            expanded: epic.expanded ?? true,
            issues: epicIssues,
            testCases: testCases.filter(tc => Number(tc.epicId) === Number(epic.id)),
            stories: mappedStories
          };
        });

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

    this.currentEpic = {
      ...this.normalizeEpic(epic),
      id,
      project_id: epic.project_id ?? this.selectedProjectId() ?? undefined,
      stories: (epic.stories || []).map(story => ({
        ...this.normalizeStory(story),
        expanded: false
      })),
      issues: [...(epic.issues || [])],
      testCases: [...(epic.testCases || [])]
    };

    this.modalMode.set('VIEW');
    this.activeModal.set('EPIC');
    this.syncPersonSearchFields();
  }

  openEpicSeparatePage(): void {
    const id = Number(this.currentEpic.id);

    if (!Number.isFinite(id) || id <= 0) {
      this.showToast('Invalid Epic ID');
      return;
    }

    this.openViewer(
      'epic',
      id
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

    this.currentIssue = {
      ...this.normalizeIssue(issue),
      id
    };

    this.issueDraftSprintId.set(this.issueSprintId(this.currentIssue));
    this.currentIssue.sprint_id = this.issueDraftSprintId();
    this.currentIssue.sprintId = this.issueDraftSprintId();
    this.selectedIssueEpicIds.set(this.getIssueLinkedIds(this.currentIssue, 'EPIC'));
    this.selectedIssueStoryIds.set(this.getIssueLinkedIds(this.currentIssue, 'STORY'));
    this.selectedIssueTaskIds.set(this.getIssueLinkedIds(this.currentIssue, 'TASK'));

    this.modalMode.set('VIEW');
    this.activeModal.set('ISSUE');
    this.syncPersonSearchFields();
  }

  openCreateIssue(): void {
    const projectId = this.selectedProjectId() || 0;
    const currentUserId = this.getAuthenticatedUserId();

    this.currentIssue = {
      project_id: projectId,
      projectId,
      sprint_id: this.selectedSprintFilter() === 'ALL'
        ? null
        : Number(this.selectedSprintFilter()),
      sprintId: this.selectedSprintFilter() === 'ALL'
        ? null
        : Number(this.selectedSprintFilter()),
      user_id: currentUserId,
      userId: currentUserId,
      creator_user_id: currentUserId,
      creatorUserId: currentUserId,
      assignee_user_id: null,
      reporter_user_id: currentUserId,
      status: 'OPEN',
      title: '',
      description: '',
      issue_code: `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`,
      issueCode: '',
      isBlocking: false,
      is_blocking: false
    };

    this.issueDraftSprintId.set(
      this.selectedSprintFilter() === 'ALL'
        ? null
        : Number(this.selectedSprintFilter())
    );
    this.selectedIssueEpicIds.set([]);
    this.selectedIssueStoryIds.set([]);
    this.selectedIssueTaskIds.set([]);

    this.modalMode.set('CREATE');
    this.activeModal.set('ISSUE');
    this.syncPersonSearchFields();
    this.assigneeSearchTerm.set('');
    this.reporterSearchTerm.set('');
  }

  openEditIssue(issue: Issue): void {
    this.openViewIssue(issue);
    this.modalMode.set('EDIT');
  }

  onIssueSprintChange(value: number | string | null): void {
    const sprintId = this.nullableNumber(value);
    this.issueDraftSprintId.set(sprintId);
    this.currentIssue.sprint_id = sprintId;
    this.currentIssue.sprintId = sprintId;
  }

  onIssueEpicSelectChange(epicIds: number[]): void {
    const normalized = (epicIds || [])
      .map(Number)
      .filter(id => Number.isFinite(id) && id > 0);

    this.selectedIssueEpicIds.set(normalized);

    const validStoryIds = new Set(
      this.issueAvailableStories().map(story => Number(story.id))
    );

    this.selectedIssueStoryIds.update(ids =>
      ids.filter(id => validStoryIds.has(Number(id)))
    );

    const validTaskIds = new Set(
      this.issueAvailableTasks().map(task => Number(task.id))
    );

    this.selectedIssueTaskIds.update(ids =>
      ids.filter(id => validTaskIds.has(Number(id)))
    );
  }

  onIssueStorySelectChange(storyIds: number[]): void {
    const normalized = (storyIds || [])
      .map(Number)
      .filter(id => Number.isFinite(id) && id > 0);

    this.selectedIssueStoryIds.set(normalized);

    const validTaskIds = new Set(
      this.issueAvailableTasks().map(task => Number(task.id))
    );

    this.selectedIssueTaskIds.update(ids =>
      ids.filter(id => validTaskIds.has(Number(id)))
    );
  }

  saveIssue(): void {
    const isCreate = this.modalMode() === 'CREATE';
    const id = Number(this.currentIssue.id);

    const projectId = this.nullableNumber(
      this.currentIssue.project_id ?? this.currentIssue.projectId ?? this.selectedProjectId()
    );

    if (!projectId) {
      this.showToast('A project is required');
      return;
    }

    const title = String(this.currentIssue.title || '').trim();
    if (!title) {
      this.showToast('Issue title is required');
      return;
    }

    const issueCode = String(
      this.currentIssue.issue_code ??
      this.currentIssue.issueCode ??
      ''
    ).trim();

    if (isCreate && !issueCode) {
      this.showToast('Issue code is required');
      return;
    }

    const sprintId = this.nullableNumber(
      this.currentIssue.sprint_id ?? this.currentIssue.sprintId
    );
    const assigneeId = this.nullableNumber(
      this.currentIssue.assignee_user_id ?? this.currentIssue.assigneeUserId
    );
    const reporterId = this.nullableNumber(
      this.currentIssue.reporter_user_id ?? this.currentIssue.reporterUserId
    );
    const creatorId = this.nullableNumber(
      this.currentIssue.creator_user_id ??
      this.currentIssue.creatorUserId ??
      this.currentIssue.user_id ??
      this.currentIssue.userId ??
      this.getAuthenticatedUserId()
    );

    const epicIds = this.selectedIssueEpicIds().map(Number).filter(Number.isFinite);
    const storyIds = this.selectedIssueStoryIds().map(Number).filter(Number.isFinite);
    const taskIds = this.selectedIssueTaskIds().map(Number).filter(Number.isFinite);

    const isBlocking = Boolean(
      this.currentIssue.isBlocking ??
      this.currentIssue.is_blocking ??
      false
    );

    const payload = {
      issue_code: issueCode,
      issueCode: issueCode,
      project_id: projectId,
      projectId,
      sprint_id: sprintId,
      sprintId,
      user_id: creatorId,
      userId: creatorId,
      creator_user_id: creatorId,
      creatorUserId: creatorId,
      assignee_user_id: assigneeId,
      assigneeUserId: assigneeId,
      reporter_user_id: reporterId,
      reporterUserId: reporterId,
      title,
      description: String(this.currentIssue.description || ''),
      status: String(this.currentIssue.status || 'OPEN').toUpperCase(),
      isBlocking,
      is_blocking: isBlocking,
      epicIds,
      storyIds,
      taskIds,
      allocations: [
        ...epicIds.map(linkId => ({ allocatableType: 'EPIC', allocatableId: linkId })),
        ...storyIds.map(linkId => ({ allocatableType: 'STORY', allocatableId: linkId })),
        ...taskIds.map(linkId => ({ allocatableType: 'TASK', allocatableId: linkId }))
      ],
      project: projectId ? { id: projectId } : null,
      sprint: sprintId ? { id: sprintId } : null,
      creator: creatorId ? { id: creatorId } : null,
      assignee: assigneeId ? { id: assigneeId } : null,
      reporter: reporterId ? { id: reporterId } : null
    };

    const request = isCreate
      ? this.http.post<any>(`${this.baseUrl2}/v1/issues`, payload, this.headers())
      : this.http.put<any>(`${this.baseUrl2}/v1/issues/${id}`, payload, this.headers());

    request.subscribe({
      next: response => {
        const entity = this.extractObject(response);
        const savedId = Number(entity?.id ?? id);

        this.showToast(
          isCreate
            ? (Number.isFinite(savedId) && savedId > 0
                ? `Issue #${savedId} created successfully`
                : 'Issue created successfully')
            : `Issue #${id} updated successfully`
        );

        this.closeModal();
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Issue save failed', {
          status: error?.status,
          url: error?.url,
          error: error?.error
        });
        this.showToast(
          error?.error?.message ||
          error?.error?.error ||
          (isCreate ? 'Could not create Issue' : 'Could not update Issue')
        );
      }
    });
  }

  deleteIssue(issue: Issue | Partial<Issue>): void {
    const id = Number(issue?.id);
    if (!Number.isFinite(id) || id <= 0) return;

    if (!confirm(`Delete issue ${issue.issueCode || issue.issue_code || '#' + id}?`)) {
      return;
    }

    this.http.delete(`${this.baseUrl2}/v1/issues/${id}`, this.headers())
      .subscribe({
        next: () => {
          this.showToast(`Issue #${id} deleted`);
          this.closeModal();
          this.loadFullHierarchy();
        },
        error: error => {
          console.error('Issue delete failed', error);
          this.showToast(error?.error?.message || 'Could not delete Issue');
        }
      });
  }

  issueMetrics = computed(() => {
    const all = this.projectIssues();
    const normalize = (value: any) => String(value || '').toUpperCase();

    return {
      total: all.length,
      open: all.filter(issue => ['OPEN', 'BACKLOG', 'TODO'].includes(normalize(issue.status))).length,
      inProgress: all.filter(issue => ['IN_PROGRESS', 'TESTING'].includes(normalize(issue.status))).length,
      completed: all.filter(issue => ['RESOLVED', 'COMPLETED', 'CLOSED'].includes(normalize(issue.status))).length,
      blocked: all.filter(issue => normalize(issue.status) === 'BLOCKED').length,
      blockers: all.filter(issue => this.isBlockingIssue(issue)).length
    };
  });

  issueDirectoryGroups = computed<Array<{ sprint: Sprint; items: Issue[] }>>(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const sprintFilter = this.selectedSprintFilter();

    const map = new Map<number, Issue[]>();

    for (const issue of this.projectIssues()) {
      if (
        sprintFilter !== 'ALL' &&
        this.issueSprintId(issue) !== Number(sprintFilter)
      ) {
        continue;
      }

      const searchFields = [
        issue.issue_code,
        issue.issueCode,
        issue.title,
        issue.description,
        this.getIssueLinkedEpicNames(issue),
        this.getIssueLinkedStoryNames(issue),
        this.getIssueLinkedTaskNames(issue),
        this.getUserName(issue.assignee_user_id),
        this.getUserName(issue.reporter_user_id)
      ];

      if (
        query &&
        !searchFields.some(value =>
          String(value ?? '').toLowerCase().includes(query)
        )
      ) {
        continue;
      }

      const status = String(issue.status || '').toUpperCase();
      if (
        this.selectedStatusFilter() !== 'ALL' &&
        status !== String(this.selectedStatusFilter()).toUpperCase()
      ) {
        continue;
      }

      const assigneeFilter = this.selectedAssigneeFilter();
      if (
        assigneeFilter !== 'ALL' &&
        Number(issue.assignee_user_id) !== Number(assigneeFilter)
      ) {
        continue;
      }

      const reporterFilter = this.selectedReporterFilter();
      if (
        reporterFilter !== 'ALL' &&
        Number(issue.reporter_user_id) !== Number(reporterFilter)
      ) {
        continue;
      }

      const sprintId = this.issueSprintId(issue);
      const list = map.get(sprintId) || [];
      list.push(issue);
      map.set(sprintId, list);
    }

    const groups: Array<{ sprint: Sprint; items: Issue[] }> = [];
    const sprintMap = new Map<number, Sprint>();
    for (const sprint of this.projectSprints()) {
      sprintMap.set(Number(sprint.id), sprint);
    }

    const backlog: Sprint = {
      id: 0,
      name: 'Backlog / Unassigned',
      status: 'FUTURE'
    };

    for (const [sprintId, items] of map.entries()) {
      groups.push({
        sprint: sprintMap.get(sprintId) || backlog,
        items: [...items].sort((a, b) =>
          String(a.issue_code || a.issueCode || '').localeCompare(
            String(b.issue_code || b.issueCode || '')
          )
        )
      });
    }

    groups.sort((a, b) => {
      if (a.sprint.id === 0) return -1;
      if (b.sprint.id === 0) return 1;

      const aDate = a.sprint.startDate
        ? new Date(a.sprint.startDate).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bDate = b.sprint.startDate
        ? new Date(b.sprint.startDate).getTime()
        : Number.MAX_SAFE_INTEGER;

      return aDate !== bDate
        ? aDate - bDate
        : this.extractSprintNumber(a.sprint.name) - this.extractSprintNumber(b.sprint.name);
    });

    return groups;
  });

  /** Flat issue collection for the Issues tab. The tab intentionally renders only a table. */
  issueTableItems = computed<Issue[]>(() => {
    const issues = this.issueDirectoryGroups().flatMap(group => group.items);
    const filter = this.issueLinkFilter();

    if (!filter) return issues;

    return issues.filter(issue =>
      this.getIssueLinkedIds(issue, filter.type).some(id => Number(id) === filter.id)
    );
  });

  trackByIssueId(index: number, issue: Issue): number {
    return Number(issue?.id ?? index);
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
      issues: [],
      stories: []
    };

    this.modalMode.set('CREATE');
    this.activeModal.set('EPIC');
    this.syncPersonSearchFields();
  }

  openEditEpic(epic: EpicNode): void {
    this.currentEpic = { ...epic };
    this.modalMode.set('EDIT');
    this.activeModal.set('EPIC');
    this.syncPersonSearchFields();
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
      issues: [],
      testCases: [],
      tasks: []
    };

    this.loadEpicsForStoryProject(projectId);
    this.modalMode.set('CREATE');
    this.activeModal.set('STORY');
    this.syncPersonSearchFields();
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
    this.syncPersonSearchFields();
  }

  openCreateTask(story?: StoryNode): void {
    this.currentTask = {
      story_id: Number(story?.id ?? 0),
      sprint_id: story?.sprint_id ?? null,
      title: '',
      description: '',
      status: 'TODO',
      priority: 'MEDIUM',
      assignee_user_id: this.getAuthenticatedUserId(),
      reporter_user_id: this.getAuthenticatedUserId(),
      issues: [],
      testCases: []
    };

    this.modalMode.set('CREATE');
    this.activeModal.set('TASK');
    this.syncPersonSearchFields();
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
    this.syncPersonSearchFields();

    this.modalMode.set('EDIT');
    this.activeModal.set('TASK');
    this.syncPersonSearchFields();
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
    this.personAutocompleteOpen.set(null);
    this.activeModal.set('NONE');
    this.modalMode.set('VIEW');
    this.currentEpic = {};
    this.currentStory = {};
    this.currentTask = {};
    this.currentIssue = {};
    this.selectedIssueEpicIds.set([]);
    this.selectedIssueStoryIds.set([]);
    this.selectedIssueTaskIds.set([]);
    this.issueDraftSprintId.set(null);
    this.assigneeSearchTerm.set('');
    this.reporterSearchTerm.set('');
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
    const epicCode = String(this.currentEpic.epic_code || '').trim();
    const id = this.currentEpic.id != null
      ? Number(this.currentEpic.id)
      : null;

    if (!name || !Number.isFinite(projectId) || projectId <= 0) {
      this.showToast('Epic name and project are required');
      return;
    }

    const isCreate = id === null || !Number.isFinite(id) || id <= 0;

    if (isCreate && !epicCode) {
      this.showToast('Epic code is required');
      return;
    }

    const payload = isCreate
      ? {
          project_id: projectId,
          epic_code: epicCode,
          name,
          description: String(this.currentEpic.description || ''),
          status: this.currentEpic.status || 'BACKLOG',
          sprint_id: this.nullableNumber(this.currentEpic.sprint_id),
          assignee_user_id: this.nullableNumber(this.currentEpic.assignee_user_id),
          reporter_user_id: this.nullableNumber(this.currentEpic.reporter_user_id)
        }
      : {
          name,
          description: String(this.currentEpic.description || ''),
          status: this.currentEpic.status || 'BACKLOG',
          sprint_id: this.nullableNumber(this.currentEpic.sprint_id),
          assignee_user_id: this.nullableNumber(this.currentEpic.assignee_user_id),
          reporter_user_id: this.nullableNumber(this.currentEpic.reporter_user_id)
        };

    const request = isCreate
      ? this.http.post<any>(`${this.baseUrl}/epics/create`, payload, this.headers())
      : this.http.put<any>(`${this.baseUrl}/epics/${id}`, payload, this.headers());

    request.subscribe({
      next: () => {
        this.showToast(isCreate ? 'Epic created successfully' : `Epic #${id} updated successfully`);
        this.closeModal();
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Epic save failed', {
          status: error?.status,
          url: error?.url,
          error: error?.error
        });
        this.showToast(
          error?.error?.message ||
          error?.error?.error ||
          (isCreate ? 'Could not create Epic' : 'Could not update Epic')
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
      ...(isCreate ? { project_id: projectId } : {}),
      epic_id: this.nullableNumber(this.currentStory.epic_id),
      sprint_id: this.nullableNumber(this.currentStory.sprint_id),
      assignee_user_id: this.nullableNumber(this.currentStory.assignee_user_id),
      reporter_user_id: this.nullableNumber(this.currentStory.reporter_user_id)
    };

    const request = isCreate
      ? this.http.post<any>(`${this.baseUrl}/stories/create`, payload, this.headers())
      : this.http.put<any>(`${this.baseUrl}/stories/${id}`, payload, this.headers());

    request.subscribe({
      next: response => {
        const entity = this.extractObject(response);
        const returnedId = Number(
          entity?.id ?? entity?.story_id ?? entity?.storyId ?? id
        );

        this.showToast(
          isCreate
            ? (Number.isFinite(returnedId) && returnedId > 0
                ? `Story #${returnedId} created successfully`
                : 'Story created successfully')
            : `Story #${id} updated successfully`
        );

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

    if (!title || !Number.isFinite(storyId) || storyId <= 0) {
      this.showToast('Task title and parent Story are required');
      return;
    }

    const isCreate = id === null || !Number.isFinite(id) || id <= 0;

    const payload = {
      title,
      description: String(this.currentTask.description || ''),
      status: this.currentTask.status || 'TODO',
      story_id: storyId,
      sprint_id: this.nullableNumber(this.currentTask.sprint_id),
      assignee_user_id: this.nullableNumber(this.currentTask.assignee_user_id),
      reporter_user_id: this.nullableNumber(this.currentTask.reporter_user_id)
    };

    const request = isCreate
      ? this.http.post<any>(`${this.baseUrl}/tasks/create`, payload, this.headers())
      : this.http.put<any>(`${this.baseUrl}/tasks/${id}`, payload, this.headers());

    request.subscribe({
      next: response => {
        const entity = this.extractObject(response);
        const returnedId = Number(
          entity?.id ?? entity?.task_id ?? entity?.taskId ?? id
        );

        this.showToast(
          isCreate
            ? (Number.isFinite(returnedId) && returnedId > 0
                ? `Task #${returnedId} created successfully`
                : 'Task created successfully')
            : `Task #${id} updated successfully`
        );

        this.closeModal();
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Task save failed', {
          status: error?.status,
          url: error?.url,
          error: error?.error
        });
        this.showToast(
          error?.error?.message ||
          error?.error?.error ||
          (isCreate ? 'Could not create Task' : 'Could not update Task')
        );
      }
    });
  }

  private epicUpdatePayload(epic: EpicNode, changes: Partial<Pick<EpicNode, 'sprint_id'>> & { status?: string }): any {
    return {
      name: String(epic.name || '').trim(),
      description: String(epic.description || ''),
      status: String(changes.status ?? epic.status ?? 'BACKLOG'),
      sprint_id: this.nullableNumber(changes.sprint_id !== undefined ? changes.sprint_id : epic.sprint_id),
      assignee_user_id: this.nullableNumber(epic.assignee_user_id),
      reporter_user_id: this.nullableNumber(epic.reporter_user_id)
    };
  }

  private storyUpdatePayload(story: StoryNode, changes: Partial<Pick<StoryNode, 'sprint_id'>> & { status?: string }): any {
    return {
      title: String(story.title || '').trim(),
      description: String(story.description || ''),
      story_points: Number(story.story_points || 0),
      status: String(changes.status ?? story.status ?? 'BACKLOG'),
      priority: String(story.priority || 'MEDIUM'),
      epic_id: this.nullableNumber(story.epic_id),
      sprint_id: this.nullableNumber(changes.sprint_id !== undefined ? changes.sprint_id : story.sprint_id),
      assignee_user_id: this.nullableNumber(story.assignee_user_id),
      reporter_user_id: this.nullableNumber(story.reporter_user_id)
    };
  }

  private taskUpdatePayload(task: TaskNode, changes: Partial<Pick<TaskNode, 'sprint_id'>> & { status?: string }): any {
    return {
      title: String(task.title || '').trim(),
      description: String(task.description || ''),
      status: String(changes.status ?? task.status ?? 'TODO'),
      sprint_id: this.nullableNumber(changes.sprint_id !== undefined ? changes.sprint_id : task.sprint_id),
      assignee_user_id: this.nullableNumber(task.assignee_user_id),
      reporter_user_id: this.nullableNumber(task.reporter_user_id)
    };
  }

  /*
   * ---------- STATUS / BULK ----------
   */

  updateEpicStatus(epic: EpicNode, status: string): void {
    if (!epic.id) return;

    this.http.put(
      `${this.baseUrl}/epics/${epic.id}`,
      this.epicUpdatePayload(epic, { status }),
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`Epic updated to ${status}`);
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Epic status update failed', error);
        this.showToast(error?.error?.message || 'Could not update Epic status');
      }
    });
  }

  updateStoryStatus(story: StoryNode, status: string): void {
    if (!story.id) return;

    this.http.put(
      `${this.baseUrl}/stories/${story.id}`,
      this.storyUpdatePayload(story, { status }),
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`Story #${story.id} updated to ${status}`);
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Story status update failed', error);
        this.showToast(error?.error?.message || 'Could not update Story status');
      }
    });
  }

  updateTaskStatus(task: TaskNode, status: string): void {
    if (!task.id) return;

    this.http.put(
      `${this.baseUrl}/tasks/${task.id}`,
      this.taskUpdatePayload(task, { status }),
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`Task #${task.id} updated to ${status}`);
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Task status update failed', error);
        this.showToast(error?.error?.message || 'Could not update Task status');
      }
    });
  }

  bulkUpdateStatus(status: string): void {
    const selected = [...this.selectedItems()];
    if (!selected.length || !status) return;

    const requests = selected.map(key => {
      const [type, idText] = key.split('_');
      const id = Number(idText);
      const item = this.findSelectedItem(type, id);

      if (type === 'EPIC') {
        return this.http.put(
          `${this.baseUrl}/epics/${id}`,
          this.epicUpdatePayload(item as EpicNode, { status }),
          this.headers()
        );
      }

      if (type === 'STORY') {
        return this.http.put(
          `${this.baseUrl}/stories/${id}`,
          this.storyUpdatePayload(item as StoryNode, { status }),
          this.headers()
        );
      }

      return this.http.put(
        `${this.baseUrl}/tasks/${id}`,
        this.taskUpdatePayload(item as TaskNode, { status }),
        this.headers()
      );
    });

    forkJoin(requests).subscribe({
      next: () => {
        this.showToast(`Updated ${selected.length} items`);
        this.clearSelection();
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Bulk status update failed', error);
        this.showToast(error?.error?.message || 'Bulk update failed');
      }
    });
  }

  bulkMoveSprint(sprintId: number): void {
    const selected = [...this.selectedItems()];
    if (!selected.length) return;

    const requests = selected.map(key => {
      const [type, idText] = key.split('_');
      const id = Number(idText);
      const item = this.findSelectedItem(type, id);
      const nextSprintId = this.nullableNumber(sprintId);

      if (type === 'EPIC') {
        return this.http.put(
          `${this.baseUrl}/epics/${id}`,
          this.epicUpdatePayload(item as EpicNode, { sprint_id: nextSprintId ?? undefined }),
          this.headers()
        );
      }

      if (type === 'STORY') {
        return this.http.put(
          `${this.baseUrl}/stories/${id}`,
          this.storyUpdatePayload(item as StoryNode, { sprint_id: nextSprintId ?? undefined }),
          this.headers()
        );
      }

      return this.http.put(
        `${this.baseUrl}/tasks/${id}`,
        this.taskUpdatePayload(item as TaskNode, { sprint_id: nextSprintId ?? undefined }),
        this.headers()
      );
    });

    forkJoin(requests).subscribe({
      next: () => {
        this.showToast(`Moved ${selected.length} items`);
        this.clearSelection();
        this.loadFullHierarchy();
      },
      error: error => {
        console.error('Bulk sprint move failed', error);
        this.showToast(error?.error?.message || 'Bulk sprint move failed');
      }
    });
  }

  private findSelectedItem(type: string, id: number): EpicNode | StoryNode | TaskNode {
    for (const epic of this.hierarchyTree()) {
      if (type === 'EPIC' && Number(epic.id) === id) return epic;

      for (const story of epic.stories || []) {
        if (type === 'STORY' && Number(story.id) === id) return story;

        for (const task of story.tasks || []) {
          if (type === 'TASK' && Number(task.id) === id) return task;
        }
      }
    }

    throw new Error(`Selected ${type} #${id} was not found`);
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
      error: error => {
        console.error('Bulk delete failed', error);
        this.showToast(error?.error?.message || 'Bulk delete failed');
      }
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
    const item = event.item.data as KanbanItem | undefined;
    if (!item) return;

    if (event.previousContainer === event.container) {
      const list = event.container.data;
      if (event.previousIndex !== event.currentIndex) {
        const moved = list.splice(event.previousIndex, 1)[0];
        if (moved) {
          list.splice(event.currentIndex, 0, moved);
        }
      }
      return;
    }

    const sourceList = event.previousContainer.data;
    const targetList = event.container.data;
    const moved = sourceList.splice(event.previousIndex, 1)[0];

    if (moved) {
      targetList.splice(event.currentIndex, 0, moved);
    }

    const nextStatus = String(status || 'BACKLOG').toUpperCase();
    item.status = nextStatus;

    if (item.type === 'EPIC') {
      this.updateEpicStatus(item.originalItem as EpicNode, nextStatus);
    } else if (item.type === 'STORY') {
      this.updateStoryStatus(item.originalItem as StoryNode, nextStatus);
    } else {
      this.updateTaskStatus(item.originalItem as TaskNode, nextStatus);
    }
  }

  private statusMetrics(items: Array<{ status?: string }>): ProgressStatusMetrics {
    const counts = {
      total: items.length,
      completed: 0,
      inProgress: 0,
      testing: 0,
      blocked: 0,
      backlog: 0,
      todo: 0
    };

    for (const item of items) {
      const status = String(item?.status || 'BACKLOG').toUpperCase();
      if (status === 'COMPLETED') counts.completed++;
      else if (status === 'IN_PROGRESS') counts.inProgress++;
      else if (status === 'TESTING') counts.testing++;
      else if (status === 'BLOCKED') counts.blocked++;
      else if (status === 'TODO') counts.todo++;
      else counts.backlog++;
    }

    return {
      ...counts,
      completionRate: counts.total ? Math.round((counts.completed / counts.total) * 100) : 0
    };
  }

  private calculateSprintProgress(sprint: Sprint): SprintProgress {
    const sprintId = Number(sprint.id);
    const sprintEpics = this.hierarchyTree().filter(
      epic => Number(epic.sprint_id || 0) === sprintId
    );

    const sprintStories: StoryNode[] = [];
    const sprintTasks: TaskNode[] = [];

    for (const epic of sprintEpics) {
      for (const story of epic.stories || []) {
        sprintStories.push(story);
        for (const task of story.tasks || []) {
          sprintTasks.push(task);
        }
      }
    }

    const epics = this.statusMetrics(sprintEpics);
    const stories = this.statusMetrics(sprintStories);
    const tasks = this.statusMetrics(sprintTasks);
    const totalWorkItems = epics.total + stories.total + tasks.total;
    const completedWorkItems = epics.completed + stories.completed + tasks.completed;
    const totalStoryPoints = sprintStories.reduce((sum, story) => sum + Number(story.story_points || 0), 0);
    const completedStoryPoints = sprintStories
      .filter(story => String(story.status || '').toUpperCase() === 'COMPLETED')
      .reduce((sum, story) => sum + Number(story.story_points || 0), 0);

    return {
      sprint,
      overallCompletionRate: totalWorkItems
        ? Math.round((completedWorkItems / totalWorkItems) * 100)
        : 0,
      completedWorkItems,
      totalWorkItems,
      totalStoryPoints,
      completedStoryPoints,
      epics,
      stories,
      tasks
    };
  }

  openSprintProgress(sprint: Sprint): void {
    this.sprintProgress.set(this.calculateSprintProgress(sprint));
    this.sprintProgressOpen.set(true);
  }

  closeSprintProgress(): void {
    this.sprintProgressOpen.set(false);
  }

  totalStoriesForEpic(epic: EpicNode): number {
    return epic.stories?.length || 0;
  }

  completedStoriesForEpic(epic: EpicNode): number {
    return (epic.stories || []).filter(
      story => String(story.status || '').toUpperCase() === 'COMPLETED'
    ).length;
  }

  totalTasksForStory(story: StoryNode): number {
    return story.tasks?.length || 0;
  }

  completedTasksForStory(story: StoryNode): number {
    return (story.tasks || []).filter(
      task => String(task.status || '').toUpperCase() === 'COMPLETED'
    ).length;
  }

  startSprint(sprint: Sprint): void {
    this.http.put(
      `${this.baseUrl}/sprints/${sprint.id}`,
      { name: sprint.name, status: 'ACTIVE' },
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`${sprint.name} started`);
        this.fetchSprints();
      },
      error: error => {
        console.error('Sprint start failed', error);
        this.showToast(error?.error?.message || 'Could not start sprint');
      }
    });
  }

  completeSprint(sprint: Sprint): void {
    this.http.put(
      `${this.baseUrl}/sprints/${sprint.id}`,
      { name: sprint.name, status: 'COMPLETED' },
      this.headers()
    ).subscribe({
      next: () => {
        this.showToast(`${sprint.name} completed`);
        this.fetchSprints();
      },
      error: error => {
        console.error('Sprint completion failed', error);
        this.showToast(error?.error?.message || 'Could not complete sprint');
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

  private filterUsers(query: string): any[] {
    const normalized = String(query || '').trim().toLowerCase();
    const users = this.users();
    if (!normalized) return users.slice(0, 8);

    return users.filter(user => {
      const employeeCode = `${user?.employeeIdPrefix ?? ''}${user?.employeeIdNumber ?? ''}`;
      return [user?.name, user?.email, employeeCode, user?.employeeIdPrefix, user?.employeeIdNumber]
        .some(value => String(value ?? '').toLowerCase().includes(normalized));
    }).slice(0, 8);
  }

  private currentPersonId(kind: 'ASSIGNEE' | 'REPORTER'): number | null {
    const active = this.activeModal();

    const value = kind === 'ASSIGNEE'
      ? active === 'EPIC'
        ? this.currentEpic.assignee_user_id
        : active === 'STORY'
          ? this.currentStory.assignee_user_id
          : active === 'TASK'
            ? this.currentTask.assignee_user_id
            : this.currentIssue.assignee_user_id
      : active === 'EPIC'
        ? this.currentEpic.reporter_user_id
        : active === 'STORY'
          ? this.currentStory.reporter_user_id
          : active === 'TASK'
            ? this.currentTask.reporter_user_id
            : this.currentIssue.reporter_user_id;

    return this.nullableNumber(value);
  }

  private setCurrentPersonId(kind: 'ASSIGNEE' | 'REPORTER', userId: number | null): void {
    if (this.activeModal() === 'EPIC') {
      if (kind === 'ASSIGNEE') this.currentEpic.assignee_user_id = userId;
      else this.currentEpic.reporter_user_id = userId;
    } else if (this.activeModal() === 'STORY') {
      if (kind === 'ASSIGNEE') this.currentStory.assignee_user_id = userId;
      else this.currentStory.reporter_user_id = userId;
    } else if (this.activeModal() === 'TASK') {
      if (kind === 'ASSIGNEE') this.currentTask.assignee_user_id = userId;
      else this.currentTask.reporter_user_id = userId;
    } else if (this.activeModal() === 'ISSUE') {
      if (kind === 'ASSIGNEE') this.currentIssue.assignee_user_id = userId;
      else this.currentIssue.reporter_user_id = userId;
    }
  }

  private userDisplayName(userId: number | null | undefined): string {
    if (!userId) return '';
    return String(this.userMap().get(Number(userId))?.name || '');
  }

  userEmployeeCode(user: any): string {
    const prefix = String(user?.employeeIdPrefix ?? user?.employee_id_prefix ?? '').trim();
    const number = String(user?.employeeIdNumber ?? user?.employee_id_number ?? '').trim();
    return `${prefix}${number}`.trim();
  }

  syncPersonSearchFields(): void {
    this.assigneeSearchTerm.set(this.userDisplayName(this.currentPersonId('ASSIGNEE')));
    this.reporterSearchTerm.set(this.userDisplayName(this.currentPersonId('REPORTER')));
    this.personAutocompleteOpen.set(null);
  }

  openPersonAutocomplete(kind: 'ASSIGNEE' | 'REPORTER'): void {
    if (this.isReadOnly()) return;
    this.personAutocompleteOpen.set(kind);
  }

  onPersonSearch(kind: 'ASSIGNEE' | 'REPORTER', value: string): void {
    const term = String(value ?? '');
    if (kind === 'ASSIGNEE') this.assigneeSearchTerm.set(term);
    else this.reporterSearchTerm.set(term);

    const selectedName = this.userDisplayName(this.currentPersonId(kind));
    if (term.trim().toLowerCase() !== selectedName.trim().toLowerCase()) {
      this.setCurrentPersonId(kind, null);
    }
    this.personAutocompleteOpen.set(kind);
  }

  selectPerson(kind: 'ASSIGNEE' | 'REPORTER', user: any): void {
    const id = this.nullableNumber(user?.id ?? user?.user_id ?? user?.userId);
    this.setCurrentPersonId(kind, id);
    const name = String(user?.name || user?.email || '');
    if (kind === 'ASSIGNEE') this.assigneeSearchTerm.set(name);
    else this.reporterSearchTerm.set(name);
    this.personAutocompleteOpen.set(null);
  }

  clearPerson(kind: 'ASSIGNEE' | 'REPORTER'): void {
    this.setCurrentPersonId(kind, null);
    if (kind === 'ASSIGNEE') this.assigneeSearchTerm.set('');
    else this.reporterSearchTerm.set('');
    this.personAutocompleteOpen.set(null);
  }

  closePersonAutocompleteLater(): void {
    window.setTimeout(() => this.personAutocompleteOpen.set(null), 120);
  }

  getUserName(userId: number | null | undefined): string {
    if (userId === null || userId === undefined) return 'Unassigned';
    return String(this.userMap().get(Number(userId))?.name || 'Unassigned');
  }

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
      if (this.sprintProgressOpen()) {
        this.closeSprintProgress();
      } else if (this.testCasePopupOpen()) {
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

  trackByDirectoryEpic(index: number, item: EpicDirectoryItem): number {
  return Number(item?.epic?.id ?? index);
}

trackByDirectoryStory(index: number, item: StoryDirectoryItem): number {
  return Number(item?.story?.id ?? index);
}

trackByDirectoryTask(index: number, item: TaskDirectoryItem): number {
  return Number(item?.task?.id ?? index);
}

}
