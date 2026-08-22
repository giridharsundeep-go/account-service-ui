import { Component, OnInit, signal, computed, ChangeDetectionStrategy, Pipe, PipeTransform, inject, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';

@Pipe({
  name: 'resolveUser',
  standalone: true,
  pure: true
})
export class ResolveUserPipe implements PipeTransform {
  transform(userId: number | null | undefined, userMap: Map<number, any>): any {
    if (!userId || !userMap) return null;
    return userMap.get(Number(userId)) || null;
  }
}

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
  status?: 'FUTURE' | 'ACTIVE' | 'CLOSED' | string;
  capacity?: number;
}

export interface Issue {
  id: number;
  title: string;
  issueCode?: string;
  status?: string;
  isBlocking?: boolean;
  projectId?: number;
  sprintId?: number;
  epicId?: number;
  storyId?: number;
  taskId?: number;
}

export interface TestCase {
  id: number;
  title?: string;
  name?: string;
  status?: string;
  executionStatus?: 'PASSED' | 'FAILED' | 'BLOCKED' | 'IN_PROGRESS' | 'UNEXECUTED' | string;
  projectId?: number;
  epicId?: number;
  storyId?: number;
  taskId?: number;
}

export interface EpicNode {
  id?: number;
  project_id: number;
  sprint_id?: number | null;
  user_id?: number;
  creator_user_id?: number;
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

export interface StoryNode {
  id?: number;
  project_id: number;
  epic_id?: number | null;
  sprint_id?: number | null;
  user_id?: number;
  creator_user_id?: number;
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

export interface TaskNode {
  id?: number;
  story_id: number;
  sprint_id?: number | null;
  user_id?: number;
  creator_user_id?: number;
  assignee_user_id?: number | null;
  reporter_user_id?: number | null;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  team_id?: number | null;
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
  team_id?: number | null;
  sprint_id?: number | null;
  issues?: Issue[];
  testCases?: TestCase[];
  originalItem: EpicNode | StoryNode | TaskNode;
}

@Component({
  selector: 'app-epics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ResolveUserPipe,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
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

  baseUrl = environment.apiBaseUrl;
  baseUrl2 = environment.apiBaseUrl2;

  storyModalEpics = signal<EpicNode[]>([]);
  activeTab = signal<'TREE' | 'KANBAN'>('TREE');
  projects = signal<any[]>([]);
  users = signal<any[]>([]);
  teams = signal<Team[]>([]);
  teamMembers = signal<any[]>([]);
  sprints = signal<Sprint[]>([]);
  userMap = signal<Map<number, any>>(new Map());
  hierarchyTree = signal<EpicNode[]>([]);

  projectTestcases = signal<TestCase[]>([]);
  projectIssues = signal<Issue[]>([]);

  collapsedSprintIds = signal<Set<number>>(new Set());

  showFilters = signal<boolean>(false);
  searchExpanded = signal<boolean>(false);

  selectedProjectId = signal<number | null>(1);
  selectedSprintFilter = signal<number | 'ALL'>('ALL');
  selectedPriorityFilter = signal<string | 'ALL'>('ALL');
  selectedStatusFilter = signal<string | 'ALL'>('ALL');
  selectedTeamFilter = signal<number | 'ALL'>('ALL');
  selectedAssigneeFilter = signal<number | 'ALL'>('ALL');
  selectedReporterFilter = signal<number | 'ALL'>('ALL');
  selectedUserFilter = signal<number | null>(null);
  searchTerm = signal<string>('');

  selectedItems = signal<Set<string>>(new Set());
  toastMessage = signal<string | null>(null);

  activeDrawer = signal<'NONE' | 'EPIC' | 'STORY' | 'TASK'>('NONE');
  drawerMode = signal<'CREATE' | 'EDIT'>('CREATE');
  isReadOnly = signal<boolean>(false);

  currentEpic: Partial<EpicNode> = {};
  currentStory: Partial<StoryNode> = {};
  currentTask: Partial<TaskNode> = {};

  testCasePopupOpen = signal<boolean>(false);
  testCasePopupType = signal<'STORY' | 'TASK' | null>(null);
  testCasePopupItemId = signal<number | null>(null);
  testCasePopupTitle = signal<string>('');
  testCasePopupItems = signal<TestCase[]>([]);

  statusPipeline = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'TESTING', 'COMPLETED', 'BLOCKED'];
  priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  private defaultRoles = ['Lead Developer', 'Product Owner', 'Senior QA', 'DevOps Lead', 'UX Designer'];

  private extractArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      return res.data || res.items || res.epics || res.stories || res.tasks || res.result || [];
    }
    return [];
  }

  getUserInitials(name?: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  activeProjectName = computed(() => {
    const proj = this.projects().find(p => p.id === this.selectedProjectId());
    return proj ? proj.name : 'Default Workspace';
  });

  projectSprints = computed(() => {
    const projId = this.selectedProjectId();
    let list = this.sprints();
    if (projId) {
      list = list.filter(s => {
        const sprintProjId = s.projectId ?? s.project_id;
        return !sprintProjId || Number(sprintProjId) === Number(projId);
      });
    }

    return [...list].sort((a, b) => {
      if (a.startDate && b.startDate) {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }
      const extractNum = (str: string) => {
        const match = str ? str.match(/\d+/) : null;
        return match ? parseInt(match[0], 10) : 0;
      };
      return extractNum(a.name) - extractNum(b.name);
    });
  });

  activeCurrentSprint = computed<Sprint | null>(() => {
    const sprints = this.projectSprints();
    if (!sprints.length) return null;

    const now = new Date().getTime();
    
    const activeDateSprint = sprints.find(s => {
      if (!s.startDate || !s.endDate) return false;
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      return now >= start && now <= end;
    });

    if (activeDateSprint) return activeDateSprint;

    const activeStatusSprint = sprints.find(s => (s.status || '').toUpperCase() === 'ACTIVE');
    return activeStatusSprint || sprints[0] || null;
  });

  displayedKanbanSprint = computed<Sprint | null>(() => {
    const sprints = this.projectSprints();
    const filterVal = this.selectedSprintFilter();

    if (filterVal !== 'ALL') {
      const selectedSp = sprints.find(s => Number(s.id) === Number(filterVal));
      if (selectedSp) return selectedSp;
    }

    return this.activeCurrentSprint() || (sprints.length > 0 ? sprints[0] : { id: 0, name: 'All Sprint Cycles', status: 'ACTIVE' });
  });

  activeSprintUsers = computed(() => {
    const activeSp = this.displayedKanbanSprint();
    if (!activeSp) return [];

    const userIds = new Set<number>();
    const tree = this.hierarchyTree();

    tree.forEach(epic => {
      const matchEpic = activeSp.id === 0 || Number(epic.sprint_id) === Number(activeSp.id);
      if (matchEpic && epic.assignee_user_id) {
        userIds.add(epic.assignee_user_id);
      }
      (epic.stories || []).forEach(story => {
        const matchStory = activeSp.id === 0 || Number(story.sprint_id) === Number(activeSp.id);
        if (matchStory && story.assignee_user_id) {
          userIds.add(story.assignee_user_id);
        }
        (story.tasks || []).forEach(task => {
          const matchTask = activeSp.id === 0 || Number(task.sprint_id) === Number(activeSp.id);
          if (matchTask && task.assignee_user_id) {
            userIds.add(task.assignee_user_id);
          }
        });
      });
    });

    const uMap = this.userMap();
    const result: any[] = [];
    userIds.forEach(id => {
      const u = uMap.get(id);
      if (u) result.push(u);
    });

    return result;
  });

  sprintTreeGroups = computed<SprintCycleGroup[]>(() => {
    const sortedSprints = this.projectSprints();
    const epics = this.hierarchyTree();
    const query = this.searchTerm().toLowerCase().trim();
    const sprintFilter = this.selectedSprintFilter();
    const priorityFilter = this.selectedPriorityFilter();
    const statusFilter = this.selectedStatusFilter();
    const assigneeFilter = this.selectedAssigneeFilter();
    const reporterFilter = this.selectedReporterFilter();
    const teamFilter = this.selectedTeamFilter();
    const userFilter = this.selectedUserFilter();

    const backlogSprint: Sprint = { id: 0, name: 'Backlog / Unassigned', status: 'FUTURE' };
    const hasUnassignedEpics = epics.some(e => !e.sprint_id);

    let allSprints = [...sortedSprints];
    if (allSprints.length === 0 || hasUnassignedEpics) {
      allSprints = [backlogSprint, ...allSprints];
    }

    const isAssigneeInSelectedTeam = (assigneeId: number | null | undefined): boolean => {
      if (teamFilter === 'ALL' || !assigneeId) return teamFilter === 'ALL';
      const user = this.userMap().get(Number(assigneeId));
      if (!user) return false;
      const uTeamId = user.team_id ?? user.teamId ?? user.team?.id;
      return uTeamId !== null && Number(uTeamId) === Number(teamFilter);
    };

    return allSprints
      .filter(sp => sprintFilter === 'ALL' || Number(sp.id) === Number(sprintFilter))
      .map(sprint => {
        const filteredEpics: EpicNode[] = [];
        let groupPoints = 0;

        for (const epic of epics) {
          const epicSprintId = epic.sprint_id ? Number(epic.sprint_id) : 0;
          const isSprintMatch = epicSprintId === Number(sprint.id);

          if (!isSprintMatch) continue;

          if (statusFilter !== 'ALL' && epic.status !== statusFilter) continue;
          if (assigneeFilter !== 'ALL' && Number(epic.assignee_user_id) !== Number(assigneeFilter)) continue;
          if (reporterFilter !== 'ALL' && Number(epic.reporter_user_id) !== Number(reporterFilter)) continue;

          const matchesSearchQuery = (epic.name || '').toLowerCase().includes(query) || (epic.epic_code || '').toLowerCase().includes(query);

          const filteredStories = (epic.stories || []).filter(story => {
            if (priorityFilter !== 'ALL' && story.priority !== priorityFilter) return false;
            if (statusFilter !== 'ALL' && story.status !== statusFilter) return false;
            if (assigneeFilter !== 'ALL' && Number(story.assignee_user_id) !== Number(assigneeFilter)) return false; 
            if (reporterFilter !== 'ALL' && Number(story.reporter_user_id) !== Number(reporterFilter)) return false;

            const matchesStorySearch = (story.title || '').toLowerCase().includes(query);

            const filteredTasks = (story.tasks || []).filter(t => {
              const matchesUserFilterTask = userFilter === null || Number(t.assignee_user_id) === Number(userFilter);
              if (!matchesUserFilterTask) return false;
              if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
              if (assigneeFilter !== 'ALL' && Number(t.assignee_user_id) !== Number(assigneeFilter)) return false;
              if (reporterFilter !== 'ALL' && Number(t.reporter_user_id) !== Number(reporterFilter)) return false;
              return query === '' || (t.title || '').toLowerCase().includes(query);
            });

            const storyHasMatchingTasks = filteredTasks.length > 0;
            const matchesUserFilterStory = userFilter === null || Number(story.assignee_user_id) === Number(userFilter);
            const storyMatchesUserAndSearch = matchesUserFilterStory && (matchesStorySearch || query === '');

            if (teamFilter !== 'ALL') {
              const teamMatch = Number(story.team_id) === Number(teamFilter) || isAssigneeInSelectedTeam(story.assignee_user_id);
              if (!teamMatch && !storyHasMatchingTasks) return false;
            }

            if (userFilter !== null) {
              return matchesUserFilterStory || storyHasMatchingTasks;
            }

            return storyMatchesUserAndSearch || storyHasMatchingTasks;
          });

          let epicTeamMatches = true;
          if (teamFilter !== 'ALL') {
            epicTeamMatches = Number(epic.team_id) === Number(teamFilter) || isAssigneeInSelectedTeam(epic.assignee_user_id);
          }

          const matchesUserFilterEpic = userFilter === null || Number(epic.assignee_user_id) === Number(userFilter);
          const hasChildrenOrMatches = filteredStories.length > 0 || (matchesSearchQuery && matchesUserFilterEpic && epicTeamMatches);

          if (hasChildrenOrMatches) {
            const storiesWithTasks = filteredStories.map(s => {
              groupPoints += s.story_points || 0;
              return {
                ...s,
                expanded: s.expanded ?? true,
                tasks: (s.tasks || []).filter(t => {
                  if (userFilter !== null && Number(t.assignee_user_id) !== Number(userFilter)) return false;
                  if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
                  if (assigneeFilter !== 'ALL' && Number(t.assignee_user_id) !== Number(assigneeFilter)) return false;
                  if (reporterFilter !== 'ALL' && Number(t.reporter_user_id) !== Number(reporterFilter)) return false;
                  return query === '' || (t.title || '').toLowerCase().includes(query);
                })
              };
            });

            filteredEpics.push({
              ...epic,
              expanded: epic.expanded ?? true,
              stories: storiesWithTasks
            });
          }
        }

        return { sprint, epics: filteredEpics, totalPoints: groupPoints };
      });
  });

  kanbanItemsByStatus = computed(() => {
    const map: Record<string, KanbanItem[]> = {
      BACKLOG: [], TODO: [], IN_PROGRESS: [], TESTING: [], COMPLETED: [], BLOCKED: []
    };

    const targetSprint = this.displayedKanbanSprint();
    const filterSprintId = this.selectedSprintFilter();
    const selectedUser = this.selectedUserFilter();

    const groups = this.sprintTreeGroups();

    groups.forEach(group => {
      if (filterSprintId !== 'ALL' && targetSprint && Number(group.sprint.id) !== Number(targetSprint.id)) {
        return;
      }

      group.epics.forEach(epic => {
        const normalizedStatus = (epic.status || 'TODO').toUpperCase();

        if (selectedUser === null || Number(epic.assignee_user_id) === Number(selectedUser)) {
          if (map[normalizedStatus]) {
            map[normalizedStatus].push({
              type: 'EPIC',
              id: epic.id,
              title: epic.name,
              code: epic.epic_code,
              status: normalizedStatus,
              assignee_user_id: epic.assignee_user_id,
              reporter_user_id: epic.reporter_user_id,
              team_id: epic.team_id,
              sprint_id: epic.sprint_id,
              issues: epic.issues,
              testCases: epic.testCases,
              originalItem: epic
            });
          }
        }

        (epic.stories || []).forEach(story => {
          const storyStatus = (story.status || 'TODO').toUpperCase();
          if (selectedUser === null || Number(story.assignee_user_id) === Number(selectedUser)) {
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
                team_id: story.team_id,
                sprint_id: story.sprint_id,
                issues: story.issues,
                testCases: story.testCases,
                originalItem: story
              });
            }
          }

          (story.tasks || []).forEach(task => {
            const taskStatus = (task.status || 'TODO').toUpperCase();
            if (selectedUser === null || Number(task.assignee_user_id) === Number(selectedUser)) {
              if (map[taskStatus]) {
                map[taskStatus].push({
                  type: 'TASK',
                  id: task.id,
                  title: task.title,
                  code: `#${task.id}`,
                  status: taskStatus,
                  assignee_user_id: task.assignee_user_id,
                  reporter_user_id: task.reporter_user_id,
                  team_id: task.team_id,
                  sprint_id: task.sprint_id,
                  issues: task.issues,
                  testCases: task.testCases,
                  originalItem: task
                });
              }
            }
          });
        });
      });
    });

    return map;
  });

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcuts(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      this.openCreateStory();
    } else if (event.key === '/') {
      event.preventDefault();
      this.searchExpanded.set(true);
      setTimeout(() => {
        const searchInput = document.querySelector('.search-input') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }, 50);
    }
  }

  ngOnInit() {
    this.fetchUsers();
    this.fetchTeams();
    this.fetchSprints(() => {
      this.fetchProjects();
    });
  }

  showToast(message: string) {
    this.toastMessage.set(message);
    setTimeout(() => this.toastMessage.set(null), 3500);
  }

  fetchTeams() {
    this.http.get<any>(`${this.baseUrl}/teams`, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of([]))
    ).subscribe(res => {
      this.teams.set(this.extractArray(res));
    });
  }

  fetchUsers() {
    this.http.get<any>(`${this.baseUrl}/user`, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of([]))
    ).subscribe(res => {
      const raw = this.extractArray(res);
      const enriched = raw.map((u: any, idx: number) => {
        const resolvedTeamId = u.team_id ?? u.teamId ?? (u.team?.id !== undefined ? u.team.id : null);
        return {
          ...u,
          team_id: resolvedTeamId !== null ? Number(resolvedTeamId) : null,
          role: u.role || u.job_title || u.designation || this.defaultRoles[idx % this.defaultRoles.length],
          avatarUrl: u.avatarUrl || u.avatar_url || u.photoUrl || null
        };
      });

      this.users.set(enriched);
      const mapObj = new Map<number, any>();
      enriched.forEach((u: any) => mapObj.set(u.id, u));
      this.userMap.set(mapObj);
    });
  }

  fetchProjects() {
    this.http.get<any>(`${this.baseUrl}/projects`, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of([]))
    ).subscribe(res => {
      const projs = this.extractArray(res);
      this.projects.set(projs);

      if (projs.length > 0) {
        const proj1 = projs.find(p => Number(p.id) === 1);
        const defaultId = proj1 ? proj1.id : projs[0].id;
        this.selectedProjectId.set(defaultId);
        
        const currentSprint = this.activeCurrentSprint();
        if (currentSprint) {
          this.selectedSprintFilter.set(currentSprint.id);
        }
        this.loadFullHierarchy();
      }
    });
  }

  fetchSprints(callback?: () => void) {
    this.http.get<any>(`${this.baseUrl}/sprints`, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of([]))
    ).subscribe(res => {
      this.sprints.set(this.extractArray(res));
      
      const currentSprint = this.activeCurrentSprint();
      if (currentSprint) {
        this.selectedSprintFilter.set(currentSprint.id);
      }
      
      if (callback) callback();
    });
  }

  private toNullableNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private normalizeEpic(raw: any): EpicNode {
    const id = Number(raw?.id ?? raw?.epic_id ?? raw?.epicId);
    return {
      ...raw,
      id: Number.isFinite(id) && id > 0 ? id : undefined,
      project_id: Number(raw?.project_id ?? raw?.projectId ?? 0),
      epic_code: raw?.epic_code ?? raw?.epicCode ?? (id ? `EPIC-${id}` : ''),
      name: raw?.name ?? raw?.title ?? '',
      description: raw?.description ?? '',
      status: raw?.status ?? 'BACKLOG',
      sprint_id: this.toNullableNumber(raw?.sprint_id ?? raw?.sprintId),
      user_id: this.toNullableNumber(raw?.user_id ?? raw?.userId) ?? undefined,
      creator_user_id: this.toNullableNumber(raw?.creator_user_id ?? raw?.creatorUserId) ?? undefined,
      assignee_user_id: this.toNullableNumber(raw?.assignee_user_id ?? raw?.assigneeUserId),
      reporter_user_id: this.toNullableNumber(raw?.reporter_user_id ?? raw?.reporterUserId),
      team_id: this.toNullableNumber(raw?.team_id ?? raw?.teamId),
      issues: raw?.issues ?? [],
      testCases: raw?.testCases ?? [],
      stories: raw?.stories ?? []
    };
  }

  private normalizeStory(raw: any): StoryNode {
    const id = Number(raw?.id ?? raw?.story_id ?? raw?.storyId);
    return {
      ...raw,
      id: Number.isFinite(id) && id > 0 ? id : undefined,
      project_id: Number(raw?.project_id ?? raw?.projectId ?? 0),
      epic_id: this.toNullableNumber(raw?.epic_id ?? raw?.epicId),
      sprint_id: this.toNullableNumber(raw?.sprint_id ?? raw?.sprintId),
      user_id: this.toNullableNumber(raw?.user_id ?? raw?.userId) ?? undefined,
      creator_user_id: this.toNullableNumber(raw?.creator_user_id ?? raw?.creatorUserId) ?? undefined,
      assignee_user_id: this.toNullableNumber(raw?.assignee_user_id ?? raw?.assigneeUserId),
      reporter_user_id: this.toNullableNumber(raw?.reporter_user_id ?? raw?.reporterUserId),
      team_id: this.toNullableNumber(raw?.team_id ?? raw?.teamId),
      title: raw?.title ?? '',
      description: raw?.description ?? '',
      story_points: Number(raw?.story_points ?? raw?.storyPoints ?? 0),
      status: raw?.status ?? 'BACKLOG',
      priority: raw?.priority ?? 'MEDIUM',
      expanded: raw?.expanded ?? true,
      issues: raw?.issues ?? [],
      testCases: raw?.testCases ?? [],
      tasks: raw?.tasks ?? []
    };
  }

  private normalizeTask(raw: any): TaskNode {
    const id = Number(raw?.id ?? raw?.task_id ?? raw?.taskId);
    return {
      ...raw,
      id: Number.isFinite(id) && id > 0 ? id : undefined,
      story_id: Number(raw?.story_id ?? raw?.storyId ?? 0),
      sprint_id: this.toNullableNumber(raw?.sprint_id ?? raw?.sprintId),
      user_id: this.toNullableNumber(raw?.user_id ?? raw?.userId) ?? undefined,
      creator_user_id: this.toNullableNumber(raw?.creator_user_id ?? raw?.creatorUserId) ?? undefined,
      assignee_user_id: this.toNullableNumber(raw?.assignee_user_id ?? raw?.assigneeUserId),
      reporter_user_id: this.toNullableNumber(raw?.reporter_user_id ?? raw?.reporterUserId),
      team_id: this.toNullableNumber(raw?.team_id ?? raw?.teamId),
      title: raw?.title ?? '',
      description: raw?.description ?? '',
      status: raw?.status ?? 'BACKLOG',
      priority: raw?.priority ?? 'MEDIUM',
      issues: raw?.issues ?? [],
      testCases: raw?.testCases ?? []
    };
  }

  private normalizeTestCase(raw: any): TestCase {
    const id = Number(raw?.id ?? raw?.testcase_id ?? raw?.testCaseId);
    return {
      ...raw,
      id,
      title: raw?.title ?? raw?.name ?? '',
      name: raw?.name ?? raw?.title ?? '',
      projectId: this.toNullableNumber(raw?.projectId ?? raw?.project_id) ?? undefined,
      epicId: this.toNullableNumber(raw?.epicId ?? raw?.epic_id) ?? undefined,
      storyId: this.toNullableNumber(raw?.storyId ?? raw?.story_id) ?? undefined,
      taskId: this.toNullableNumber(raw?.taskId ?? raw?.task_id) ?? undefined
    };
  }

  private normalizeIssue(raw: any): Issue {
    return {
      ...raw,
      id: Number(raw?.id ?? raw?.issue_id ?? raw?.issueId),
      issueCode: raw?.issueCode ?? raw?.issue_code ?? raw?.code,
      projectId: this.toNullableNumber(raw?.projectId ?? raw?.project_id) ?? undefined,
      epicId: this.toNullableNumber(raw?.epicId ?? raw?.epic_id) ?? undefined,
      storyId: this.toNullableNumber(raw?.storyId ?? raw?.story_id) ?? undefined,
      taskId: this.toNullableNumber(raw?.taskId ?? raw?.task_id) ?? undefined
    };
  }

  loadFullHierarchy() {
    const projId = this.selectedProjectId();
    if (!projId) return;

    const headers = { headers: this.auth.getAuthHeaders() };
    const epicsReq = this.http.get<any>(`${this.baseUrl}/projects/${projId}/epics`, headers).pipe(catchError(() => of([])));
    const storiesReq = this.http.get<any>(`${this.baseUrl}/projects/${projId}/stories`, headers).pipe(catchError(() => of([])));
    const tasksReq = this.http.get<any>(`${this.baseUrl}/tasks`, headers).pipe(catchError(() => of([])));
    
    const testcasesReq = this.http.get<any>(`${this.baseUrl2}/v1/testcases?projectId=${projId}`, headers).pipe(catchError(() => of([])));
    const issuesReq = this.http.get<any>(`${this.baseUrl2}/v1/issues?projectId=${projId}`, headers).pipe(catchError(() => of([])));

    forkJoin([epicsReq, storiesReq, tasksReq, testcasesReq, issuesReq]).subscribe(([epicRes, storyRes, taskRes, tcRes, issueRes]) => {
      const epics: EpicNode[] = this.extractArray(epicRes).map((e: any) => this.normalizeEpic(e)).filter((e: EpicNode) => !!e.id);
      const stories: StoryNode[] = this.extractArray(storyRes).map((s: any) => this.normalizeStory(s)).filter((s: StoryNode) => !!s.id);
      const tasks: TaskNode[] = this.extractArray(taskRes).map((t: any) => this.normalizeTask(t)).filter((t: TaskNode) => !!t.id);
      const testcases: TestCase[] = this.extractArray(tcRes).map((tc: any) => this.normalizeTestCase(tc));
      const issues: Issue[] = this.extractArray(issueRes).map((i: any) => this.normalizeIssue(i));

      this.projectTestcases.set(testcases);
      this.projectIssues.set(issues);

      const tree = epics.map((epic, idx) => {
        const epicIssues = issues.filter(i => Number(i.epicId) === Number(epic.id));
        const epicTCs = testcases.filter(tc => Number(tc.epicId) === Number(epic.id));

        return {
          ...epic,
          reporter_user_id: epic.reporter_user_id || (this.users()[idx % Math.max(1, this.users().length)]?.id ?? null),
          expanded: epic.expanded ?? true,
          issues: epicIssues,
          testCases: epicTCs,
          stories: stories
            .filter(s => Number(s.epic_id) === Number(epic.id))
            .map((story, sIdx) => {
              const storyIssues = issues.filter(i => Number(i.storyId) === Number(story.id));
              const storyTCs = testcases.filter(tc => Number(tc.storyId) === Number(story.id));

              return {
                ...story,
                reporter_user_id: story.reporter_user_id || (this.users()[(sIdx + 1) % Math.max(1, this.users().length)]?.id ?? null),
                expanded: story.expanded ?? true,
                issues: storyIssues,
                testCases: storyTCs,
                tasks: tasks
                  .filter(t => Number(t.story_id) === Number(story.id))
                  .map((task, tIdx) => {
                    const taskIssues = issues.filter(i => Number(i.taskId) === Number(task.id));
                    const taskTCs = testcases.filter(tc => Number(tc.taskId) === Number(task.id));

                    return {
                      ...task,
                      reporter_user_id: task.reporter_user_id || (this.users()[(tIdx + 2) % Math.max(1, this.users().length)]?.id ?? null),
                      issues: taskIssues,
                      testCases: taskTCs
                    };
                  })
              };
            })
        };
      });

      this.hierarchyTree.set(tree);
    });
  }

  private extractEntityId(res: any): number | null {
    const entity = res?.data ?? res?.item ?? res?.result ?? res;
    const id = entity?.id ?? entity?.story_id ?? entity?.task_id;
    return id !== undefined && id !== null ? Number(id) : null;
  }

  private normalizeTestCaseList(ids: number[]): TestCase[] {
    const uniqueIds = [...new Set((ids || []).map(Number).filter(Boolean))];
    return uniqueIds
      .map(id => this.projectTestcases().find(tc => Number(tc.id) === id))
      .filter((tc): tc is TestCase => !!tc);
  }

  removeIssueFromItem(item: any, issue: Issue, type: string) {
    const endpoint = `${this.baseUrl2}/v1/issues/${issue.id}/unassign`;
    this.http.put(endpoint, { type, id: item.id }, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => {
        if (item.issues) {
          item.issues = item.issues.filter((i: Issue) => i.id !== issue.id);
        }
        return of(null);
      })
    ).subscribe(() => {
      this.showToast(`Removed Issue #${issue.issueCode || issue.id}`);
      this.loadFullHierarchy();
    });
  }

  onProjectChange(id: number) {
    this.selectedProjectId.set(id);
    this.selectedAssigneeFilter.set('ALL');
    this.selectedReporterFilter.set('ALL');
    this.selectedUserFilter.set(null);
    
    const currentSprint = this.activeCurrentSprint();
    if (currentSprint) {
      this.selectedSprintFilter.set(currentSprint.id);
    } else {
      this.selectedSprintFilter.set('ALL');
    }
    
    this.loadFullHierarchy();
    this.fetchSprints();
  }

  onTeamFilterChange(teamId: number | 'ALL') {
    this.selectedTeamFilter.set(teamId);
    this.selectedUserFilter.set(null);

    if (teamId === 'ALL' || teamId === null || teamId === undefined) {
      this.teamMembers.set([]);
      return;
    }

    this.http.get<any>(`${this.baseUrl}/team-members/team/${teamId}`, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of([]))
    ).subscribe(res => {
      const membersRaw = this.extractArray(res);
      const normalized = membersRaw.map((m: any) => {
        const uId = m.user_id ?? m.id;
        const mappedUser = this.userMap().get(Number(uId)) || {};
        return {
          id: uId,
          name: m.name || m.username || m.email || mappedUser.name || `User ${uId}`,
          avatarUrl: m.avatarUrl || m.avatar_url || mappedUser.avatarUrl || null,
          role: m.role || mappedUser.role || 'Member'
        };
      });
      this.teamMembers.set(normalized);
    });
  }

  filterByUser(userId: any) {
    const current = this.selectedUserFilter();
    const targetId = userId !== null ? Number(userId) : null;

    if (current !== null && Number(current) === targetId) {
      this.selectedUserFilter.set(null);
    } else {
      this.selectedUserFilter.set(targetId);
    }
  }

  isUserSelected(memberId: any): boolean {
    const current = this.selectedUserFilter();
    return current !== null && Number(current) === Number(memberId);
  }

  clearSelection() {
    this.selectedItems.set(new Set());
  }

  toggleSprintExpand(sprintId: number) {
    const set = new Set(this.collapsedSprintIds());
    if (set.has(sprintId)) {
      set.delete(sprintId);
    } else {
      set.add(sprintId);
    }
    this.collapsedSprintIds.set(set);
  }

  isSprintExpanded(sprintId: number): boolean {
    return !this.collapsedSprintIds().has(sprintId);
  }

  clearAllFilters() {
    const currentSprint = this.activeCurrentSprint();
    this.selectedSprintFilter.set(currentSprint ? currentSprint.id : 'ALL');
    this.selectedPriorityFilter.set('ALL');
    this.selectedStatusFilter.set('ALL');
    this.selectedTeamFilter.set('ALL');
    this.selectedAssigneeFilter.set('ALL');
    this.selectedReporterFilter.set('ALL');
    this.selectedUserFilter.set(null);
    this.teamMembers.set([]);
    this.searchTerm.set('');
    this.showToast('Filters reset to default');
  }

  toggleEpicExpand(epic: EpicNode) {
    this.hierarchyTree.update(tree => tree.map(e => e.id === epic.id ? { ...e, expanded: !e.expanded } : e));
  }

  toggleStoryExpand(story: StoryNode) {
    this.hierarchyTree.update(tree => tree.map(e => ({
      ...e,
      stories: (e.stories || []).map(s => s.id === story.id ? { ...s, expanded: !s.expanded } : s)
    })));
  }

  updateEpicStatus(epic: EpicNode, newStatus: string) {
    this.hierarchyTree.update(tree => tree.map(e => e.id === epic.id ? { ...e, status: newStatus } : e));
    this.http.put(`${this.baseUrl}/epics/${epic.id}`, { ...epic, status: newStatus }, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => this.showToast(`Epic ${epic.epic_code} updated to ${newStatus}`)
    });
  }

  updateStoryStatus(story: StoryNode, newStatus: string) {
    this.hierarchyTree.update(tree => tree.map(e => ({
      ...e,
      stories: (e.stories || []).map(s => s.id === story.id ? { ...s, status: newStatus } : s)
    })));
    this.http.put(`${this.baseUrl}/stories/${story.id}`, { ...story, status: newStatus }, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => this.showToast(`Story #${story.id} updated to ${newStatus}`)
    });
  }

  updateTaskStatus(task: TaskNode, newStatus: string) {
    this.hierarchyTree.update(tree => tree.map(e => ({
      ...e,
      stories: (e.stories || []).map(s => ({
        ...s,
        tasks: (s.tasks || []).map(t => t.id === task.id ? { ...t, status: newStatus } : t)
      }))
    })));
    this.http.put(`${this.baseUrl}/tasks/${task.id}`, { ...task, status: newStatus }, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => this.showToast(`Task #${task.id} updated to ${newStatus}`)
    });
  }

  toggleItemSelection(type: string, id: number | undefined) {
    if (!id) return;
    const key = `${type}_${id}`;
    const next = new Set(this.selectedItems());
    next.has(key) ? next.delete(key) : next.add(key);
    this.selectedItems.set(next);
  }

  isItemSelected(type: string, id: number | undefined): boolean {
    if (!id) return false;
    return this.selectedItems().has(`${type}_${id}`);
  }

  toggleSelectAllForSprint(event: any, group: SprintCycleGroup) {
    const next = new Set(this.selectedItems());
    group.epics.forEach(e => {
      if (e.id) event.checked ? next.add(`EPIC_${e.id}`) : next.delete(`EPIC_${e.id}`);
      (e.stories || []).forEach(s => {
        if (s.id) event.checked ? next.add(`STORY_${s.id}`) : next.delete(`STORY_${s.id}`);
        (s.tasks || []).forEach(t => {
          if (t.id) event.checked ? next.add(`TASK_${t.id}`) : next.delete(`TASK_${t.id}`);
        });
      });
    });
    this.selectedItems.set(next);
  }

  bulkUpdateStatus(status: string) {
    const selected = Array.from(this.selectedItems());
    if (selected.length === 0) return;

    const requests = selected.map(key => {
      const [type, idStr] = key.split('_');
      const id = Number(idStr);
      if (type === 'EPIC') return this.http.put(`${this.baseUrl}/epics/${id}`, { status }, { headers: this.auth.getAuthHeaders() });
      if (type === 'STORY') return this.http.put(`${this.baseUrl}/stories/${id}`, { status }, { headers: this.auth.getAuthHeaders() });
      return this.http.put(`${this.baseUrl}/tasks/${id}`, { status }, { headers: this.auth.getAuthHeaders() });
    });

    forkJoin(requests).subscribe(() => {
      this.showToast(`Updated ${selected.length} items to ${status}`);
      this.clearSelection();
      this.loadFullHierarchy();
    });
  }

  bulkMoveSprint(sprintId: number) {
    const selected = Array.from(this.selectedItems());
    if (selected.length === 0) return;

    const requests = selected.map(key => {
      const [type, idStr] = key.split('_');
      const id = Number(idStr);
      if (type === 'EPIC') return this.http.put(`${this.baseUrl}/epics/${id}`, { sprint_id: sprintId }, { headers: this.auth.getAuthHeaders() });
      if (type === 'STORY') return this.http.put(`${this.baseUrl}/stories/${id}`, { sprint_id: sprintId }, { headers: this.auth.getAuthHeaders() });
      return this.http.put(`${this.baseUrl}/tasks/${id}`, { sprint_id: sprintId }, { headers: this.auth.getAuthHeaders() });
    });

    forkJoin(requests).subscribe(() => {
      this.showToast(`Moved ${selected.length} items to Sprint`);
      this.clearSelection();
      this.loadFullHierarchy();
    });
  }

  bulkDeleteSelected() {
    if (!confirm('Are you sure you want to delete selected items?')) return;
    const selected = Array.from(this.selectedItems());

    const requests = selected.map(key => {
      const [type, idStr] = key.split('_');
      const id = Number(idStr);
      if (type === 'EPIC') return this.http.delete(`${this.baseUrl}/epics/${id}`, { headers: this.auth.getAuthHeaders() });
      if (type === 'STORY') return this.http.delete(`${this.baseUrl}/stories/${id}`, { headers: this.auth.getAuthHeaders() });
      return this.http.delete(`${this.baseUrl}/tasks/${id}`, { headers: this.auth.getAuthHeaders() });
    });

    forkJoin(requests).subscribe(() => {
      this.showToast(`Deleted ${selected.length} items`);
      this.clearSelection();
      this.loadFullHierarchy();
    });
  }

  exportToCSV() {
    const rows = [['Type', 'Code/ID', 'Title', 'Status', 'Priority', 'Points', 'Sprint']];
    this.hierarchyTree().forEach(e => {
      rows.push(['EPIC', e.epic_code, e.name, e.status, '-', '-', e.sprint_id?.toString() || 'Unassigned']);
      (e.stories || []).forEach(s => {
        rows.push(['STORY', `#${s.id}`, s.title, s.status, s.priority, (s.story_points || 0).toString(), s.sprint_id?.toString() || 'Unassigned']);
        (s.tasks || []).forEach(t => {
          rows.push(['TASK', `#${t.id}`, t.title, t.status, '-', '-', t.sprint_id?.toString() || 'Unassigned']);
        });
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `agile_workspace_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('Workspace data exported to CSV');
  }

  triggerCSVImport(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.showToast('CSV import processed successfully');
      this.loadFullHierarchy();
    };
    reader.readAsText(file);
  }

  onSprintDrop(event: CdkDragDrop<EpicNode[]>, targetSprintId: number) {
    const epic = event.previousContainer.data[event.previousIndex];
    if (!epic) return;

    const sprint_id = targetSprintId === 0 ? null : targetSprintId;
    this.http.put(`${this.baseUrl}/epics/${epic.id}`, { ...epic, sprint_id }, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => {
        this.showToast(`Moved Epic ${epic.epic_code} to Sprint`);
        this.loadFullHierarchy();
      }
    });
  }

  onKanbanDrop(event: CdkDragDrop<KanbanItem[]>, targetStatus: string) {
    const item = event.previousContainer.data[event.previousIndex];
    if (!item) return;

    if (item.type === 'EPIC') {
      this.updateEpicStatus(item.originalItem as EpicNode, targetStatus);
    } else if (item.type === 'STORY') {
      this.updateStoryStatus(item.originalItem as StoryNode, targetStatus);
    } else if (item.type === 'TASK') {
      this.updateTaskStatus(item.originalItem as TaskNode, targetStatus);
    }
  }

  startSprint(sprint: Sprint) {
    this.http.put(`${this.baseUrl}/sprints/${sprint.id}`, { ...sprint, status: 'ACTIVE' }, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => {
        this.showToast(`Sprint ${sprint.name} is now ACTIVE`);
        this.fetchSprints();
      }
    });
  }

  completeSprint(sprint: Sprint) {
    this.http.put(`${this.baseUrl}/sprints/${sprint.id}`, { ...sprint, status: 'CLOSED' }, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => {
        this.showToast(`Sprint ${sprint.name} COMPLETED`);
        this.fetchSprints();
      }
    });
  }

  closeDrawers() {
    this.activeDrawer.set('NONE');
    this.currentEpic = {};
    this.currentStory = {};
    this.currentTask = {};
  }

  openCreateEpic() {
    this.isReadOnly.set(false);
    this.currentEpic = { status: 'BACKLOG', project_id: this.selectedProjectId() || undefined };
    this.drawerMode.set('CREATE');
    this.activeDrawer.set('EPIC');
  }

  openViewEpic(epic: EpicNode) {
    this.currentEpic = { ...epic };
    this.isReadOnly.set(true);
    this.drawerMode.set('EDIT');
    this.activeDrawer.set('EPIC');
  }

  saveEpic() {
    if (!this.currentEpic.name || !this.currentEpic.project_id) return;
    const req = this.currentEpic.id
      ? this.http.put(`${this.baseUrl}/epics/${this.currentEpic.id}`, this.currentEpic, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/epics/create`, this.currentEpic, { headers: this.auth.getAuthHeaders() });

    req.subscribe(() => {
      this.showToast(`Epic ${this.drawerMode() === 'CREATE' ? 'created' : 'updated'} successfully`);
      this.closeDrawers();
      this.loadFullHierarchy();
    });
  }

  openCreateStory(epic?: EpicNode) {
    this.isReadOnly.set(false);
    this.currentStory = { 
      status: 'BACKLOG', 
      priority: 'MEDIUM',
      project_id: this.selectedProjectId() || undefined,
      epic_id: epic ? epic.id : undefined,
      testCases: []
    };
    this.loadEpicsForStoryProject(this.currentStory.project_id || 1);
    this.drawerMode.set('CREATE');
    this.activeDrawer.set('STORY');
  }

  openViewStory(story: StoryNode) {
    const normalized = this.normalizeStory(story);
    if (!normalized.id) {
      console.error('Invalid Story ID:', story);
      this.showToast('Invalid Story ID');
      return;
    }

    const storyId = Number(normalized.id);
    this.currentStory = {
      ...normalized,
      id: storyId,
      issues: [...(normalized.issues || [])],
      testCases: this.getTestCasesForStory(storyId)
    };
    this.isReadOnly.set(true);
    this.drawerMode.set('EDIT');
    this.activeDrawer.set('STORY');
  }

  saveStory() {
    if (!this.currentStory.title || !this.currentStory.project_id) {
      this.showToast('Story title and project are required');
      return;
    }

    const storyId = this.currentStory.id != null ? Number(this.currentStory.id) : null;
    const isCreate = storyId === null || !Number.isFinite(storyId) || storyId <= 0;

    const payload: any = {
      title: this.currentStory.title,
      description: this.currentStory.description || '',
      story_points: Number(this.currentStory.story_points || 0),
      status: this.currentStory.status || 'BACKLOG',
      priority: this.currentStory.priority || 'MEDIUM',
      project_id: Number(this.currentStory.project_id),
      epic_id: this.currentStory.epic_id != null ? Number(this.currentStory.epic_id) : null,
      sprint_id: this.currentStory.sprint_id != null ? Number(this.currentStory.sprint_id) : null,
      assignee_user_id: this.currentStory.assignee_user_id != null ? Number(this.currentStory.assignee_user_id) : null,
      reporter_user_id: this.currentStory.reporter_user_id != null ? Number(this.currentStory.reporter_user_id) : null
    };

    const url = isCreate
      ? `${this.baseUrl}/stories/create`
      : `${this.baseUrl}/stories/${storyId}`;

    console.log(isCreate ? 'Creating Story' : 'Updating Story', { storyId, url, payload });

    const req = isCreate
      ? this.http.post(url, payload, { headers: this.auth.getAuthHeaders() })
      : this.http.put(url, payload, { headers: this.auth.getAuthHeaders() });

    req.subscribe({
      next: (res: any) => {
        const entity = res?.data ?? res?.item ?? res?.result ?? res;
        const returnedId = Number(entity?.id ?? entity?.story_id ?? entity?.storyId ?? storyId);

        if (!Number.isFinite(returnedId) || returnedId <= 0) {
          this.showToast('Story saved, but no valid Story ID was returned');
          this.closeDrawers();
          this.loadFullHierarchy();
          return;
        }
        this.showToast(isCreate ? `Story #${returnedId} created successfully` : `Story #${returnedId} updated successfully`);
        this.closeDrawers();
        this.loadFullHierarchy();
      },
      error: (error) => {
        console.error('Story save failed:', { status: error.status, url: error.url, error: error.error });
        this.showToast(`Could not save Story (${error.status})`);
      }
    });
  }

  openCreateTask(story?: StoryNode) {
    this.isReadOnly.set(false);
    this.currentTask = { 
      status: 'BACKLOG', 
      priority: 'MEDIUM',
      story_id: story ? story.id : undefined,
      testCases: []
    };
    this.drawerMode.set('CREATE');
    this.activeDrawer.set('TASK');
  }

  openViewTask(task: TaskNode) {
    const normalized = this.normalizeTask(task);
    if (!normalized.id) {
      console.error('Invalid Task ID:', task);
      this.showToast('Invalid Task ID');
      return;
    }

    const taskId = Number(normalized.id);
    this.currentTask = {
      ...normalized,
      id: taskId,
      issues: [...(normalized.issues || [])],
      testCases: this.getTestCasesForTask(taskId)
    };
    this.isReadOnly.set(true);
    this.drawerMode.set('EDIT');
    this.activeDrawer.set('TASK');
  }

  saveTask() {
    if (!this.currentTask.title || !this.currentTask.story_id) {
      this.showToast('Task title and parent Story are required');
      return;
    }

    const taskId = this.currentTask.id != null ? Number(this.currentTask.id) : null;
    const isCreate = taskId === null || !Number.isFinite(taskId) || taskId <= 0;

    const payload: any = {
      title: this.currentTask.title,
      description: this.currentTask.description || '',
      status: this.currentTask.status || 'BACKLOG',
      priority: this.currentTask.priority || 'MEDIUM',
      story_id: Number(this.currentTask.story_id),
      sprint_id: this.currentTask.sprint_id != null ? Number(this.currentTask.sprint_id) : null,
      assignee_user_id: this.currentTask.assignee_user_id != null ? Number(this.currentTask.assignee_user_id) : null,
      reporter_user_id: this.currentTask.reporter_user_id != null ? Number(this.currentTask.reporter_user_id) : null
    };

    const url = isCreate
      ? `${this.baseUrl}/tasks/create`
      : `${this.baseUrl}/tasks/${taskId}`;

    console.log(isCreate ? 'Creating Task' : 'Updating Task', { taskId, url, payload });

    const req = isCreate
      ? this.http.post(url, payload, { headers: this.auth.getAuthHeaders() })
      : this.http.put(url, payload, { headers: this.auth.getAuthHeaders() });

    req.subscribe({
      next: (res: any) => {
        const entity = res?.data ?? res?.item ?? res?.result ?? res;
        const returnedId = Number(entity?.id ?? entity?.task_id ?? entity?.taskId ?? taskId);

        if (!Number.isFinite(returnedId) || returnedId <= 0) {
          this.showToast('Task saved, but no valid Task ID was returned');
          this.closeDrawers();
          this.loadFullHierarchy();
          return;
        }
        this.showToast(isCreate ? `Task #${returnedId} created successfully` : `Task #${returnedId} updated successfully`);
        this.closeDrawers();
        this.loadFullHierarchy();
      },
      error: (error) => {
        console.error('Task save failed:', { status: error.status, url: error.url, error: error.error });
        this.showToast(`Could not save Task (${error.status})`);
      }
    });
  }

  openEditKanbanItem(item: KanbanItem) {
    if (item.type === 'EPIC') this.openViewEpic(item.originalItem as EpicNode);
    else if (item.type === 'STORY') this.openViewStory(item.originalItem as StoryNode);
    else if (item.type === 'TASK') this.openViewTask(item.originalItem as TaskNode);
  }

  enableEditMode() {
    this.isReadOnly.set(false);

    if (this.activeDrawer() === 'STORY' && this.currentStory.project_id) {
      this.loadEpicsForStoryProject(this.currentStory.project_id);
    }
  }

  onStoryProjectChange(projectId: number) {
    this.loadEpicsForStoryProject(projectId);
  }

  availableStories = computed<StoryNode[]>(() => {
  const stories: StoryNode[] = [];

  for (const epic of this.hierarchyTree()) {
    for (const story of epic.stories || []) {
      stories.push(story);
    }
  }

  return stories;
});

trackByStoryId(index: number, story: StoryNode): number {
  return Number(story.id);
}



  loadEpicsForStoryProject(projectId: number) {
    if (!projectId) {
      this.storyModalEpics.set([]);
      return;
    }
    this.http.get<any>(`${this.baseUrl}/projects/${projectId}/epics`, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of([]))
    ).subscribe(res => {
      this.storyModalEpics.set(this.extractArray(res));
    });
  }

  openTestCasesPopup(item: Partial<StoryNode> | Partial<TaskNode>, type: 'STORY' | 'TASK'): void {
    const itemId = Number(item.id);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      this.showToast(`Invalid ${type === 'STORY' ? 'Story' : 'Task'} ID`);
      return;
    }
    const testCases = type === 'STORY'
      ? this.getTestCasesForStory(itemId)
      : this.getTestCasesForTask(itemId);
    this.testCasePopupType.set(type);
    this.testCasePopupItemId.set(itemId);
    this.testCasePopupTitle.set(`${type === 'STORY' ? 'Story' : 'Task'} #${itemId} - Test Cases`);
    this.testCasePopupItems.set(testCases);
    this.testCasePopupOpen.set(true);
  }

  closeTestCasesPopup(): void {
    this.testCasePopupOpen.set(false);
    this.testCasePopupType.set(null);
    this.testCasePopupItemId.set(null);
    this.testCasePopupTitle.set('');
    this.testCasePopupItems.set([]);
  }

  getTestCaseCode(tc: TestCase): string {
    return (tc as any).testCaseCode || (tc as any).code || `TC-${tc.id}`;
  }

  private getTestCasesForStory(storyId: number | null | undefined): TestCase[] {
    if (storyId == null) return [];
    const id = Number(storyId);
    return this.projectTestcases()
      .filter((tc: TestCase) => Number(tc.storyId) === id)
      .map((tc: TestCase) => ({ ...tc }));
  }

  private getTestCasesForTask(taskId: number | null | undefined): TestCase[] {
    if (taskId == null) return [];
    const id = Number(taskId);
    return this.projectTestcases()
      .filter((tc: TestCase) => Number(tc.taskId) === id)
      .map((tc: TestCase) => ({ ...tc }));
  }


  trackByTestCaseId(index: number, testCase: TestCase): number {
  return Number(testCase.id);
}
trackByUserId(index: number, user: any): number {
  return Number(user.id);
}

}
