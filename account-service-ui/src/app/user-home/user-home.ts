import {
  Component,
  OnInit,
  Inject,
  PLATFORM_ID,
  HostListener,
  effect, inject
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { FormsModule } from '@angular/forms';
import {
  CommonModule,
  isPlatformBrowser
} from '@angular/common';

import {
  Router,
  RouterOutlet,
  ActivatedRoute
} from '@angular/router';

import { AuthService } from '../auth.service';
import { WorkItemDialogService } from '../shared/work-item-dialog.service';
import { ProjectContextService } from '../project-context.service';
import { environment } from '../../environment';

interface GlobalWorkItemSuggestion {
  id: number;
  type: 'EPIC' | 'STORY' | 'TASK' | 'ISSUE';
  typeLabel: string;
  key: string;
  title: string;
  projectId: number;
  projectName: string;
}

import { Dashboard } from '../dashboard/dashboard';
import { Roles } from '../roles/roles';
import { Users } from '../users/users';
import { Teams } from '../teams/teams';
import { Products } from '../products/products';
import { ProjectPlanning } from '../projects/project-planning';
import { Projects } from '../projects/projects';
import { WorkItems } from '../work-items/work-items';
import { Issues } from '../issues/issues';
import { Testcases } from '../testcases/testcases';
import { Releases } from '../releases/releases';
import { Docs } from '../docs/docs';
import { Boards } from '../boards/boards';
import { KanbanBoard } from '../kanban-board/kanban-board';
import { SprintPlanning } from '../sprint-planning/sprint-planning';

@Component({
  selector: 'app-user-home',
  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    Dashboard,
    Roles,
    Users,
    Teams,
    Products,
    Projects,
    ProjectPlanning,
    WorkItems,
    Boards,
    KanbanBoard,
    SprintPlanning,
    Issues,
    Testcases,
    Releases,
    Docs
  ],

  templateUrl: './user-home.html',
  styleUrls: ['./user-home.css', '../shared/field-controls.css']
})
export class UserHome implements OnInit {
  readonly itemDialog = inject(WorkItemDialogService);

  private readonly baseUrl = String(environment.apiBaseUrlM || '').replace(/\/$/, '');

  // =========================================================
  // APPLICATION STATE
  // =========================================================

  activeMenu = 'dashboard';

  // Workspace navigation is private to this browser tab; unlike auth, it must not be shared.
  private readonly ACTIVE_MENU_STORAGE_KEY = 'greatley-poshley-active-menu';

  currentYear =
    new Date().getFullYear();

  isCollapsed = false;

  searchQuery = '';

  createMenuOpen = false;

  profileMenuOpen = false;
  currentUserProfileId: number | null = null;
  profileOpenRequest = 0;
  globalProjectMenuOpen = false;
  globalProjectSearch = '';
  globalWorkSearch = '';
  globalWorkSearchOpen = false;
  globalWorkSearchLoading = false;
  globalWorkItems: GlobalWorkItemSuggestion[] = [];
  private loadedWorkSearchProjectId: number | null = null;
  private workSearchRequestProjectId: number | null = null;

  // =========================================================
  // USER
  // =========================================================

  user = {
    name: 'Giridhar Sundeep',
    email: 'giridharsundeep.pro@gmail.com',
    phone: '7799165659',
    image: null as string | ArrayBuffer | null
  };

  // =========================================================
  // NAVIGATION
  // =========================================================

  // Sidebar navigation is grouped around the user's workflow.
  readonly primaryNavigation = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' }
  ];

  readonly planningNavigation = [
    { id: 'products', label: 'Products', icon: 'products' },
    { id: 'projects', label: 'Projects', icon: 'projects' },
    { id: 'boards', label: 'Boards', icon: 'boards' },
    { id: 'kanban-board', label: 'Kanban Board', icon: 'kanban' },
    { id: 'sprint-planning', label: 'Sprint Planning', icon: 'sprint' },
    { id: 'project-planning', label: 'Project Planning', icon: 'sprint' },
    { id: 'work-items', label: 'Work Items', icon: 'work-items' }
  ];

  readonly qualityNavigation = [
    { id: 'test-cases', label: 'Test Cases', icon: 'tests' },
  ];

  readonly deliveryNavigation = [
    { id: 'releases', label: 'Releases', icon: 'releases' }
  ];

  readonly knowledgeNavigation = [
    { id: 'docs', label: 'Documentation', icon: 'docs' }
  ];

  readonly peopleNavigation = [
    { id: 'teams', label: 'Teams', icon: 'teams' },
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'roles', label: 'Roles & Permissions', icon: 'roles' }
  ];

  private get allNavigationItems() {
    return [
      ...this.primaryNavigation,
      ...this.planningNavigation,
      ...this.qualityNavigation,
      ...this.deliveryNavigation,
      ...this.knowledgeNavigation,
      ...this.peopleNavigation
    ];
  }

  readonly createItems = [
    {
      id: 'epic',
      label: 'Epic',
      icon: 'epics'
    },
    {
      id: 'story',
      label: 'Story',
      icon: 'story'
    },
    {
      id: 'task',
      label: 'Task',
      icon: 'task'
    },
    {
      id: 'issue',
      label: 'Issue',
      icon: 'issues'
    },
    {
      id: 'test-case',
      label: 'Test Case',
      icon: 'tests'
    },
    {
      id: 'release',
      label: 'Release',
      icon: 'releases'
    }
  ];

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    readonly projectContext: ProjectContextService,
    private http: HttpClient,
    @Inject(PLATFORM_ID)
    private platformId: Object
  ) {
    effect(() => {
      const projectId = this.projectContext.selectedProjectId();
      if (projectId && projectId !== this.loadedWorkSearchProjectId && projectId !== this.workSearchRequestProjectId) {
        this.loadGlobalWorkItems(projectId);
      }
    });
  }

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.projectContext.loadProjects();

    // Restore this browser tab's last selected workspace page before route/query
    // synchronization so a reload does not fall back to Dashboard.
    this.restoreActiveMenu();

    this.syncActiveRoute();

    // Viewer returns to UserHome with ?menu=...
    // so the exact same navigation item remains selected.
    this.route.queryParamMap.subscribe(params => {
      const menu = params.get('menu');

      if (!menu) return;

      const requestedMenu = menu === 'epics' ? 'work-items' : menu;

      const valid = this.allNavigationItems.map(item => item.id);

      if (valid.includes(requestedMenu)) {
        this.setActive(requestedMenu);
      }
    });

    /*
     * Keep the navigation state synchronized
     * when the browser opens a Viewer route.
     */
  }

  // =========================================================
  // SIDEBAR
  // =========================================================

  toggleSidebar(): void {

    this.isCollapsed =
      !this.isCollapsed;

    /*
     * Close popovers when navigation changes.
     */
    this.createMenuOpen = false;
    this.profileMenuOpen = false;
  }

  expandSidebar(): void {

    if (this.isCollapsed) {
      this.isCollapsed = false;
    }
  }

  collapseSidebar(): void {

    if (!this.isCollapsed) {
      this.isCollapsed = true;
    }
  }

  // =========================================================
  // NAVIGATION
  // =========================================================

  setActive(menu: string, persist = true): void {

    this.activeMenu = menu;

    if (menu !== 'users') {
      this.currentUserProfileId = null;
      this.profileOpenRequest = 0;
    }

    if (persist && isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem(
        this.ACTIVE_MENU_STORAGE_KEY,
        menu
      );
    }

    this.createMenuOpen = false;
    this.profileMenuOpen = false;
  }

  private restoreActiveMenu(): void {

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const storedMenu =
      sessionStorage.getItem(
        this.ACTIVE_MENU_STORAGE_KEY
      );

    if (!storedMenu) {
      return;
    }

    const valid = this.allNavigationItems.map(item => item.id);

    const restoredMenu = storedMenu === 'epics' ? 'work-items' : storedMenu;
    if (valid.includes(restoredMenu)) {
      this.activeMenu = restoredMenu;
    }
  }

  isActive(menu: string): boolean {

    return this.activeMenu === menu;
  }

  isUserGroupActive(): boolean {

    return [
      'roles',
      'users',
      'teams'
    ].includes(
      this.activeMenu
    );
  }

  // =========================================================
  // CREATE MENU
  // =========================================================

  toggleCreateMenu(
    event?: Event
  ): void {

    event?.stopPropagation();

    this.profileMenuOpen = false;

    this.createMenuOpen =
      !this.createMenuOpen;
  }

  closeCreateMenu(): void {

    this.createMenuOpen = false;
  }

  onCreateItem(
    type: string
  ): void {

    this.createMenuOpen = false;

    if (
      type === 'epic' ||
      type === 'story' ||
      type === 'task'
    ) {
      this.openKanbanCreate(type);
      return;
    }

    if (type === 'issue') {
      this.openKanbanCreate('issue');
      return;
    }

    if (type === 'test-case') {

      this.activeMenu =
        'test-cases';

      return;
    }

    if (type === 'release') {

      this.activeMenu =
        'releases';

      return;
    }
  }

  // =========================================================
  // PROFILE MENU
  // =========================================================

  toggleProfileMenu(
    event?: Event
  ): void {

    event?.stopPropagation();

    this.createMenuOpen = false;

    this.profileMenuOpen =
      !this.profileMenuOpen;
  }

  closeProfileMenu(): void {

    this.profileMenuOpen = false;
  }

  openMyProfile(): void {
    this.profileMenuOpen = false;
    this.currentUserProfileId = this.auth.getCurrentUserId();
    this.profileOpenRequest += 1;
    this.setActive('users');
  }

  // =========================================================
  // SEARCH
  // =========================================================

  focusSearch(
    event?: Event
  ): void {

    event?.stopPropagation();

    const element = document.querySelector('.global-work-search-input') as HTMLInputElement | null;

    element?.focus();
  }

  clearSearch(): void {

    this.searchQuery = '';

    this.focusSearch();
  }

  private openKanbanCreate(type: string): void {
    const projectId = this.projectContext.selectedProjectId();
    this.router.navigate(['/user-home'], {
      queryParams: {
        menu: 'kanban-board',
        createType: type,
        openType: null,
        openId: null,
        projectId: projectId ?? null
      },
      queryParamsHandling: 'merge'
    });
  }

  // =========================================================
  // KEYBOARD SHORTCUT
  // =========================================================

  @HostListener(
    'document:keydown',
    ['$event']
  )
  handleKeyboard(
    event: KeyboardEvent
  ): void {

    /*
     * Cmd + K / Ctrl + K
     */
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'k'
    ) {

      event.preventDefault();

      this.focusSearch();

      return;
    }

    /*
     * Escape closes popovers.
     */
    if (
      event.key === 'Escape'
    ) {

      this.createMenuOpen = false;
      this.profileMenuOpen = false;
      this.globalProjectMenuOpen = false;
      this.globalWorkSearchOpen = false;
    }
  }

  // =========================================================
  // DOCUMENT CLICK
  // =========================================================

  @HostListener(
    'document:click',
    ['$event']
  )
  handleDocumentClick(
    event: Event
  ): void {

    const target =
      event.target as HTMLElement;

    if (
      !target.closest(
        '.gmail-create-wrapper'
      )
    ) {

      this.createMenuOpen = false;
    }

    if (
      !target.closest(
        '.gmail-profile-wrapper'
      )
    ) {

      this.profileMenuOpen = false;
    }

    if (!target.closest('.global-project-picker')) {
      this.globalProjectMenuOpen = false;
    }
    if (!target.closest('.global-work-search')) {
      this.globalWorkSearchOpen = false;
    }
  }

  get filteredGlobalProjects() {
    const query = this.globalProjectSearch.trim().toLowerCase();
    return this.projectContext.projects().filter(project => !query || project.name.toLowerCase().includes(query));
  }

  get globalProjectName(): string {
    return this.projectContext.selectedProject()?.name ?? 'Select project';
  }

  selectGlobalProject(projectId: number): void {
    this.projectContext.setSelectedProject(projectId);
    this.globalWorkItems = [];
    this.loadedWorkSearchProjectId = null;
    this.globalProjectMenuOpen = false;
    this.globalProjectSearch = '';
  }

  get filteredGlobalWorkItems(): GlobalWorkItemSuggestion[] {
    const query = this.globalWorkSearch.trim().toLowerCase();
    if (query.length < 2) return [];
    return this.globalWorkItems
      .filter(item => `${item.key} ${item.title} ${item.typeLabel}`.toLowerCase().includes(query))
      .slice(0, 8);
  }

  trackGlobalWorkItem(_index: number, item: GlobalWorkItemSuggestion): string {
    return `${item.type}:${item.id}`;
  }

  clearGlobalWorkSearch(): void {
    this.globalWorkSearch = '';
    this.globalWorkSearchOpen = false;
    this.focusSearch();
  }

  openFirstGlobalWorkItem(): void {
    const first = this.filteredGlobalWorkItems[0];
    if (first) this.openGlobalWorkItem(first);
  }

  openGlobalWorkItem(item: GlobalWorkItemSuggestion): void {
    this.globalWorkSearchOpen = false;
    this.globalWorkSearch = '';
    this.itemDialog.open(item.projectId, item.type, item.id);
  }

  private loadGlobalWorkItems(projectId: number): void {
    if (!this.baseUrl) return;
    this.workSearchRequestProjectId = projectId;
    this.globalWorkSearchLoading = true;
    const issueUrls = [...new Set([
      `${this.baseUrl}/v1/issues?projectId=${projectId}`,
      `${environment.apiBaseUrl2 || ''}/v1/issues?projectId=${projectId}`,
      `${environment.apiBaseUrl || ''}/v1/issues?projectId=${projectId}`
    ].filter(Boolean))];
    forkJoin({
      epics: this.http.get<any>(`${this.baseUrl}/projects/${projectId}/epics`, { headers: this.auth.getAuthHeaders() }).pipe(catchError(() => of([]))),
      stories: this.http.get<any>(`${this.baseUrl}/projects/${projectId}/stories`, { headers: this.auth.getAuthHeaders() }).pipe(catchError(() => of([]))),
      tasks: this.http.get<any>(`${this.baseUrl}/tasks`, { headers: this.auth.getAuthHeaders() }).pipe(catchError(() => of([]))),
      issues: this.globalWorkCollection(issueUrls)
    }).subscribe(({ epics, stories, tasks, issues }) => {
      if (this.projectContext.selectedProjectId() !== projectId) return;
      const epicRows = this.extractGlobalArray(epics);
      const storyRows = this.extractGlobalArray(stories);
      const storyIds = new Set(storyRows.map(row => this.globalNumber(row?.id ?? row?.story_id ?? row?.storyId)).filter((id): id is number => id !== null));
      const taskRows = this.extractGlobalArray(tasks).filter(row => {
        const rowProject = this.globalNumber(row?.project_id ?? row?.projectId ?? row?.project?.id);
        const storyId = this.globalNumber(row?.story_id ?? row?.storyId ?? row?.story?.id);
        return rowProject === projectId || (rowProject === null && storyId !== null && storyIds.has(storyId));
      });
      const issueRows = this.extractGlobalArray(issues).filter(row => {
        const rowProject = this.globalNumber(row?.project_id ?? row?.projectId ?? row?.project?.id);
        return rowProject === null || rowProject === projectId;
      });
      const project = this.projectContext.projects().find(candidate => candidate.id === projectId);
      const suggestions = [
        ...epicRows.map(row => this.normalizeGlobalWorkItem(row, 'EPIC', projectId, project?.name || '')),
        ...storyRows.map(row => this.normalizeGlobalWorkItem(row, 'STORY', projectId, project?.name || '')),
        ...taskRows.map(row => this.normalizeGlobalWorkItem(row, 'TASK', projectId, project?.name || '')),
        ...issueRows.map(row => this.normalizeGlobalWorkItem(row, 'ISSUE', projectId, project?.name || ''))
      ].filter((item): item is GlobalWorkItemSuggestion => item !== null);
      this.globalWorkItems = suggestions;
      this.loadedWorkSearchProjectId = projectId;
      this.workSearchRequestProjectId = null;
      this.globalWorkSearchLoading = false;
    }, () => {
      if (this.projectContext.selectedProjectId() !== projectId) return;
      this.globalWorkItems = [];
      this.loadedWorkSearchProjectId = projectId;
      this.workSearchRequestProjectId = null;
      this.globalWorkSearchLoading = false;
    });
  }

  private globalWorkCollection(urls: string[]): Observable<any> {
    const attempt = (index: number): Observable<any> => {
      if (index >= urls.length) return of([]);
      return this.http.get<any>(urls[index], { headers: this.auth.getAuthHeaders() }).pipe(
        switchMap(response => this.extractGlobalArray(response).length ? of(response) : attempt(index + 1)),
        catchError(() => attempt(index + 1))
      );
    };
    return attempt(0);
  }

  private extractGlobalArray(value: any, depth = 0): any[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object' || depth > 5) return [];
    for (const key of ['content', 'data', 'items', 'results', 'records', 'epics', 'stories', 'tasks', 'issues']) {
      const candidate = value[key];
      if (Array.isArray(candidate)) return candidate;
      if (candidate && typeof candidate === 'object') {
        const nested = this.extractGlobalArray(candidate, depth + 1);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  private globalNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  private normalizeGlobalWorkItem(raw: any, type: GlobalWorkItemSuggestion['type'], projectId: number, projectName: string): GlobalWorkItemSuggestion | null {
    const id = this.globalNumber(raw?.id ?? raw?.epic_id ?? raw?.epicId ?? raw?.story_id ?? raw?.storyId ?? raw?.task_id ?? raw?.taskId ?? raw?.issue_id ?? raw?.issueId);
    if (id === null) return null;
    const typeLabel = type === 'ISSUE' ? 'Issue' : type[0] + type.slice(1).toLowerCase();
    const title = String(raw?.title ?? raw?.name ?? raw?.summary ?? raw?.description ?? `${typeLabel} ${id}`).trim();
    const key = String(raw?.epic_code ?? raw?.epicCode ?? raw?.story_code ?? raw?.storyCode ?? raw?.task_code ?? raw?.taskCode ?? raw?.issue_code ?? raw?.issueCode ?? raw?.key ?? `${typeLabel.toUpperCase()}-${id}`).trim();
    return { id, type, typeLabel, key, title, projectId, projectName };
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  logout(): void {

    if (
      isPlatformBrowser(
        this.platformId
      )
    ) {

      sessionStorage.clear();
      localStorage.clear();
    }

    this.router.navigate([
      '/login'
    ]);
  }

  // =========================================================
  // ROUTE
  // =========================================================

  isViewerRoute(): boolean {

    return (
      this.router.url === '/viewer' ||
      this.router.url.startsWith(
        '/viewer/'
      )
    );
  }

  syncActiveRoute(): void {

    const url =
      this.router.url;

    if (
      url.includes('/viewer/')
    ) {
      return;
    }

    if (
      url.includes('/epics')
    ) {
      this.setActive('work-items');
    }
    else if (
      url.includes('/issues')
    ) {
      this.setActive('issues');
    }
    else if (
      url.includes('/testcases')
    ) {
      this.setActive('test-cases');
    }
    else if (
      url.includes('/projects')
    ) {
      this.setActive('projects');
    }
    else if (
      url.includes('/sprint-planning')
    ) {
      this.setActive('sprint-planning');
    }
    else if (
      url.includes('/kanban-board')
    ) {
      this.setActive('kanban-board');
    }
    else if (
      url.includes('/boards')
    ) {
      this.setActive('boards');
    }
    else if (
      url.includes('/products')
    ) {
      this.setActive('products');
    }
    else if (
      url.includes('/users')
    ) {
      this.setActive('users');
    }
    else if (
      url.includes('/teams')
    ) {
      this.setActive('teams');
    }
    else if (
      url.includes('/roles')
    ) {
      this.setActive('roles');
    }
    else if (
      url.includes('/releases')
    ) {
      this.setActive('releases');
    }
    else if (
      url.includes('/docs')
    ) {
      this.setActive('docs');
    }
  }

  // =========================================================
  // USER INITIALS
  // =========================================================

  get userInitials(): string {

    const name =
      String(
        this.user?.name || 'U'
      ).trim();

    if (!name) {
      return 'U';
    }

    const parts =
      name.split(/\s+/);

    if (
      parts.length >= 2
    ) {

      return (
        parts[0].charAt(0) +
        parts[1].charAt(0)
      ).toUpperCase();
    }

    return name
      .substring(0, 2)
      .toUpperCase();
  }
}
