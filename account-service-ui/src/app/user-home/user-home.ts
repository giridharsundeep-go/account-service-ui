import {WorkspaceSettingsService} from '../shared/workspace-settings.service';
import { SuiteAppMenu } from '../shared/suite-app-menu';
import { SuiteAppFrame } from '../shared/suite-app-frame';
import { SuiteSessionService } from '../shared/suite-session.service';
import { ChatlyLauncher } from '../shared/chatly-launcher.service';
import { NotificationCenter } from '../shared/notification-center';
import { ChangeDetectorRef } from '@angular/core';
import { ProjectWorkService } from '../shared/project-work.service';
import { RecentWorkService, RecentWork } from '../shared/recent-work.service';
import { FullscreenDialogHost } from '../shared/fullscreen-dialog-host';
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
  searchText?: string;
  projectId: number;
  projectName: string;
}

import { Dashboard } from '../dashboard/dashboard';
import { Roles } from '../roles/roles';
import { Users } from '../users/users';
import { Teams } from '../teams/teams';
import { Products } from '../products/products';
import { Projects } from '../projects/projects';
import { WorkItems } from '../work-items/work-items';
import { Issues } from '../issues/issues';
import { Testcases } from '../testcases/testcases';
import { Releases } from '../releases/releases';
import { Boards } from '../boards/boards';
import { KanbanBoard } from '../kanban-board/kanban-board';
import { SprintPlanning } from '../sprint-planning/sprint-planning';

@Component({
  selector: 'app-user-home',
  standalone: true,

  imports: [
    SuiteAppMenu, SuiteAppFrame,
    FullscreenDialogHost,
    NotificationCenter,
    CommonModule,
    FormsModule,
    RouterOutlet,
    Dashboard,
    Roles,
    Users,
    Teams,
    Products,
    Projects,
    WorkItems,
    Boards,
    KanbanBoard,
    SprintPlanning,
    Issues,
    Testcases,
    Releases
  ],

  templateUrl: './user-home.html',
  styleUrls: ['./user-home.css', '../shared/field-controls.css']
})
export class UserHome implements OnInit {
  readonly workspaceSettings=inject(WorkspaceSettingsService);
  readonly chatly=inject(ChatlyLauncher);
  readonly suite=inject(SuiteSessionService);

  readonly itemDialog = inject(WorkItemDialogService);
  readonly recentWork = inject(RecentWorkService);
  private readonly workData = inject(ProjectWorkService);
  private readonly cdr=inject(ChangeDetectorRef);
  globalPeople:any[]=[];
  recentMenuOpen = false;

  openRecent(item:RecentWork):void { this.recentMenuOpen=false; this.globalWorkSearchOpen=false; this.itemDialog.open(item.projectId,item.type,item.id); }
  avatarTone(id: number): string { return ['violet','indigo','blue','green','yellow','orange','red'][Math.abs(Number(id)||0)%7]; }
  projectInitials(name: string): string { return name.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase(); }
  get searchRecent(): RecentWork[] { const query=this.globalWorkSearch.trim().toLocaleLowerCase();return this.recentWork.items().filter(item=>!query || `${item.title} ${item.key}`.toLocaleLowerCase().includes(query)).slice(0,8); }
  get filteredGlobalPeople():any[]{const q=this.globalWorkSearch.trim().toLowerCase();return q.length<2?[]:this.globalPeople.filter(u=>(u.name+' '+u.email).toLowerCase().includes(q)).slice(0,5);}
  openSearchPerson(person:any):void {this.globalWorkSearchOpen=false;this.currentUserProfileId=person.id;this.profileOpenRequest++;this.setActive('users');}

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
  sidebarWidth=240;
  private resizingSidebar=false;
  beginSidebarResize(event:PointerEvent):void{event.preventDefault();this.resizingSidebar=true;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);}
  resizeSidebar(delta:number):void{this.sidebarWidth=Math.max(180,Math.min(380,this.sidebarWidth+delta));if(isPlatformBrowser(this.platformId))localStorage.setItem('gp-sidebar-width',String(this.sidebarWidth));}
  @HostListener('document:pointermove',['$event']) onSidebarMove(event:PointerEvent):void{if(this.resizingSidebar)this.resizeSidebar(event.clientX-this.sidebarWidth);}
  @HostListener('document:pointercancel') cancelSidebarResize():void{this.resizingSidebar=false;}
  @HostListener('document:pointerup') finishSidebarResize():void{this.resizingSidebar=false;}


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
    name: 'Your account',
    email: '',
    phone: '',
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
    { id: 'work-items', label: 'Work Items', icon: 'work-items' }
  ];

  readonly qualityNavigation = [
    { id: 'test-cases', label: 'Test Cases', icon: 'tests' },
  ];

  readonly deliveryNavigation = [
    { id: 'releases', label: 'Releases', icon: 'releases' }
  ];

  readonly knowledgeNavigation = [
    { id: 'docs', label: 'Docsy', icon: 'docs' },
    { id: 'chatly', label: 'Chatly', icon: 'chat' },
    { id: 'calendar', label: 'Timely', icon: 'calendar' }
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
      this.itemDialog.revision();
      if (projectId) {
        this.loadGlobalWorkItems(projectId);
      }
    });
  }

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.workspaceSettings.start();
    if(isPlatformBrowser(this.platformId))this.sidebarWidth=Math.max(180,Math.min(380,Number(localStorage.getItem('gp-sidebar-width'))||240));
    void this.suite.register().catch(()=>null);
    this.recentWork.refreshForCurrentUser();
    this.http.get<any>(this.baseUrl+'/session/access',{headers:this.auth.getAuthHeaders()}).subscribe({next:session=>{this.auth.updateCurrentUser(session.user);this.cdr.markForCheck();},error:()=>{}});
    this.loadCurrentAccount();
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
    if (projectId) this.itemDialog.create(projectId, type);
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
    if (!target.closest('.header-recent')) this.recentMenuOpen = false;
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
    if (!query) return [];
    return this.globalWorkItems
      .filter(item => query.split(/\s+/).every(word=>`${item.key} ${item.title} ${item.typeLabel} ${item.searchText || ''}`.toLocaleLowerCase().includes(word)))
      .sort((a,b)=>Number(b.title.toLowerCase().startsWith(query))-Number(a.title.toLowerCase().startsWith(query)))
      .slice(0, 12);
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
    if(!this.globalWorkSearch.trim()){if(this.searchRecent[0])this.openRecent(this.searchRecent[0]);return;}
    const first = this.filteredGlobalWorkItems[0];
    if (first) this.openGlobalWorkItem(first);
    else if(this.filteredGlobalPeople[0])this.openSearchPerson(this.filteredGlobalPeople[0]);
  }

  openGlobalWorkItem(item: GlobalWorkItemSuggestion): void {
    this.globalWorkSearchOpen = false;
    this.globalWorkSearch = '';
    this.itemDialog.open(item.projectId, item.type, item.id);
  }

  private loadGlobalWorkItems(projectId:number):void {
    this.workSearchRequestProjectId=projectId;this.globalWorkSearchLoading=true;
    this.workData.load(projectId).subscribe(snapshot=>{
      if(this.projectContext.selectedProjectId()!==projectId)return;
      this.globalWorkItems=snapshot.items.map(item=>({id:item.id,type:item.kind,typeLabel:item.kind[0]+item.kind.slice(1).toLowerCase(),key:item.key,title:item.title,searchText:[item.raw.title,item.raw.name,item.raw.summary,item.raw.epic_name,item.raw.story_title,item.raw.task_title,item.raw.issue_title].filter(Boolean).join(' '),projectId,projectName:this.globalProjectName}));
      this.globalPeople=snapshot.users.map(u=>({id:Number(u.user_account_id??u.user_id??u.id),name:u.full_name??u.fullName??u.name??[u.first_name??u.firstName,u.last_name??u.lastName].filter(Boolean).join(' '),email:u.email??'',designation:u.designation??u.role_name??u.role?.name??''}));
      this.loadedWorkSearchProjectId=projectId;this.workSearchRequestProjectId=null;this.globalWorkSearchLoading=false;this.cdr.markForCheck();
    });
  }
  private loadCurrentAccount():void {
    const apply=(response:any)=>{const u=response?.data?.user??response?.data??response?.user??response;if(!u||typeof u!=='object')return;
      const name=u.fullName??u.full_name??u.name??[u.firstName??u.first_name,u.lastName??u.last_name].filter(Boolean).join(' ');
      this.user={name:name||u.username||u.email||'Your account',email:u.email??u.email_address??'',phone:u.phone??'',image:u.profile_picture_url??u.profilePictureUrl??u.avatarUrl??null};this.cdr.markForCheck();};
    apply(this.auth.getCurrentUser());const id=this.auth.getCurrentUserId();if(!id)return;
    this.http.get<any>(this.baseUrl+'/users/'+id,{headers:this.auth.getAuthHeaders()}).pipe(catchError(()=>this.http.get<any>(this.baseUrl+'/users',{headers:this.auth.getAuthHeaders()})),catchError(()=>of(null))).subscribe(response=>{
      const rows=Array.isArray(response)?response:Array.isArray(response?.data)?response.data:response?.content;
      apply(rows?rows.find((u:any)=>Number(u.user_account_id??u.user_id??u.id)===id):response);
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

  async logout(): Promise<void> {
    try {await this.suite.logout();} catch {this.auth.logout();}
    await this.router.navigate(['/login']);
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
