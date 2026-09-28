import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { environment } from '../../environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  Observable,
  BehaviorSubject,
  of
} from 'rxjs';

import {
  catchError,
  map,
  switchMap
} from 'rxjs/operators';

import { AuthService } from '../auth.service';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';

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
}

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatExpansionModule,
    MatDialogModule,
    MatChipsModule
  ],
  templateUrl: './teams.html',
  styleUrls: ['./teams.css']
})
export class Teams implements OnInit {

  baseUrl = environment.apiBaseUrlM;

  private teamsRefresh$ =
    new BehaviorSubject<void>(undefined);


  teams$: Observable<TeamView[]> = of([]);

  allUsers: UserPayload[] = [];

  name = '';
  description = '';

  // User IDs sent to POST/PUT /api/teams
  selectedUsers: number[] = [];

  // Display-only chip objects
  chipUserObjects: UserPayload[] = [];

  editingTeamId: number | null = null;

  searchTerm = '';

  loading = false;

  selectedTeam: TeamView | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {}

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  ngOnInit(): void {

    this.loadUsersBackground();

    /*
     * GET /api/teams returns:
     *
     * {
     *   data: [
     *     {
     *       id,
     *       name,
     *       description,
     *       createdAt,
     *       members: [ User, User, User ]
     *     }
     *   ],
     *   message,
     *   success
     * }
     *
     * Member identity data is hydrated from the same /api/users list.
     */
    this.teams$ = this.teamsRefresh$.pipe(
      switchMap(() =>
        this.http.get<any>(
          `${this.baseUrl}/teams`,
          {
            headers: this.auth.getAuthHeaders()
          }
        )
      ),

      map((res: any) => {

        const teams =
          Array.isArray(res?.data)
            ? res.data
            : [];

        return teams.map((team: any) =>
          this.normalizeTeam(team)
        );
      }),

      catchError((error) => {

        console.error(
          'Failed to load teams:',
          error
        );

        return of([] as TeamView[]);
      })
    );
  }

  // ============================================================
  // SEARCH
  // ============================================================

  filterTeams(teams: TeamView[] | null): TeamView[] {

    if (!teams) {
      return [];
    }

    const term =
      this.searchTerm
        .trim()
        .toLowerCase();

    if (!term) {
      return teams;
    }

    return teams.filter((team: TeamView) => {

      const teamMatches =
        (team?.name || '')
          .toLowerCase()
          .includes(term) ||
        (team?.description || '')
          .toLowerCase()
          .includes(term);

      const memberMatches =
        this.getTeamMembers(team).some(
          (member: TeamMemberView) =>
            this.getMemberName(member)
              .toLowerCase()
              .includes(term) ||
            this.getMemberEmail(member)
              .toLowerCase()
              .includes(term)
        );

      return teamMatches || memberMatches;
    });
  }

  // ============================================================
  // REFRESH
  // ============================================================

  refreshTeamsList(): void {
    this.teamsRefresh$.next();
  }

  // ============================================================
  // USERS
  // ============================================================

  loadUsersBackground(): void {

    /*
     * User picker source of truth:
     * GET /api/users
     *
     * The API should return safe user fields only. The frontend
     * normalizes both camelCase and snake_case responses.
     */
    this.http.get<any>(
      `${this.baseUrl}/users`,
      {
        headers: this.auth.getAuthHeaders()
      }
    ).subscribe({
      next: (res: any) => {

        const rawUsers =
          Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res)
              ? res
              : [];

        this.allUsers =
          rawUsers.map((user: any) =>
            this.normalizeUser(user)
          );


        this.rebuildChipsFromSelectedUsers();

        /*
         * Re-fetch teams after users are loaded so team membership IDs
         * can always be hydrated with name/email/avatar/employee code.
         */
        this.refreshTeamsList();

        this.cdr.markForCheck();
      },

      error: (error) => {

        console.error(
          'Failed to load users:',
          error
        );
      }
    });
  }

  private normalizeUser(user: any): UserPayload {
    return {
      id: Number(
        user?.id ??
        user?.user_id
      ),
      name:
        user?.name ||
        user?.username ||
        user?.email ||
        'Unknown User',
      email:
        user?.email ||
        'No email available',
      profilePictureUrl:
        user?.profilePictureUrl ??
        user?.profile_picture_url ??
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

  private normalizeTeam(team: any): TeamView {
    const rawMembers =
      Array.isArray(team?.members)
        ? team.members
        : Array.isArray(team?.teamMembers)
          ? team.teamMembers
          : Array.isArray(team?.team_members)
            ? team.team_members
            : Array.isArray(team?.memberIds)
              ? team.memberIds
              : [];

    return {
      id: Number(team?.id),
      name: team?.name ?? '',
      description: team?.description ?? '',
      createdAt:
        team?.createdAt ??
        team?.created_at ??
        null,
      members:
        rawMembers
          .map((member: any) =>
            this.normalizeMember(member)
          )
          .map((member: TeamMemberView) =>
            this.enrichMemberFromUsers(member)
          )
          .filter((member: TeamMemberView) =>
            Number.isFinite(member.id) && member.id > 0
          )
    };
  }

  private normalizeMember(member: any): TeamMemberView {
    const source =
      member?.user ??
      member;

    const rawId =
      member?.user_id ??
      member?.userId ??
      member?.memberId ??
      source?.id ??
      source?.user_id ??
      member?.id;

    return {
      id: Number(rawId),
      name:
        source?.name ||
        source?.username ||
        source?.email ||
        'Unknown User',
      email:
        source?.email ||
        'No email available',
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
    const knownUser =
      this.findKnownUser(member.id);

    if (!knownUser) {
      return member;
    }

    return {
      ...member,
      name:
        member.name &&
        member.name !== 'Unknown User'
          ? member.name
          : knownUser.name,
      email:
        member.email &&
        member.email !== 'No email available'
          ? member.email
          : knownUser.email,
      profilePictureUrl:
        member.profilePictureUrl ??
        knownUser.profilePictureUrl ??
        null,
      employeeIdPrefix:
        member.employeeIdPrefix ??
        knownUser.employeeIdPrefix ??
        null,
      employeeIdNumber:
        member.employeeIdNumber ??
        knownUser.employeeIdNumber ??
        null
    };
  }

  trackTeam(index: number, team: TeamView): number {
    return Number(
      team?.id ??
      index
    );
  }

  // ============================================================
  // TEAM MEMBER HELPERS
  // ============================================================

  getTeamMembers(team: TeamView | null): TeamMemberView[] {

    if (!Array.isArray(team?.members)) {
      return [];
    }

    return team!.members
      .map((member: TeamMemberView) =>
        this.enrichMemberFromUsers(member)
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
    return this.resolveAvatarUrl(
      this.getMemberAvatar(member)
    );
  }

  getAvatarDisplaySrc(user: UserPayload): string {
    return this.resolveAvatarUrl(
      user?.profilePictureUrl ?? null
    );
  }

  private resolveAvatarUrl(path: string | null): string {
    if (!path) {
      return '';
    }

    if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    const cleanPath = path
      .trim()
      .replace(/^\/+/, '');

    const cleanBase = this.baseUrl.endsWith('/')
      ? this.baseUrl.slice(0, -1)
      : this.baseUrl;

    return `${cleanBase}/${cleanPath}`;
  }

  getInitials(name: string): string {

    if (!name?.trim()) {
      return '?';
    }

    const parts =
      name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length >= 2) {
      return (
        parts[0][0] +
        parts[parts.length - 1][0]
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

    const counts: {
      [key: string]: number
    } = {};

    members.forEach((member: TeamMemberView) => {

      const role =
        this.getMemberRole(member);

      counts[role] =
        (counts[role] || 0) + 1;
    });

    return Object.keys(counts)
      .reduce((a, b) =>
        counts[a] > counts[b]
          ? a
          : b
      );
  }

  getUniqueRolesCount(members: TeamMemberView[]): number {

    if (!members?.length) {
      return 0;
    }

    return new Set(
      members.map(
        (member: TeamMemberView) =>
          this.getMemberRole(member)
      )
    ).size;
  }

  getUnassignedCandidates(
    currentTeamMembers: TeamMemberView[]
  ): UserPayload[] {

    const assignedIds =
      new Set(
        (currentTeamMembers || [])
          .map((member: TeamMemberView) =>
            this.getMemberId(member)
          )
          .filter((id: number) =>
            Number.isFinite(id) && id > 0
          )
      );

    return this.allUsers.filter(
      (user: UserPayload) =>
        !assignedIds.has(
          Number(user?.id)
        )
    );
  }

  // ============================================================
  // EDIT TEAM
  // ============================================================

  editTeam(team: TeamView): void {

    this.name =
      team?.name || '';

    this.description =
      team?.description || '';

    this.editingTeamId =
      Number(team?.id);

    const members =
      this.getTeamMembers(team);

    this.selectedUsers =
      members
        .map((member: TeamMemberView) =>
          this.getMemberId(member)
        )
        .filter((id: number) =>
          Number.isFinite(id) && id > 0
        );

    this.rebuildChipsFromSelectedUsers();

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });

    this.cdr.markForCheck();
  }

  // ============================================================
  // MEMBER SELECT DIALOG
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

  openTeamMemberManager(
    team: TeamView | null
  ): void {

    if (!team) {
      return;
    }

    const currentIds =
      this.getTeamMembers(team)
        .map((member: TeamMemberView) =>
          this.getMemberId(member)
        )
        .filter((id: number) =>
          Number.isFinite(id) && id > 0
        );

    this.openUserSelectionDialog(
      currentIds,
      (ids: number[]) => {
        this.updateTeamMembers(
          team,
          ids
        );
      }
    );
  }

  private openUserSelectionDialog(
    currentSelection: number[],
    onSelected: (ids: number[]) => void
  ): void {

    const currentIds =
      new Set(
        currentSelection.map(
          (id: number) => Number(id)
        )
      );

    const usersForDialog = [
      ...this.allUsers,
      ...currentSelection
        .map((id: number) =>
          this.findKnownUser(id)
        )
        .filter(
          (user): user is UserPayload =>
            !!user
        )
    ].filter(
      (user: UserPayload, index: number, collection: UserPayload[]) =>
        collection.findIndex(
          (candidate: UserPayload) =>
            Number(candidate.id) ===
            Number(user.id)
        ) === index
    );

    const dialogRef =
      this.dialog.open(
        UserSelectDialog,
        {
          width: '860px',
          maxWidth: '92vw',
          data: {
            users: usersForDialog,
            currentSelection: [...currentIds]
          }
        }
      );

    dialogRef
      .afterClosed()
      .subscribe(
        (result: number[] | undefined) => {

          if (!Array.isArray(result)) {
            return;
          }

          onSelected(
            [...new Set(
              result.map(
                (id: number) =>
                  Number(id)
              )
            )].filter(
              (id: number) =>
                Number.isFinite(id) &&
                id > 0
            )
          );
        }
      );
  }

  private findKnownUser(
    id: number
  ): UserPayload | null {

    return (
      this.allUsers.find(
        (user: UserPayload) =>
          Number(user.id) === Number(id)
      ) ??
      null
    );
  }

  // ============================================================
  // REBUILD CHIPS
  // ============================================================

  private rebuildChipsFromSelectedUsers(): void {

    this.chipUserObjects =
      this.selectedUsers
        .map((id: number) =>
          this.findKnownUser(id)
        )
        .filter(
          (user): user is UserPayload =>
            !!user
        );

    this.cdr.markForCheck();
  }

  removeUserChip(userId: number): void {

    this.selectedUsers =
      this.selectedUsers.filter(
        (id: number) =>
          Number(id) !== Number(userId)
      );

    this.rebuildChipsFromSelectedUsers();
  }

  // ============================================================
  // CREATE / UPDATE
  //
  // ONE REQUEST CONTAINS:
  // Team fields + memberIds
  //
  // Backend updates teams + team_members in ONE transaction.
  // ============================================================

  saveTeam(): void {

    const trimmedName =
      this.name.trim();

    if (!trimmedName) {
      return;
    }

    this.loading = true;

    const payload =
      this.buildTeamPayload(
        this.selectedUsers
      );

    const headers =
      this.auth.getAuthHeaders();

    // UPDATE
    if (
      this.editingTeamId !== null &&
      this.editingTeamId > 0
    ) {

      this.http.put<any>(
        `${this.baseUrl}/teams/${this.editingTeamId}`,
        payload,
        { headers }
      ).subscribe({

        next: (res: any) => {
          this.handleSuccessfulTeamSave(res);
        },

        error: (error) => {

          console.error(
            'Failed to update team:',
            error
          );

          this.loading = false;
          this.cdr.markForCheck();
        }
      });

      return;
    }

    // CREATE
    this.http.post<any>(
      `${this.baseUrl}/teams`,
      payload,
      { headers }
    ).subscribe({

      next: (res: any) => {
        this.handleSuccessfulTeamSave(res);
      },

      error: (error) => {

        console.error(
          'Failed to create team:',
          error
        );

        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private buildTeamPayload(
    memberIds: number[]
  ): any {

    return {
      name: this.name.trim(),
      description: this.description.trim(),
      memberIds: [
        ...new Set(
          memberIds
            .map((id: number) =>
              Number(id)
            )
            .filter((id: number) =>
              Number.isFinite(id) &&
              id > 0
            )
        )
      ]
    };
  }

  private handleSuccessfulTeamSave(
    res: any
  ): void {

    this.loading = false;

    this.resetForm();
    this.refreshTeamsList();
    this.cdr.markForCheck();
  }

  // ============================================================
  // INLINE MEMBER ADD / UPDATE
  // ============================================================

  addMemberToTeamInline(
    teamId: number,
    userId: number
  ): void {

    if (!userId || !this.selectedTeam) {
      return;
    }

    if (
      Number(this.selectedTeam.id) !==
      Number(teamId)
    ) {
      return;
    }

    const currentIds =
      this.getTeamMembers(
        this.selectedTeam
      )
        .map((member: TeamMemberView) =>
          this.getMemberId(member)
        )
        .filter((id: number) =>
          Number.isFinite(id) &&
          id > 0
        );

    if (
      currentIds.includes(
        Number(userId)
      )
    ) {
      return;
    }

    this.updateTeamMembersInline(
      this.selectedTeam,
      [
        ...currentIds,
        Number(userId)
      ]
    );
  }

  private updateTeamMembersInline(
    team: TeamView,
    memberIds: number[]
  ): void {

    const payload =
      this.buildTeamPayload(
        memberIds
      );

    this.loading = true;

    this.http.put<any>(
      `${this.baseUrl}/teams/${team.id}`,
      payload,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    ).subscribe({

      next: (res: any) => {

        const updatedTeam =
          res?.data
            ? this.normalizeTeam(res.data)
            : null;

        if (updatedTeam) {
          this.selectedTeam =
            updatedTeam;
        }

        this.loading = false;
        this.refreshTeamsList();
        this.cdr.markForCheck();
      },

      error: (error) => {

        console.error(
          'Failed to update team members:',
          error
        );

        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ============================================================
  // INLINE MEMBER REMOVE
  // ============================================================

  removeMemberFromTeamInline(
    teamId: number,
    userId: number
  ): void {

    if (!this.selectedTeam) {
      return;
    }

    if (
      Number(this.selectedTeam.id) !==
      Number(teamId)
    ) {
      return;
    }

    if (
      !confirm(
        'Remove this user from the team?'
      )
    ) {
      return;
    }

    const remainingIds =
      this.getTeamMembers(
        this.selectedTeam
      )
        .map((member: TeamMemberView) =>
          this.getMemberId(member)
        )
        .filter((id: number) =>
          Number.isFinite(id) &&
          id > 0 &&
          Number(id) !== Number(userId)
        );

    this.updateTeamMembersInline(
      this.selectedTeam,
      remainingIds
    );
  }

  // ============================================================
  // TEAM MEMBER MANAGER
  // ============================================================

  private updateTeamMembers(
    team: TeamView,
    memberIds: number[]
  ): void {

    const payload =
      this.buildTeamPayload(
        memberIds
      );

    this.loading = true;

    this.http.put<any>(
      `${this.baseUrl}/teams/${team.id}`,
      payload,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    ).subscribe({

      next: (res: any) => {

        const updatedTeam =
          res?.data
            ? this.normalizeTeam(res.data)
            : null;

        if (updatedTeam) {
          this.selectedTeam =
            updatedTeam;
        }

        this.loading = false;
        this.refreshTeamsList();
        this.cdr.markForCheck();
      },

      error: (error) => {

        console.error(
          'Failed to update team members:',
          error
        );

        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ============================================================
  // TEAM DETAILS
  // ============================================================

  openTeamDetails(
    team: TeamView
  ): void {

    this.selectedTeam = team;
    this.cdr.markForCheck();
  }

  closeTeamDetails(): void {

    this.selectedTeam = null;
    this.cdr.markForCheck();
  }

  // ============================================================
  // DELETE
  // ============================================================

  deleteTeam(id: number): void {

    if (
      !confirm(
        'Are you sure you want to delete this team?'
      )
    ) {
      return;
    }

    this.loading = true;

    this.http.delete<any>(
      `${this.baseUrl}/teams/${id}`,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    ).subscribe({

      next: () => {

        this.loading = false;

        this.refreshTeamsList();

        if (
          this.editingTeamId === id
        ) {
          this.resetForm();
        }

        if (
          Number(this.selectedTeam?.id) ===
          Number(id)
        ) {
          this.closeTeamDetails();
        }

        this.cdr.markForCheck();
      },

      error: (error) => {

        console.error(
          'Failed to delete team:',
          error
        );

        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ============================================================
  // COMPLETE SAVE
  // ============================================================

  private completeSaveWorkflow(): void {

    this.resetForm();

    this.refreshTeamsList();

    this.loading = false;

    this.cdr.markForCheck();
  }

  // ============================================================
  // RESET
  // ============================================================

  resetForm(): void {

    this.name = '';

    this.description = '';

    this.selectedUsers = [];

    this.chipUserObjects = [];

    this.editingTeamId = null;

    this.selectedTeam = null;

    this.cdr.markForCheck();
  }
}
