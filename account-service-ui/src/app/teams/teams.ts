import { ChatlyLauncher } from '../shared/chatly-launcher.service';
import { TeamWorkComponent } from '../shared/team-work';

import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environment';

import {
  Observable,
  BehaviorSubject,
  forkJoin,
  of,
  Subscription
} from 'rxjs';

import {
  catchError,
  map,
  switchMap
} from 'rxjs/operators';

import { AuthService } from '../auth.service';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { PersonCard } from '../shared/person-card';
import { peopleRows, personDesignation } from '../shared/people-directory';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';

import {
  UserSelectDialog,
  UserPayload
} from '../user-select-dialog/user-select-dialog';

interface TeamMemberView {
  id: number;
  name: string;
  email: string;
  profilePictureUrl?: string | null;
  employeeIdPrefix?: string | null;
  employeeIdNumber?: string | number | null;
  role_name?: string | null;
}

interface TeamView {
  id: number;
  name: string;
  description: string;
  createdAt?: string | null;
  members: TeamMemberView[];
  teamLeadName?: string | null;
  teamLeadId?: number | null;
  category?: string | null;
  status?: string | null;
}

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [
    CommonModule,
    TeamWorkComponent,
    FormsModule,
    WorkspaceHeroComponent,
    PersonCard,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatExpansionModule,
    MatDialogModule,
    MatChipsModule,
    MatSelectModule,
    MatIconModule
  ],
  templateUrl: './teams.html',
  styleUrls: ['./teams.css', '../shared/field-controls.css']
})
export class Teams implements OnInit, OnDestroy {
  readonly chatly=inject(ChatlyLauncher);


  baseUrl = environment.apiBaseUrlM;

  private teamsRefresh$ = new BehaviorSubject<void>(undefined);
  private teamsSubscription?: Subscription;

  /**
   * `teams$` remains available for templates that use the async pipe.
   * `teams` supports templates that use filterTeams(teams).
   */
  teams$: Observable<TeamView[]> = of([]);
  teams: TeamView[] = [];

  allUsers: UserPayload[] = [];
  private peopleRoles: any[] = [];

  name = '';
  description = '';

  selectedUsers: number[] = [];
  chipUserObjects: UserPayload[] = [];

  editingTeamId: number | null = null;
  searchTerm = '';
  memberSearchTerm = '';
  statusFilter: 'all' | 'operational' | 'empty' = 'all';
  teamLeadFilter = 'all';
  memberCountFilter: 'all' | '0' | '1-5' | '6-10' | '11+' = 'all';
  loading = false;

  selectedTeam: TeamView | null = null;
  teamProfileTab: 'overview' | 'work' | 'resources' = 'overview';
  createTab: 'overview' | 'work' | 'resources' = 'overview';
  editingProfileTitle = false;
  editingProfileDescription = false;
  profileNameDraft = '';
  profileDescriptionDraft = '';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {}

  // ============================================================
  // INITIAL LOAD / CLEANUP
  // ============================================================

  ngOnInit(): void {
    const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');

    // Keep the stream alive after a failed request so later refreshes work.
    // APIs may return a raw array, { data: [...] }, { teams: [...] }, or a
    // paginated/nested response depending on the controller implementation.
    this.teams$ = this.teamsRefresh$.pipe(
      switchMap(() =>
        this.http.get<any>(
          `${cleanBaseUrl}/teams`,
          { headers: this.auth.getAuthHeaders() }
        ).pipe(
          map((res: any) => {
            const rawTeams = this.extractTeamsArray(res);
            return rawTeams
              .map((team: any) => this.normalizeTeam(team))
              .filter((team: TeamView) => Number.isFinite(team.id) && team.id > 0);
          }),
          catchError((error) => {
            console.error('Failed to load teams from GET /teams:', error);
            return of([] as TeamView[]);
          })
        )
      )
    );

    // Synchronize the observable with the array used by the card template.
    this.teamsSubscription = this.teams$.subscribe({
      next: (teams: TeamView[]) => {
        this.teams = teams;

        // Keep the selected detail view in sync after refreshes.
        if (this.selectedTeam) {
          const refreshedTeam = teams.find(
            team => Number(team.id) === Number(this.selectedTeam?.id)
          );

          if (refreshedTeam) {
            // GET /teams commonly returns directory rows without the membership join.
            // Do not replace a fully loaded profile's members with that incomplete list row.
            this.selectedTeam = {
              ...refreshedTeam,
              members: refreshedTeam.members.length
                ? refreshedTeam.members
                : (this.selectedTeam.members || [])
            };
          }
        }

        this.cdr.markForCheck();
      }
    });

    this.loadUsersBackground();
  }

  ngOnDestroy(): void {
    this.teamsSubscription?.unsubscribe();
  }

  // ============================================================
  // SEARCH / FILTER
  // ============================================================

  get totalTeams(): number {
    return this.teams.length;
  }

  get operationalTeams(): number {
    return this.teams.filter(team => this.getTeamMembers(team).length > 0).length;
  }

  get teamsNeedingMembers(): number {
    return this.teams.filter(team => this.getTeamMembers(team).length === 0).length;
  }

  get totalTeamMembers(): number {
    return this.teams.reduce((total, team) => total + this.getTeamMembers(team).length, 0);
  }

  get teamLeadOptions(): string[] {
    return [...new Set(
      this.teams
        .map((team: TeamView) => this.getTeamLeadName(team))
        .filter((name: string) => !!name && name !== 'Not assigned')
    )].sort((a, b) => a.localeCompare(b));
  }

  filterTeams(teams: TeamView[] | null | undefined): TeamView[] {
    if (!Array.isArray(teams)) {
      return [];
    }

    const term = (this.searchTerm || '').trim().toLowerCase();

    return teams.filter((team: TeamView) => {
      const members = this.getTeamMembers(team);
      const lead = this.getTeamLeadName(team);
      const status = members.length > 0 ? 'operational' : 'empty';

      const matchesSearch = !term || [
        team?.name || '',
        team?.description || '',
        lead,
        ...members.flatMap((member: TeamMemberView) => [
          this.getMemberName(member),
          this.getMemberEmail(member),
          this.getMemberEmployeeCode(member)
        ])
      ].some((value: string) => value.toLowerCase().includes(term));

      const matchesStatus = this.statusFilter === 'all' || status === this.statusFilter;
      const matchesLead = this.teamLeadFilter === 'all' || lead === this.teamLeadFilter;
      const count = members.length;
      const matchesCount =
        this.memberCountFilter === 'all' ||
        (this.memberCountFilter === '0' && count === 0) ||
        (this.memberCountFilter === '1-5' && count >= 1 && count <= 5) ||
        (this.memberCountFilter === '6-10' && count >= 6 && count <= 10) ||
        (this.memberCountFilter === '11+' && count >= 11);

      return matchesSearch && matchesStatus && matchesLead && matchesCount;
    });
  }

  trackTeam(index: number, team: TeamView): number {
    return Number(team?.id ?? index);
  }

  refreshTeamsList(): void {
    this.teamsRefresh$.next();
  }

  // ============================================================
  // LOAD USERS
  // ============================================================

  loadUsersBackground(): void {
    const headers = this.auth.getAuthHeaders();
    forkJoin({users: this.http.get<any>(`${this.baseUrl}/users`, {headers}),
      roles: this.http.get<any>(`${this.baseUrl}/roles`, {headers}).pipe(catchError(() => of([])))
    }).subscribe({
      next: ({users: res, roles}) => {
        this.peopleRoles = peopleRows(roles);
        const rawUsers = this.extractUsersArray(res);

        this.allUsers = rawUsers
          .map((user: any) => this.normalizeUser(user))
          .filter((user: UserPayload) => Number.isFinite(Number(user.id)) && Number(user.id) > 0);

        if (this.allUsers.length === 0) {
          console.warn('GET /users returned no recognizable user records. Check the response shape in the Network tab.', res);
        }

        this.rebuildChipsFromSelectedUsers();

        // Reload team membership details after user data is available.
        this.refreshTeamsList();
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to load users:', error);
      }
    });
  }

  private extractUsersArray(response: any): any[] {
    // Support common API response envelopes without assuming one backend shape.
    const candidates = [
      response,
      response?.data,
      response?.users,
      response?.content,
      response?.items,
      response?.results,
      response?.result,
      response?.payload,
      response?.data?.users,
      response?.data?.content,
      response?.data?.items,
      response?.data?.results,
      response?.result?.users,
      response?.payload?.users
    ];
    const direct = candidates.find((value: any) => Array.isArray(value));
    if (direct) return direct;

    // Some endpoints return a nested wrapper such as { data: { result: { users: [] } } }.
    const queue: any[] = [response];
    const seen = new Set<any>();
    while (queue.length) {
      const value = queue.shift();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (Array.isArray(child) && child.every((item: any) => item && typeof item === 'object')) {
          if (child.length === 0 || child.some((item: any) =>
            'id' in item || 'user_id' in item || 'userId' in item || 'email' in item)) {
            return child;
          }
        } else if (child && typeof child === 'object') {
          queue.push(child);
        }
      }
    }
    return [];
  }

  private resolveDisplayName(user: any): string {
    const profile = user?.profile ?? user?.userProfile ?? user?.user_profile ?? {};
    const firstName = user?.firstName ?? user?.first_name ?? user?.givenName ?? user?.given_name ?? profile?.firstName ?? profile?.first_name ?? '';
    const lastName = user?.lastName ?? user?.last_name ?? user?.surname ?? profile?.lastName ?? profile?.last_name ?? '';
    const joinedName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
    const candidate =
      user?.displayName ?? user?.display_name ?? user?.fullName ?? user?.full_name ??
      user?.name ?? user?.preferredName ?? user?.preferred_name ?? joinedName ?? '';
    const clean = String(candidate ?? '').trim();
    if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return clean;
    // Some APIs store a login identifier in `username`; only use it if it is not an email.
    const username = String(user?.username ?? user?.login ?? '').trim();
    if (username && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) return username;
    return 'Name not provided';
  }

  private normalizeUser(user: any): UserPayload {
    return {
      designation: personDesignation(user, this.peopleRoles),
      id: Number(user?.id ?? user?.user_id ?? user?.userId ?? user?.user_account_id),
      name: this.resolveDisplayName(user),
      email: user?.email || 'No email available',
      profilePictureUrl:
        user?.profilePictureUrl ??
        user?.profile_picture_url ??
        user?.avatarUrl ??
        user?.avatar_url ??
        user?.photoUrl ??
        user?.photo_url ??
        null,
      employeeIdPrefix:
        user?.employeeIdPrefix ??
        user?.employee_id_prefix ??
        null,
      employeeIdNumber:
        user?.employeeIdNumber ??
        user?.employee_id_number ??
        null
    };
  }

  private extractTeamsArray(response: any): any[] {
    const candidates = [
      response,
      response?.data,
      response?.teams,
      response?.content,
      response?.data?.teams,
      response?.data?.content,
      response?.result,
      response?.result?.teams,
      response?.payload?.teams
    ];

    return candidates.find((value: any) => Array.isArray(value)) ?? [];
  }

  private normalizeTeam(team: any): TeamView {
    const rawMembers =
      Array.isArray(team?.members) ? team.members :
      Array.isArray(team?.teamMembers) ? team.teamMembers :
      Array.isArray(team?.team_members) ? team.team_members :
      Array.isArray(team?.teamUsers) ? team.teamUsers :
      Array.isArray(team?.team_users) ? team.team_users :
      Array.isArray(team?.memberships) ? team.memberships :
      Array.isArray(team?.teamMemberships) ? team.teamMemberships :
      Array.isArray(team?.team_memberships) ? team.team_memberships :
      Array.isArray(team?.users) ? team.users :
      Array.isArray(team?.memberIds) ? team.memberIds :
      Array.isArray(team?.member_ids) ? team.member_ids :
      [];

    const members = rawMembers
      .map((member: any) => this.normalizeMember(member))
      .map((member: TeamMemberView) => this.enrichMemberFromUsers(member))
      .filter((member: TeamMemberView) =>
        Number.isFinite(member.id) && member.id > 0
      );

    const rawLead = team?.teamLead ?? team?.team_lead ?? team?.lead ?? team?.owner ?? null;
    const teamLeadName =
      team?.teamLeadName ?? team?.team_lead_name ?? team?.leadName ?? team?.lead_name ??
      rawLead?.name ?? rawLead?.fullName ?? rawLead?.full_name ?? null;
    const rawLeadId =
      team?.teamLeadId ?? team?.team_lead_id ?? team?.leadUserId ?? team?.lead_user_id ??
      rawLead?.id ?? rawLead?.user_id ?? null;

    return {
      id: Number(team?.id ?? team?.teamId ?? team?.team_id),
      name: team?.name ?? team?.teamName ?? team?.team_name ?? '',
      description: team?.description ?? team?.teamDescription ?? team?.team_description ?? '',
      createdAt: team?.createdAt ?? team?.created_at ?? team?.createdDate ?? team?.created_date ?? null,
      members,
      teamLeadName: teamLeadName ? String(teamLeadName) : null,
      teamLeadId: rawLeadId == null ? null : Number(rawLeadId),
      category: team?.category ?? team?.teamCategory ?? team?.team_category ?? team?.type ?? null,
      status: team?.status ?? team?.teamStatus ?? team?.team_status ?? null
    };
  }

  private normalizeMember(member: any): TeamMemberView {
    // Some team APIs return full user objects, while others return only numeric/string IDs.
    // Preserve ID-only members so enrichMemberFromUsers can hydrate them into visible people cards.
    const source = member?.user ?? member;

    const rawId =
      (typeof member === 'number' || typeof member === 'string' ? member : undefined) ??
      member?.user_id ??
      member?.userId ??
      member?.memberId ??
      member?.userAccountId ??
      member?.user_account_id ??
      member?.account_id ??
      source?.userAccountId ??
      source?.user_account_id ??
      source?.id ??
      source?.user_id ??
      member?.id;

    return {
      id: Number(rawId),
      name: this.resolveDisplayName(source),
      email: source?.email || 'No email available',
      profilePictureUrl:
        source?.profilePictureUrl ??
        source?.profile_picture_url ??
        null,
      employeeIdPrefix:
        source?.employeeIdPrefix ??
        source?.employee_id_prefix ??
        null,
      employeeIdNumber:
        source?.employeeIdNumber ??
        source?.employee_id_number ??
        null,
      role_name:
        source?.role_name ??
        source?.role?.name ??
        member?.role_name ??
        member?.role?.name ??
        null
    };
  }

  private enrichMemberFromUsers(member: TeamMemberView): TeamMemberView {
    const knownUser = this.findKnownUser(member.id);

    if (!knownUser) {
      return member;
    }

    return {
      ...member,
      name:
        member.name &&
        member.name !== 'Unknown User' &&
        member.name !== 'Name not provided'
          ? member.name
          : knownUser.name,
      email:
        member.email && member.email !== 'No email available'
          ? member.email
          : knownUser.email,
      profilePictureUrl:
        member.profilePictureUrl ?? knownUser.profilePictureUrl ?? null,
      employeeIdPrefix:
        member.employeeIdPrefix ?? knownUser.employeeIdPrefix ?? null,
      employeeIdNumber:
        member.employeeIdNumber ?? knownUser.employeeIdNumber ?? null
    };
  }

  private findKnownUser(id: number): UserPayload | null {
    return this.allUsers.find(
      (user: UserPayload) => Number(user.id) === Number(id)
    ) ?? null;
  }

  getTeamLeadName(team: TeamView | null): string {
    if (!team) {
      return 'Not assigned';
    }

    if (team.teamLeadName?.trim()) {
      return team.teamLeadName.trim();
    }

    if (team.teamLeadId) {
      const lead = this.findKnownUser(Number(team.teamLeadId));
      if (lead?.name) {
        return lead.name;
      }
    }

    const leadMember = this.getTeamMembers(team).find((member: TeamMemberView) =>
      /team lead|lead|manager/i.test(member.role_name || '')
    );

    return leadMember?.name || 'Not assigned';
  }

  getTeamCategory(team: TeamView): string {
    return team.category?.trim() || `Team #${team.id}`;
  }

  // ============================================================
  // TEAM MEMBER HELPERS
  // ============================================================

  getTeamMembers(team: TeamView | null): TeamMemberView[] {
    if (!Array.isArray(team?.members)) {
      return [];
    }

    return team.members.map(
      (member: TeamMemberView) => this.enrichMemberFromUsers(member)
    );
  }

  getFilteredTeamMembers(team: TeamView | null): TeamMemberView[] {
    const members = this.getTeamMembers(team);
    const term = (this.memberSearchTerm || '').trim().toLowerCase();
    if (!term) return members;
    return members.filter((member: TeamMemberView) =>
      [this.getMemberName(member), this.getMemberEmail(member), this.getMemberEmployeeCode(member)]
        .some((value: string) => String(value || '').toLowerCase().includes(term))
    );
  }

  getMemberId(member: any): number {
    return Number(
      member?.id ??
      member?.user_id ??
      member?.user?.id
    );
  }

  getMemberName(member: any): string {
    return (
      member?.name ||
      member?.user?.name ||
      member?.username ||
      member?.email ||
      'Unknown User'
    );
  }

  getMemberEmail(member: any): string {
    return (
      member?.email ||
      member?.user?.email ||
      'No email available'
    );
  }

  getMemberRoleLabel(member: any): string {
    return personDesignation(this.findKnownUser(this.getMemberId(member)) || member, this.peopleRoles);
  }

  // Arrow property keeps the component context when Angular calls trackBy.
  trackMember = (_index: number, member: any): number | string => {
    const id = this.getMemberId(member);
    return (Number.isFinite(id) && id > 0 ? id : '') || this.getMemberEmail(member) || this.getMemberName(member) || _index;
  };

  getMemberEmployeeCode(member: any): string {
    const prefix =
      member?.employeeIdPrefix ??
      member?.employee_id_prefix ??
      member?.user?.employeeIdPrefix ??
      member?.user?.employee_id_prefix ??
      '';

    const number =
      member?.employeeIdNumber ??
      member?.employee_id_number ??
      member?.user?.employeeIdNumber ??
      member?.user?.employee_id_number ??
      '';

    if (!prefix && !number) {
      return 'No employee code';
    }

    if (prefix && number) {
      return `${prefix}//${number}`;
    }

    return String(prefix || number);
  }

  getMemberAvatar(member: any): string | null {
    return (
      member?.profilePictureUrl ??
      member?.profile_picture_url ??
      member?.user?.profilePictureUrl ??
      member?.user?.profile_picture_url ??
      null
    );
  }

  getMemberAvatarDisplaySrc(member: any): string {
    return this.resolveAvatarUrl(this.getMemberAvatar(member));
  }

  getAvatarDisplaySrc(user: UserPayload): string {
    return this.resolveAvatarUrl(user?.profilePictureUrl ?? null);
  }

  private resolveAvatarUrl(path: string | null): string {
    if (!path) {
      return '';
    }

    if (
      path.startsWith('data:') ||
      path.startsWith('http://') ||
      path.startsWith('https://')
    ) {
      return path;
    }

    const cleanPath = path.trim().replace(/^\/+/, '');
    const cleanBase = this.baseUrl.endsWith('/')
      ? this.baseUrl.slice(0, -1)
      : this.baseUrl;

    return `${cleanBase}/${cleanPath}`;
  }

  getInitials(name: string): string {
    if (!name?.trim()) {
      return '?';
    }

    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      return (
        parts[0][0] + parts[parts.length - 1][0]
      ).toUpperCase();
    }

    return parts[0][0].toUpperCase();
  }

  getMemberRole(member: any): string {
    return (
      member?.role_name ||
      member?.role?.name ||
      member?.user?.role_name ||
      member?.user?.role?.name ||
      'Workspace Staff'
    );
  }

  getDominantRole(members: TeamMemberView[]): string {
    if (!members?.length) {
      return 'None Configured';
    }

    const counts: Record<string, number> = {};

    members.forEach((member: TeamMemberView) => {
      const role = this.getMemberRole(member);
      counts[role] = (counts[role] || 0) + 1;
    });

    return Object.keys(counts).reduce((a, b) =>
      counts[a] > counts[b] ? a : b
    );
  }

  getUniqueRolesCount(members: TeamMemberView[]): number {
    if (!members?.length) {
      return 0;
    }

    return new Set(
      members.map((member: TeamMemberView) => this.getMemberRole(member))
    ).size;
  }

  getUnassignedCandidates(currentTeamMembers: TeamMemberView[]): UserPayload[] {
    const assignedIds = new Set(
      (currentTeamMembers || [])
        .map((member: TeamMemberView) => this.getMemberId(member))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    );

    return this.allUsers.filter(
      (user: UserPayload) => !assignedIds.has(Number(user?.id))
    );
  }

  // ============================================================
  // CREATE / EDIT FORM
  // ============================================================

  editTeam(team: TeamView): void {
    this.selectedTeam = null;
    this.teamProfileTab = 'overview';
    this.createTab = 'overview';
    this.name = team?.name || '';
    this.description = team?.description || '';
    this.editingTeamId = Number(team?.id);

    this.selectedUsers = this.getTeamMembers(team)
      .map((member: TeamMemberView) => this.getMemberId(member))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    this.rebuildChipsFromSelectedUsers();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  saveTeam(): void {
    const trimmedName = this.name.trim();

    if (!trimmedName || this.loading) {
      return;
    }

    this.loading = true;

    const payload = this.buildTeamPayload(this.selectedUsers);
    const headers = this.auth.getAuthHeaders();

    if (this.editingTeamId !== null && this.editingTeamId > 0) {
      this.http.put<any>(
        `${this.baseUrl}/teams/${this.editingTeamId}`,
        payload,
        { headers }
      ).subscribe({
        next: (res: any) => this.handleSuccessfulTeamSave(res),
        error: (error) => {
          console.error('Failed to update team:', error);
          this.loading = false;
          this.cdr.markForCheck();
        }
      });

      return;
    }

    this.http.post<any>(
      `${this.baseUrl}/teams`,
      payload,
      { headers }
    ).subscribe({
      next: (res: any) => this.handleSuccessfulTeamSave(res),
      error: (error) => {
        console.error('Failed to create team:', error);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private buildTeamPayload(memberIds: number[]): any {
    return {
      name: this.name.trim(),
      description: this.description.trim(),
      memberIds: [
        ...new Set(
          memberIds
            .map((id: number) => Number(id))
            .filter((id: number) => Number.isFinite(id) && id > 0)
        )
      ]
    };
  }

  private handleSuccessfulTeamSave(_res: any): void {
    this.loading = false;
    this.resetForm();
    this.refreshTeamsList();
    this.cdr.markForCheck();
  }

  resetForm(): void {
    this.name = '';
    this.description = '';
    this.selectedUsers = [];
    this.chipUserObjects = [];
    this.editingTeamId = null;
    this.selectedTeam = null;
    this.createTab = 'overview';
    this.editingProfileTitle = false;
    this.editingProfileDescription = false;
    this.cdr.markForCheck();
  }

  // ============================================================
  // USER SELECTION DIALOG / CHIPS
  // ============================================================

  openUserSelectModal(): void {
    this.openUserSelectionDialog(
      this.selectedUsers,
      (ids: number[]) => {
        this.selectedUsers = ids;
        this.rebuildChipsFromSelectedUsers();
      }
    );
  }

  openTeamMemberManager(team: TeamView | null): void {
    if (!team) {
      return;
    }

    const currentIds = this.getTeamMembers(team)
      .map((member: TeamMemberView) => this.getMemberId(member))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    this.openUserSelectionDialog(
      currentIds,
      (ids: number[]) => this.updateTeamMembers(team, ids)
    );
  }

  private openUserSelectionDialog(
    currentSelection: number[],
    onSelected: (ids: number[]) => void
  ): void {
    const currentIds = new Set(
      currentSelection.map((id: number) => Number(id))
    );

    const usersForDialog = [
      ...this.allUsers,
      ...currentSelection
        .map((id: number) => this.findKnownUser(id))
        .filter((user): user is UserPayload => !!user)
    ].filter(
      (user: UserPayload, index: number, collection: UserPayload[]) =>
        collection.findIndex(
          candidate => Number(candidate.id) === Number(user.id)
        ) === index
    );

    const dialogRef = this.dialog.open(UserSelectDialog, {
      width: '860px',
      maxWidth: '92vw',
      data: {
        users: usersForDialog,
        currentSelection: [...currentIds]
      }
    });

    dialogRef.afterClosed().subscribe((result: number[] | undefined) => {
      if (!Array.isArray(result)) {
        return;
      }

      const ids = [...new Set(
        result.map((id: number) => Number(id))
      )].filter(
        (id: number) => Number.isFinite(id) && id > 0
      );

      onSelected(ids);
    });
  }

  private rebuildChipsFromSelectedUsers(): void {
    this.chipUserObjects = this.selectedUsers
      .map((id: number) => this.findKnownUser(id))
      .filter((user): user is UserPayload => !!user);

    this.cdr.markForCheck();
  }

  removeUserChip(userId: number): void {
    this.selectedUsers = this.selectedUsers.filter(
      (id: number) => Number(id) !== Number(userId)
    );

    this.rebuildChipsFromSelectedUsers();
  }

  // ============================================================
  // TEAM MEMBER ADD / REMOVE
  // ============================================================

  addMemberToTeamInline(teamId: number, userId: number): void {
    if (!userId || !this.selectedTeam) {
      return;
    }

    if (Number(this.selectedTeam.id) !== Number(teamId)) {
      return;
    }

    const currentIds = this.getTeamMembers(this.selectedTeam)
      .map((member: TeamMemberView) => this.getMemberId(member))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    if (currentIds.includes(Number(userId))) {
      return;
    }

    this.updateTeamMembersInline(
      this.selectedTeam,
      [...currentIds, Number(userId)]
    );
  }

  removeMemberFromTeamInline(teamId: number, userId: number): void {
    if (!this.selectedTeam) {
      return;
    }

    if (Number(this.selectedTeam.id) !== Number(teamId)) {
      return;
    }

    if (!confirm('Remove this user from the team?')) {
      return;
    }

    const remainingIds = this.getTeamMembers(this.selectedTeam)
      .map((member: TeamMemberView) => this.getMemberId(member))
      .filter((id: number) =>
        Number.isFinite(id) &&
        id > 0 &&
        Number(id) !== Number(userId)
      );

    this.updateTeamMembersInline(this.selectedTeam, remainingIds);
  }

  private updateTeamMembersInline(
    team: TeamView,
    memberIds: number[]
  ): void {
    this.loading = true;

    this.http.put<any>(
      `${this.baseUrl}/teams/${team.id}`,
      this.buildTeamPayload(memberIds),
      { headers: this.auth.getAuthHeaders() }
    ).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.selectedTeam = this.normalizeTeam(res.data);
        }

        this.loading = false;
        this.refreshTeamsList();
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to update team members:', error);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private updateTeamMembers(team: TeamView, memberIds: number[]): void {
    this.loading = true;

    this.http.put<any>(
      `${this.baseUrl}/teams/${team.id}`,
      this.buildTeamPayload(memberIds),
      { headers: this.auth.getAuthHeaders() }
    ).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.selectedTeam = this.normalizeTeam(res.data);
        }

        this.loading = false;
        this.refreshTeamsList();
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to update team members:', error);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ============================================================
  // TEAM DETAILS
  // ============================================================

  startProfileFieldEdit(field: 'name' | 'description'): void {
    if (!this.selectedTeam) return;
    this.editingProfileTitle = field === 'name';
    this.editingProfileDescription = field === 'description';
    this.profileNameDraft = this.selectedTeam.name || '';
    this.profileDescriptionDraft = this.selectedTeam.description || '';
    this.cdr.markForCheck();
  }

  cancelProfileFieldEdit(): void {
    this.editingProfileTitle = false;
    this.editingProfileDescription = false;
    this.profileNameDraft = this.selectedTeam?.name || '';
    this.profileDescriptionDraft = this.selectedTeam?.description || '';
    this.cdr.markForCheck();
  }

  saveProfileField(field: 'name' | 'description'): void {
    const team = this.selectedTeam;
    if (!team || this.loading) return;
    const nextName = field === 'name' ? this.profileNameDraft.trim() : team.name;
    const nextDescription = field === 'description' ? this.profileDescriptionDraft.trim() : team.description;
    if (!nextName) return;

    this.loading = true;
    const memberIds = this.getTeamMembers(team).map((member: TeamMemberView) => this.getMemberId(member)).filter((id: number) => Number.isFinite(id) && id > 0);
    this.http.put<any>(`${this.baseUrl}/teams/${team.id}`, {
      name: nextName,
      description: nextDescription,
      memberIds: [...new Set(memberIds)]
    }, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res: any) => {
        const returned = res?.data ? this.normalizeTeam(res.data) : { ...team, name: nextName, description: nextDescription };
        this.selectedTeam = { ...team, ...returned, name: nextName, description: nextDescription };
        this.name = nextName;
        this.description = nextDescription;
        this.loading = false;
        this.cancelProfileFieldEdit();
        this.refreshTeamsList();
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error(`Failed to update team ${field}:`, error);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  /** Extract membership arrays from the different response envelopes used by team APIs. */
  private extractTeamMembersArray(response: any): any[] {
    const candidates = [
      response,
      response?.data,
      response?.members,
      response?.teamMembers,
      response?.team_members,
      response?.users,
      response?.content,
      response?.items,
      response?.results,
      response?.result,
      response?.payload,
      response?.data?.members,
      response?.data?.teamMembers,
      response?.data?.team_members,
      response?.data?.teamUsers,
      response?.data?.team_users,
      response?.data?.memberships,
      response?.data?.users,
      response?.data?.content,
      response?.data?.items,
      response?.result?.members,
      response?.result?.teamMembers,
      response?.result?.team_members,
      response?.payload?.members,
      response?.payload?.teamMembers,
      response?.payload?.team_members
    ];
    const found = candidates.find((value: any) => Array.isArray(value));
    if (found) return found;

    // Some APIs wrap the team and its members in { data: { team: ..., ... } }.
    const nestedTeam = response?.data?.team ?? response?.team ?? response?.result?.team ?? response?.payload?.team;
    if (nestedTeam && nestedTeam !== response) {
      return this.extractTeamMembersArray(nestedTeam);
    }
    return [];
  }

  private applyTeamMembersResponse(teamId: number, response: any): boolean {
    const rawMembers = this.extractTeamMembersArray(response);
    if (!rawMembers.length || Number(this.selectedTeam?.id) !== Number(teamId)) return false;

    const members = rawMembers
      .map((member: any) => this.normalizeMember(member))
      .map((member: TeamMemberView) => this.enrichMemberFromUsers(member))
      .filter((member: TeamMemberView) => Number.isFinite(member.id) && member.id > 0);

    if (!members.length) return false;
    this.selectedTeam = { ...this.selectedTeam!, members };
    // Keep the list record in sync too, so reopening the profile does not lose its cards.
    this.teams = this.teams.map((item: TeamView) =>
      Number(item.id) === Number(teamId) ? { ...item, members } : item
    );
    this.cdr.markForCheck();
    return true;
  }

  /** Fallback for backends where GET /teams/:id omits the membership join. */
  private loadTeamMembersFallback(teamId: number): void {
    const headers = this.auth.getAuthHeaders();
    this.http.get<any>(`${this.baseUrl}/teams/${teamId}/members`, { headers }).subscribe({
      next: (response: any) => {
        if (this.applyTeamMembersResponse(teamId, response)) return;
        // Some controllers expose the same relation under /users instead of /members.
        this.http.get<any>(`${this.baseUrl}/teams/${teamId}/users`, { headers }).subscribe({
          next: (usersResponse: any) => { this.applyTeamMembersResponse(teamId, usersResponse); },
          error: () => { /* Optional compatibility endpoint; keep current profile state. */ }
        });
      },
      error: () => {
        this.http.get<any>(`${this.baseUrl}/teams/${teamId}/users`, { headers }).subscribe({
          next: (usersResponse: any) => { this.applyTeamMembersResponse(teamId, usersResponse); },
          error: () => { /* Optional compatibility endpoint; keep current profile state. */ }
        });
      }
    });
  }

  openTeamDetails(team: TeamView): void {
    // Open immediately from the team-list record. This backend returns 404 for
    // GET /teams/:id, so avoid that unsupported request and use the existing
    // team row plus the optional membership relation endpoint when necessary.
    this.selectedTeam = {
      ...team,
      members: Array.isArray(team?.members) ? team.members : []
    };
    this.editingProfileTitle = false;
    this.editingProfileDescription = false;
    this.profileNameDraft = team?.name || '';
    this.profileDescriptionDraft = team?.description || '';
    this.teamProfileTab = 'overview';
    this.memberSearchTerm = '';
    this.cdr.markForCheck();

    if (!this.getTeamMembers(this.selectedTeam).length) {
      this.loadTeamMembersFallback(Number(team.id));
    }
  }

  closeTeamDetails(): void {
    this.selectedTeam = null;
    this.teamProfileTab = 'overview';
    this.cdr.markForCheck();
  }

  // ============================================================
  // DELETE
  // ============================================================

  deleteTeam(id: number): void {
    if (!confirm('Are you sure you want to delete this team?')) {
      return;
    }

    this.loading = true;

    this.http.delete<any>(
      `${this.baseUrl}/teams/${id}`,
      { headers: this.auth.getAuthHeaders() }
    ).subscribe({
      next: () => {
        this.loading = false;
        this.refreshTeamsList();

        if (Number(this.editingTeamId) === Number(id)) {
          this.resetForm();
        }

        if (Number(this.selectedTeam?.id) === Number(id)) {
          this.closeTeamDetails();
        }

        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to delete team:', error);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }
}
