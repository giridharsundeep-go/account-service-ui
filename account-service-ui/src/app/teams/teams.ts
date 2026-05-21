import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { environment } from '../../environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { forkJoin, map, Observable, take } from 'rxjs';
import { AuthService } from '../auth.service';

// Angular Material Imports
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
  baseUrl = environment.apiBaseUrl;

  teams$: Observable<any[]> | undefined;
  users$: Observable<any[]> | undefined;
  allUsers: any[] = []; // Cached array to quickly match names/roles for chips

  name = '';
  description = '';
  selectedUsers: number[] = [];
  editingTeamId: number | null = null;
  searchTerm = '';
  loading = false;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private dialog: MatDialog // Inject MatDialog
  ) { }

  ngOnInit() {
    this.loadTeams();
    this.loadUsers();
  }

  loadTeams() {
    this.teams$ = this.http.get<any>(`${this.baseUrl}/teams`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(map(res => res?.data || []));
  }

  loadUsers() {
    this.users$ = this.http.get<any>(`${this.baseUrl}/user`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(
      map(res => {
        const users = res?.data || [];
        this.allUsers = users; // Keep a local reference copy to resolve names for chips
        return users;
      })
    );
  }

  // 1. INLINE CRUD: ADD MEMBER TO A SPECIFIC TEAM DIRECTLY FROM THE CARD DROPDOWN
  addMemberToTeamInline(teamId: number, userId: number) {
    if (!userId) return;

    this.http.post(`${this.baseUrl}/team-members/create`, {
      team_id: teamId,
      user_id: userId
    }, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: () => {
        // Refresh database records to render updates instantly
        this.loadTeams();
      },
      error: (err) => console.error('Failed to provision inline member seat:', err)
    });
  }

  // 2. INLINE CRUD: REMOVE MEMBER FROM A SPECIFIC TEAM DIRECTLY FROM THE CARD ROSTER LIST
  removeMemberFromTeamInline(teamId: number, userId: number) {
    if (!confirm('Revoke access privileges for this team member?')) return;

    // Assuming an API structure pattern of /team-members/delete or matching your route parameters:
    this.http.request('delete', `${this.baseUrl}/team-members`, {
      body: { team_id: teamId, user_id: userId },
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: () => {
        this.loadTeams();
      },
      error: (err) => console.error('Failed to revoke member seat privilege:', err)
    });
  }

  // Add 'take' to your rxjs imports at the top if it isn't there:
  // import { forkJoin, map, Observable, take } from 'rxjs';

  openUserSelectModal() {
    // Make sure we have a valid observable stream to read from
    if (this.users$) {
      this.users$.pipe(take(1)).subscribe((usersListFromApi) => {

        const dialogRef = this.dialog.open(UserSelectDialog, {
          width: '450px',
          data: {
            // Pass the freshly resolved stream array data directly
            users: usersListFromApi || [],
            currentSelection: this.selectedUsers
          }
        });

        dialogRef.afterClosed().subscribe((result: number[] | undefined) => {
          if (result !== undefined) {
            this.selectedUsers = result;
          }
        });

      });
    }
  }

  // Get full user profiles for currently selected IDs to display in chips
  getSelectedUserObjects(): any[] {
    return this.allUsers.filter(user => this.selectedUsers.includes(user.id));
  }

  // Allow clicking "x" on a chip to instantly remove them from selection
  removeUserChip(userId: number) {
    this.selectedUsers = this.selectedUsers.filter(id => id !== userId);
  }

  saveTeam() {
    if (!this.name.trim() || this.selectedUsers.length === 0) return;
    this.loading = true;

    const payload = { name: this.name, description: this.description };
    const request = this.editingTeamId
      ? this.http.put(`${this.baseUrl}/teams/${this.editingTeamId}`, payload, { headers: this.auth.getAuthHeaders() })
      : this.http.post<any>(`${this.baseUrl}/teams/create`, payload, { headers: this.auth.getAuthHeaders() });

    request.subscribe({
      next: (res: any) => {
        const teamId = this.editingTeamId || res?.data?.id;
        const memberRequests = this.selectedUsers.map(userId => {
          return this.http.post(`${this.baseUrl}/team-members/create`, {
            team_id: teamId,
            user_id: userId
          }, { headers: this.auth.getAuthHeaders() });
        });

        forkJoin(memberRequests).subscribe({
          next: () => {
            this.resetForm();
            this.loadTeams();
            this.loading = false;
          },
          error: () => this.loading = false
        });
      },
      error: () => this.loading = false
    });
  }

  editTeam(team: any) {
    this.name = team.name;
    this.description = team.description || '';
    this.editingTeamId = team.id;

    // Optional: If team payload comes down with members, map them here:
    // this.selectedUsers = team.members ? team.members.map((m: any) => m.id) : [];
  }

  deleteTeam(id: number) {
    if (!confirm('Delete team?')) return;
    this.http.delete(`${this.baseUrl}/teams/${id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe(() => this.loadTeams());
  }

  resetForm() {
    this.name = '';
    this.description = '';
    this.selectedUsers = [];
    this.editingTeamId = null;
  }

  filterTeams(teams: any[]) {
    if (!this.searchTerm.trim()) return teams;
    return teams.filter((t: any) =>
      t.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }
}