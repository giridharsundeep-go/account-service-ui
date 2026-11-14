import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';
import { Users } from '../users/users';
import { Teams } from '../teams/teams';
import { Agents } from '../agents/agents';
import { WorkspaceSettingsComponent } from '../shared/workspace-settings';
import { Roles } from '../roles/roles';

type PeoplePage = 'users' | 'teams' | 'agents' | 'workflows' | 'structure' | 'roles' | 'permissions' | 'designations';

@Component({
  selector: 'app-people-access',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [CommonModule, FormsModule, Users, Teams, Agents, WorkspaceSettingsComponent, Roles],
  templateUrl: './people-access.html',
  styleUrls: ['./people-access.css']
})
export class PeopleAccess implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly project = inject(ProjectContextService);
  private readonly baseUrl = String(environment.apiBaseUrlM || '').replace(/\/$/, '');

  activePage: PeoplePage = 'users';
  user: { id: number | null; name: string; email: string; phone: string; image: string | ArrayBuffer | null } = { id: null, name: 'Your account', email: '', phone: '', image: null };
  people: any[] = [];
  searchText = '';
  searchOpen = false;
  currentUserProfileId: number | null = null;
  profileOpenRequest = 0;

  get token(): string { return this.auth.getAuthHeaders().get('Authorization')?.replace(/^Bearer /, '') || ''; }

  readonly pages: { id: PeoplePage; label: string; icon: string; detail: string }[] = [
    { id: 'users', label: 'People', icon: '♙', detail: 'Find teammates and manage profiles' },
    { id: 'teams', label: 'Teams', icon: '♧', detail: 'Organize people around shared work' },
    { id: 'agents', label: 'Agents', icon: '⠿', detail: 'Manage assistants and service agents' },
    { id: 'workflows', label: 'Workflows', icon: '⇄', detail: 'Configure shared work statuses' },
    { id: 'structure', label: 'Organization', icon: '⌘', detail: 'Manage departments and divisions' },
    { id: 'roles', label: 'Roles', icon: '◈', detail: 'Create and manage access roles' },
    { id: 'permissions', label: 'Permissions', icon: '✓', detail: 'Review access and per-person overrides' },
    { id: 'designations', label: 'Designations', icon: '▤', detail: 'Manage job titles in the directory' }
  ];

  get activePageLabel(): string { return this.pages.find(page => page.id === this.activePage)?.label || 'People & Access'; }
  get activePageDetail(): string { return this.pages.find(page => page.id === this.activePage)?.detail || 'Manage your workspace directory and access.'; }

  get filteredPeople(): any[] {
    const query = this.searchText.trim().toLocaleLowerCase();
    if (query.length < 2) return [];
    return this.people.filter(person => `${person.fullName || person.name || ''} ${person.email || ''}`.toLocaleLowerCase().includes(query)).slice(0, 6);
  }

  ngOnInit(): void {
    const current = this.auth.getCurrentUser();
    if (current) this.user = {
      ...this.user,
      id: Number(current.id ?? current.userId ?? current.user_id) || null,
      name: current.fullName || current.full_name || current.name || 'Your account',
      email: current.email || current.email_address || '',
      phone: current.phone || '',
      image: current.profilePictureUrl ?? current.profile_picture_url ?? current.avatarUrl ?? current.avatar_url ?? null
    };
    this.route.queryParamMap.subscribe(params => {
      const view = params.get('view');
      if (['users', 'teams', 'agents', 'workflows', 'structure', 'roles', 'permissions', 'designations'].includes(view || '')) {
        this.activePage = view as PeoplePage;
        if (this.activePage !== 'users') this.currentUserProfileId = null;
      }
      const userId = Number(params.get('userId'));
      if (Number.isSafeInteger(userId) && userId > 0 && userId !== this.currentUserProfileId) this.openPerson({ id: userId }, false);
      else if (!params.get('userId')) this.currentUserProfileId = null;
    });
    this.http.get<any>(`${this.baseUrl}/users`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: response => { this.people = Array.isArray(response) ? response : response?.data ?? response?.users ?? []; },
      error: () => { this.people = []; }
    });
  }

  navigate(page: PeoplePage): void {
    if (!['users', 'teams', 'agents', 'workflows', 'structure', 'roles', 'permissions', 'designations'].includes(page)) return;
    this.activePage = page;
    this.currentUserProfileId = null;
    this.profileOpenRequest = 0;
    this.searchOpen = false;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { view: page, userId: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  onSearchInput(value: unknown): void {
    this.searchText = typeof value === 'string' ? value : String((value as any)?.value ?? '');
    this.searchOpen = this.searchText.trim().length > 0;
  }

  onSearchSubmit(): void {
    const first = this.filteredPeople[0];
    if (first) this.openPerson(first);
    else this.navigate('users');
  }

  openPerson(person: any, syncUrl = true): void {
    this.activePage = 'users';
    this.currentUserProfileId = Number(person.id);
    this.profileOpenRequest += 1;
    this.searchOpen = false;
    if (syncUrl) void this.router.navigate([], { relativeTo: this.route, queryParams: { view: 'users', userId: this.currentUserProfileId }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  onProfileClosed(): void {
    this.currentUserProfileId = null;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { userId: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  trackPage(_index: number, page: { id: PeoplePage }): string { return page.id; }
  trackPerson(_index: number, person: any): number { return Number(person.id); }
}
