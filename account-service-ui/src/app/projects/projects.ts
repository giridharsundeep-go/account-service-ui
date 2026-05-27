import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest, forkJoin, of } from 'rxjs';
import { finalize, switchMap, map, catchError } from 'rxjs/operators';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';

// Required Angular Material Module Imports
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { UserSelectDialog } from '../user-select-dialog/user-select-dialog';

export interface UserAccountNode {
  id: number;
  name: string;
  email: string;
  role?: string;
}

export interface FunctionalTeamNode {
  id: number | string;
  name: string;
  membersCount?: number;
  members?: UserAccountNode[];
  isLoadingMembers?: boolean;
}

export interface CoreProductNode {
  id: number;
  name: string;
  description?: string;
}

export interface StrategicInitiative {
  id?: number;
  user_id?: number;
  product_id: number | null;
  name: string;
  description: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'ON_HOLD';
  methodology: 'AGILE_SCRUM' | 'WATERFALL_GANTT';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  total_backlog_points: number;
  sprint_duration_weeks: number;
  target_velocity: number;
  auto_rollover_backlog: boolean;
  computed_sprint_count: number;
  computed_total_duration_weeks: number;
  associatedTeamIds: string[];
  associatedUserIds: number[];
}

@Component({
  selector: 'app-projects',
  standalone: true,
  templateUrl: './projects.html',
  styleUrl: './projects.css',
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatChipsModule,
    MatDialogModule
  ]
})
export class Projects implements OnInit {
  baseUrl = environment.apiBaseUrl;

  public projectsRefresh$ = new BehaviorSubject<void>(undefined);
  private usersSubject$ = new BehaviorSubject<UserAccountNode[]>([]);

  projects$: Observable<StrategicInitiative[]> | undefined;

  liveActiveTeams: FunctionalTeamNode[] = [];
  organizationPersonnel: UserAccountNode[] = [];
  systemProducts: CoreProductNode[] = [];
  projectLookupFilter = '';

  isComposerOpen = false;
  isSaving = false;
  isLoadingResources = false;
  activeBuilderStep = 1;

  agileTuning = { focusFactor: 0.80, scopeBufferPercent: 15 };

  selectedUsers: number[] = [];
  chipUserObjects: Array<{ id: number, name: string, isFromTeam?: boolean, teamName?: string }> = [];
  selectedTeamIds: string[] = [];

  projectForm!: StrategicInitiative;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {
    this.resetProjectForm();
  }

  ngOnInit(): void {
    this.loadUsersBackground();
    this.loadTeamsBackground();
    this.loadProductsBackground();

    this.projects$ = combineLatest([
      this.projectsRefresh$,
      this.usersSubject$
    ]).pipe(
      switchMap(() => {
        return this.http.get<any>(`${this.baseUrl}/projects`, { headers: this.auth.getAuthHeaders() });
      }),
      map((res: any) => {
        const rawProjectsArray = res?.data || res || [];
        return rawProjectsArray.map((project: any) => {
          project.associatedUserIds = project.associatedUserIds || [];
          project.associatedTeamIds = project.associatedTeamIds || [];
          project.product_id = project.product_id ? Number(project.product_id) : null;
          return project as StrategicInitiative;
        });
      })
    );
  }

  private loadProductsBackground(): void {
    this.http.get<any>(`${this.baseUrl}/products`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.systemProducts = res?.data || res || [];
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Failed to resolve master product tracking context indexes:', err)
    });
  }

  getProductName(productId: number | null): string {
    if (!productId) return 'Unassigned Sandbox Workspace';
    const match = this.systemProducts.find(p => Number(p.id) === Number(productId));
    return match ? match.name : `Product Reference Cluster #${productId}`;
  }

  private loadUsersBackground(): void {
    this.isLoadingResources = true;
    this.http.get<any>(`${this.baseUrl}/user`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        const users = res?.data || [];
        this.organizationPersonnel = users;
        this.usersSubject$.next(users);
        this.rebuildChipsMatrix();
        this.isLoadingResources = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to sync master user rosters:', err);
        this.isLoadingResources = false;
        this.cdr.markForCheck();
      }
    });
  }

  private loadTeamsBackground(): void {
    this.http.get<any>(`${this.baseUrl}/teams`, { headers: this.auth.getAuthHeaders() }).pipe(
      switchMap((res: any) => {
        const teams = res?.data || res || [];
        if (teams.length === 0) return of([] as FunctionalTeamNode[]);

        const requests = teams.map((team: any) =>
          this.http.get<any>(`${this.baseUrl}/team-members/team/${team.id}`, { headers: this.auth.getAuthHeaders() }).pipe(
            map((memberRes: any): FunctionalTeamNode => {
              const resData = memberRes?.data || memberRes;
              const membersList = Array.isArray(resData) ? resData : (resData?.individuals || resData?.members || []);

              return {
                ...team,
                members: membersList,
                membersCount: membersList.length,
                isLoadingMembers: false
              };
            }),
            catchError(() => of({ ...team, members: [], membersCount: 0, isLoadingMembers: false } as FunctionalTeamNode))
          )
        );
        return forkJoin(requests);
      }),
      map((enrichedTeams: unknown) => enrichedTeams as FunctionalTeamNode[])
    ).subscribe({
      next: (enrichedTeams: FunctionalTeamNode[]) => {
        this.liveActiveTeams = enrichedTeams;
        this.rebuildChipsMatrix();
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Failed processing pre-fetch on functional rosters:', err)
    });
  }

  // ✅ FIXED: Calls syncResourcesWithBackend()
  openUserSelectionDialog(): void {
    const dialogRef = this.dialog.open(UserSelectDialog, {
      width: '1000px',
      data: {
        users: this.organizationPersonnel,
        currentSelection: [...this.selectedUsers]
      }
    });

    dialogRef.afterClosed().subscribe((result: number[] | undefined) => {
      if (result !== undefined) {
        this.selectedUsers = result.map((id: number | string) => Number(id));
        this.projectForm.associatedUserIds = [...this.selectedUsers];
        this.rebuildChipsMatrix();

        this.syncResourcesWithBackend();
        this.cdr.markForCheck();
      }
    });
  }

  // ✅ FIXED: Safe mapping logic ensures arrays find cross references regardless of serialization differences
  private rebuildChipsMatrix(): void {
    const temporaryChipsMap = new Map<number, { id: number, name: string, isFromTeam: boolean, teamName?: string }>();

    this.liveActiveTeams.forEach(team => {
      if (team && team.id && this.selectedTeamIds.map(String).includes(team.id.toString()) && team.members) {
        team.members.forEach((member: UserAccountNode) => {
          const cleanId = Number(member.id);
          temporaryChipsMap.set(cleanId, {
            id: cleanId,
            name: member.name || member.email || `User ${cleanId}`,
            isFromTeam: true,
            teamName: team.name
          });
        });
      }
    });

    this.selectedUsers.forEach((id: number) => {
      const cleanId = Number(id);
      if (!temporaryChipsMap.has(cleanId)) {
        const match = this.organizationPersonnel.find(u => Number(u.id) === cleanId);
        temporaryChipsMap.set(cleanId, {
          id: cleanId,
          name: match ? (match.name || match.email || `User ${cleanId}`) : `User ID: ${cleanId}`,
          isFromTeam: false
        });
      }
    });

    this.chipUserObjects = Array.from(temporaryChipsMap.values());
    this.cdr.markForCheck();
  }

  // ✅ FIXED: Calls syncResourcesWithBackend()
  removeUserChip(chip: { id: number, isFromTeam?: boolean }): void {
    if (chip.isFromTeam) {
      alert('This resource is allocated via an assigned Team. To remove this engineer, deselect their corresponding functional team cohort.');
      return;
    }

    this.selectedUsers = this.selectedUsers.filter(id => Number(id) !== Number(chip.id));
    this.projectForm.associatedUserIds = [...this.selectedUsers];
    this.rebuildChipsMatrix();

    this.syncResourcesWithBackend();
    this.cdr.markForCheck();
  }

  isTeamSelected(teamId: string | undefined | number): boolean {
    if (!teamId) return false;
    return this.selectedTeamIds.includes(teamId.toString());
  }

  // ✅ FIXED: Calls syncResourcesWithBackend()
  toggleTeamSelection(team: FunctionalTeamNode): void {
    if (!team || !team.id) return;
    const cleanId = team.id.toString();
    const index = this.selectedTeamIds.indexOf(cleanId);

    if (index > -1) {
      this.selectedTeamIds.splice(index, 1);
    } else {
      this.selectedTeamIds.push(cleanId);
    }

    this.projectForm.associatedTeamIds = [...this.selectedTeamIds];
    this.rebuildChipsMatrix();

    this.syncResourcesWithBackend();
    this.cdr.markForCheck();
  }

  getLiveManpowerHeadcount(): number {
    const uniqueIds = new Set<number>();

    this.liveActiveTeams
      .filter(team => team?.id && this.selectedTeamIds.includes(team.id.toString()))
      .forEach(team => {
        if (team.members && team.members.length > 0) {
          team.members.forEach(m => uniqueIds.add(Number(m.id)));
        } else {
          const count = team.membersCount || 0;
          for (let i = 0; i < count; i++) { uniqueIds.add(Math.random()); }
        }
      });

    this.selectedUsers.forEach(id => uniqueIds.add(Number(id)));
    return uniqueIds.size;
  }

  getSelectedTeamsCount(): number {
    return this.selectedTeamIds.length;
  }

  calculateAgileMetrics(): void {
    const rawPoints = this.projectForm.total_backlog_points || 0;
    const velocity = this.projectForm.target_velocity || 1;
    const durationWeeks = this.projectForm.sprint_duration_weeks || 2;

    const bufferedPoints = rawPoints * (1 + (this.agileTuning.scopeBufferPercent / 100));
    const effectiveVelocity = velocity * this.agileTuning.focusFactor;

    const calculatedSprints = Math.ceil(bufferedPoints / (effectiveVelocity || 1));

    this.projectForm.computed_sprint_count = calculatedSprints;
    this.projectForm.computed_total_duration_weeks = calculatedSprints * durationWeeks;
  }

  // ✅ FIXED: Accurately re-syncs chips and user collections on open/update operations
  loadProjectToComposer(project: StrategicInitiative): void {
    this.projectForm = JSON.parse(JSON.stringify(project));
    this.projectForm.product_id = project.product_id ? Number(project.product_id) : null;

    this.selectedUsers = project.associatedUserIds
      ? project.associatedUserIds.map((id: any) => Number(id))
      : [];
    this.selectedTeamIds = project.associatedTeamIds
      ? project.associatedTeamIds.map((id: any) => id.toString())
      : [];

    this.activeBuilderStep = 1;
    this.isComposerOpen = true;
    this.calculateAgileMetrics();
    this.rebuildChipsMatrix();
    this.cdr.markForCheck();

    if (this.projectForm.id && this.projectForm.id > 0) {
      this.isLoadingResources = true;
      this.cdr.markForCheck();

      this.http.get<any>(`${this.baseUrl}/project-individuals/${this.projectForm.id}`, {
        headers: this.auth.getAuthHeaders()
      }).pipe(
        map(res => {
          const inner = res?.data || res;
          return Array.isArray(inner) ? inner : (inner?.individuals || inner?.members || []);
        }),
        catchError((err) => {
          console.error(`Failed loading structural individual references:`, err);
          return of([]);
        }),
        finalize(() => {
          this.isLoadingResources = false;
          this.rebuildChipsMatrix();
          this.cdr.markForCheck();
        })
      ).subscribe((assignedIndividuals: UserAccountNode[]) => {
        if (assignedIndividuals && assignedIndividuals.length > 0) {
          const incomingUserIds = assignedIndividuals.map(user => Number(user.id));
          const masterSet = new Set([...this.selectedUsers, ...incomingUserIds]);
          this.selectedUsers = Array.from(masterSet);
          this.projectForm.associatedUserIds = [...this.selectedUsers];
        }
      });
    }
  }

  // ✅ FIXED: Dual pipeline system synchronizes teams and individual users in parallel with backend endpoints
  private syncResourcesWithBackend(): void {
    if (!this.projectForm.id || this.projectForm.id <= 0) {
      return;
    }

    const projectId = this.projectForm.id;
    const headers = { headers: this.auth.getAuthHeaders() };

    // --- 1. INDIVIDUALS SYNC PAYLOAD ---
    const uniqueUserIds = new Set<number>();

    this.liveActiveTeams
      .filter(team => team?.id && this.selectedTeamIds.map(String).includes(team.id.toString()))
      .forEach(team => {
        if (team.members) {
          team.members.forEach(member => uniqueUserIds.add(Number(member.id)));
        }
      });

    this.selectedUsers.forEach(id => uniqueUserIds.add(Number(id)));

    const individualsPayload = {
      project_id: projectId,
      user_account_ids: Array.from(uniqueUserIds)
    };

    // --- 2. TEAMS SYNC PAYLOAD ---
    const teamsPayload = {
      project_id: projectId,
      team_ids: this.selectedTeamIds.map(id => Number(id))
    };

    console.log('Dispatching parallel synchronization states to backend endpoints...');

    this.http.post(`${this.baseUrl}/project-individuals/sync`, individualsPayload, headers).subscribe({
      next: (res) => console.log('Individuals system synchronized:', res),
      error: (err) => console.error('Failed syncing structural individuals roster:', err)
    });

    this.http.post(`${this.baseUrl}/project-teams/sync`, teamsPayload, headers).subscribe({
      next: (res) => console.log('Teams system synchronized:', res),
      error: (err) => console.error('Failed syncing high-level functional teams array:', err)
    });
  }

  commitProjectToSystem(): void {
    if (!this.projectForm.name || !this.projectForm.name.trim()) {
      alert('Validation Error: Project Name cannot be blank.');
      return;
    }

    if (this.projectForm.product_id === null || this.projectForm.product_id === undefined) {
      alert('Operational mapping mandate missing: Projects must attach explicitly to an active parent Product.');
      return;
    }

    this.calculateAgileMetrics();
    this.isSaving = true;
    this.cdr.markForCheck();

    this.projectForm.associatedUserIds = this.selectedUsers.map(id => Number(id));
    this.projectForm.associatedTeamIds = this.selectedTeamIds.map(id => id.toString());

    const url = this.projectForm.id && this.projectForm.id > 0
      ? `${this.baseUrl}/projects/${this.projectForm.id}`
      : `${this.baseUrl}/projects/create`;

    if (this.projectForm.id && this.projectForm.id > 0) {
      this.http.put(url, this.projectForm, { headers: this.auth.getAuthHeaders() })
        .pipe(finalize(() => { this.isSaving = false; this.cdr.markForCheck(); }))
        .subscribe({
          next: () => this.completeSaveWorkflow(),
          error: (err) => console.error('Failed to update project entity structure payload:', err)
        });
    } else {
      this.http.post(url, this.projectForm, { headers: this.auth.getAuthHeaders() })
        .pipe(finalize(() => { this.isSaving = false; this.cdr.markForCheck(); }))
        .subscribe({
          next: () => this.completeSaveWorkflow(),
          error: (err) => console.error('Failed to create new enterprise project structure template:', err)
        });
    }
  }

  private completeSaveWorkflow(): void {
    this.isComposerOpen = false;
    this.resetProjectForm();
    this.refreshProjectList();
  }

  refreshProjectList(): void {
    this.projectsRefresh$.next();
  }

  decommissionProject(projectId: number | undefined): void {
    if (projectId === undefined || !confirm('Permanently decommission this strategic architecture record?')) return;
    this.http.delete(`${this.baseUrl}/projects/${projectId}`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => this.refreshProjectList(),
      error: (err) => console.error("Failed to remove record context", err)
    });
  }

  setBuilderStep(step: number): void { if (step >= 1 && step <= 3) this.activeBuilderStep = step; }
  nextBuilderStep(): void { if (this.activeBuilderStep < 3) this.activeBuilderStep++; }
  previousBuilderStep(): void { if (this.activeBuilderStep > 1) this.activeBuilderStep--; }
  closeComposerDrawer(): void { this.isComposerOpen = false; this.resetProjectForm(); }
  initiateNewProject(): void { this.resetProjectForm(); this.activeBuilderStep = 1; this.isComposerOpen = true; }

  private resetProjectForm(): void {
    this.projectForm = {
      product_id: null,
      name: '', description: '', status: 'ACTIVE', methodology: 'AGILE_SCRUM', priority: 'MEDIUM',
      total_backlog_points: 120, sprint_duration_weeks: 2, target_velocity: 30, auto_rollover_backlog: true,
      computed_sprint_count: 0, computed_total_duration_weeks: 0, associatedTeamIds: [], associatedUserIds: []
    };
    this.selectedUsers = [];
    this.selectedTeamIds = [];
    this.chipUserObjects = [];

    this.liveActiveTeams.forEach(t => { t.isLoadingMembers = false; });

    this.rebuildChipsMatrix();
    this.calculateAgileMetrics();
  }
}