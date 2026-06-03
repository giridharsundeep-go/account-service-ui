import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest, forkJoin, of } from 'rxjs';
import { finalize, switchMap, map, catchError } from 'rxjs/operators';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';

// Angular Material Module Imports
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
import { MatListModule } from '@angular/material/list';

import { UserSelectDialog } from '../user-select-dialog/user-select-dialog';

export interface UserAccountNode {
  id: number;
  name?: string;
  username?: string;
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
  project_code: string;
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
    MatDialogModule,
    MatListModule
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

  activeCalibrationTab: 'engine' | 'preview' = 'engine';
  isLoadingPreview = false;
  calculatedSprintsPreview: any[] = [];
  previewStartDate: string = new Date().toISOString().split('T')[0];
  previewActivationType: 'AUTOMATIC' | 'MANUAL' = 'AUTOMATIC';

  agileTuning = { focusFactor: 0.80, scopeBufferPercent: 15 };

  selectedUsers: number[] = [];
  chipUserObjects: Array<{ id: number, name: string, isFromTeam: boolean, teamName?: string }> = [];
  selectedTeamIds: string[] = [];

  projectForm!: StrategicInitiative;

  // --- Perspectives & Unified Sprints Mode Operational States ---
  public dashboardViewMode: 'projects' | 'sprints' = 'projects';
  public sprintTimelineFilter: 'ALL' | 'CURRENT' | 'FUTURE' = 'ALL';
  public globalSprintsCollection: any[] = [];
  public activeProjectFilterCode: string = '';

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
        const processedProjects = rawProjectsArray.map((project: any) => {
          project.associatedUserIds = project.associatedUserIds || [];
          project.associatedTeamIds = project.associatedTeamIds || [];
          project.product_id = project.product_id ? Number(project.product_id) : null;
          project.project_code = project.project_code || '';
          return project as StrategicInitiative;
        });

        this.buildGlobalSprintsMatrix(processedProjects);
        return processedProjects;
      })
    );
  }

  resetProjectForm(): void {
    this.projectForm = {
      product_id: null,
      name: '',
      project_code: '',
      description: '',
      status: 'ACTIVE',
      methodology: 'AGILE_SCRUM',
      priority: 'MEDIUM',
      total_backlog_points: 120,
      sprint_duration_weeks: 2,
      target_velocity: 30,
      auto_rollover_backlog: true,
      computed_sprint_count: 0,
      computed_total_duration_weeks: 0,
      associatedTeamIds: [],
      associatedUserIds: []
    };
  }

  initiateNewProject(): void {
    this.resetProjectForm();
    this.selectedUsers = [];
    this.selectedTeamIds = [];
    this.chipUserObjects = [];
    this.activeBuilderStep = 1;
    this.isComposerOpen = true;
    this.calculateAgileMetrics();
    this.cdr.detectChanges();
  }

  loadProjectToComposer(project: StrategicInitiative): void {
    this.projectForm = { ...project };
    this.activeBuilderStep = 1;
    this.isComposerOpen = true;
    this.calculateAgileMetrics();

    if (project.id) {
      this.isLoadingResources = true;
      this.cdr.detectChanges();

      forkJoin({
        individuals: this.http.get<any>(`${this.baseUrl}/project-individuals/${project.id}`, { headers: this.auth.getAuthHeaders() }).pipe(catchError(() => of([]))),
        teams: this.http.get<any>(`${this.baseUrl}/project-teams/${project.id}`, { headers: this.auth.getAuthHeaders() }).pipe(catchError(() => of([])))
      }).pipe(
        finalize(() => {
          this.isLoadingResources = false;
          this.rebuildChipsMatrix();
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: (result: { individuals: any; teams: any }) => {
          let individualRecords = result.individuals?.data || result.individuals || [];
          if (individualRecords && !Array.isArray(individualRecords) && typeof individualRecords === 'object') {
            individualRecords = individualRecords.individuals || individualRecords.users || Object.values(individualRecords);
          }
          if (!Array.isArray(individualRecords)) individualRecords = [];

          let teamRecords = result.teams?.data || result.teams || [];
          if (teamRecords && !Array.isArray(teamRecords) && typeof teamRecords === 'object') {
            teamRecords = teamRecords.teams || teamRecords.groups || Object.values(teamRecords);
          }
          if (!Array.isArray(teamRecords)) teamRecords = [];

          this.selectedUsers = individualRecords.map((item: any) => {
            if (!item) return 0;
            return Number(item.user_id || item.id || (typeof item === 'number' || typeof item === 'string' ? item : 0));
          }).filter((id: number) => id > 0);
          this.projectForm.associatedUserIds = [...this.selectedUsers];

          this.selectedTeamIds = teamRecords.map((item: any) => {
            if (!item) return '';
            // If the get route returns raw primitive integer IDs, cast them directly to strings
            return String(item.team_id || item.id || (typeof item === 'number' || typeof item === 'string' ? item : ''));
          }).filter((id: string) => id.length > 0);
          this.projectForm.associatedTeamIds = [...this.selectedTeamIds];
        },
        error: (err) => {
          console.error('Relational mapping lookup error occurred:', err);
          this.selectedUsers = project.associatedUserIds ? [...project.associatedUserIds].map(Number) : [];
          this.selectedTeamIds = project.associatedTeamIds ? [...project.associatedTeamIds].map(String) : [];
        }
      });
    } else {
      this.selectedUsers = project.associatedUserIds ? [...project.associatedUserIds].map(Number) : [];
      this.selectedTeamIds = project.associatedTeamIds ? [...project.associatedTeamIds].map(String) : [];
      this.rebuildChipsMatrix();
      this.cdr.detectChanges();
    }
  }

  closeComposerDrawer(): void {
    this.isComposerOpen = false;
  }

  setBuilderStep(step: number): void {
    if (step >= 1 && step <= 4) {
      this.activeBuilderStep = step;
      if (step === 2) {
        this.rebuildChipsMatrix();
      }
      if (step === 4) {
        this.generateSprintPreview();
      }
      this.cdr.detectChanges();
    }
  }

  nextBuilderStep(): void {
    if (this.activeBuilderStep < 4) {
      this.activeBuilderStep++;
      if (this.activeBuilderStep === 2) {
        this.rebuildChipsMatrix();
      }
      if (this.activeBuilderStep === 4) {
        this.generateSprintPreview();
      }
      this.cdr.detectChanges();
    }
  }

  previousBuilderStep(): void {
    if (this.activeBuilderStep > 1) {
      this.activeBuilderStep--;
      this.cdr.detectChanges();
    }
  }

  calculateAgileMetrics(): void {
    const rawPoints = this.projectForm.total_backlog_points || 0;
    const velocity = this.projectForm.target_velocity || 1;
    const durationWeeks = this.projectForm.sprint_duration_weeks || 2;

    const bufferedPoints = rawPoints * (1 + (this.agileTuning.scopeBufferPercent / 100));
    const effectiveVelocity = velocity * this.agileTuning.focusFactor;
    
    this.projectForm.computed_sprint_count = Math.ceil(bufferedPoints / (effectiveVelocity || 1));
    this.projectForm.computed_total_duration_weeks = this.projectForm.computed_sprint_count * durationWeeks;
  }

  generateSprintPreview(): void {
    this.activeCalibrationTab = 'preview';
    this.isLoadingPreview = true;
    this.cdr.detectChanges();

    try {
      const rawPoints = this.projectForm.total_backlog_points || 0;
      const velocity = this.projectForm.target_velocity || 1;
      const durationWeeks = this.projectForm.sprint_duration_weeks || 2;

      const bufferedPoints = rawPoints * (1 + (this.agileTuning.scopeBufferPercent / 100));
      const effectiveVelocity = velocity * this.agileTuning.focusFactor;
      const totalSprintsNeeded = Math.ceil(bufferedPoints / (effectiveVelocity || 1));

      const mockSprintsArray = [];
      let currentIterationStartDate = new Date(this.previewStartDate);
      const prefixCode = this.projectForm.project_code ? `${this.projectForm.project_code.trim()}-` : 'SPRINT-';

      for (let i = 1; i <= totalSprintsNeeded; i++) {
        const currentIterationEndDate = new Date(currentIterationStartDate);
        currentIterationEndDate.setDate(currentIterationEndDate.getDate() + (durationWeeks * 7) - 1);

        const randomSequenceId = Math.floor(1000000 + Math.random() * 9000000);

        mockSprintsArray.push({
          sprint_number: i,
          name: `${prefixCode}${randomSequenceId} (Cycle ${i})`,
          status: 'PLANNED',
          scheduled_start_date: currentIterationStartDate.toISOString().split('T')[0],
          scheduled_end_date: currentIterationEndDate.toISOString().split('T')[0],
          duration_weeks: durationWeeks,
          target_velocity: Math.round(effectiveVelocity),
          activation_type: this.previewActivationType
        });

        const nextSprintStartDate = new Date(currentIterationEndDate);
        nextSprintStartDate.setDate(nextSprintStartDate.getDate() + 1);
        currentIterationStartDate = nextSprintStartDate;
      }

      this.calculatedSprintsPreview = mockSprintsArray;
    } catch (err) {
      console.error('Failed generating cycle timelines:', err);
      this.calculatedSprintsPreview = [];
    } finally {
      this.isLoadingPreview = false;
      this.cdr.detectChanges();
    }
  }

  commitProjectToSystem(): void {
    this.isSaving = true;
    
    const body = {
      ...this.projectForm,
      associatedTeamIds: this.selectedTeamIds,
      associatedUserIds: this.selectedUsers,
      previewStartDate: this.previewStartDate,
      previewActivationType: this.previewActivationType
    };

    const request$ = this.projectForm.id
      ? this.http.put(`${this.baseUrl}/projects/${this.projectForm.id}`, body, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/projects/create`, body, { headers: this.auth.getAuthHeaders() });

    request$.pipe(
      switchMap((projectRes: any) => {
        const responseData = projectRes?.data || projectRes;
        const confirmedProjectId = this.projectForm.id || responseData?.id || responseData?.project_id;
        
        if (!confirmedProjectId) {
          throw new Error('Could not resolve a valid project context ID context mapping layer.');
        }

        const initializedSprintsPayload = this.calculatedSprintsPreview.map(sprint => ({
          ...sprint,
          project_id: Number(confirmedProjectId),
          user_id: this.projectForm.user_id || 1
        }));

        // Convert string team IDs back to numbers for the backend sync API signature request payload layout
        const numericTeamIds = this.selectedTeamIds.map(id => Number(id)).filter(id => !isNaN(id));

        // ✅ FIXED FEATURE INTEGRATION: Triggers parallel sync commands to your new bulk allocation targets
        return forkJoin({
          sprintsSync: this.http.put(`${this.baseUrl}/sprints/project/${confirmedProjectId}/sync`, {
            previewStartDate: this.previewStartDate,
            previewActivationType: this.previewActivationType,
            sprints: initializedSprintsPayload
          }, { headers: this.auth.getAuthHeaders() }),

          teamsSync: this.http.post(`${this.baseUrl}/project-teams/sync`, {
            project_id: Number(confirmedProjectId),
            team_ids: numericTeamIds
          }, { headers: this.auth.getAuthHeaders() }),

          individualsSync: this.http.post(`${this.baseUrl}/project-individuals/sync`, {
            project_id: Number(confirmedProjectId),
            user_account_ids: this.selectedUsers
          }, { headers: this.auth.getAuthHeaders() })
        });
      }),
      finalize(() => {
        this.isSaving = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.isComposerOpen = false;
        this.projectsRefresh$.next();
      },
      error: (err) => console.error('Failed syncing unified structural configuration pipelines and allocations:', err)
    });
  }

  decommissionProject(projectId: any): void {
    if (!confirm('Are you completely sure you want to decommission this strategic architecture record layer?')) return;
    this.http.delete(`${this.baseUrl}/projects/${projectId}`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => this.projectsRefresh$.next(),
      error: (err) => console.error('Failed processing delete routine:', err)
    });
  }

  // --- Sprints Portfolio Compilers & Perspectives Filtering Logics ---
  private buildGlobalSprintsMatrix(projects: StrategicInitiative[]): void {
    const combinedSprints: any[] = [];
    
    projects.forEach((proj, index) => {
      const durationWeeks = proj.sprint_duration_weeks || 2;
      const sprintCount = proj.computed_sprint_count || 3;
      let seedDate = new Date();
      
      seedDate.setDate(seedDate.getDate() - (index * 12));

      for (let i = 1; i <= sprintCount; i++) {
        const endDate = new Date(seedDate);
        endDate.setDate(endDate.getDate() + (durationWeeks * 7) - 1);
        
        let status: 'CURRENT' | 'PLANNED' | 'COMPLETED' = 'PLANNED';
        const now = new Date();
        if (now >= seedDate && now <= endDate) {
          status = 'CURRENT';
        } else if (now > endDate) {
          status = 'COMPLETED';
        }

        combinedSprints.push({
          id: `${proj.project_code || 'PRJ'}-S${i}-${1000 + i}`,
          projectCode: proj.project_code || 'SANDBOX',
          sprint_number: i,
          name: `${proj.project_code || 'PRJ'} - Sprint ${i}`,
          status: status,
          scheduled_start_date: seedDate.toISOString().split('T')[0],
          scheduled_end_date: endDate.toISOString().split('T')[0],
          duration_weeks: durationWeeks,
          target_velocity: Math.round(proj.target_velocity || 30)
        });

        const nextStart = new Date(endDate);
        nextStart.setDate(nextStart.getDate() + 1);
        seedDate = nextStart;
      }
    });

    this.globalSprintsCollection = combinedSprints;
  }

  public setViewMode(mode: 'projects' | 'sprints'): void {
    this.dashboardViewMode = mode;
    if (mode === 'projects') {
      this.activeProjectFilterCode = ''; 
    }
    this.cdr.detectChanges();
  }

  public setSprintFilter(filter: 'ALL' | 'CURRENT' | 'FUTURE'): void {
    this.sprintTimelineFilter = filter;
    this.cdr.detectChanges();
  }

  public switchToSprintsForProject(projectCode: string): void {
    this.activeProjectFilterCode = projectCode;
    this.sprintTimelineFilter = 'ALL';
    this.setViewMode('sprints');
  }

  public shouldDisplaySprintRow(sprint: any): boolean {
    if (this.activeProjectFilterCode && sprint.projectCode !== this.activeProjectFilterCode) {
      return false;
    }
    if (this.sprintTimelineFilter === 'CURRENT') {
      return sprint.status === 'CURRENT';
    }
    if (this.sprintTimelineFilter === 'FUTURE') {
      return sprint.status === 'PLANNED';
    }
    return true;
  }

  public getFilteredSprintsCount(): number {
    return this.globalSprintsCollection.filter(s => this.shouldDisplaySprintRow(s)).length;
  }

  public executeSprintAction(sprint: any, contextType: string): void {
    console.log(`Executing operational framework pipeline for target ${sprint.id}: Action mode: ${contextType}`);
    if (contextType === 'ACTIVATE') {
      sprint.status = 'CURRENT';
    }
    this.cdr.detectChanges();
  }

  // --- Core Background Roster & Metadata Loaders ---
  private loadProductsBackground(): void {
    this.http.get<any>(`${this.baseUrl}/products`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.systemProducts = res?.data || res || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to resolve master product collections:', err)
    });
  }

  getProductName(productId: number | null): string {
    if (!productId) return 'Unassigned Sandbox Workspace';
    const match = this.systemProducts.find(p => Number(p.id) === Number(productId));
    return match ? match.name : `Product Reference Cluster #${productId}`;
  }

  private loadUsersBackground(): void {
    this.http.get<any>(`${this.baseUrl}/user`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        const users = res?.data || res || [];
        this.organizationPersonnel = users;
        this.usersSubject$.next(users);
        this.rebuildChipsMatrix();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed parsing background roster pipelines:', err)
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
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed handling initialization on functional arrays:', err)
    });
  }

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
        this.selectedUsers = result.map(id => Number(id));
        this.projectForm.associatedUserIds = [...this.selectedUsers];
        this.rebuildChipsMatrix();
        this.cdr.detectChanges();
      }
    });
  }

  onTeamSelectionChange(selectedOptions: any[]): void {
    this.selectedTeamIds = selectedOptions.map(opt => opt.value.toString());
    this.projectForm.associatedTeamIds = [...this.selectedTeamIds];
    this.rebuildChipsMatrix();
    this.cdr.detectChanges();
  }

  isTeamSelected(teamId: number | string): boolean {
    return this.selectedTeamIds.includes(teamId.toString());
  }

  removeUserChip(userObj: any): void {
    if (userObj.isFromTeam) return;
    const index = this.selectedUsers.indexOf(userObj.id);
    if (index > -1) {
      this.selectedUsers.splice(index, 1);
      this.projectForm.associatedUserIds = [...this.selectedUsers];
      this.rebuildChipsMatrix();
      this.cdr.detectChanges();
    }
  }

  public rebuildChipsMatrix(): void {
    const temporaryChipsMap = new Map<number, { id: number, name: string, isFromTeam: boolean, teamName?: string }>();

    if (this.liveActiveTeams && this.liveActiveTeams.length > 0) {
      this.liveActiveTeams.forEach(team => {
        if (team && team.id && this.selectedTeamIds.includes(team.id.toString()) && team.members) {
          team.members.forEach((member: UserAccountNode) => {
            const cleanId = Number(member.id);
            temporaryChipsMap.set(cleanId, {
              id: cleanId,
              name: member.name || member.username || member.email || `User ${cleanId}`,
              isFromTeam: true,
              teamName: team.name
            });
          });
        }
      });
    }

    if (this.selectedUsers && this.selectedUsers.length > 0) {
      this.selectedUsers.forEach((id: number) => {
        const cleanId = Number(id);
        if (!temporaryChipsMap.has(cleanId)) {
          const match = this.organizationPersonnel.find(u => Number(u.id) === cleanId);
          temporaryChipsMap.set(cleanId, {
            id: cleanId,
            name: match ? (match.name || match.username || match.email) : `Specialist Node #${cleanId}`,
            isFromTeam: false
          });
        }
      });
    }

    this.chipUserObjects = Array.from(temporaryChipsMap.values());
  }
}