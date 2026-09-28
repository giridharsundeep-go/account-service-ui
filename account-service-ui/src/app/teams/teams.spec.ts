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

import { UserSelectDialog } from '../user-select-dialog/user-select-dialog';

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

  teams$: Observable<any[]> = of([]);

  allUsers: any[] = [];

  name = '';
  description = '';

  // User IDs sent to POST/PUT /api/teams
  selectedUsers: number[] = [];

  // Display-only chip objects
  chipUserObjects: any[] = [];

  editingTeamId: number | null = null;

  searchTerm = '';

  loading = false;

  selectedTeam: any = null;

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
     * [
     *   {
     *     id,
     *     name,
     *     description,
     *     members: [ User, User, User ]
     *   }
     * ]
     *
     * There is deliberately NO separate team-members API call.
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

        return teams.map((team: any) => ({
          ...team,
          members:
            Array.isArray(team?.members)
              ? team.members
              : []
        }));
      }),

      catchError((error) => {

        console.error(
          'Failed to load teams:',
          error
        );

        return of([]);
      })
    );
  }

  // ============================================================
  // SEARCH
  // ============================================================

  filterTeams(teams: any[] | null): any[] {

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

    return teams.filter((team: any) => {

      const teamMatches =
        (team?.name || '')
          .toLowerCase()
          .includes(term) ||
        (team?.description || '')
          .toLowerCase()
          .includes(term);

      const memberMatches =
        this.getTeamMembers(team).some(
          (member: any) =>
            (member?.name || '')
              .toLowerCase()
              .includes(term) ||
            (member?.email || '')
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

    this.http.get<any>(
      `${this.baseUrl}/user`,
      {
        headers: this.auth.getAuthHeaders()
      }
    ).subscribe({
      next: (res: any) => {

        this.allUsers =
          Array.isArray(res?.data)
            ? res.data
            : [];

        this.rebuildChipsFromSelectedUsers();

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

  trackTeam(index: number, team: any): number {
    return Number(team?.id ?? index);
  }

  // ============================================================
  // TEAM MEMBER HELPERS
  // ============================================================

  getTeamMembers(team: any): any[] {

    return Array.isArray(team?.members)
      ? team.members
      : [];
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

  getMemberRole(member: any): string {

    return (
      member?.role_name ||
      member?.role?.name ||
      member?.user?.role_name ||
      member?.user?.role?.name ||
      'Workspace Staff'
    );
  }

  getDominantRole(members: any[]): string {

    if (!members?.length) {
      return 'None Configured';
    }

    const counts: {
      [key: string]: number
    } = {};

    members.forEach((member: any) => {

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

  getUniqueRolesCount(members: any[]): number {

    if (!members?.length) {
      return 0;
    }

    return new Set(
      members.map(
        (member: any) =>
          this.getMemberRole(member)
      )
    ).size;
  }

  getUnassignedCandidates(
    currentTeamMembers: any[]
  ): any[] {

    const assignedIds =
      new Set(
        (currentTeamMembers || [])
          .map((member: any) =>
            this.getMemberId(member)
          )
          .filter((id: number) =>
            Number.isFinite(id) && id > 0
          )
      );

    return this.allUsers.filter(
      (user: any) =>
        !assignedIds.has(
          Number(user?.id ?? user?.user_id)
        )
    );
  }

  // ============================================================
  // EDIT TEAM
  // ============================================================

  editTeam(team: any): void {

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
        .map((member: any) =>
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

    const dialogRef =
      this.dialog.open(
        UserSelectDialog,
        {
          width: '1000px',

          data: {
            users: this.allUsers,

            currentSelection:
              this.selectedUsers
          }
        }
      );

    dialogRef
      .afterClosed()
      .subscribe(
        (result: number[] | undefined) => {

          if (result === undefined) {
            return;
          }

          this.selectedUsers =
            [
              ...new Set(
                result.map(
                  (id: number) =>
                    Number(id)
                )
              )
            ];

          this.rebuildChipsFromSelectedUsers();
        }
      );
  }

  // ============================================================
  // REBUILD CHIPS
  // ============================================================

  private rebuildChipsFromSelectedUsers(): void {

    this.chipUserObjects =
      this.selectedUsers.map(
        (id: number) => {

          const user =
            this.allUsers.find(
              (candidate: any) =>
                Number(
                  candidate?.id ??
                  candidate?.user_id
                ) === Number(id)
            );

          return {
            id,
            name:
              user?.name ||
              user?.username ||
              user?.email ||
              `User ID: ${id}`
          };
        }
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

    if (!this.name.trim()) {
      return;
    }

    this.loading = true;

    const payload = {
      name: this.name.trim(),

      description:
        this.description.trim(),

      memberIds:
        [
          ...new Set(
            this.selectedUsers
              .map((id: number) =>
                Number(id)
              )
              .filter((id: number) =>
                Number.isFinite(id) && id > 0
              )
          )
        ]
    };

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

        next: () => {

          this.completeSaveWorkflow();
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

      next: () => {

        this.completeSaveWorkflow();
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

  // ============================================================
  // INLINE MEMBER ADD
  //
  // Uses PUT /teams/{id}.
  // No /team-members API.
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
        .map((member: any) =>
          this.getMemberId(member)
        )
        .filter((id: number) =>
          Number.isFinite(id) && id > 0
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

  // ============================================================
  // INLINE MEMBER REMOVE
  // ============================================================

  removeMemberFromTeamInline(
    teamId: number,
    userId: number
  ): void {

    if (
      !confirm(
        'Remove this user from the team?'
      )
    ) {
      return;
    }

    if (!this.selectedTeam) {
      return;
    }

    if (
      Number(this.selectedTeam.id) !==
      Number(teamId)
    ) {
      return;
    }

    const memberIds =
      this.getTeamMembers(
        this.selectedTeam
      )
        .map((member: any) =>
          this.getMemberId(member)
        )
        .filter((id: number) =>
          Number.isFinite(id) &&
          id > 0 &&
          Number(id) !== Number(userId)
        );

    this.updateTeamMembersInline(
      this.selectedTeam,
      memberIds
    );
  }

  private updateTeamMembersInline(
    team: any,
    memberIds: number[]
  ): void {

    const payload = {
      name: team?.name || '',

      description:
        team?.description || '',

      memberIds:
        [
          ...new Set(
            memberIds.map(
              (id: number) =>
                Number(id)
            )
          )
        ]
    };

    this.loading = true;

    this.http.put<any>(
      `${this.baseUrl}/teams/${team.id}`,
      payload,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    ).subscribe({

      next: () => {

        this.loading = false;

        this.closeTeamDetails();

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

  openTeamDetails(team: any): void {

    this.selectedTeam = team;
  }

  closeTeamDetails(): void {

    this.selectedTeam = null;
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

    this.http.delete(
      `${this.baseUrl}/teams/${id}`,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    ).subscribe({

      next: () => {

        this.refreshTeamsList();

        if (
          this.editingTeamId === id
        ) {
          this.resetForm();
        }

        if (
          this.selectedTeam?.id === id
        ) {
          this.closeTeamDetails();
        }
      },

      error: (error) => {

        console.error(
          'Failed to delete team:',
          error
        );
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
