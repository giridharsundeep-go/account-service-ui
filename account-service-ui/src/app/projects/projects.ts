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
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { UserSelectDialog } from '../user-select-dialog/user-select-dialog';

export interface UserAccountNode {
  id: number | string;
  name?: string;
  username?: string;
  email?: string;
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

export interface SprintItem {
  id: string | number;
  project_id?: number;
  projectCode: string;
  projectName: string;
  sprint_number: number;
  name: string;
  status: 'CURRENT' | 'PLANNED' | 'COMPLETED' | 'ON_HOLD';
  scheduled_start_date: string;
  scheduled_end_date: string;
  duration_weeks: number;
  target_velocity: number;
  completedPoints: number;
  activation_type: 'AUTOMATIC' | 'MANUAL';
  description?: string;
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
    MatListModule,
    MatExpansionModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressBarModule,
    MatMenuModule
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
  previewStartDate: Date | string | null = new Date();
  previewActivationType: 'AUTOMATIC' | 'MANUAL' = 'AUTOMATIC';

  agileTuning = { focusFactor: 0.80, scopeBufferPercent: 15 };

  selectedUsers: number[] = [];
  chipUserObjects: Array<{ id: number, name: string, isFromTeam: boolean, teamName?: string }> = [];
  selectedTeamIds: string[] = [];

  projectForm!: StrategicInitiative;

  // --- Sprints Perspective Operational States ---
  public dashboardViewMode: 'projects' | 'sprints' = 'projects';
  public sprintTimelineFilter: 'ALL' | 'CURRENT' | 'FUTURE' | 'COMPLETED' = 'ALL';
  public globalSprintsCollection: SprintItem[] = [];
  public activeProjectFilterCode: string = '';
  public sprintSearchQuery: string = '';
  public sprintSortBy: 'START_DATE' | 'NAME' | 'VELOCITY' = 'START_DATE';

  // --- Inline Sprint Form State ---
  public isSprintModalOpen = false;
  public editingSprintId: string | number | null = null;
  public sprintForm: Partial<SprintItem> = {
    name: '',
    projectCode: '',
    sprint_number: 1,
    target_velocity: 30,
    duration_weeks: 2,
    scheduled_start_date: new Date().toISOString().split('T')[0],
    scheduled_end_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    status: 'PLANNED'
  };

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

  private safeToString(value: any): string {
    return value !== null && value !== undefined ? String(value).trim() : '';
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

          this.selectedUsers = individualRecords.map((item: any) => Number(item.user_id || item.id || 0)).filter((id: number) => id > 0);
          this.projectForm.associatedUserIds = [...this.selectedUsers];

          this.selectedTeamIds = teamRecords.map((item: any) => this.safeToString(item.team_id || item.id || item)).filter((id: string) => id.length > 0);
          this.projectForm.associatedTeamIds = [...this.selectedTeamIds];
        },
        error: (err) => {
          console.error('Relational mapping lookup error occurred:', err);
          this.selectedUsers = project.associatedUserIds ? [...project.associatedUserIds].map(Number) : [];
          this.selectedTeamIds = project.associatedTeamIds ? [...project.associatedTeamIds].map(id => this.safeToString(id)) : [];
        }
      });
    } else {
      this.selectedUsers = project.associatedUserIds ? [...project.associatedUserIds].map(Number) : [];
      this.selectedTeamIds = project.associatedTeamIds ? [...project.associatedTeamIds].map(id => this.safeToString(id)) : [];
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
      if (step === 2) this.rebuildChipsMatrix();
      if (step === 3) this.calculateAgileMetrics();
      if (step === 4) this.generateSprintPreview();
      this.cdr.detectChanges();
    }
  }

  nextBuilderStep(): void {
    if (this.activeBuilderStep < 4) {
      this.activeBuilderStep++;
      if (this.activeBuilderStep === 2) this.rebuildChipsMatrix();
      if (this.activeBuilderStep === 3) this.calculateAgileMetrics();
      if (this.activeBuilderStep === 4) this.generateSprintPreview();
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
    if (!this.projectForm) return;

    const rawPoints = Math.max(0, Number(this.projectForm.total_backlog_points) || 0);
    const velocity = Math.max(1, Number(this.projectForm.target_velocity) || 1);
    const durationWeeks = Math.max(1, Number(this.projectForm.sprint_duration_weeks) || 1);

    const scopeBuffer = Number(this.agileTuning?.scopeBufferPercent) || 0;
    const bufferedPoints = Math.round(rawPoints * (1 + (scopeBuffer / 100)));

    const focusFactor = Math.max(0.01, Number(this.agileTuning?.focusFactor) || 0.8);
    const effectiveVelocity = Math.max(1, Math.round(velocity * focusFactor));

    this.projectForm.computed_sprint_count = bufferedPoints > 0 ? Math.ceil(bufferedPoints / effectiveVelocity) : 0;
    this.projectForm.computed_total_duration_weeks = this.projectForm.computed_sprint_count * durationWeeks;

    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  generateSprintPreview(): void {
    this.activeCalibrationTab = 'preview';
    this.isLoadingPreview = true;
    this.cdr.detectChanges();

    try {
      this.calculateAgileMetrics();

      const rawPoints = Math.max(0, Number(this.projectForm.total_backlog_points) || 0);
      const velocity = Math.max(1, Number(this.projectForm.target_velocity) || 1);
      const durationWeeks = Math.max(1, Number(this.projectForm.sprint_duration_weeks) || 1);

      const scopeBuffer = Number(this.agileTuning.scopeBufferPercent) || 0;
      let remainingPoints = Math.round(rawPoints * (1 + (scopeBuffer / 100)));

      const focusFactor = Math.max(0.01, Number(this.agileTuning.focusFactor) || 0.8);
      const effectiveVelocity = Math.max(1, Math.round(velocity * focusFactor));

      const totalSprintsNeeded = this.projectForm.computed_sprint_count;
      const mockSprintsArray = [];

      let currentIterationStartDate: Date;
      if (this.previewStartDate instanceof Date) {
        currentIterationStartDate = new Date(this.previewStartDate.getTime());
      } else if (typeof this.previewStartDate === 'string' && this.previewStartDate.trim()) {
        currentIterationStartDate = new Date(this.previewStartDate);
      } else {
        currentIterationStartDate = new Date();
      }

      if (isNaN(currentIterationStartDate.getTime())) currentIterationStartDate = new Date();

      const prefixCode = this.projectForm.project_code && this.projectForm.project_code.trim()
        ? `${this.projectForm.project_code.trim()}-`
        : 'SPRINT-';

      for (let i = 1; i <= totalSprintsNeeded; i++) {
        const sprintTargetPoints = Math.min(remainingPoints, effectiveVelocity);
        remainingPoints = Math.max(0, remainingPoints - sprintTargetPoints);

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
          target_velocity: sprintTargetPoints,
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

        if (!confirmedProjectId) throw new Error('Could not resolve a valid project context ID.');

        const initializedSprintsPayload = this.calculatedSprintsPreview.map(sprint => ({
          ...sprint,
          project_id: Number(confirmedProjectId),
          user_id: this.projectForm.user_id || 1
        }));

        const numericTeamIds = this.selectedTeamIds.map(id => Number(id)).filter(id => !isNaN(id));

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
      error: (err) => console.error('Failed syncing dynamic configuration pipelines:', err)
    });
  }

  decommissionProject(projectId: any): void {
    if (!confirm('Are you completely sure you want to decommission this strategic architecture record layer?')) return;
    this.http.delete(`${this.baseUrl}/projects/${projectId}`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => this.projectsRefresh$.next(),
      error: (err) => console.error('Failed processing delete routine:', err)
    });
  }

  private buildGlobalSprintsMatrix(projects: StrategicInitiative[]): void {
    const combinedSprints: SprintItem[] = [];

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

        const targetVel = Math.round(proj.target_velocity || 30);
        const completedVel = status === 'COMPLETED' ? targetVel : (status === 'CURRENT' ? Math.round(targetVel * 0.65) : 0);

        combinedSprints.push({
          id: `${proj.project_code || 'PRJ'}-S${i}-${1000 + i}`,
          project_id: proj.id,
          projectCode: proj.project_code || 'SANDBOX',
          projectName: proj.name,
          sprint_number: i,
          name: `${proj.project_code || 'PRJ'} - Sprint ${i}`,
          status: status,
          scheduled_start_date: seedDate.toISOString().split('T')[0],
          scheduled_end_date: endDate.toISOString().split('T')[0],
          duration_weeks: durationWeeks,
          target_velocity: targetVel,
          completedPoints: completedVel,
          activation_type: 'AUTOMATIC'
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
    if (mode === 'projects') this.activeProjectFilterCode = '';
    this.cdr.detectChanges();
  }

  public setSprintFilter(filter: 'ALL' | 'CURRENT' | 'FUTURE' | 'COMPLETED'): void {
    this.sprintTimelineFilter = filter;
    this.cdr.detectChanges();
  }

  public switchToSprintsForProject(projectCode: string): void {
    this.activeProjectFilterCode = projectCode;
    this.sprintTimelineFilter = 'ALL';
    this.setViewMode('sprints');
  }

  // --- GOOGLE DEV SPRINT FUNCTIONS & API INTEGRATIONS ---

  public getFilteredSprints(statusCategory?: 'CURRENT' | 'PLANNED' | 'COMPLETED'): SprintItem[] {
    let list = [...this.globalSprintsCollection];

    if (this.activeProjectFilterCode) {
      list = list.filter(s => s.projectCode === this.activeProjectFilterCode);
    }

    if (statusCategory) {
      list = list.filter(s => s.status === statusCategory);
    } else if (this.sprintTimelineFilter !== 'ALL') {
      if (this.sprintTimelineFilter === 'CURRENT') list = list.filter(s => s.status === 'CURRENT');
      if (this.sprintTimelineFilter === 'FUTURE') list = list.filter(s => s.status === 'PLANNED');
      if (this.sprintTimelineFilter === 'COMPLETED') list = list.filter(s => s.status === 'COMPLETED');
    }

    if (this.sprintSearchQuery.trim()) {
      const q = this.sprintSearchQuery.toLowerCase().trim();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.projectCode.toLowerCase().includes(q) ||
        s.projectName.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (this.sprintSortBy === 'START_DATE') {
        return new Date(a.scheduled_start_date).getTime() - new Date(b.scheduled_start_date).getTime();
      }
      if (this.sprintSortBy === 'NAME') {
        return a.name.localeCompare(b.name);
      }
      if (this.sprintSortBy === 'VELOCITY') {
        return b.target_velocity - a.target_velocity;
      }
      return 0;
    });

    return list;
  }

  public getRunningSprints(): SprintItem[] {
    return this.getFilteredSprints('CURRENT');
  }

  public getUpcomingSprints(): SprintItem[] {
    return this.getFilteredSprints('PLANNED');
  }

  public getCompletedSprints(): SprintItem[] {
    return this.getFilteredSprints('COMPLETED');
  }

  public getFilteredSprintsCount(): number {
    return this.getFilteredSprints().length;
  }

  public getSprintProgress(sprint: SprintItem): number {
    if (!sprint.target_velocity || sprint.target_velocity === 0) return 0;
    const pct = Math.round(((sprint.completedPoints || 0) / sprint.target_velocity) * 100);
    return Math.min(100, Math.max(0, pct));
  }

  public startSprint(sprint: SprintItem): void {
    sprint.status = 'CURRENT';
    this.http.put(`${this.baseUrl}/sprints/${sprint.id}/start`, { status: 'CURRENT' }, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of(null))
    ).subscribe(() => this.cdr.detectChanges());
  }

  public completeSprint(sprint: SprintItem): void {
    sprint.status = 'COMPLETED';
    sprint.completedPoints = sprint.target_velocity;
    this.http.put(`${this.baseUrl}/sprints/${sprint.id}/complete`, { status: 'COMPLETED' }, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of(null))
    ).subscribe(() => this.cdr.detectChanges());
  }

  public openCreateSprintModal(): void {
    this.editingSprintId = null;
    this.sprintForm = {
      name: '',
      projectCode: this.activeProjectFilterCode || 'PRJ',
      sprint_number: this.globalSprintsCollection.length + 1,
      target_velocity: 30,
      duration_weeks: 2,
      scheduled_start_date: new Date().toISOString().split('T')[0],
      scheduled_end_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      status: 'PLANNED'
    };
    this.isSprintModalOpen = true;
    this.cdr.detectChanges();
  }

  public editSprint(sprint: SprintItem): void {
    this.editingSprintId = sprint.id;
    this.sprintForm = { ...sprint };
    this.isSprintModalOpen = true;
    this.cdr.detectChanges();
  }

  public saveSprintModal(): void {
    if (!this.sprintForm.name) return;

    if (this.editingSprintId) {
      const matchIndex = this.globalSprintsCollection.findIndex(s => s.id === this.editingSprintId);
      if (matchIndex > -1) {
        this.globalSprintsCollection[matchIndex] = {
          ...this.globalSprintsCollection[matchIndex],
          ...this.sprintForm
        } as SprintItem;
      }
    } else {
      const newSprint: SprintItem = {
        id: `SPR-${Date.now()}`,
        projectCode: this.sprintForm.projectCode || 'PRJ',
        projectName: 'Strategic Initiative Workspace',
        sprint_number: Number(this.sprintForm.sprint_number) || 1,
        name: this.sprintForm.name,
        status: (this.sprintForm.status as any) || 'PLANNED',
        scheduled_start_date: this.sprintForm.scheduled_start_date || new Date().toISOString().split('T')[0],
        scheduled_end_date: this.sprintForm.scheduled_end_date || new Date().toISOString().split('T')[0],
        duration_weeks: Number(this.sprintForm.duration_weeks) || 2,
        target_velocity: Number(this.sprintForm.target_velocity) || 30,
        completedPoints: 0,
        activation_type: 'AUTOMATIC'
      };
      this.globalSprintsCollection.unshift(newSprint);
    }

    this.isSprintModalOpen = false;
    this.cdr.detectChanges();
  }

  public deleteSprint(sprintId: string | number): void {
    if (!confirm('Are you sure you want to remove this sprint execution cycle?')) return;
    this.globalSprintsCollection = this.globalSprintsCollection.filter(s => s.id !== sprintId);
    this.http.delete(`${this.baseUrl}/sprints/${sprintId}`, { headers: this.auth.getAuthHeaders() }).pipe(
      catchError(() => of(null))
    ).subscribe(() => this.cdr.detectChanges());
  }

  private loadProductsBackground(): void {
    this.http.get<any>(`${this.baseUrl}/products`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.systemProducts = res?.data || res || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to resolve product collections:', err)
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

  onTeamSelectionChange(selection: any): void {
    let rawValues: any[] = [];
    if (Array.isArray(selection)) {
      rawValues = selection;
    } else if (selection && selection.value && Array.isArray(selection.value)) {
      rawValues = selection.value;
    } else if (selection !== null && selection !== undefined) {
      rawValues = [selection];
    }

    this.selectedTeamIds = rawValues.map(val => this.safeToString(val)).filter(val => val !== '');
    this.projectForm.associatedTeamIds = [...this.selectedTeamIds];
    this.rebuildChipsMatrix();
    this.cdr.detectChanges();
  }

  isTeamSelected(teamId: number | string): boolean {
    const cleanId = this.safeToString(teamId);
    return this.selectedTeamIds.includes(cleanId);
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
        if (!team) return;
        const cleanTeamId = this.safeToString(team.id);

        if (this.selectedTeamIds.includes(cleanTeamId) && Array.isArray(team.members)) {
          team.members.forEach((member: any) => {
            if (!member) return;
            const rawId = member.id || member.userId || member.user_id;
            const cleanId = Number(rawId);

            if (!isNaN(cleanId) && cleanId > 0) {
              temporaryChipsMap.set(cleanId, {
                id: cleanId,
                name: member.name || member.username || member.displayName || member.email || `User ${cleanId}`,
                isFromTeam: true,
                teamName: team.name || 'Team Member'
              });
            }
          });
        }
      });
    }

    if (this.selectedUsers && this.selectedUsers.length > 0) {
      this.selectedUsers.forEach((id: number) => {
        const cleanId = Number(id);
        if (!isNaN(cleanId) && cleanId > 0 && !temporaryChipsMap.has(cleanId)) {
          const match = this.organizationPersonnel.find(u => Number(u.id) === cleanId);
          temporaryChipsMap.set(cleanId, {
            id: cleanId,
            name: match ? (match.name || match.username || match.email || `User ${cleanId}`) : `Specialist Node #${cleanId}`,
            isFromTeam: false
          });
        }
      });
    }

    this.chipUserObjects = Array.from(temporaryChipsMap.values());
  }
}