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
import { DragDropModule } from '@angular/cdk/drag-drop';

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

  storyModalEpics = signal<EpicNode[]>([]);
  activeTab = signal<'TREE' | 'KANBAN'>('TREE');

  projects = signal<any[]>([]);
  users = signal<any[]>([]);
  teams = signal<Team[]>([]);
  teamMembers = signal<any[]>([]);
  sprints = signal<Sprint[]>([]);
  userMap = signal<Map<number, any>>(new Map());
  hierarchyTree = signal<EpicNode[]>([]);

  collapsedSprintIds = signal<Set<number>>(new Set());

  // Filter Toggles
  showFilters = signal<boolean>(false);
  searchExpanded = signal<boolean>(false);

  // Default selection set to Project 1
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

  // Active current sprint determination based on date window or ACTIVE status
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

  // Displayed Sprint at top header of Kanban View
  displayedKanbanSprint = computed<Sprint | null>(() => {
    const sprints = this.projectSprints();
    const filterVal = this.selectedSprintFilter();

    if (filterVal !== 'ALL') {
      const selectedSp = sprints.find(s => Number(s.id) === Number(filterVal));
      if (selectedSp) return selectedSp;
    }

    return { id: 0, name: 'All Sprint Cycles', status: 'ACTIVE' };
  });

  // Computes all users assigned to items associated with the displayed Sprint
  activeSprintUsers = computed(() => {
    const activeSp = this.displayedKanbanSprint();
    if (!activeSp) return [];

    const userIds = new Set<number>();
    const tree = this.hierarchyTree();

    tree.forEach(epic => {
      const epicSprintId = epic.sprint_id ? Number(epic.sprint_id) : 0;
      const matchEpic = activeSp.id === 0 || epicSprintId === Number(activeSp.id);

      if (matchEpic && epic.assignee_user_id) {
        userIds.add(Number(epic.assignee_user_id));
      }

      (epic.stories || []).forEach(story => {
        const storySprintId = story.sprint_id ? Number(story.sprint_id) : epicSprintId;
        const matchStory = activeSp.id === 0 || storySprintId === Number(activeSp.id);

        if (matchStory && story.assignee_user_id) {
          userIds.add(Number(story.assignee_user_id));
        }

        (story.tasks || []).forEach(task => {
          const taskSprintId = task.sprint_id ? Number(task.sprint_id) : storySprintId;
          const matchTask = activeSp.id === 0 || taskSprintId === Number(activeSp.id);

          if (matchTask && task.assignee_user_id) {
            userIds.add(Number(task.assignee_user_id));
          }
        });
      });
    });

    const uMap = this.userMap();
    const result: any[] = [];
    userIds.forEach(id => {
      const u = uMap.get(id);
      if (u) {
        result.push(u);
      } else {
        result.push({ id, name: `User ${id}` });
      }
    });

    return result;
  });

  teamMembersForSelectedTeam = computed(() => {
    if (this.selectedTeamFilter() === 'ALL') {
      return [];
    }
    return this.teamMembers();
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

  // Kanban Items organized by Status Column and filtered by Selected User & Selected Sprint Filter
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

  totalEpicsCount = computed(() => this.hierarchyTree().length);
  totalStoriesCount = computed(() => this.hierarchyTree().reduce((acc, e) => acc + (e.stories?.length || 0), 0));
  totalTasksCount = computed(() => this.hierarchyTree().reduce((acc, e) => acc + (e.stories || []).reduce((sAcc, s) => sAcc + (s.tasks?.length || 0), 0), 0));

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
  
  onSearchBlur() {
    if (!this.searchTerm().trim()) {
      this.searchExpanded.set(false);
    }
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

  loadFullHierarchy() {
    const projId = this.selectedProjectId();
    if (!projId) return;

    const headers = { headers: this.auth.getAuthHeaders() };
    const epicsReq = this.http.get<any>(`${this.baseUrl}/projects/${projId}/epics`, headers).pipe(catchError(() => of([])));
    const storiesReq = this.http.get<any>(`${this.baseUrl}/projects/${projId}/stories`, headers).pipe(catchError(() => of([])));
    const tasksReq = this.http.get<any>(`${this.baseUrl}/tasks`, headers).pipe(catchError(() => of([])));

    forkJoin([epicsReq, storiesReq, tasksReq]).subscribe(([epicRes, storyRes, taskRes]) => {
      const epics: EpicNode[] = this.extractArray(epicRes);
      const stories: StoryNode[] = this.extractArray(storyRes);
      const tasks: TaskNode[] = this.extractArray(taskRes);

      const tree = epics.map((epic, idx) => ({
        ...epic,
        reporter_user_id: epic.reporter_user_id || (this.users()[idx % Math.max(1, this.users().length)]?.id ?? null),
        expanded: epic.expanded ?? true,
        stories: stories
          .filter(s => Number(s.epic_id) === Number(epic.id))
          .map((story, sIdx) => ({
            ...story,
            reporter_user_id: story.reporter_user_id || (this.users()[(sIdx + 1) % Math.max(1, this.users().length)]?.id ?? null),
            expanded: story.expanded ?? true,
            tasks: tasks
              .filter(t => Number(t.story_id) === Number(story.id))
              .map((task, tIdx) => ({
                ...task,
                reporter_user_id: task.reporter_user_id || (this.users()[(tIdx + 2) % Math.max(1, this.users().length)]?.id ?? null)
              }))
          }))
      }));

      this.hierarchyTree.set(tree);
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

    this.http.get<any>(`${this.baseUrl}/api/team-members/team/${teamId}`, { headers: this.auth.getAuthHeaders() }).pipe(
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

  openCreateEpic() {
    this.currentEpic = {
      project_id: this.selectedProjectId() || 1,
      status: 'TODO',
      sprint_id: this.selectedSprintFilter() === 'ALL' ? null : Number(this.selectedSprintFilter())
    };
    this.drawerMode.set('CREATE');
    this.isReadOnly.set(false);
    this.activeDrawer.set('EPIC');
  }

  openCreateStory(parentEpic?: EpicNode) {
    this.currentStory = {
      project_id: parentEpic?.project_id || this.selectedProjectId() || 1,
      epic_id: parentEpic?.id || null,
      status: 'TODO',
      priority: 'MEDIUM',
      story_points: 3,
      sprint_id: parentEpic?.sprint_id || (this.selectedSprintFilter() === 'ALL' ? null : Number(this.selectedSprintFilter()))
    };

    const epics = this.hierarchyTree().filter(e => Number(e.project_id) === Number(this.currentStory.project_id));
    this.storyModalEpics.set(epics);
    this.drawerMode.set('CREATE');
    this.isReadOnly.set(false);
    this.activeDrawer.set('STORY');
  }

  openCreateTask(parentStory?: StoryNode) {
    this.currentTask = {
      story_id: parentStory?.id || undefined,
      status: 'TODO',
      priority: 'MEDIUM',
      sprint_id: parentStory?.sprint_id || (this.selectedSprintFilter() === 'ALL' ? null : Number(this.selectedSprintFilter()))
    };
    this.drawerMode.set('CREATE');
    this.isReadOnly.set(false);
    this.activeDrawer.set('TASK');
  }

  openViewEpic(epic: EpicNode) {
    this.currentEpic = { ...epic };
    this.drawerMode.set('EDIT');
    this.isReadOnly.set(true);
    this.activeDrawer.set('EPIC');
  }

  openViewStory(story: StoryNode) {
    this.currentStory = { ...story };
    const epics = this.hierarchyTree().filter(e => Number(e.project_id) === Number(story.project_id));
    this.storyModalEpics.set(epics);
    this.drawerMode.set('EDIT');
    this.isReadOnly.set(true);
    this.activeDrawer.set('STORY');
  }

  openViewTask(task: TaskNode) {
    this.currentTask = { ...task };
    this.drawerMode.set('EDIT');
    this.isReadOnly.set(true);
    this.activeDrawer.set('TASK');
  }

  openEditKanbanItem(item: KanbanItem) {
    if (item.type === 'EPIC') this.openViewEpic(item.originalItem as EpicNode);
    else if (item.type === 'STORY') this.openViewStory(item.originalItem as StoryNode);
    else if (item.type === 'TASK') this.openViewTask(item.originalItem as TaskNode);
  }

  enableEditMode() {
    this.isReadOnly.set(false);
  }

  closeDrawers() {
    this.activeDrawer.set('NONE');
  }

  saveEpic() {
    if (!this.currentEpic.name) return;
    const isEdit = this.drawerMode() === 'EDIT';
    const req$ = isEdit
      ? this.http.put(`${this.baseUrl}/epics/${this.currentEpic.id}`, this.currentEpic, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/epics`, this.currentEpic, { headers: this.auth.getAuthHeaders() });

    req$.subscribe(() => {
      this.showToast(`Epic ${isEdit ? 'updated' : 'created'} successfully`);
      this.closeDrawers();
      this.loadFullHierarchy();
    });
  }

  saveStory() {
    if (!this.currentStory.title) return;
    const isEdit = this.drawerMode() === 'EDIT';
    const req$ = isEdit
      ? this.http.put(`${this.baseUrl}/stories/${this.currentStory.id}`, this.currentStory, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/stories`, this.currentStory, { headers: this.auth.getAuthHeaders() });

    req$.subscribe(() => {
      this.showToast(`Story ${isEdit ? 'updated' : 'created'} successfully`);
      this.closeDrawers();
      this.loadFullHierarchy();
    });
  }

  saveTask() {
    if (!this.currentTask.title) return;
    const isEdit = this.drawerMode() === 'EDIT';
    const req$ = isEdit
      ? this.http.put(`${this.baseUrl}/tasks/${this.currentTask.id}`, this.currentTask, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/tasks`, this.currentTask, { headers: this.auth.getAuthHeaders() });

    req$.subscribe(() => {
      this.showToast(`Task ${isEdit ? 'updated' : 'created'} successfully`);
      this.closeDrawers();
      this.loadFullHierarchy();
    });
  }

  onStoryProjectChange(projectId: number) {
    const epics = this.hierarchyTree().filter(e => Number(e.project_id) === Number(projectId));
    this.storyModalEpics.set(epics);
    this.currentStory.epic_id = null;
  }

  onKanbanDrop(event: any, newStatus: string) {
    if (!event.container.data || !event.previousContainer.data) return;
    const item: KanbanItem = event.previousContainer.data[event.previousIndex];
    if (!item) return;

    if (item.type === 'EPIC') {
      this.updateEpicStatus(item.originalItem as EpicNode, newStatus);
    } else if (item.type === 'STORY') {
      this.updateStoryStatus(item.originalItem as StoryNode, newStatus);
    } else if (item.type === 'TASK') {
      this.updateTaskStatus(item.originalItem as TaskNode, newStatus);
    }
  }

  onSprintDrop(event: any, newSprintId: number) {
    if (!event.item.data) return;
    const epic: EpicNode = event.item.data;
    const targetSprintId = newSprintId === 0 ? null : newSprintId;

    this.http.put(`${this.baseUrl}/epics/${epic.id}`, { ...epic, sprint_id: targetSprintId }, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => {
        this.showToast(`Moved Epic ${epic.epic_code} to Sprint`);
        this.loadFullHierarchy();
      }
    });
  }
}