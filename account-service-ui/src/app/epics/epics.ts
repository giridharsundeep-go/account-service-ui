import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { environment } from '../../environment';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { map, Observable } from 'rxjs';

// Angular Material UI Engine Imports
import { MatButtonModule } from '@angular/material/button';
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
    MatAutocompleteModule
  ],
  templateUrl: './epics.html',
  styleUrls: ['./epics.css']
})
export class Epics implements OnInit {
  baseUrl = environment.apiBaseUrl;

  // Tab Navigation Engine Control
  activeViewTab: 'EPICS' | 'STORIES' = 'EPICS';

  // Data Source Management Pools
  projectsCollection: any[] = [];
  usersCollection: any[] = [];
  sprintsCollection: any[] = []; 
  epicsCachedCollection: any[] = []; 

  // Filtered Auto-Suggest Core Arrays (Shared cleanly across both context forms)
  filteredCreators: any[] = [];
  filteredAssignees: any[] = [];

  // Reactive Data Workspace Streams
  epics$: Observable<any[]> | undefined;
  stories$: Observable<any[]> | undefined;

  // Global ID-to-Object Memory Cache Mapping Systems
  userCacheMap: Map<number, any> = new Map();

  // Functional Interface Layout Controls
  searchTerm = '';
  loading = false;

  // Drawer Toggles (0 = Create Mode, >0 = Edit Mode with Active Identity Record)
  editingEpicId: number | null = null;
  editingStoryId: number | null = null;

  // Global Context Pipeline Filter Selections
  selectedPipelineProjectId: number | null = null;
  selectedFilterEpicId: number | null = null; // Filter for User Stories Grid

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

  // Form 2: Story Form Payload Structure (Directly mapping your updated schema definition)
  storyForm = {
    id: null as number | null,
    project_id: null as any,
    epic_id: null as any,
    sprint_id: null as any,
    user_id: null as any,          // Account workspace identity (user_account references)
    creator_user_id: null as any,  // Mapped directly to users table
    assignee_user_id: null as any, // Mapped directly to users table
    title: '',
    description: '',
    story_points: 0,
    status: 'BACKLOG',
    priority: 'MEDIUM'
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
          
          // Cascaded data parameters loading on initial default project match
          this.hydrateSprintsLookup(this.selectedPipelineProjectId);
          this.hydrateEpicsLookupCache(this.selectedPipelineProjectId);
          this.refreshTabularWorkspace();
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
    if (!projectId) {
      this.sprintsCollection = [];
      return;
    }

    this.http.get<any>(`${this.baseUrl}/sprints/project/${projectId}`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.sprintsCollection = res?.data || res || [];
      },
      error: (err) => {
        console.error(`Unable to resolve scoped sprints for project index ID #${projectId}`, err);
        this.sprintsCollection = [];
      }
    });
  }

  hydrateEpicsLookupCache(projectId: number | null) {
    if (!projectId) {
      this.epicsCachedCollection = [];
      return;
    }
    this.http.get<any>(`${this.baseUrl}/projects/${projectId}/epics`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.epicsCachedCollection = res?.data || res || [];
      },
      error: (err) => {
        console.error(`Error populating epics matrix lookup reference pool for project context: ${projectId}`, err);
        this.epicsCachedCollection = [];
      }
    });
  }

  refreshTabularWorkspace() {
    if (!this.selectedPipelineProjectId) return;
    this.loading = true;

    if (this.activeViewTab === 'EPICS') {
      this.epics$ = this.http.get<any>(`${this.baseUrl}/projects/${this.selectedPipelineProjectId}/epics`, { headers: this.auth.getAuthHeaders() }).pipe(
        map(res => {
          const list = res?.data || res || [];
          this.epicsCachedCollection = list; 
          return list;
        })
      );
    } else {
      this.stories$ = this.http.get<any>(`${this.baseUrl}/projects/${this.selectedPipelineProjectId}/stories`, { headers: this.auth.getAuthHeaders() }).pipe(
        map(res => res?.data || res || [])
      );
    }

    this.loading = false;
  }

  togglePerspectiveTab(tab: 'EPICS' | 'STORIES') {
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
    
    // Clear out form sub-selections to ensure valid relational mapping contexts
    this.storyForm.sprint_id = null;
    this.storyForm.epic_id = null;
    this.selectedFilterEpicId = null; // Clear epic secondary data filter
    this.searchTerm = '';
    
    // Re-verify and isolate dataset collections for newly instantiated project
    this.hydrateSprintsLookup(cleanId);
    this.hydrateEpicsLookupCache(cleanId);
    this.refreshTabularWorkspace();
  }

  onFilterEpicChange(epicId: any) {
    this.selectedFilterEpicId = epicId ? Number(epicId) : null;
  }

  // ==========================================
  // 👥 USER AUTOCOMPLETE MATCH FILTER ACTIONS
  // ==========================================
  filterCreatorAutocomplete() {
    const cleanSearch = this.creatorSearchInput.toLowerCase().trim();
    if (!cleanSearch) {
      this.filteredCreators = [...this.usersCollection];
      return;
    }
    this.filteredCreators = this.usersCollection.filter(u =>
      (u.name || '').toLowerCase().includes(cleanSearch) ||
      (u.role || u.designation || '').toLowerCase().includes(cleanSearch)
    );
  }

  filterAssigneeAutocomplete() {
    const cleanSearch = this.assigneeSearchInput.toLowerCase().trim();
    if (!cleanSearch) {
      this.filteredAssignees = [...this.usersCollection];
      return;
    }
    this.filteredAssignees = this.usersCollection.filter(u =>
      (u.name || '').toLowerCase().includes(cleanSearch) ||
      (u.role || u.designation || '').toLowerCase().includes(cleanSearch)
    );
  }

  selectCreatorUser(user: any) {
    if (this.activeViewTab === 'EPICS') {
      this.epicForm.creator_user_id = user.id;
    } else {
      this.storyForm.creator_user_id = user.id;
    }
    this.creatorSearchInput = user.name;
  }

  selectAssigneeUser(user: any) {
    if (this.activeViewTab === 'EPICS') {
      this.epicForm.assignee_user_id = user.id;
    } else {
      this.storyForm.assignee_user_id = user.id;
    }
    this.assigneeSearchInput = user.name;
  }

  clearAssigneeSelection() {
    if (this.activeViewTab === 'EPICS') {
      this.epicForm.assignee_user_id = null;
    } else {
      this.storyForm.assignee_user_id = null;
    }
    this.assigneeSearchInput = '';
    this.filteredAssignees = [...this.usersCollection];
  }

  resolveUserObject(userId: any): any {
    if (!userId) return null;
    return this.userCacheMap.get(Number(userId)) || { name: `User #${userId}`, role: 'Member' };
  }

  resolveEpicTitle(epicId: any): string {
    if (!epicId) return 'Standalone/No Epic';
    const epic = this.epicsCachedCollection.find(e => e.id === Number(epicId));
    return epic ? `[${epic.epic_code}] ${epic.name}` : `Epic ID #${epicId}`;
  }

  getUserAvatarUrl(user: any): string {
    if (user && user.avatar) return user.avatar;
    const fallbackName = user && user.name ? encodeURIComponent(user.name) : 'User';
    return `https://ui-avatars.com/api/?name=${fallbackName}&background=0D8ABC&color=fff&size=100`;
  }

  closeAllDrawers() {
    this.editingEpicId = null;
    this.editingStoryId = null;
  }

  // ==========================================
  // ⚙️ EPIC ACTION CONTROLS
  // ==========================================
  initiateEpicCreate() {
    const activeProjectFallback = this.selectedPipelineProjectId;
    this.closeAllDrawers();

    this.epicForm = {
      id: null,
      project_id: activeProjectFallback,
      creator_user_id: null,
      assignee_user_id: null,
      epic_code: '',
      name: '',
      description: '',
      status: 'BACKLOG'
    };
    this.creatorSearchInput = '';
    this.assigneeSearchInput = '';
    this.editingEpicId = 0;
  }

  editEpic(epic: any) {
    this.closeAllDrawers();
    this.epicForm = { ...epic };
    
    if (!this.epicForm.project_id) {
      this.epicForm.project_id = this.selectedPipelineProjectId;
    }

    const creatorObj = this.resolveUserObject(epic.creator_user_id);
    this.creatorSearchInput = creatorObj ? creatorObj.name : '';

    const assigneeObj = this.resolveUserObject(epic.assignee_user_id);
    this.assigneeSearchInput = assigneeObj ? assigneeObj.name : '';

    this.editingEpicId = epic.id;
  }

  saveEpic() {
    const finalProjectId = this.epicForm.project_id ? Number(this.epicForm.project_id) : this.selectedPipelineProjectId;
    const finalCreatorId = this.epicForm.creator_user_id ? Number(this.epicForm.creator_user_id) : null;
    const finalAssigneeId = this.epicForm.assignee_user_id ? Number(this.epicForm.assignee_user_id) : null;

    if (!this.epicForm.name || !this.epicForm.name.trim() || !this.epicForm.epic_code || !this.epicForm.epic_code.trim() || !finalProjectId || !finalCreatorId) {
      alert('Validation Error: Epic Code, Name, Project Context, and Creator selection are required fields.');
      return;
    }

    this.loading = true;
    const cleanPayload = {
      id: this.epicForm.id,
      project_id: finalProjectId,
      creator_user_id: finalCreatorId,
      assignee_user_id: finalAssigneeId,
      epic_code: this.epicForm.epic_code.trim(),
      name: this.epicForm.name.trim(),
      description: this.epicForm.description ? this.epicForm.description.trim() : '',
      status: this.epicForm.status
    };

    const request = this.editingEpicId && this.editingEpicId > 0
      ? this.http.put(`${this.baseUrl}/epics/${this.editingEpicId}`, cleanPayload, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/epics/create`, cleanPayload, { headers: this.auth.getAuthHeaders() });

    request.subscribe({
      next: () => { 
        this.closeAllDrawers(); 
        this.hydrateEpicsLookupCache(finalProjectId);
        this.refreshTabularWorkspace(); 
      },
      error: () => this.loading = false
    });
  }

  deleteEpic(id: number) {
    if (!confirm('Are you sure you want to permanently purge this epic entry row?')) return;
    this.http.delete(`${this.baseUrl}/epics/${id}`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => {
        this.hydrateEpicsLookupCache(this.selectedPipelineProjectId);
        this.refreshTabularWorkspace();
      }
    });
  }

  // ==========================================
  // ⚡ STORIES TRANSACTION CONTROLS
  // ==========================================
  initiateStoryCreate() {
    const activeProjectFallback = this.selectedPipelineProjectId;
    this.closeAllDrawers();

    this.storyForm = {
      id: null,
      project_id: activeProjectFallback,
      epic_id: null,
      sprint_id: null,
      user_id: 1, 
      creator_user_id: null,
      assignee_user_id: null,
      title: '',
      description: '',
      story_points: 0,
      status: 'BACKLOG',
      priority: 'MEDIUM'
    };
    this.creatorSearchInput = '';
    this.assigneeSearchInput = '';
    this.editingStoryId = 0;
  }

  editStory(story: any) {
    this.closeAllDrawers();
    this.storyForm = { ...story };

    if (!this.storyForm.project_id) {
      this.storyForm.project_id = this.selectedPipelineProjectId;
    }

    const creatorObj = this.resolveUserObject(story.creator_user_id);
    this.creatorSearchInput = creatorObj ? creatorObj.name : '';

    const assigneeObj = this.resolveUserObject(story.assignee_user_id);
    this.assigneeSearchInput = assigneeObj ? assigneeObj.name : '';

    this.editingStoryId = story.id;
  }

  saveStory() {
    const finalProjectId = this.storyForm.project_id ? Number(this.storyForm.project_id) : this.selectedPipelineProjectId;
    const finalCreatorId = this.storyForm.creator_user_id ? Number(this.storyForm.creator_user_id) : null;
    const finalAssigneeId = this.storyForm.assignee_user_id ? Number(this.storyForm.assignee_user_id) : null;
    const finalEpicId = this.storyForm.epic_id ? Number(this.storyForm.epic_id) : null;
    const finalSprintId = this.storyForm.sprint_id ? Number(this.storyForm.sprint_id) : null;

    if (!this.storyForm.title || !this.storyForm.title.trim() || !finalProjectId || !finalCreatorId) {
      alert('Validation Error: Story Title, Project Context, and Creator selections are required.');
      return;
    }

    this.loading = true;
    const cleanPayload = {
      id: this.storyForm.id,
      project_id: finalProjectId,
      epic_id: finalEpicId,
      sprint_id: finalSprintId,
      user_id: this.storyForm.user_id,
      creator_user_id: finalCreatorId,
      assignee_user_id: finalAssigneeId,
      title: this.storyForm.title.trim(),
      description: this.storyForm.description ? this.storyForm.description.trim() : '',
      story_points: Number(this.storyForm.story_points || 0),
      status: this.storyForm.status,
      priority: this.storyForm.priority
    };

    const request = this.editingStoryId && this.editingStoryId > 0
      ? this.http.put(`${this.baseUrl}/stories/${this.editingStoryId}`, cleanPayload, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/stories/create`, cleanPayload, { headers: this.auth.getAuthHeaders() });

    request.subscribe({
      next: () => { this.closeAllDrawers(); this.refreshTabularWorkspace(); },
      error: () => this.loading = false
    });
  }

  deleteStory(id: number) {
    if (!confirm('Are you absolutely sure you want to permanently delete this user story?')) return;
    this.http.delete(`${this.baseUrl}/stories/${id}`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => this.refreshTabularWorkspace()
    });
  }

  filterCollection(collection: any[] | null): any[] {
    if (!collection) return [];
    let filteredList = collection;

    // Filter by Epic relationship if browsing user stories
    if (this.activeViewTab === 'STORIES' && this.selectedFilterEpicId !== null) {
      filteredList = filteredList.filter(item => Number(item.epic_id) === this.selectedFilterEpicId);
    }

    if (!this.searchTerm.trim()) return filteredList;
    const cleanSearch = this.searchTerm.toLowerCase();
    return filteredList.filter(item =>
      (item.name || item.title || '').toLowerCase().includes(cleanSearch) ||
      (item.epic_code || '').toLowerCase().includes(cleanSearch) ||
      (item.description || '').toLowerCase().includes(cleanSearch)
    );
  }

  resolveProjectName(projectId: any): string {
    if (!projectId) return 'Global/No Project';
    const proj = this.projectsCollection.find(p => p.id === Number(projectId));
    return proj ? proj.name : `Project ID #${projectId}`;
  }
}