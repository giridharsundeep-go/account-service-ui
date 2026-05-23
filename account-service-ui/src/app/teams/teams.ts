import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { environment } from '../../environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { map, Observable, BehaviorSubject, combineLatest, forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
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

  private teamsRefresh$ = new BehaviorSubject<void>(undefined);
  private usersSubject$ = new BehaviorSubject<any[]>([]);
  
  teams$: Observable<any[]> | undefined;
  allUsers: any[] = []; 

  name = '';
  description = '';
  
  selectedUsers: number[] = [];
  chipUserObjects: any[] = []; 

  editingTeamId: number | null = null;
  searchTerm = '';
  loading = false;

  private originalTeamState: { name: string; description: string; userIds: number[] } | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadUsersBackground();

    this.teams$ = combineLatest([
      this.teamsRefresh$,
      this.usersSubject$
    ]).pipe(
      switchMap(() => {
        return this.http.get<any>(`${this.baseUrl}/teams`, { headers: this.auth.getAuthHeaders() });
      }),
      switchMap((res: any) => {
        const rawTeamsArray = res?.data || [];
        
        if (rawTeamsArray.length === 0) {
          return of([]); 
        }

        const teamRosterRequests = rawTeamsArray.map((team: any) => 
          this.http.get<any>(`${this.baseUrl}/team-members/team/${team.id}`, { headers: this.auth.getAuthHeaders() }).pipe(
            map((rosterRes: any) => {
              const rawMembers = rosterRes?.data || [];
              
              team.members = rawMembers.map((m: any) => {
                const targetId = Number(m.user_id || m.id || m);
                const foundProfile = this.allUsers.find(u => Number(u.id || u.user_id) === targetId);
                
                return foundProfile 
                  ? { ...foundProfile, id: targetId, user_id: targetId } 
                  : { id: targetId, user_id: targetId, name: m.name || m.username || `User ID: ${targetId}` };
              });

              return team;
            })
          )
        );

        return forkJoin(teamRosterRequests) as Observable<any[]>;
      })
    );
  }

  filterTeams(teams: any[] | null): any[] {
    if (!teams) return [];
    if (!this.searchTerm.trim()) return teams;
    
    const term = this.searchTerm.toLowerCase().trim();
    return teams.filter(team => 
      team.name?.toLowerCase().includes(term) || 
      team.description?.toLowerCase().includes(term)
    );
  }

  refreshTeamsList() {
    this.teamsRefresh$.next();
  }

  loadUsersBackground() {
    this.http.get<any>(`${this.baseUrl}/user`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: (res) => {
        const users = res?.data || [];
        this.allUsers = users;
        this.usersSubject$.next(users);
        
        if (this.selectedUsers.length > 0) {
          this.rebuildChipsFromSelectedUsers();
        }
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Failed to pre-cache master user roster listing:', err)
    });
  }

  getDominantRole(members: any[]): string {
    if (!members || members.length === 0) return 'None Configured';
    const counts: { [key: string]: number } = {};
    members.forEach(m => {
      const role = m.role_name || m.user?.role_name || 'Staff';
      counts[role] = (counts[role] || 0) + 1;
    });
    
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }

  getUniqueRolesCount(members: any[]): number {
    if (!members || members.length === 0) return 0;
    const distinctRoles = new Set(members.map(m => m.role_name || m.user?.role_name || 'Staff'));
    return distinctRoles.size;
  }

  getUnassignedCandidates(currentTeamMembers: any[]): any[] {
    const assignedIds = new Set((currentTeamMembers || []).map(m => Number(m.id || m.user_id)));
    return this.allUsers.filter(u => !assignedIds.has(Number(u.id || u.user_id)));
  }

  editTeam(team: any) {
    this.name = team.name;
    this.description = team.description || '';
    this.editingTeamId = team.id;
    this.loading = true;
    
    this.selectedUsers = [];
    this.chipUserObjects = [];

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 1. Immediately cache whatever member info is already sitting in the stream layout cards
    const structuralMembersList = team.members || team.users || team.team_members || [];
    if (Array.isArray(structuralMembersList) && structuralMembersList.length > 0) {
      this.selectedUsers = structuralMembersList.map((m: any) => Number(m.user_id || m.id));
      this.chipUserObjects = structuralMembersList.map((m: any) => ({
        id: Number(m.user_id || m.id),
        name: m.name || m.username || m.user?.name || `User ID: ${m.user_id || m.id}`
      }));
    }

    // Initialize immediate state safety layer to avoid null failures if saved instantly
    this.originalTeamState = {
      name: team.name,
      description: team.description || '',
      userIds: [...this.selectedUsers]
    };

    this.cdr.detectChanges();

    // 2. Fetch fresh server values to guarantee precise sync arrays
    this.http.get<any>(`${this.baseUrl}/team-members/team/${team.id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: (res) => {
        const membersList = res?.data || [];
        this.selectedUsers = membersList.map((m: any) => Number(m.user_id || m.id));
        
        // Re-write matching current active storage maps
        this.originalTeamState = {
          name: team.name,
          description: team.description || '',
          userIds: [...this.selectedUsers]
        };

        this.rebuildChipsFromSelectedUsers();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to look up assigned team members from backend:', err);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private rebuildChipsFromSelectedUsers() {
    this.chipUserObjects = this.selectedUsers.map(id => {
      const match = this.allUsers.find(u => 
        Number(u.id) === Number(id) || Number(u.user_id) === Number(id)
      );
      
      return {
        id: id,
        name: match ? (match.name || match.username || match.first_name || `User ${id}`) : `User ID: ${id}`
      };
    });
    this.cdr.markForCheck();
  }

  addMemberToTeamInline(teamId: number, userId: number) {
    if (!userId) return;

    this.http.post(`${this.baseUrl}/team-members/create`, {
      team_id: teamId,
      user_ids: [userId]
    }, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: () => {
        this.refreshTeamsList();
        if (this.editingTeamId === teamId && !this.selectedUsers.includes(userId)) {
          this.selectedUsers = [...this.selectedUsers, userId];
          this.rebuildChipsFromSelectedUsers();
        }
      },
      error: (err) => console.error('Failed to provision inline member seat:', err)
    });
  }

  removeMemberFromTeamInline(teamId: number, userId: number) {
    if (!confirm('Revoke access privileges for this team member?')) return;

    this.http.request('delete', `${this.baseUrl}/team-members`, {
      body: { team_id: teamId, user_ids: [userId] },
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: () => {
        this.refreshTeamsList();
        if (this.editingTeamId === teamId) {
          this.selectedUsers = this.selectedUsers.filter(id => id !== userId);
          this.rebuildChipsFromSelectedUsers();
        }
      },
      error: (err) => console.error('Failed to revoke member seat privilege:', err)
    });
  }

  openUserSelectModal() {
    const dialogRef = this.dialog.open(UserSelectDialog, {
      width: '1000px',
      data: {
        users: this.allUsers,
        currentSelection: this.selectedUsers
      }
    });

    dialogRef.afterClosed().subscribe((result: number[] | undefined) => {
      if (result !== undefined) {
        this.selectedUsers = result.map(id => Number(id));
        this.rebuildChipsFromSelectedUsers();
      }
    });
  }

  removeUserChip(userId: number) {
    this.selectedUsers = this.selectedUsers.filter(id => Number(id) !== Number(userId));
    this.chipUserObjects = this.chipUserObjects.filter(obj => Number(obj.id) !== Number(userId));
    this.cdr.markForCheck();
  }

  // Property to store the team being actively previewed
selectedTeam: any = null;

// Opens the detail drawer panel when a card gets clicked
openTeamDetails(team: any): void {
  this.selectedTeam = team;
}

// Closes the drawer panel layout cleanly
closeTeamDetails(): void {
  this.selectedTeam = null;
}

  
  saveTeam() {
    if (!this.name.trim()) return;
    this.loading = true; // Turn loader ON
    this.cdr.markForCheck();

    const metadataPayload = { name: this.name.trim(), description: this.description.trim() };

    if (this.editingTeamId && this.editingTeamId > 0) {
      const hasMetadataChanged = !this.originalTeamState ||
        this.originalTeamState.name !== metadataPayload.name ||
        this.originalTeamState.description !== metadataPayload.description;

      if (!hasMetadataChanged) {
        this.syncTeamMembers(this.editingTeamId);
      } else {
        this.http.put(`${this.baseUrl}/teams/${this.editingTeamId}`, metadataPayload, { headers: this.auth.getAuthHeaders() })
          .subscribe({
            next: () => {
              this.syncTeamMembers(this.editingTeamId!);
            },
            error: (err) => {
              console.error('Failed to update team metadata records:', err);
              this.loading = false; // Guard error fallback
              this.cdr.markForCheck();
            }
          });
      }
    } else {
      this.http.post<any>(`${this.baseUrl}/teams/create`, metadataPayload, { headers: this.auth.getAuthHeaders() })
        .subscribe({
          next: (res: any) => {
            const targetTeamId = res?.data?.id;
            this.syncTeamMembers(targetTeamId);
          },
          error: (err) => {
            console.error('Failed to build new team records:', err);
            this.loading = false; // Guard error fallback
            this.cdr.markForCheck();
          }
        });
    }
  }
  private syncTeamMembers(teamId: number) {
    if (this.originalTeamState && this.editingTeamId && this.editingTeamId > 0) {
      const originalIds = this.originalTeamState.userIds || [];
      const addedUsers = this.selectedUsers.filter(id => !originalIds.includes(id));
      const removedUsers = originalIds.filter(id => !this.selectedUsers.includes(id));

      const syncRequests: Observable<any>[] = [];

      if (addedUsers.length > 0) {
        syncRequests.push(
          this.http.post(`${this.baseUrl}/team-members/create`, {
            team_id: teamId,
            user_ids: addedUsers
          }, { headers: this.auth.getAuthHeaders() })
        );
      }

      if (removedUsers.length > 0) {
        syncRequests.push(
          this.http.request('delete', `${this.baseUrl}/team-members`, {
            body: { team_id: teamId, user_ids: removedUsers },
            headers: this.auth.getAuthHeaders()
          })
        );
      }

      if (syncRequests.length === 0) {
        this.completeSaveWorkflow();
        return;
      }

      forkJoin(syncRequests).subscribe({
        next: () => this.completeSaveWorkflow(),
        error: (err) => this.handleSyncError(err) // This drops the button loader if child sync fails
      });
    } else {
      if (this.selectedUsers.length === 0) {
        this.completeSaveWorkflow();
        return;
      }
      
      this.http.post(`${this.baseUrl}/team-members/create`, {
        team_id: teamId,
        user_ids: this.selectedUsers
      }, { headers: this.auth.getAuthHeaders() }).subscribe({
        next: () => this.completeSaveWorkflow(),
        error: (err) => this.handleSyncError(err)
      });
    }
  }

  private completeSaveWorkflow() {
    this.resetForm();
    this.refreshTeamsList();
    this.loading = false;
    this.cdr.markForCheck();
  }

  private handleSyncError(err: any) {
    console.error('Failed to update team membership sync grids:', err);
    this.loading = false;
    this.cdr.markForCheck();
  }

  deleteTeam(id: number) {
    if (!confirm('Are you sure you want to delete this team?')) return;
    this.http.delete(`${this.baseUrl}/teams/${id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe(() => {
      this.refreshTeamsList();
      if (this.editingTeamId === id) this.resetForm();
    });
  }

  resetForm() {
    this.name = '';
    this.description = '';
    this.selectedUsers = [];
    this.chipUserObjects = [];
    this.editingTeamId = null;
    this.originalTeamState = null;
    this.cdr.markForCheck();
  }
}