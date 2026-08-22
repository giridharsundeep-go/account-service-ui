import { Component, OnInit, signal, computed, ChangeDetectionStrategy, Pipe, PipeTransform, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';

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

export interface Sprint {
  id: number;
  projectId?: number;
  project_id?: number;
  name: string;
  status?: string;
}

export interface AllocatableItem {
  id: number;
  title: string;
  type: 'EPIC' | 'STORY' | 'TASK';
  sprintId?: number | null;
  epicId?: number | null;
  storyId?: number | null;
}

export interface IssueAllocation {
  id?: number;
  allocatableType: 'EPIC' | 'STORY' | 'TASK';
  allocatableId: number;
}

export interface IssueRecord {
  id?: number;
  issue_code?: string;
  issueCode?: string;
  project_id?: number;
  projectId?: number;
  sprint_id?: number | null;
  sprintId?: number | null;
  user_id?: number;
  userId?: number;
  creator_user_id?: number;
  creatorUserId?: number;
  assignee_user_id?: number | null;
  assigneeUserId?: number | null;
  reporter_user_id?: number | null;
  reporterUserId?: number | null;
  title: string;
  description?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  allocations?: IssueAllocation[];
  epicIds?: number[];
  storyIds?: number[];
  taskIds?: number[];
}

@Component({
  selector: 'app-issues',
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
    MatButtonModule,
    MatTableModule,
    MatIconModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatBadgeModule
  ],
  templateUrl: './issues.html',
  styleUrls: ['./issues.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Issues implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  baseUrl = environment.apiBaseUrl;
  baseUrl2 = environment.apiBaseUrl2 || environment.apiBaseUrl;

  viewMode = signal<'CARDS' | 'TABLE'>('CARDS');

  projects = signal<any[]>([]);
  sprints = signal<Sprint[]>([]);
  users = signal<any[]>([]);
  userMap = signal<Map<number, any>>(new Map());
  issuesList = signal<IssueRecord[]>([]);

  rawEpics = signal<AllocatableItem[]>([]);
  rawStories = signal<AllocatableItem[]>([]);
  rawTasks = signal<AllocatableItem[]>([]);

  selectedProjectId = signal<number | null>(null);
  selectedSprintFilter = signal<number | 'ALL'>('ALL');
  selectedStatusFilter = signal<string | 'ALL'>('ALL');
  searchTerm = signal<string>('');

  collapsedEpicIds = signal<Set<number>>(new Set());

  displayedColumns: string[] = ['code', 'title', 'status', 'epic', 'story', 'task', 'assignee', 'reporter', 'actions'];

  toastMessage = signal<string | null>(null);

  activeDrawer = signal<'NONE' | 'ISSUE'>('NONE');
  drawerMode = signal<'CREATE' | 'EDIT'>('CREATE');
  isReadOnly = signal<boolean>(false);

  currentIssue: Partial<IssueRecord> = {};
  drawerSprintId = signal<number | null>(null);
  selectedDrawerEpicIds = signal<number[]>([]);
  selectedDrawerStoryIds = signal<number[]>([]);
  selectedDrawerTaskIds = signal<number[]>([]);

  statusPipeline = ['OPEN', 'BACKLOG', 'TODO', 'IN_PROGRESS', 'TESTING', 'RESOLVED', 'COMPLETED', 'CLOSED', 'BLOCKED'];

  private extractArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      return res.data || res.items || res.issues || res.result || [];
    }
    return [];
  }

  toggleEpicCollapse(epicId: number) {
    this.collapsedEpicIds.update(set => {
      const next = new Set(set);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  }

  isEpicCollapsed(epicId: number): boolean {
    return this.collapsedEpicIds().has(epicId);
  }

  private getLinkedIds(issue: IssueRecord, type: 'EPIC' | 'STORY' | 'TASK'): number[] {
    const idsFromAllocations = (issue.allocations || [])
      .filter(a => a.allocatableType === type)
      .map(a => Number(a.allocatableId));
    
    if (idsFromAllocations.length > 0) return idsFromAllocations;
    
    if (type === 'EPIC' && issue.epicIds) return issue.epicIds.map(Number);
    if (type === 'STORY' && issue.storyIds) return issue.storyIds.map(Number);
    if (type === 'TASK' && issue.taskIds) return issue.taskIds.map(Number);
    
    return [];
  }

  getLinkedEpicNames(issue: IssueRecord): string {
    const epicIds = this.getLinkedIds(issue, 'EPIC');
    if (!epicIds.length) return '—';
    return this.rawEpics().filter(e => epicIds.includes(e.id)).map(e => e.title).join(', ') || '—';
  }

  getLinkedStoryNames(issue: IssueRecord): string {
    const storyIds = this.getLinkedIds(issue, 'STORY');
    if (!storyIds.length) return '—';
    return this.rawStories().filter(s => storyIds.includes(s.id)).map(s => s.title).join(', ') || '—';
  }

  getLinkedTaskNames(issue: IssueRecord): string {
    const taskIds = this.getLinkedIds(issue, 'TASK');
    if (!taskIds.length) return '—';
    return this.rawTasks().filter(t => taskIds.includes(t.id)).map(t => t.title).join(', ') || '—';
  }

  activeProjectName = computed(() => {
    const proj = this.projects().find(p => p.id === this.selectedProjectId());
    return proj ? proj.name : 'Select Project';
  });

  filteredSprints = computed(() => {
    const projId = this.selectedProjectId();
    if (!projId) return [];
    return this.sprints().filter(s => {
      const pId = s.projectId ?? s.project_id;
      return !pId || Number(pId) === Number(projId);
    });
  });

  availableEpics = computed(() => {
    const sprintId = this.drawerSprintId() ?? (this.selectedSprintFilter() !== 'ALL' ? Number(this.selectedSprintFilter()) : null);
    if (!sprintId) return this.rawEpics();
    return this.rawEpics().filter(e => !e.sprintId || Number(e.sprintId) === Number(sprintId));
  });

  availableStories = computed(() => {
    const epicIds = this.selectedDrawerEpicIds();
    if (!epicIds || epicIds.length === 0) return this.rawStories();
    return this.rawStories().filter(s => !s.epicId || epicIds.includes(Number(s.epicId)));
  });

  availableTasks = computed(() => {
    const storyIds = this.selectedDrawerStoryIds();
    if (!storyIds || storyIds.length === 0) return this.rawTasks();
    return this.rawTasks().filter(t => !t.storyId || storyIds.includes(Number(t.storyId)));
  });

  metrics = computed(() => {
    const all = this.issuesList();
    return {
      total: all.length,
      open: all.filter(i => ['OPEN', 'TODO', 'BACKLOG'].includes(i.status?.toUpperCase() || '')).length,
      inProgress: all.filter(i => ['IN_PROGRESS', 'TESTING'].includes(i.status?.toUpperCase() || '')).length,
      completed: all.filter(i => ['RESOLVED', 'COMPLETED', 'CLOSED'].includes(i.status?.toUpperCase() || '')).length,
      blocked: all.filter(i => (i.status?.toUpperCase() || '') === 'BLOCKED').length
    };
  });

  private isLinkedToItem(issue: IssueRecord, type: 'EPIC' | 'STORY' | 'TASK', targetId: number): boolean {
    const hasInAllocations = (issue.allocations || []).some(
      a => a.allocatableType === type && Number(a.allocatableId) === Number(targetId)
    );
    if (hasInAllocations) return true;

    if (type === 'EPIC' && issue.epicIds?.includes(targetId)) return true;
    if (type === 'STORY' && issue.storyIds?.includes(targetId)) return true;
    if (type === 'TASK' && issue.taskIds?.includes(targetId)) return true;

    return false;
  }

  groupedHierarchy = computed(() => {
    const issues = this.issuesList();
    const epics = this.rawEpics();
    const stories = this.rawStories();
    const tasks = this.rawTasks();
    const sprintFilter = this.selectedSprintFilter();

    let targetEpics = epics;
    if (sprintFilter !== 'ALL') {
      const sId = Number(sprintFilter);
      targetEpics = epics.filter(e => !e.sprintId || Number(e.sprintId) === sId);
    }

    return targetEpics.map(epic => {
      const epicStories = stories.filter(s => Number(s.epicId) === Number(epic.id));

      const mappedStories = epicStories.map(story => {
        const storyTasks = tasks.filter(t => Number(t.storyId) === Number(story.id));

        const mappedTasks = storyTasks.map(task => ({
          ...task,
          issues: issues.filter(i => this.isLinkedToItem(i, 'TASK', task.id))
        }));

        return {
          ...story,
          issues: issues.filter(i => 
            this.isLinkedToItem(i, 'STORY', story.id) && 
            !storyTasks.some(t => this.isLinkedToItem(i, 'TASK', t.id))
          ),
          tasks: mappedTasks
        };
      });

      const directEpicIssues = issues.filter(i => 
        this.isLinkedToItem(i, 'EPIC', epic.id) &&
        !stories.some(s => this.isLinkedToItem(i, 'STORY', s.id)) &&
        !tasks.some(t => this.isLinkedToItem(i, 'TASK', t.id))
      );

      const totalCount = directEpicIssues.length + 
        mappedStories.reduce((acc, s) => 
          acc + s.issues.length + s.tasks.reduce((tAcc, t) => tAcc + t.issues.length, 0), 0
        );

      return {
        ...epic,
        stories: mappedStories,
        directIssues: directEpicIssues,
        totalIssuesCount: totalCount
      };
    });
  });

  ngOnInit() {
    this.fetchUsers();
    this.fetchSprints();
    this.fetchProjects();
  }

  showToast(message: string) {
    this.toastMessage.set(message);
    setTimeout(() => this.toastMessage.set(null), 3500);
  }

  fetchUsers() {
    this.http.get<any>(`${this.baseUrl}/user`, { headers: this.auth.getAuthHeaders() })
      .pipe(catchError(() => of([])))
      .subscribe(res => {
        const raw = this.extractArray(res);
        this.users.set(raw);
        const mapObj = new Map<number, any>();
        raw.forEach((u: any) => mapObj.set(u.id, u));
        this.userMap.set(mapObj);
      });
  }

  fetchSprints() {
    this.http.get<any>(`${this.baseUrl}/sprints`, { headers: this.auth.getAuthHeaders() })
      .pipe(catchError(() => of([])))
      .subscribe(res => this.sprints.set(this.extractArray(res)));
  }

  fetchProjects() {
    this.http.get<any>(`${this.baseUrl}/projects`, { headers: this.auth.getAuthHeaders() })
      .pipe(catchError(() => of([])))
      .subscribe(res => {
        const projs = this.extractArray(res);
        this.projects.set(projs);
        if (projs.length > 0) {
          this.onProjectChange(projs[0].id);
        }
      });
  }

  onProjectChange(projId: number) {
    this.selectedProjectId.set(projId);
    this.selectedSprintFilter.set('ALL');
    this.loadAllIssues();
    this.loadAllocatables(projId);
  }

  onSprintFilterChange(sprintId: number | 'ALL') {
    this.selectedSprintFilter.set(sprintId);
    this.loadAllIssues();
  }

  onDrawerProjectChange(projId: number) {
    this.currentIssue.project_id = projId;
    this.currentIssue.projectId = projId;
    this.currentIssue.sprint_id = null;
    this.currentIssue.sprintId = null;
    this.drawerSprintId.set(null);
    this.selectedDrawerEpicIds.set([]);
    this.selectedDrawerStoryIds.set([]);
    this.selectedDrawerTaskIds.set([]);
    this.loadAllocatables(projId);
  }

  onDrawerSprintChange(sprintId: number | null) {
    const parsedId = sprintId ? Number(sprintId) : null;
    this.currentIssue.sprint_id = parsedId;
    this.currentIssue.sprintId = parsedId;
    this.drawerSprintId.set(parsedId);
    this.selectedDrawerEpicIds.set([]);
    this.selectedDrawerStoryIds.set([]);
    this.selectedDrawerTaskIds.set([]);
  }

  onEpicSelectChange(epicIds: number[]) {
    this.selectedDrawerEpicIds.set(epicIds);
    const validStories = this.availableStories().map(s => s.id);
    const filteredStories = this.selectedDrawerStoryIds().filter(id => validStories.includes(id));
    this.selectedDrawerStoryIds.set(filteredStories);
    this.onStorySelectChange(filteredStories);
  }

  onStorySelectChange(storyIds: number[]) {
    this.selectedDrawerStoryIds.set(storyIds);
    const validTasks = this.availableTasks().map(t => t.id);
    this.selectedDrawerTaskIds.set(this.selectedDrawerTaskIds().filter(id => validTasks.includes(id)));
  }

  loadAllocatables(projId: number) {
    const headers = this.auth.getAuthHeaders();

    forkJoin({
      epics: this.http.get<any>(`${this.baseUrl}/projects/${projId}/epics`, { headers }).pipe(catchError(() => of([]))),
      stories: this.http.get<any>(`${this.baseUrl}/projects/${projId}/stories`, { headers }).pipe(catchError(() => of([]))),
      tasks: this.http.get<any>(`${this.baseUrl}/tasks`, { headers }).pipe(catchError(() => of([])))
    }).subscribe(res => {
      this.rawEpics.set(this.extractArray(res.epics).map(e => ({
        id: e.id,
        title: e.title || e.name,
        type: 'EPIC',
        sprintId: e.sprint_id || e.sprintId
      })));

      this.rawStories.set(this.extractArray(res.stories).map(s => ({
        id: s.id,
        title: s.title || s.name,
        type: 'STORY',
        epicId: s.epic_id || s.epicId
      })));

      this.rawTasks.set(this.extractArray(res.tasks).map(t => ({
        id: t.id,
        title: t.title || t.name,
        type: 'TASK',
        storyId: t.story_id || t.storyId
      })));
    });
  }

  loadAllIssues() {
    const projId = this.selectedProjectId();
    if (!projId) return;

    let params = new HttpParams().set('projectId', projId.toString());
    if (this.selectedSprintFilter() !== 'ALL') {
      params = params.set('sprintId', this.selectedSprintFilter().toString());
    }

    this.http.get<any>(`${this.baseUrl2}/v1/issues`, { headers: this.auth.getAuthHeaders(), params })
      .pipe(catchError(() => of([])))
      .subscribe(res => this.issuesList.set(this.extractArray(res)));
  }

  deleteIssue(id: number | undefined) {
    if (!id) return;
    if (confirm('Are you sure you want to delete this issue?')) {
      this.http.delete(`${this.baseUrl2}/v1/issues/${id}`, { headers: this.auth.getAuthHeaders() }).subscribe(() => {
        this.showToast('Issue deleted successfully');
        this.closeDrawers();
        this.loadAllIssues();
      });
    }
  }

  private getCurrentUserId(): number {
    const storedUser = localStorage.getItem('user') || localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const extractedId = parsed?.id ?? parsed?.userId ?? parsed?.user_id ?? parsed?.user?.id;
        if (extractedId) return Number(extractedId);
      } catch (e) {}
    }
    
    const authAny = this.auth as any;
    return authAny.user?.id || authAny.currentUser?.id || authAny.getUserId?.() || 1;
  }

  openCreateIssue() {
    const currentUserId = this.getCurrentUserId();
    const projId = this.selectedProjectId() || (this.projects().length > 0 ? this.projects()[0].id : undefined);
    const sprintId = this.selectedSprintFilter() === 'ALL' ? null : Number(this.selectedSprintFilter());

    this.currentIssue = {
      project_id: projId,
      projectId: projId,
      sprint_id: sprintId,
      sprintId: sprintId,
      user_id: currentUserId,
      userId: currentUserId,
      creator_user_id: currentUserId,
      creatorUserId: currentUserId,
      assignee_user_id: null,
      assigneeUserId: null,
      reporter_user_id: currentUserId,
      reporterUserId: currentUserId,
      status: 'OPEN',
      title: '',
      description: '',
      issue_code: `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`
    };

    this.drawerSprintId.set(sprintId);
    this.selectedDrawerEpicIds.set([]);
    this.selectedDrawerStoryIds.set([]);
    this.selectedDrawerTaskIds.set([]);

    if (projId) this.loadAllocatables(projId);

    this.drawerMode.set('CREATE');
    this.isReadOnly.set(false);
    this.activeDrawer.set('ISSUE');
  }

  openViewIssue(issue: IssueRecord) {
  const epicIds = (issue.allocations || []).filter(a => a.allocatableType === 'EPIC').map(a => a.allocatableId);
  const storyIds = (issue.allocations || []).filter(a => a.allocatableType === 'STORY').map(a => a.allocatableId);
  const taskIds = (issue.allocations || []).filter(a => a.allocatableType === 'TASK').map(a => a.allocatableId);

  const code = issue.issue_code || issue.issueCode || '';
  
  // Safely extract IDs from nested backend entity objects or flat properties
  const rawIssue = issue as any;
  const projId = rawIssue.project?.id || issue.project_id || issue.projectId;
  const sId = rawIssue.sprint?.id || issue.sprint_id || issue.sprintId || null;
  const assigneeId = rawIssue.assignee?.id || issue.assignee_user_id || issue.assigneeUserId || null;
  const reporterId = rawIssue.reporter?.id || issue.reporter_user_id || issue.reporterUserId || null;

  const rawCreator = rawIssue.creator;
  const creatorId = typeof rawCreator === 'object' && rawCreator !== null 
    ? rawCreator.id 
    : (issue.user_id || issue.userId || issue.creator_user_id || issue.creatorUserId);

  this.currentIssue = { 
    ...issue,
    project_id: projId,
    projectId: projId,
    sprint_id: sId ? Number(sId) : null,
    sprintId: sId ? Number(sId) : null,
    assignee_user_id: assigneeId ? Number(assigneeId) : null,
    assigneeUserId: assigneeId ? Number(assigneeId) : null,
    reporter_user_id: reporterId ? Number(reporterId) : null,
    reporterUserId: reporterId ? Number(reporterId) : null,
    issue_code: code,
    issueCode: code,
    user_id: creatorId,
    userId: creatorId,
    creator_user_id: creatorId,
    creatorUserId: creatorId
  };
  
  this.drawerSprintId.set(sId ? Number(sId) : null);
  this.selectedDrawerEpicIds.set(epicIds.length ? epicIds : issue.epicIds || []);
  this.selectedDrawerStoryIds.set(storyIds.length ? storyIds : issue.storyIds || []);
  this.selectedDrawerTaskIds.set(taskIds.length ? taskIds : issue.taskIds || []);

  // Fetch cascading Epics, Stories, and Tasks for the populated project
  if (projId) {
    this.loadAllocatables(Number(projId));
  }

  this.drawerMode.set('EDIT');
  this.isReadOnly.set(true);
  this.activeDrawer.set('ISSUE');
}

  saveIssue() {
    const isEdit = this.drawerMode() === 'EDIT';

    const epicIds = this.selectedDrawerEpicIds();
    const storyIds = this.selectedDrawerStoryIds();
    const taskIds = this.selectedDrawerTaskIds();
    const currentUserId = this.currentIssue.user_id || this.currentIssue.creator_user_id || this.getCurrentUserId();
    const projectId = this.currentIssue.project_id || this.currentIssue.projectId;
    const sprintId = this.currentIssue.sprint_id || this.currentIssue.sprintId;
    const assigneeId = this.currentIssue.assignee_user_id || this.currentIssue.assigneeUserId;
    const reporterId = this.currentIssue.reporter_user_id || this.currentIssue.reporterUserId;
    
    const issueCode = this.currentIssue.issue_code || this.currentIssue.issueCode || `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`;

    const payload = {
      ...this.currentIssue,
      issueCode: issueCode,
      issue_code: issueCode,
      project: projectId ? { id: projectId } : null,
      sprint: sprintId ? { id: sprintId } : null,
      creator: currentUserId ? { id: currentUserId } : null,
      assignee: assigneeId ? { id: Number(assigneeId) } : null,
      reporter: reporterId ? { id: Number(reporterId) } : null,
      projectId,
      sprintId,
      userId: currentUserId,
      creatorUserId: currentUserId,
      assigneeUserId: assigneeId,
      reporterUserId: reporterId,
      epicIds,
      storyIds,
      taskIds,
      allocations: [
        ...epicIds.map(id => ({ allocatableType: 'EPIC', allocatableId: id })),
        ...storyIds.map(id => ({ allocatableType: 'STORY', allocatableId: id })),
        ...taskIds.map(id => ({ allocatableType: 'TASK', allocatableId: id }))
      ]
    };

    const req$ = isEdit
      ? this.http.put(`${this.baseUrl2}/v1/issues/${this.currentIssue.id}`, payload, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl2}/v1/issues`, payload, { headers: this.auth.getAuthHeaders() });

    req$.subscribe({
      next: () => {
        this.showToast(`Issue ${isEdit ? 'updated' : 'created'} successfully`);
        this.closeDrawers();
        this.loadAllIssues();
      },
      error: (err) => {
        console.error('Failed to save issue:', err);
        const errDetail = err?.error?.message || err?.statusText || 'Server Error';
        this.showToast(`Failed to ${isEdit ? 'update' : 'create'} issue: ${errDetail}`);
      }
    });
  }

  enableEditMode() {
    this.isReadOnly.set(false);
  }

  closeDrawers() {
    this.activeDrawer.set('NONE');
  }
}