import {
  Component,
  OnInit,
  Inject,
  PLATFORM_ID,
  HostListener
} from '@angular/core';

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

import {
  MatDialog,
  MatDialogModule
} from '@angular/material/dialog';

import { EditProfileDialog } from '../edit-profile-dialog/edit-profile-dialog';
import { AuthService } from '../auth.service';

import { Dashboard } from '../dashboard/dashboard';
import { Roles } from '../roles/roles';
import { Users } from '../users/users';
import { Teams } from '../teams/teams';
import { Products } from '../products/products';
import { Projects } from '../projects/projects';
import { Epics } from '../epics/epics';
import { Issues } from '../issues/issues';
import { Testcases } from '../testcases/testcases';
import { Releases } from '../releases/releases';
import { Docs } from '../docs/docs';

@Component({
  selector: 'app-user-home',
  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    MatDialogModule,
    Dashboard,
    Roles,
    Users,
    Teams,
    Products,
    Projects,
    Epics,
    Issues,
    Testcases,
    Releases,
    Docs
  ],

  templateUrl: './user-home.html',
  styleUrls: ['./user-home.css']
})
export class UserHome implements OnInit {

  // =========================================================
  // APPLICATION STATE
  // =========================================================

  activeMenu = 'dashboard';

  currentYear =
    new Date().getFullYear();

  isCollapsed = false;

  searchQuery = '';

  createMenuOpen = false;

  profileMenuOpen = false;

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

  readonly primaryNavigation = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'dashboard'
    },
    {
      id: 'products',
      label: 'Products',
      icon: 'products'
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: 'projects'
    },
    {
      id: 'epics',
      label: 'Epics & Backlogs',
      icon: 'epics'
    },
    
    {
      id: 'test-cases',
      label: 'Test Cases',
      icon: 'tests'
    },
    {
      id: 'releases',
      label: 'Releases',
      icon: 'releases'
    },
    {
      id: 'docs',
      label: 'Documentation',
      icon: 'docs'
    }
  ];

  readonly administrationNavigation = [
    {
      id: 'roles',
      label: 'Roles',
      icon: 'roles'
    },
    {
      id: 'users',
      label: 'Users',
      icon: 'users'
    },
    {
      id: 'teams',
      label: 'Teams',
      icon: 'teams'
    }
  ];

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
    private dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    @Inject(PLATFORM_ID)
    private platformId: Object
  ) {}

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {

    this.syncActiveRoute();

    // Viewer returns to UserHome with ?menu=...
    // so the exact same navigation item remains selected.
    this.route.queryParamMap.subscribe(params => {
      const menu = params.get('menu');

      if (!menu) return;

      const valid = [
        ...this.primaryNavigation.map(item => item.id),
        ...this.administrationNavigation.map(item => item.id)
      ];

      if (valid.includes(menu)) {
        this.activeMenu = menu;
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

  setActive(menu: string): void {

    this.activeMenu = menu;

    this.createMenuOpen = false;
    this.profileMenuOpen = false;
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

    /*
     * Epic / Story / Task creation is
     * handled from the Epics workspace.
     */
    if (
      type === 'epic' ||
      type === 'story' ||
      type === 'task'
    ) {

      this.activeMenu =
        'epics';

      return;
    }

    if (type === 'issue') {

      this.activeMenu =
        'issues';

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

  openEditDialog(): void {

    this.profileMenuOpen = false;

    const dialogRef =
      this.dialog.open(
        EditProfileDialog,
        {
          width: '600px',
          height: '600px',
          data: {
            ...this.user
          }
        }
      );

    dialogRef
      .afterClosed()
      .subscribe(result => {

        if (result) {
          this.user = result;
        }
      });
  }

  // =========================================================
  // SEARCH
  // =========================================================

  focusSearch(
    event?: Event
  ): void {

    event?.stopPropagation();

    const element =
      document.querySelector(
        '.gmail-search-input'
      ) as HTMLInputElement | null;

    element?.focus();
  }

  clearSearch(): void {

    this.searchQuery = '';

    this.focusSearch();
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
      this.activeMenu = 'epics';
    }
    else if (
      url.includes('/issues')
    ) {
      this.activeMenu = 'issues';
    }
    else if (
      url.includes('/testcases')
    ) {
      this.activeMenu = 'test-cases';
    }
    else if (
      url.includes('/projects')
    ) {
      this.activeMenu = 'projects';
    }
    else if (
      url.includes('/products')
    ) {
      this.activeMenu = 'products';
    }
    else if (
      url.includes('/users')
    ) {
      this.activeMenu = 'users';
    }
    else if (
      url.includes('/teams')
    ) {
      this.activeMenu = 'teams';
    }
    else if (
      url.includes('/roles')
    ) {
      this.activeMenu = 'roles';
    }
    else if (
      url.includes('/releases')
    ) {
      this.activeMenu = 'releases';
    }
    else if (
      url.includes('/docs')
    ) {
      this.activeMenu = 'docs';
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