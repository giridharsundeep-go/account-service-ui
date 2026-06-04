import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { environment } from '../../environment';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';

// Angular Material UI Engine Imports
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OverlayModule } from '@angular/cdk/overlay';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

@Component({
  selector: 'app-epics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatAutocompleteModule, 
    MatTooltipModule, 
    OverlayModule, 
    MatCardModule,
    MatDividerModule,
  ],
  templateUrl: './epics.html',
  styleUrls: ['./epics.css']
})
export class Epics implements OnInit {
  baseUrl = environment.apiBaseUrl;

  // Tab Navigation Engine Control
  activeViewTab: 'EPICS' | 'STORIES' | 'TASKS' = 'EPICS';

  activeHoverId: number | null = null;
  // Data Source Management Pools
  projectsCollection: any[] = [];
  usersCollection: any[] = [];
  sprintsCollection: any[] = []; 
  epicsCachedCollection: any[] = []; 
  storiesCachedCollection: any[] = []; 
  tasksRawCollection: any[] = []; // In-memory bucket to solve missing project_id column join in tasks table

  // Filtered Auto-Suggest Core Arrays (Shared cleanly across context forms)
  filteredCreators: any[] = [];
  filteredAssignees: any[] = [];

  // Reactive Data Workspace Streams for rendering
  epics$: Observable<any[]> | undefined;
  stories$: Observable<any[]> | undefined;
  tasks$: Observable<any[]> | undefined;

  // Global ID-to-Object Memory Cache Mapping Systems
  userCacheMap: Map<number, any> = new Map();

  // Functional Interface Layout Controls
  searchTerm = '';
  loading = false;

  // Drawer Toggles (0 = Create Mode, >0 = Edit Mode with Active Identity Record)
  editingEpicId: number | null = null;
  editingStoryId: number | null = null;
  editingTaskId: number | null = null;

  // Global Context Pipeline Filter Selections
  selectedPipelineProjectId: number | null = null;
  selectedFilterEpicId: number | null = null;   
  selectedFilterStoryId: number | null = null;  

  // Autocomplete Explicit Input Trackers
  creatorSearchInput = '';
  assigneeSearchInput = '';

  // Form 1: Epic Form Payload Structure (1:1 with DB Columns)
  epicForm = {
    id: null as number | null,
    project_id: null as any,
    creator_user_id: null as any,
    assignee_user_id: null as any,
    epic_code: '',
    name: '',
    description: '',
    status: 'BACKLOG'
  };

  // Form 2: Story Form Payload Structure
  storyForm = {
    id: null as number | null,
    project_id: null as any,
    epic_id: null as any,
    sprint_id: null as any,
    user_id: 1,          
    creator_user_id: null as any,  
    assignee_user_id: null as any, 
    title: '',
    description: '',
    story_points: 0,
    status: 'BACKLOG',
    priority: 'MEDIUM'
  };

  // Form 3: Task Form Payload Structure (1:1 mapping with tasks table schema)
  taskForm = {
    id: null as number | null,
    story_id: null as any,
    user_id: 1,                    
    creator_user_id: null as any,  
    assignee_user_id: null as any, 
    title: '',
    description: '',
    status: 'TODO'
  };

  constructor(private http: HttpClient, private auth: AuthService) { }

  ngOnInit() {
    this.hydrateUserDirectory();
    this.fetchGlobalProjects();
  }

  // ==========================================
  // 📁 REPOSITORY DATA MATRIX HYDRATION
  // ==========================================
  fetchGlobalProjects() {
    this.http.get<any>(`${this.baseUrl}/projects`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.projectsCollection = res?.data || res || [];

        if (this.projectsCollection.length > 0 && !this.selectedPipelineProjectId) {
          this.selectedPipelineProjectId = this.projectsCollection[0].id;
          this.epicForm.project_id = this.selectedPipelineProjectId;
          this.storyForm.project_id = this.selectedPipelineProjectId;
          
          this.hydrateSprintsLookup(this.selectedPipelineProjectId);
          this.hydrateEpicsLookupCache(this.selectedPipelineProjectId);
          this.hydrateStoriesAndTasksCache(this.selectedPipelineProjectId);
        }
      }
    });
  }

  hydrateUserDirectory() {
    this.http.get<any>(`${this.baseUrl}/user`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.usersCollection = res?.data || res || [];
        this.usersCollection.forEach((u: any) => this.userCacheMap.set(u.id, u));
        this.filteredCreators = [...this.usersCollection];
        this.filteredAssignees = [...this.usersCollection];
      }
    });
  }

  hydrateSprintsLookup(projectId: number | null) {
    if (!projectId) { this.sprintsCollection = []; return; }
    this.http.get<any>(`${this.baseUrl}/sprints/project/${projectId}`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => this.sprintsCollection = res?.data || res || []
    });
  }

  hydrateEpicsLookupCache(projectId: number | null) {
    if (!projectId) { this.epicsCachedCollection = []; return; }
    this.http.get<any>(`${this.baseUrl}/projects/${projectId}/epics`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => this.epicsCachedCollection = res?.data || res || []
    });
  }

  /**
   * Resolves tasks safely via parent user story scopes to bypass the lack of project_id in tasks table schema.
   */
  hydrateStoriesAndTasksCache(projectId: number | null) {
    if (!projectId) {
      this.storiesCachedCollection = [];
      this.tasksRawCollection = [];
      this.refreshTabularWorkspace();
      return;
    }

    this.loading = true;
    this.http.get<any>(`${this.baseUrl}/projects/${projectId}/stories`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.storiesCachedCollection = res?.data || res || [];
        
        if (this.storiesCachedCollection.length === 0) {
          this.tasksRawCollection = [];
          this.loading = false;
          this.refreshTabularWorkspace();
          return;
        }

        // ForkJoin batch queries tasks for all retrieved stories to populate display arrays cleanly
        const taskRequests = this.storiesCachedCollection.map(story =>
          this.http.get<any>(`${this.baseUrl}/stories/${story.id}/tasks`, { headers: this.auth.getAuthHeaders() }).pipe(
            map(taskRes => taskRes?.data || taskRes || [])
          )
        );

        forkJoin(taskRequests).subscribe({
          next: (allTasksArrays: any[][]) => {
            this.tasksRawCollection = allTasksArrays.reduce((acc, val) => acc.concat(val), []);
            this.loading = false;
            this.refreshTabularWorkspace();
          },
          error: (err) => {
            console.error("Failed to batch hydrate execution tasks via story endpoints", err);
            this.loading = false;
            this.refreshTabularWorkspace();
          }
        });
      },
      error: () => { this.loading = false; this.refreshTabularWorkspace(); }
    });
  }

  refreshTabularWorkspace() {
    if (!this.selectedPipelineProjectId) return;

    if (this.activeViewTab === 'EPICS') {
      this.epics$ = this.http.get<any>(`${this.baseUrl}/projects/${this.selectedPipelineProjectId}/epics`, { headers: this.auth.getAuthHeaders() }).pipe(
        map(res => this.epicsCachedCollection = res?.data || res || [])
      );
    } else if (this.activeViewTab === 'STORIES') {
      this.stories$ = of(this.storiesCachedCollection);
    } else if (this.activeViewTab === 'TASKS') {
      this.tasks$ = of(this.tasksRawCollection);
    }
  }

  togglePerspectiveTab(tab: 'EPICS' | 'STORIES' | 'TASKS') {
    this.activeViewTab = tab;
    this.closeAllDrawers();
    this.searchTerm = '';
    this.refreshTabularWorkspace();
  }

  onFormProjectContextChange(projectId: any) {
    const cleanId = projectId ? Number(projectId) : null;
    this.selectedPipelineProjectId = cleanId;
    this.epicForm.project_id = cleanId;
    this.storyForm.project_id = cleanId;
    
    this.storyForm.sprint_id = null;
    this.storyForm.epic_id = null;
    this.taskForm.story_id = null;
    this.selectedFilterEpicId = null; 
    this.selectedFilterStoryId = null;
    this.searchTerm = '';
    
    this.hydrateSprintsLookup(cleanId);
    this.hydrateEpicsLookupCache(cleanId);
    this.hydrateStoriesAndTasksCache(cleanId);
  }

  onFilterEpicChange(epicId: any) { this.selectedFilterEpicId = epicId ? Number(epicId) : null; }
  onFilterStoryChange(storyId: any) { this.selectedFilterStoryId = storyId ? Number(storyId) : null; }

  // ==========================================
  // 👥 USER AUTOCOMPLETE FILTER LOGIC
  // ==========================================
  filterCreatorAutocomplete() {
    const cleanSearch = this.creatorSearchInput.toLowerCase().trim();
    this.filteredCreators = !cleanSearch ? [...this.usersCollection] : this.usersCollection.filter(u =>
      (u.name || '').toLowerCase().includes(cleanSearch) || (u.email || '').toLowerCase().includes(cleanSearch)
    );
  }

  filterAssigneeAutocomplete() {
    const cleanSearch = this.assigneeSearchInput.toLowerCase().trim();
    this.filteredAssignees = !cleanSearch ? [...this.usersCollection] : this.usersCollection.filter(u =>
      (u.name || '').toLowerCase().includes(cleanSearch) || (u.email || '').toLowerCase().includes(cleanSearch)
    );
  }

  selectCreatorUser(user: any) {
    if (this.activeViewTab === 'EPICS') this.epicForm.creator_user_id = user.id;
    else if (this.activeViewTab === 'STORIES') this.storyForm.creator_user_id = user.id;
    else if (this.activeViewTab === 'TASKS') this.taskForm.creator_user_id = user.id;
    this.creatorSearchInput = user.name;
  }

  selectAssigneeUser(user: any) {
    if (this.activeViewTab === 'EPICS') this.epicForm.assignee_user_id = user.id;
    else if (this.activeViewTab === 'STORIES') this.storyForm.assignee_user_id = user.id;
    else if (this.activeViewTab === 'TASKS') this.taskForm.assignee_user_id = user.id;
    this.assigneeSearchInput = user.name;
  }

  resolveUserObject(userId: any): any { return this.userCacheMap.get(Number(userId)) || null; }
  resolveEpicTitle(epicId: any): string {
    const epic = this.epicsCachedCollection.find(e => e.id === Number(epicId));
    return epic ? `[${epic.epic_code}] ${epic.name}` : 'Standalone Module';
  }
  resolveStoryTitle(storyId: any): string {
    const story = this.storiesCachedCollection.find(s => s.id === Number(storyId));
    return story ? story.title : `ID #${storyId}`;
  }

  getUserAvatarUrl(user: any): string {
    if (user?.avatar) return user.avatar;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=0D8ABC&color=fff&size=120&bold=true`;
  }

  closeAllDrawers() { this.editingEpicId = null; this.editingStoryId = null; this.editingTaskId = null; }

  // ==========================================
  // 💾 RECORD PERSISTENCE ROUTINES
  // ==========================================
  initiateEpicCreate() {
    this.closeAllDrawers();
    this.epicForm = { id: null, project_id: this.selectedPipelineProjectId, creator_user_id: null, assignee_user_id: null, epic_code: '', name: '', description: '', status: 'BACKLOG' };
    this.creatorSearchInput = ''; this.assigneeSearchInput = ''; this.editingEpicId = 0;
  }

  editEpic(epic: any) {
    this.closeAllDrawers(); this.epicForm = { ...epic };
    this.creatorSearchInput = this.resolveUserObject(epic.creator_user_id)?.name || '';
    this.assigneeSearchInput = this.resolveUserObject(epic.assignee_user_id)?.name || '';
    this.editingEpicId = epic.id;
  }

  saveEpic() {
    this.loading = true;
    const req = this.editingEpicId ? this.http.put(`${this.baseUrl}/epics/${this.editingEpicId}`, this.epicForm, { headers: this.auth.getAuthHeaders() })
                                   : this.http.post(`${this.baseUrl}/epics/create`, this.epicForm, { headers: this.auth.getAuthHeaders() });
    req.subscribe({ next: () => { this.closeAllDrawers(); this.hydrateEpicsLookupCache(this.selectedPipelineProjectId); this.refreshTabularWorkspace(); }, error: () => this.loading = false });
  }

  deleteEpic(id: number) {
    if (!confirm('Purge epic record?')) return;
    this.http.delete(`${this.baseUrl}/epics/${id}`, { headers: this.auth.getAuthHeaders() }).subscribe({ next: () => { this.hydrateEpicsLookupCache(this.selectedPipelineProjectId); this.refreshTabularWorkspace(); } });
  }

  initiateStoryCreate() {
    this.closeAllDrawers();
    this.storyForm = { id: null, project_id: this.selectedPipelineProjectId, epic_id: null, sprint_id: null, user_id: 1, creator_user_id: null, assignee_user_id: null, title: '', description: '', story_points: 0, status: 'BACKLOG', priority: 'MEDIUM' };
    this.creatorSearchInput = ''; this.assigneeSearchInput = ''; this.editingStoryId = 0;
  }

  editStory(story: any) {
    this.closeAllDrawers(); this.storyForm = { ...story };
    this.creatorSearchInput = this.resolveUserObject(story.creator_user_id)?.name || '';
    this.assigneeSearchInput = this.resolveUserObject(story.assignee_user_id)?.name || '';
    this.editingStoryId = story.id;
  }

  saveStory() {
    this.loading = true;
    const req = this.editingStoryId ? this.http.put(`${this.baseUrl}/stories/${this.editingStoryId}`, this.storyForm, { headers: this.auth.getAuthHeaders() })
                                    : this.http.post(`${this.baseUrl}/stories/create`, this.storyForm, { headers: this.auth.getAuthHeaders() });
    req.subscribe({ next: () => { this.closeAllDrawers(); this.hydrateStoriesAndTasksCache(this.selectedPipelineProjectId); }, error: () => this.loading = false });
  }

  deleteStory(id: number) {
    if (!confirm('Purge user story?')) return;
    this.http.delete(`${this.baseUrl}/stories/${id}`, { headers: this.auth.getAuthHeaders() }).subscribe({ next: () => this.hydrateStoriesAndTasksCache(this.selectedPipelineProjectId)});
  }

  initiateTaskCreate() {
    this.closeAllDrawers();
    this.taskForm = { id: null, story_id: this.selectedFilterStoryId || null, user_id: 1, creator_user_id: null, assignee_user_id: null, title: '', description: '', status: 'TODO' };
    this.creatorSearchInput = ''; this.assigneeSearchInput = ''; this.editingTaskId = 0;
  }

  editTask(task: any) {
    this.closeAllDrawers(); this.taskForm = { ...task };
    this.creatorSearchInput = this.resolveUserObject(task.creator_user_id)?.name || '';
    this.assigneeSearchInput = this.resolveUserObject(task.assignee_user_id)?.name || '';
    this.editingTaskId = task.id;
  }

  saveTask() {
    this.loading = true;
    const req = this.editingTaskId ? this.http.put(`${this.baseUrl}/tasks/${this.editingTaskId}`, this.taskForm, { headers: this.auth.getAuthHeaders() })
                                   : this.http.post(`${this.baseUrl}/tasks/create`, this.taskForm, { headers: this.auth.getAuthHeaders() });
    req.subscribe({ next: () => { this.closeAllDrawers(); this.hydrateStoriesAndTasksCache(this.selectedPipelineProjectId); }, error: () => this.loading = false });
  }

  deleteTask(id: number) {
    if (!confirm('Purge task row?')) return;
    this.http.delete(`${this.baseUrl}/tasks/${id}`, { headers: this.auth.getAuthHeaders() }).subscribe({ next: () => this.hydrateStoriesAndTasksCache(this.selectedPipelineProjectId)});
  }

  filterCollection(collection: any[] | null): any[] {
    if (!collection) return [];
    let list = collection;
    if (this.activeViewTab === 'STORIES' && this.selectedFilterEpicId !== null) {
      list = list.filter(item => Number(item.epic_id) === this.selectedFilterEpicId);
    }
    if (this.activeViewTab === 'TASKS' && this.selectedFilterStoryId !== null) {
      list = list.filter(item => Number(item.story_id) === this.selectedFilterStoryId);
    }
    if (!this.searchTerm.trim()) return list;
    const s = this.searchTerm.toLowerCase();
    return list.filter(item => (item.name || item.title || '').toLowerCase().includes(s) || (item.epic_code || '').toLowerCase().includes(s) || (item.description || '').toLowerCase().includes(s));
  }
}