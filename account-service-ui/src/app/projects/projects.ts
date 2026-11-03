import { SprintPlanning } from '../sprint-planning/sprint-planning';
import { untracked, effect } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectContextService } from '../project-context.service';
import { ProjectWorkItem, ProjectWorkService } from '../shared/project-work.service';
import { WorkItemDialogService } from '../shared/work-item-dialog.service';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  forkJoin,
  from,
  of
} from 'rxjs';
import {
  finalize,
  switchMap,
  map,
  catchError,
  concatMap,
  toArray
} from 'rxjs/operators';

import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';

import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
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
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatStepperModule } from '@angular/material/stepper';

import { UserSelectDialog } from '../user-select-dialog/user-select-dialog';
import { PersonCard } from '../shared/person-card';
import { PlanningWorkTableComponent } from '../shared/planning-work-table';
import { TeamSelectDialog } from '../shared/team-select-dialog';
import { TeamPeopleDialog } from '../shared/team-people-dialog';
import { personDesignation, personRegions } from '../shared/people-directory';


export interface UserAccountNode {
  id: number | string;
  name?: string;
  username?: string;
  email?: string;
  role?: string;
  roleId?: number;
  designation?: string;
  jobTitle?: string;
  profilePictureUrl?: string | null;
  employeeIdPrefix?: string | null;
  employeeIdNumber?: string | number | null;
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

  status: 'ACTIVE' | 'ARCHIVED' | 'ON_HOLD' | 'COMPLETED';

  methodology:
    | 'AGILE_SCRUM'
    | 'WATERFALL_GANTT';

  priority:
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH'
    | 'CRITICAL';

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

  status:
    | 'CURRENT'
    | 'PLANNED'
    | 'COMPLETED'
    | 'ON_HOLD';

  scheduled_start_date: string;
  scheduled_end_date: string;

  duration_weeks: number;
  target_velocity: number;
  completedPoints: number;

  activation_type:
    | 'AUTOMATIC'
    | 'MANUAL';

  description?: string;
}


@Component({
  selector: 'app-projects',
  standalone: true,

  templateUrl: './projects.html',
  styleUrls: ['./projects.css', '../shared/field-controls.css'],

  imports: [
    CommonModule,
    FormsModule,
    WorkspaceHeroComponent,
    PersonCard,
    PlanningWorkTableComponent,

    MatIconModule,
    MatCardModule,
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
    SprintPlanning,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressBarModule,
    MatMenuModule,
    MatTableModule,
    MatTabsModule,
    MatStepperModule
  ]
})
export class Projects implements OnInit {
  get canManageProjects():boolean{return this.auth.isAdmin();}

  projectRoles: any[] = [];
  planningVisited=false;
  private openPlanningAfterCreate = false;
  createAndOpenPlanning(): void {
    this.openPlanningAfterCreate = true;
    this.saveProfileProject();
  }
  private readonly projectWork = inject(ProjectWorkService);
  private readonly itemDialog = inject(WorkItemDialogService);
  private lastItemRevision = this.itemDialog.revision();
  private readonly itemRefresh = effect(() => {
    const revision = this.itemDialog.revision();
    if (revision === this.lastItemRevision) return;
    this.lastItemRevision = revision;
    untracked(() => { if (this.workRequestProject > 0) this.loadProjectWork(this.workRequestProject); });
  });
  private readonly projectContext = inject(ProjectContextService);
  private readonly projectRouter = inject(Router);
  projectWorkItems: ProjectWorkItem[] = [];
  projectWorkLoading = false;
  projectWorkError = '';
  private workRequestProject = 0;
  loadProjectWork(id: number): void {
    if (!Number.isFinite(id) || id <= 0) return;
    this.workRequestProject=id; this.projectWorkLoading=true; this.projectWorkError=''; this.projectWorkItems=[];
    this.projectWork.load(id).subscribe(data=>{if(this.workRequestProject!==id)return;this.projectWorkItems=data.items;this.projectWorkLoading=false;this.projectWorkError=data.unavailable.length ? 'Some work sources are unavailable: '+data.unavailable.join(', ') : '';this.cdr.markForCheck();});
  }
  sprintPreviewItems(sprint: SprintItem): ProjectWorkItem[] { return this.projectWorkItems.filter(item=>item.sprintId===Number(sprint.id)); }
  openProjectWorkItem(item: ProjectWorkItem): void { this.itemDialog.open(item.projectId,item.kind,item.id); }
  openProjectPlanning(project: StrategicInitiative): void { this.planningVisited=true; this.selectedProjectTabIndex=4; }
  memberDesignation(member:any): string {
    const user:any=this.organizationPersonnel.find(u=>Number(u.id)===Number(member.id));
    return personDesignation(user || member, this.projectRoles);
  }
  get allocatedTeams(): FunctionalTeamNode[] { return this.liveActiveTeams.filter(team => this.isTeamSelected(team.id)); }
  get individualMembers(): any[] { return this.chipUserObjects.filter(member => this.selectedUsers.includes(Number(member.id))); }
  public openAllocatedTeam(team: FunctionalTeamNode): void {
    const members = (team.members || []).map(member => {
      const user = this.organizationPersonnel.find(person => Number(person.id) === Number(member.id)) || member;
      return {...member, ...user, designation: this.memberDesignation(user), location: personRegions(user).join(' · '), employeeCode: [user.employeeIdPrefix,user.employeeIdNumber].filter(Boolean).join('/')};
    });
    this.dialog.open(TeamPeopleDialog, {width:'1040px',maxWidth:'96vw',data:{name:team.name,members}});
  }
  public openTeamSelectionDialog(): void {
    this.dialog.open(TeamSelectDialog, {width:'760px', maxWidth:'96vw', data:{teams:this.liveActiveTeams, selected:this.selectedTeamIds}})
      .afterClosed().subscribe((ids:string[] | undefined) => { if(ids) this.onTeamSelectionChange(ids); });
  }
  public removeAllocatedTeam(id:number|string): void { this.onTeamSelectionChange(this.selectedTeamIds.filter(value=>value!==String(id))); }
  private deliveryPlanChanged = false;
  public deliveryParametersChanged(): void { this.deliveryPlanChanged = true; this.generateSprintPreview(); }


  baseUrl = environment.apiBaseUrlM;

  public projectsRefresh$ =
    new BehaviorSubject<void>(undefined);

  private usersSubject$ =
    new BehaviorSubject<UserAccountNode[]>([]);

  projects$: Observable<StrategicInitiative[]> | undefined;


  /* ============================================================
     RESOURCES
  ============================================================ */

  liveActiveTeams: FunctionalTeamNode[] = [];

  organizationPersonnel: UserAccountNode[] = [];

  systemProducts: CoreProductNode[] = [];

  private currentProjectsCache: StrategicInitiative[] = [];


  /* ============================================================
     SINGLE GLOBAL SEARCH
  ============================================================ */

  public globalSearchQuery = '';

  public selectedProductId: number | 'ALL' = 'ALL';


  /* ============================================================
     VIEW
  ============================================================ */

  public dashboardViewMode:
    | 'projects'
    | 'sprints' = 'projects';

  public activeProjectFilterCode = '';

  public activeProjectFilterId:
    number | null = null;

  public sprintLoadError = '';

  public sprintTimelineFilter:
    | 'ALL'
    | 'CURRENT'
    | 'FUTURE'
    | 'COMPLETED' = 'ALL';

  public sprintSortBy:
    | 'START_DATE'
    | 'NAME'
    | 'VELOCITY' = 'START_DATE';


  /* ============================================================
     PROJECT COMPOSER
  ============================================================ */

  isComposerOpen = false;

  isSaving = false;

  isLoadingResources = false;

  activeBuilderStep = 1;

  activeCalibrationTab:
    | 'engine'
    | 'preview' = 'engine';

  isLoadingPreview = false;

  calculatedSprintsPreview: any[] = [];

  previewStartDate:
    | Date
    | string
    | null = new Date();

  previewActivationType:
    | 'AUTOMATIC'
    | 'MANUAL' = 'AUTOMATIC';


  agileTuning = {
    focusFactor: 0.80,
    scopeBufferPercent: 15
  };


  selectedUsers: number[] = [];

  chipUserObjects:
    Array<{
      id: number;
      name: string;
      email: string;
      employeeCode: string;
      profilePictureUrl?: string | null;
      designation?: string | null;
      jobTitle?: string | null;
      title?: string | null;
      role?: string | null;
      isFromTeam: boolean;
      teamName?: string;
    }> = [];

  selectedTeamIds: string[] = [];

  projectForm!: StrategicInitiative;


  /* ============================================================
     SPRINT DATA
  ============================================================ */

  public globalSprintsCollection:
    SprintItem[] = [];

  private sprintLoadSequence = 0;
  private composerLoadSequence = 0;

  public isSprintModalOpen = false;

  public editingSprintId:
    string | number | null = null;

  public sprintForm:
    Partial<SprintItem> = {
      name: '',
      projectCode: '',
      sprint_number: 1,
      target_velocity: 30,
      duration_weeks: 2,
      scheduled_start_date:
        new Date().toISOString().split('T')[0],
      scheduled_end_date:
        new Date(
          Date.now() + 14 * 86400000
        ).toISOString().split('T')[0],
      status: 'PLANNED'
    };


  /* ============================================================
     POPUPS
  ============================================================ */

  public selectedSprint:
    SprintItem | null = null;

  public selectedProject:
    StrategicInitiative | null = null;

  public selectedProjectTabIndex = 0;
  public isProfileEditing = false;
  public isProfileCreating = false;
  public projectSaveError = '';
  private projectSaveStage = 'project details';
  public allocationLoadError = '';
  public projectDisplayedColumns = ['project', 'status', 'deadline', 'actions'];
  public profileSprintDisplayedColumns = ['sprint', 'sprintStatus', 'start', 'end', 'velocity'];
  private profileEditSnapshot: StrategicInitiative | null = null;
Math: any;


  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {
    this.resetProjectForm();
  }


  /* ============================================================
     INIT
  ============================================================ */

  ngOnInit(): void {
    this.http.get<any>(`${this.baseUrl}/roles`,{headers:this.auth.getAuthHeaders()}).pipe(catchError(()=>of([]))).subscribe(res=>{this.projectRoles=this.extractApiArray(res);this.cdr.markForCheck();});

    this.loadUsersBackground();

    this.loadTeamsBackground();

    this.loadProductsBackground();


    this.projects$ =
      combineLatest([
        this.projectsRefresh$,
        this.usersSubject$
      ]).pipe(

        switchMap(() => {

          return this.http.get<any>(
            `${this.baseUrl}/projects`,
            {
              headers:
                this.auth.getAuthHeaders()
            }
          );

        }),

        map((res: any) => {

          const rawProjectsArray =
            res?.data ||
            res ||
            [];

          const processedProjects =
            rawProjectsArray.map(
              (project: any) => {

                project.associatedUserIds =
                  project.associatedUserIds || [];

                project.associatedTeamIds =
                  project.associatedTeamIds || [];

                project.product_id =
                  project.product_id
                    ? Number(project.product_id)
                    : null;

                project.project_code =
                  project.project_code || '';

                return project as StrategicInitiative;
              }
            );

          this.currentProjectsCache =
            processedProjects;

          this.refreshSprintProjectNames();
          this.loadSprintsBackground();

          return processedProjects;

        })
      );

  }


  /* ============================================================
     GLOBAL SEARCH
  ============================================================ */

  public onGlobalSearch(value: string): void {

    this.globalSearchQuery =
      value || '';

    this.cdr.detectChanges();
  }


  public clearGlobalSearch(): void {

    this.globalSearchQuery = '';

    this.cdr.detectChanges();
  }


  public getFilteredProjects(
    projects: StrategicInitiative[]
  ): StrategicInitiative[] {

    const query =
      this.globalSearchQuery
        .trim()
        .toLowerCase();

    return projects.filter(
      project => {

        if (
          this.selectedProductId !== 'ALL' &&
          Number(project.product_id) !== Number(this.selectedProductId)
        ) {
          return false;
        }

        if (!query) {
          return true;
        }

        return (
          (project.name || '')
            .toLowerCase()
            .includes(query) ||

          (project.project_code || '')
            .toLowerCase()
            .includes(query) ||

          (project.description || '')
            .toLowerCase()
            .includes(query) ||

          (project.status || '')
            .toLowerCase()
            .includes(query) ||

          this.getProductName(
            project.product_id
          )
            .toLowerCase()
            .includes(query)
        );

      }
    );
  }



  public setProductFilter(productId: number | 'ALL'): void {

    this.selectedProductId = productId;
    this.cdr.detectChanges();
  }


  public getFilteredSprints(
    statusCategory?:
      | 'CURRENT'
      | 'PLANNED'
      | 'COMPLETED'
  ): SprintItem[] {

    let list =
      [...this.globalSprintsCollection];


    if (this.activeProjectFilterId != null) {

      list =
        list.filter(
          sprint =>
            Number(sprint.project_id) ===
            Number(this.activeProjectFilterId)
        );

    } else if (this.activeProjectFilterCode) {

      const filterCode =
        this.activeProjectFilterCode
          .trim()
          .toLowerCase();

      list =
        list.filter(
          sprint =>
            String(sprint.projectCode || '')
              .trim()
              .toLowerCase() ===
            filterCode
        );

    }


    if (statusCategory) {

      list =
        list.filter(
          sprint =>
            sprint.status ===
            statusCategory
        );

    } else {

      if (
        this.sprintTimelineFilter ===
        'CURRENT'
      ) {

        list =
          list.filter(
            sprint =>
              sprint.status ===
              'CURRENT'
          );

      }

      if (
        this.sprintTimelineFilter ===
        'FUTURE'
      ) {

        list =
          list.filter(
            sprint =>
              sprint.status ===
              'PLANNED'
          );

      }

      if (
        this.sprintTimelineFilter ===
        'COMPLETED'
      ) {

        list =
          list.filter(
            sprint =>
              sprint.status ===
              'COMPLETED'
          );

      }

    }


    const query =
      this.globalSearchQuery
        .trim()
        .toLowerCase();


    if (query) {

      list =
        list.filter(
          sprint => {

            return (
              (sprint.name || '')
                .toLowerCase()
                .includes(query) ||

              (sprint.projectCode || '')
                .toLowerCase()
                .includes(query) ||

              (sprint.projectName || '')
                .toLowerCase()
                .includes(query) ||

              String(
                sprint.sprint_number
              ).includes(query)
            );

          }
        );

    }


    list.sort(
      (a, b) => {

        if (
          this.sprintSortBy ===
          'START_DATE'
        ) {

          return (
            new Date(
              a.scheduled_start_date
            ).getTime() -

            new Date(
              b.scheduled_start_date
            ).getTime()
          );

        }


        if (
          this.sprintSortBy ===
          'NAME'
        ) {

          return a.name
            .localeCompare(b.name);

        }


        if (
          this.sprintSortBy ===
          'VELOCITY'
        ) {

          return (
            b.target_velocity -
            a.target_velocity
          );

        }


        return 0;
      }
    );


    return list;
  }


  public getRunningSprints(): SprintItem[] {
    return this.getFilteredSprints(
      'CURRENT'
    );
  }


  public getUpcomingSprints(): SprintItem[] {
    return this.getFilteredSprints(
      'PLANNED'
    );
  }


  public getCompletedSprints(): SprintItem[] {
    return this.getFilteredSprints(
      'COMPLETED'
    );
  }


  public getFilteredSprintsCount(): number {

    return this.getFilteredSprints()
      .length;

  }


  /* ============================================================
     VIEW SWITCHING
  ============================================================ */

  public setViewMode(
    mode: 'projects' | 'sprints'
  ): void {

    this.dashboardViewMode =
      mode;

    if (mode === 'projects') {
      this.activeProjectFilterCode = '';
      this.activeProjectFilterId = null;
    } else {
      // The top-level Sprints view must always represent the
      // complete sprint collection, not the last project filter.
      this.activeProjectFilterCode = '';
      this.activeProjectFilterId = null;
      this.sprintTimelineFilter = 'ALL';
      this.loadSprintsBackground();
    }

    this.clearSelectedDetails();

    this.cdr.detectChanges();
  }


  public switchToSprintsForProject(
    projectCode: string,
    projectId?: number
  ): void {

    this.activeProjectFilterCode =
      projectCode || '';

    this.activeProjectFilterId =
      projectId != null && Number.isFinite(Number(projectId))
        ? Number(projectId)
        : null;

    this.sprintTimelineFilter =
      'ALL';

    this.dashboardViewMode =
      'sprints';

    // Always reload from the selected project's endpoint. This avoids
    // showing the previous project's cached sprint collection.
    if (this.activeProjectFilterId != null) {
      this.loadSprintsBackground(
        this.activeProjectFilterId
      );
    } else {
      // Keep compatibility with callers that only provide a project code.
      this.loadSprintsBackground();
    }

    this.clearSelectedDetails();

    this.cdr.detectChanges();
  }


  public clearProjectFilter(): void {

    this.activeProjectFilterCode =
      '';

    this.activeProjectFilterId =
      null;

    // Reload the full collection after leaving a project-specific
    // sprint view. Otherwise global view can retain only that project's rows.
    this.loadSprintsBackground();

    this.cdr.detectChanges();
  }


  public setSprintFilter(
    filter:
      | 'ALL'
      | 'CURRENT'
      | 'FUTURE'
      | 'COMPLETED'
  ): void {

    this.sprintTimelineFilter =
      filter;

    this.cdr.detectChanges();
  }


  /* ============================================================
     PROJECT DETAILS
  ============================================================ */

  /** Normalize API/project objects before assigning them to strongly typed form state.
   * Some API responses omit fields or return nulls, so a plain object spread is unsafe.
   */
  private normalizeProject(project: Partial<StrategicInitiative> | null | undefined): StrategicInitiative {
    const source = project ?? {};
    const scope = Math.max(0, Number(source.total_backlog_points ?? 120));
    const velocity = Math.max(1, Math.round(Number(source.target_velocity ?? 30) * this.agileTuning.focusFactor));
    const count = Math.ceil(Math.round(scope * (1 + this.agileTuning.scopeBufferPercent / 100)) / velocity);
    return {
      ...(source as any),
      id: source.id,
      user_id: source.user_id,
      product_id: source.product_id ?? null,
      name: source.name ?? '',
      project_code: source.project_code ?? '',
      description: source.description ?? '',
      status: source.status ?? 'ACTIVE',
      methodology: source.methodology ?? 'AGILE_SCRUM',
      priority: source.priority ?? 'MEDIUM',
      total_backlog_points: source.total_backlog_points ?? 120,
      sprint_duration_weeks: source.sprint_duration_weeks ?? 2,
      target_velocity: source.target_velocity ?? 30,
      auto_rollover_backlog: source.auto_rollover_backlog ?? true,
      computed_sprint_count: count,
      computed_total_duration_weeks: count * Number(source.sprint_duration_weeks ?? 2),
      associatedTeamIds: [...(source.associatedTeamIds ?? [])],
      associatedUserIds: [...(source.associatedUserIds ?? [])]
    };
  }

  public openProjectDetails(
    project: StrategicInitiative
  ): void {
    const normalized = this.normalizeProject(project);
    this.selectedProject = normalized;
    this.loadProjectWork(Number(normalized.id));
    this.loadSprintsBackground(Number(normalized.id));
    this.selectedSprint = null;
    this.selectedProjectTabIndex = 0;
    this.planningVisited = false;
    this.isProfileCreating = false;
    this.isProfileEditing = false;
    this.projectSaveError = '';
    this.profileEditSnapshot = this.normalizeProject(normalized);
    this.projectForm = this.normalizeProject(normalized);
    this.selectedTeamIds = [...(normalized.associatedTeamIds || [])];
    this.selectedUsers = [...(normalized.associatedUserIds || [])];
    this.chipUserObjects = [];
    this.loadComposerResources(Number(normalized.id), normalized);
    this.cdr.detectChanges();
  }


  public closeProjectDetails(): void {
    this.composerLoadSequence++;
    this.isLoadingResources = false;
    this.selectedProject = null;
    this.selectedProjectTabIndex = 0;
    this.isProfileCreating = false;
    this.isProfileEditing = false;
    this.profileEditSnapshot = null;
    this.cdr.detectChanges();
  }



  public getProjectProfileValue(project: any, keys: string[]): string {
    for (const key of keys) {
      const value = project?.[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        const date = new Date(value);
        if (/date|deadline|due/i.test(key) && !Number.isNaN(date.getTime())) {
          return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return String(value);
      }
    }
    return '—';
  }

  public getProjectDeadline(project: any): string {
    const value = project?.deadline || project?.due_date || project?.target_end_date || project?.end_date;
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  public getProjectProfileSprints(project: StrategicInitiative): SprintItem[] {
    if (this.isProfileEditing) return this.calculatedSprintsPreview as SprintItem[];
    return this.globalSprintsCollection
      .filter(sprint => Number(sprint.project_id) === Number(project.id))
      .sort((a, b) => Number(a.sprint_number) - Number(b.sprint_number));
  }

  public editProjectInProfile(project: StrategicInitiative): void {
    const normalized = this.normalizeProject(project);
    this.selectedProject = normalized;
    this.selectedSprint = null;
    this.profileEditSnapshot = this.normalizeProject(normalized);
    this.projectForm = this.normalizeProject(normalized);
    this.selectedProjectTabIndex = 0;
    this.isProfileCreating = false;
    this.isProfileEditing = true;
    this.deliveryPlanChanged = false;
    this.projectSaveError = '';
    this.selectedUsers = [];
    this.selectedTeamIds = [];
    this.chipUserObjects = [];
    this.loadComposerResources(Number(project.id), project);
    this.generateSprintPreview();
    this.cdr.detectChanges();
  }

  public cancelProfileEdit(): void {
    if (this.isProfileCreating) {
      this.closeProjectDetails();
      return;
    }
    if (this.profileEditSnapshot) {
      this.projectForm = this.normalizeProject(this.profileEditSnapshot);
      this.selectedTeamIds = this.projectForm.associatedTeamIds.map(String);
      this.selectedUsers = this.projectForm.associatedUserIds.map(Number);
      this.rebuildChipsMatrix();
    }
    this.selectedProjectTabIndex = 0;
    this.isProfileEditing = false;
    this.cdr.detectChanges();
  }

  public saveProfileProject(): void {
    if (!this.projectForm.name?.trim() || this.isSaving || this.isLoadingResources || this.allocationLoadError) return;
    this.generateSprintPreview();
    this.commitProjectToSystem();
  }

  public createMissingProjectSprints(): void {
    const id = Number(this.selectedProject?.id);
    if (!id || this.isSaving || this.isProfileEditing) return;
    this.projectForm = this.normalizeProject(this.selectedProject);
    this.deliveryPlanChanged = false;
    this.generateSprintPreview();
    this.isSaving = true;
    this.projectSaveError = '';
    this.saveProjectSprints(id, true).pipe(finalize(() => {
      this.isSaving = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => this.loadSprintsBackground(id),
      error: error => { this.projectSaveError = 'Unable to create sprints: ' + (error?.error?.message || error.message); }
    });
  }

  /* ============================================================
     SPRINT DETAILS
  ============================================================ */

  public openSprintDetails(
    sprint: SprintItem
  ): void {

    this.selectedSprint =
      sprint;
    const projectId=Number(sprint.project_id || this.selectedProject?.id);
    if(projectId) this.loadProjectWork(projectId);

    this.selectedProject =
      null;

    document.body.classList.add(
      'projects-popup-open'
    );

    this.cdr.detectChanges();
  }


  public closeSprintDetails(): void {

    this.selectedSprint =
      null;

    document.body.classList.remove(
      'projects-popup-open'
    );

    this.cdr.detectChanges();
  }


  private clearSelectedDetails(): void {

    this.selectedProject =
      null;

    this.selectedSprint =
      null;

    document.body.classList.remove(
      'projects-popup-open'
    );
  }


  /* ============================================================
     PROJECT FORM
  ============================================================ */

  resetProjectForm(): void {

    this.projectForm = {

      product_id: null,

      name: '',

      project_code: '',

      description: '',

      status: 'ACTIVE',

      methodology:
        'AGILE_SCRUM',

      priority:
        'MEDIUM',

      total_backlog_points:
        120,

      sprint_duration_weeks:
        2,

      target_velocity:
        30,

      auto_rollover_backlog:
        true,

      computed_sprint_count:
        0,

      computed_total_duration_weeks:
        0,

      associatedTeamIds: [],

      associatedUserIds: []

    };

  }


  public initiateNewProject(): void {
    this.resetProjectForm();
    this.selectedUsers = [];
    this.selectedTeamIds = [];
    this.chipUserObjects = [];
    this.projectForm.associatedUserIds = [];
    this.projectForm.associatedTeamIds = [];
    this.activeBuilderStep = 1;
    this.isComposerOpen = false;
    this.isProfileCreating = true;
    this.isProfileEditing = true;
    this.deliveryPlanChanged = true;
    this.projectSaveError = '';
    this.selectedProjectTabIndex = 0;
    this.selectedSprint = null;
    this.profileEditSnapshot = null;
    this.selectedProject = this.normalizeProject(this.projectForm);
    this.generateSprintPreview();
    this.loadComposerResources();
    this.cdr.detectChanges();
  }


  public loadProjectToComposer(
    project: StrategicInitiative
  ): void {

    this.projectForm = {
      ...project,
      associatedTeamIds: [],
      associatedUserIds: []
    };

    this.selectedUsers = [];

    this.selectedTeamIds = [];

    this.chipUserObjects = [];

    this.activeBuilderStep = 1;

    this.isComposerOpen = true;

    this.calculateAgileMetrics();

    if (project.id) {
      this.loadComposerResources(
        Number(project.id),
        project
      );
    } else {
      this.loadComposerResources();
    }

    this.cdr.detectChanges();
  }


  public closeComposerDrawer(): void {

    // Do not allow backdrop/cancel actions to dismiss the composer while
    // the project and its related resources are still being persisted.
    if (this.isSaving) {
      return;
    }

    this.isComposerOpen = false;
  }


  /* ============================================================
     WIZARD
  ============================================================ */

  public setBuilderStep(
    step: number
  ): void {

    if (
      step < 1 ||
      step > 4
    ) {
      return;
    }

    this.activeBuilderStep =
      step;

    if (step === 2) {
      this.rebuildChipsMatrix();
    }

    if (step === 3) {
      this.calculateAgileMetrics();
    }

    if (step === 4) {
      this.generateSprintPreview();
    }

    this.cdr.detectChanges();
  }


  public nextBuilderStep(): void {

    if (
      this.activeBuilderStep >= 4
    ) {
      return;
    }

    this.activeBuilderStep++;

    if (
      this.activeBuilderStep === 2
    ) {
      this.rebuildChipsMatrix();
    }

    if (
      this.activeBuilderStep === 3
    ) {
      this.calculateAgileMetrics();
    }

    if (
      this.activeBuilderStep === 4
    ) {
      this.generateSprintPreview();
    }

    this.cdr.detectChanges();
  }


  public previousBuilderStep(): void {

    if (
      this.activeBuilderStep <= 1
    ) {
      return;
    }

    this.activeBuilderStep--;

    this.cdr.detectChanges();
  }


  /* ============================================================
     AGILE CALCULATIONS
  ============================================================ */

  public calculateAgileMetrics(): void {

    if (!this.projectForm) {
      return;
    }

    const rawPoints =
      Math.max(
        0,
        Number(
          this.projectForm
            .total_backlog_points
        ) || 0
      );

    const velocity =
      Math.max(
        1,
        Number(
          this.projectForm
            .target_velocity
        ) || 1
      );

    const durationWeeks =
      Math.max(
        1,
        Number(
          this.projectForm
            .sprint_duration_weeks
        ) || 1
      );

    const scopeBuffer =
      Number(
        this.agileTuning
          .scopeBufferPercent
      ) || 0;

    const bufferedPoints =
      Math.round(
        rawPoints *
        (
          1 +
          scopeBuffer / 100
        )
      );

    const focusFactor =
      Math.max(
        0.01,
        Number(
          this.agileTuning
            .focusFactor
        ) || 0.8
      );

    const effectiveVelocity =
      Math.max(
        1,
        Math.round(
          velocity *
          focusFactor
        )
      );

    this.projectForm
      .computed_sprint_count =
      bufferedPoints > 0
        ? Math.ceil(
          bufferedPoints /
          effectiveVelocity
        )
        : 0;

    this.projectForm
      .computed_total_duration_weeks =
      this.projectForm
        .computed_sprint_count *
      durationWeeks;

    this.cdr.detectChanges();
  }


  public generateSprintPreview(): void {

    this.activeCalibrationTab =
      'preview';

    this.isLoadingPreview =
      true;

    try {

      this.calculateAgileMetrics();

      const rawPoints =
        Math.max(
          0,
          Number(
            this.projectForm
              .total_backlog_points
          ) || 0
        );

      const velocity =
        Math.max(
          1,
          Number(
            this.projectForm
              .target_velocity
          ) || 1
        );

      const durationWeeks =
        Math.max(
          1,
          Number(
            this.projectForm
              .sprint_duration_weeks
          ) || 1
        );

      const scopeBuffer =
        Number(
          this.agileTuning
            .scopeBufferPercent
        ) || 0;

      let remainingPoints =
        Math.round(
          rawPoints *
          (
            1 +
            scopeBuffer / 100
          )
        );

      const focusFactor =
        Math.max(
          0.01,
          Number(
            this.agileTuning
              .focusFactor
          ) || 0.8
        );

      const effectiveVelocity =
        Math.max(
          1,
          Math.round(
            velocity *
            focusFactor
          )
        );

      const totalSprintsNeeded =
        this.projectForm
          .computed_sprint_count || 0;

      const mockSprintsArray: any[] =
        [];

      let currentIterationStartDate:
        Date;

      if (
        this.previewStartDate
        instanceof Date
      ) {

        currentIterationStartDate =
          new Date(
            this.previewStartDate
              .getTime()
          );

      } else if (
        typeof this.previewStartDate ===
        'string' &&
        this.previewStartDate.trim()
      ) {

        currentIterationStartDate =
          new Date(
            this.previewStartDate
          );

      } else {

        currentIterationStartDate =
          new Date();

      }

      if (
        isNaN(
          currentIterationStartDate
            .getTime()
        )
      ) {

        currentIterationStartDate =
          new Date();

      }


      const prefixCode =
        this.projectForm
          .project_code
          ?.trim()
          ? `${this.projectForm.project_code.trim()}-`
          : '';


      for (
        let i = 1;
        i <= totalSprintsNeeded;
        i++
      ) {

        const sprintTargetPoints =
          Math.min(
            remainingPoints,
            effectiveVelocity
          );

        remainingPoints =
          Math.max(
            0,
            remainingPoints -
            sprintTargetPoints
          );


        const currentIterationEndDate =
          new Date(
            currentIterationStartDate
          );

        currentIterationEndDate
          .setDate(
            currentIterationEndDate
              .getDate() +
            (
              durationWeeks *
              7
            ) -
            1
          );


        const existing = this.globalSprintsCollection.find(sprint =>
          Number(sprint.project_id) === Number(this.projectForm.id) && sprint.sprint_number === i);


        mockSprintsArray.push({

          id: existing?.id,
          project_id: this.projectForm.id,

          sprint_number: i,

          name:
            existing?.name || `${prefixCode}SPRINT-${i} (Cycle ${i})`,

          status:
            'PLANNED',

          scheduled_start_date:
            currentIterationStartDate
              .toISOString()
              .split('T')[0],

          scheduled_end_date:
            currentIterationEndDate
              .toISOString()
              .split('T')[0],

          duration_weeks:
            durationWeeks,

          target_velocity:
            sprintTargetPoints,

          activation_type:
            this.previewActivationType

        });


        const nextSprintStartDate =
          new Date(
            currentIterationEndDate
          );

        nextSprintStartDate
          .setDate(
            nextSprintStartDate
              .getDate() + 1
          );

        currentIterationStartDate =
          nextSprintStartDate;
      }


      this.calculatedSprintsPreview =
        mockSprintsArray;

    } catch (err) {

      console.error(
        'Failed generating sprint preview:',
        err
      );

      this.calculatedSprintsPreview =
        [];

    } finally {

      this.isLoadingPreview =
        false;

      this.cdr.detectChanges();

    }

  }


  /* ============================================================
     SAVE PROJECT
  ============================================================ */

  public commitProjectToSystem(): void {

    // A synchronous guard prevents duplicate POSTs even if the user clicks
    // repeatedly before Angular has rendered the disabled button.
    if (this.isSaving) {
      return;
    }

    this.generateSprintPreview();

    this.isSaving = true;
    this.projectSaveError = '';
    this.projectSaveStage = 'project details';

    const isExistingProject =
      !!this.projectForm.id;

    const numericTeamIds = this.selectedTeamIds
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0);

    const numericUserIds = this.selectedUsers
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0);

    // Snapshot all form values before starting network requests so the
    // payload cannot change while the save is in progress.
    const body = {
      ...this.projectForm,
      associatedTeamIds: [...numericTeamIds],
      associatedUserIds: [...numericUserIds],
      previewStartDate: this.previewStartDate,
      previewActivationType: this.previewActivationType
    };

    let savedProjectSnapshot: any = null;
    const request$ = isExistingProject
      ? this.http.put(
          `${this.baseUrl}/projects/${this.projectForm.id}`,
          body,
          { headers: this.auth.getAuthHeaders() }
        )
      : this.http.post(
          `${this.baseUrl}/projects/create`,
          body,
          { headers: this.auth.getAuthHeaders() }
        );

    request$
      .pipe(
        switchMap((projectRes: any) => {
          this.requireSaveSuccess(projectRes, 'Project');

          const responseData =
            projectRes?.data ||
            projectRes;
          savedProjectSnapshot = responseData?.project || responseData;

          const confirmedProjectId = Number(
            this.projectForm.id ||
            responseData?.id ||
            responseData?.project_id ||
            responseData?.projectId
          );

          if (
            !Number.isFinite(confirmedProjectId) ||
            confirmedProjectId <= 0
          ) {
            throw new Error(
              'Could not resolve project ID.'
            );
          }
          // A retry after a related-resource failure must update this project,
          // rather than create a second project with the same draft.
          this.projectForm.id = confirmedProjectId;
          if (this.selectedProject) this.selectedProject.id = confirmedProjectId;

          const headers = this.auth.getAuthHeaders();
          // Complete allocations first so a sprint error cannot cancel member persistence.
          this.projectSaveStage = 'team allocations';
          return this.http.post<any>(`${this.baseUrl}/project-teams/sync`,
            {project_id: confirmedProjectId, team_ids: numericTeamIds}, {headers}).pipe(
            map(response => this.requireSaveSuccess(response, 'Team allocations')),
            switchMap(() => {
              this.projectSaveStage = 'individual members';
              return this.http.post<any>(`${this.baseUrl}/project-individuals/sync`,
                {project_id: confirmedProjectId, user_account_ids: numericUserIds}, {headers});
            }),
            map(response => {
              this.requireSaveSuccess(response, 'Individual members');
              const count = response?.data?.allocated_individuals_count;
              if (count != null && Number(count) !== numericUserIds.length)
                throw new Error('The API did not save every selected individual member.');
              return response;
            }),
            switchMap(() => {
              this.projectSaveStage = 'sprints';
              return this.saveProjectSprints(confirmedProjectId, isExistingProject);
            })
          );

        }),
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({

        next: () => {
          this.isComposerOpen = false;
          this.sprintLoadError = '';
          if (this.selectedProject && savedProjectSnapshot) {
            const created = this.normalizeProject({
              ...body,
              ...savedProjectSnapshot,
              id: savedProjectSnapshot?.id ?? savedProjectSnapshot?.project_id ?? savedProjectSnapshot?.projectId ?? this.projectForm.id,
              associatedTeamIds: numericTeamIds.map(String),
              associatedUserIds: [...numericUserIds]
            });
            this.selectedProject = created;
            this.projectForm = this.normalizeProject(created);
            this.profileEditSnapshot = this.normalizeProject(created);
            this.isProfileCreating = false;
            this.isProfileEditing = false;
            this.deliveryPlanChanged = false;
            this.selectedProjectTabIndex = this.openPlanningAfterCreate ? 4 : 0;
            this.planningVisited = this.openPlanningAfterCreate;
            this.openPlanningAfterCreate = false;
            this.loadComposerResources(Number(created.id), created);
            this.loadSprintsBackground(Number(created.id));
          }
          this.projectsRefresh$.next();
          this.cdr.detectChanges();
        },

        error: err => {
          this.projectSaveError = `Unable to save ${this.projectSaveStage}: ${err?.error?.message || err?.message || 'Please try again.'}`;
          console.error(
            'Failed saving project:',
            err,
            err?.error
          );
        }

      });

  }


  private buildSprintPersistencePayload(
    projectId: number,
    sprint: any
  ): Record<string, any> {

    return {
      project_id: projectId,
      sprint_number:
        Number(sprint?.sprint_number) || 1,
      name:
        String(
          sprint?.name ||
          `Sprint ${sprint?.sprint_number || 1}`
        ).trim(),
      status:
        this.toBackendSprintStatus(
          sprint?.status ||
          'PLANNED'
        ),
      start_date:
        sprint?.scheduled_start_date ||
        sprint?.scheduledStartDate ||
        sprint?.start_date ||
        sprint?.startDate ||
        null,
      end_date:
        sprint?.scheduled_end_date ||
        sprint?.scheduledEndDate ||
        sprint?.end_date ||
        sprint?.endDate ||
        null,
      scheduled_start_date:
        sprint?.scheduled_start_date ||
        sprint?.scheduledStartDate ||
        sprint?.start_date ||
        sprint?.startDate ||
        null,
      scheduled_end_date:
        sprint?.scheduled_end_date ||
        sprint?.scheduledEndDate ||
        sprint?.end_date ||
        sprint?.endDate ||
        null,
      duration_weeks:
        Number(sprint?.duration_weeks) ||
        Number(sprint?.durationWeeks) ||
        2,
      target_velocity:
        Number(sprint?.target_velocity) ||
        Number(sprint?.targetVelocity) ||
        0,
      activation_type:
        this.toBackendActivationType(
          sprint?.activation_type ??
          sprint?.activationType
        )
    };

  }


  private requireSaveSuccess(response: any, label: string): any {
    if (response?.success === false) throw new Error(response?.message || label + ' could not be saved.');
    return response;
  }

  private saveProjectSprints(projectId: number, isExistingProject: boolean): Observable<any> {
    const headers = this.auth.getAuthHeaders();
    const existing$ = isExistingProject
      ? this.http.get<any>(`${this.baseUrl}/sprints?project_id=${projectId}`, {headers})
      : of([]);
    return existing$.pipe(
      map(response => this.requireSaveSuccess(response, 'Sprint list')),
      switchMap(response => {
        const existing = this.extractApiArray(response).map(row => this.normalizeSprint(row)).filter((row): row is SprintItem => !!row);
        const byNumber = new Map(existing.map(sprint => [sprint.sprint_number, sprint]));
        const operations: Observable<any>[] = [];
        for (const preview of this.calculatedSprintsPreview) {
          const saved = byNumber.get(Number(preview.sprint_number));
          const payload = this.buildSprintPersistencePayload(projectId, preview);
          if (!saved) {
            operations.push(this.http.post<any>(`${this.baseUrl}/sprints/create`, payload, {headers}));
          } else if (this.deliveryPlanChanged && saved.status === 'PLANNED' && saved.id) {
            operations.push(this.http.put<any>(`${this.baseUrl}/sprints/${saved.id}`, payload, {headers}));
          }
        }
        // Fill missing cycles without deleting existing sprints or their assigned work.
        return from(operations).pipe(
          concatMap(operation => operation.pipe(map(response => this.requireSaveSuccess(response, 'Sprint')))),
          toArray()
        );
      })
    );
  }


  /* ============================================================
     DELETE / ARCHIVE
  ============================================================ */

  public decommissionProject(
    projectId: any
  ): void {

    if (
      !confirm(
        'Are you sure you want to archive this project?'
      )
    ) {
      return;
    }


    this.http.delete(
      `${this.baseUrl}/projects/${projectId}`,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    )
    .subscribe({

      next: () =>
        this.projectsRefresh$.next(),

      error: err =>
        console.error(
          'Failed processing project archive:',
          err
        )

    });

  }


  /* ============================================================
     SPRINT MATRIX
  ============================================================ */

  private buildGlobalSprintsMatrix(
    projects: StrategicInitiative[]
  ): void {

    this.currentProjectsCache =
      projects;

    this.refreshSprintProjectNames();

  }


  loadSprintsBackground(
    projectId?: number
  ): void {

    this.sprintLoadError = '';

    const requestSequence =
      ++this.sprintLoadSequence;

    const url =
      projectId != null
        ? `${this.baseUrl}/sprints?project_id=${Number(projectId)}`
        : `${this.baseUrl}/sprints`;

    this.http.get<any>(
      url,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    )
    .pipe(
      map((res: any) =>
        this.extractApiArray(res)
      ),
      catchError(err => {

        // Never let an older request replace the result of a newer
        // project/global sprint navigation action.
        if (requestSequence === this.sprintLoadSequence) {
          this.sprintLoadError =
            err?.error?.message ||
            err?.error?.msg ||
            'Unable to load sprints.';
        }

        console.error(
          'Failed loading sprints:',
          err,
          err?.error
        );

        return of([] as any[]);
      })
    )
    .subscribe((raw: any[]) => {

      // Ignore stale HTTP responses. This is important because the
      // Projects page can trigger a global sprint load while the user
      // immediately navigates into a project-specific sprint view.
      if (requestSequence !== this.sprintLoadSequence) {
        return;
      }

      this.globalSprintsCollection =
        (Array.isArray(raw) ? raw : [])
          .map((item: any) =>
            this.normalizeSprint(item)
          )
          .filter(
            (
              item: SprintItem | null
            ): item is SprintItem =>
              !!item &&
              item.id !== null &&
              item.id !== undefined
          );

      this.refreshSprintProjectNames();

      if (projectId != null) {
        this.activeProjectFilterId =
          Number(projectId);

        const project =
          this.currentProjectsCache.find(
            item =>
              Number(item.id) ===
              Number(projectId)
          );

        if (project) {
          this.activeProjectFilterCode =
            project.project_code || '';
        }
      }

      this.cdr.detectChanges();

    });

  }


  private extractApiArray(
    response: any
  ): any[] {

    const candidates = [
      response,
      response?.data,
      response?.users,
      response?.data?.users,
      response?.teams,
      response?.data?.teams,
      response?.members,
      response?.data?.members,
      response?.individuals,
      response?.data?.individuals,
      response?.teamIds,
      response?.data?.teamIds,
      response?.sprints,
      response?.data?.sprints,
      response?.data?.data,
      response?.result,
      response?.result?.data,
      response?.content,
      response?.data?.content,
      ...Object.values(response?._embedded || {}),
      ...Object.values(response?.data?._embedded || {})
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];

  }

  private normalizeSprintStatus(
    status: any
  ): SprintItem['status'] {

    const value = String(
      status || 'PLANNED'
    )
      .trim()
      .toUpperCase();

    switch (value) {
      case 'ACTIVE':
      case 'CURRENT':
        return 'CURRENT';
      case 'PAUSED':
      case 'ON_HOLD':
        return 'ON_HOLD';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'PLANNED':
      default:
        return 'PLANNED';
    }

  }


  private toBackendSprintStatus(
    status: any
  ): 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'PAUSED' {

    switch (
      this.normalizeSprintStatus(status)
    ) {
      case 'CURRENT':
        return 'ACTIVE';
      case 'ON_HOLD':
        return 'PAUSED';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'PLANNED':
      default:
        return 'PLANNED';
    }

  }


  private toBackendActivationType(
    activationType: any
  ): 'AUTOMATIC' | 'MANUAL' {

    return String(
      activationType || 'AUTOMATIC'
    )
      .trim()
      .toUpperCase() === 'MANUAL'
      ? 'MANUAL'
      : 'AUTOMATIC';

  }


  private normalizeSprint(
    item: any
  ): SprintItem | null {

    if (!item) {
      return null;
    }

    const projectId =
      item?.project_id ??
      item?.projectId ?? item?.project?.id;

    return {

      id:
        item?.id ??
        item?.sprint_id,

      project_id:
        projectId != null
          ? Number(projectId)
          : undefined,

      projectCode:
        String(
          item?.projectCode ??
          item?.project_code ??
          item?.project?.project_code ??
          'PRJ'
        ),

      projectName:
        String(
          item?.projectName ??
          item?.project_name ??
          item?.project?.name ??
          'Project'
        ),

      sprint_number:
        Number(
          item?.sprint_number ??
          item?.sprintNumber ??
          1
        ),

      name:
        String(
          item?.name ??
          item?.sprint_name ??
          ''
        ),

      status:
        this.normalizeSprintStatus(
          item?.status
        ),

      scheduled_start_date:
        String(
          item?.scheduled_start_date ??
          item?.scheduledStartDate ??
          item?.start_date ??
          item?.startDate ??
          ''
        ),

      scheduled_end_date:
        String(
          item?.scheduled_end_date ??
          item?.scheduledEndDate ??
          item?.end_date ??
          item?.endDate ??
          ''
        ),

      duration_weeks:
        Number(
          item?.duration_weeks ??
          item?.durationWeeks ??
          2
        ),

      target_velocity:
        Number(
          item?.target_velocity ??
          item?.targetVelocity ??
          0
        ),

      completedPoints:
        Number(
          item?.completedPoints ??
          item?.completed_points ??
          0
        ),

      activation_type:
        this.toBackendActivationType(
          item?.activation_type ??
          item?.activationType
        ),

      description:
        item?.description

    };

  }


  private refreshSprintProjectNames(): void {

    const projects =
      this.currentProjectsCache || [];

    this.globalSprintsCollection =
      this.globalSprintsCollection.map(
        sprint => {

          const project =
            projects.find(
              item =>
                Number(item.id) ===
                Number(sprint.project_id)
            );

          return {
            ...sprint,
            projectCode:
              project?.project_code ||
              sprint.projectCode ||
              'PRJ',
            projectName:
              project?.name ||
              sprint.projectName ||
              'Project'
          };

        }
      );

  }


  public getSprintProgress(
    sprint: SprintItem
  ): number {

    if (!sprint.target_velocity) {
      return 0;
    }

    const pct =
      Math.round(
        (
          (
            sprint.completedPoints ||
            0
          ) /
          sprint.target_velocity
        ) * 100
      );

    return Math.min(
      100,
      Math.max(0, pct)
    );

  }


  public startSprint(
    sprint: SprintItem
  ): void {

    if (!sprint.id) {
      return;
    }

    const previousStatus =
      sprint.status;

    const payload = {
      name:
        sprint.name,
      status:
        'ACTIVE',
      start_date:
        sprint.scheduled_start_date,
      end_date:
        sprint.scheduled_end_date,
      scheduled_start_date:
        sprint.scheduled_start_date,
      scheduled_end_date:
        sprint.scheduled_end_date,
      activation_type:
        this.toBackendActivationType(
          sprint.activation_type
        ),
      is_current:
        true
    };

    this.http.put(
      `${this.baseUrl}/sprints/${sprint.id}`,
      payload,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    )
    .subscribe({

      next: (res: any) => {

        const updated =
          this.normalizeSprint(
            res?.data || res
          );

        sprint.status =
          updated?.status || 'CURRENT';

        this.closeSprintDetails();
        this.loadSprintsBackground(
          this.activeProjectFilterId ?? undefined
        );

      },

      error: err => {

        sprint.status =
          previousStatus;

        console.error(
          'Failed starting sprint:',
          err,
          err?.error
        );

        this.cdr.detectChanges();

      }

    });

  }


  public completeSprint(
    sprint: SprintItem
  ): void {

    if (!sprint.id) {
      return;
    }

    const previousStatus =
      sprint.status;

    const previousCompletedPoints =
      sprint.completedPoints;

    const payload = {
      name:
        sprint.name,
      status:
        'COMPLETED',
      start_date:
        sprint.scheduled_start_date,
      end_date:
        sprint.scheduled_end_date,
      scheduled_start_date:
        sprint.scheduled_start_date,
      scheduled_end_date:
        sprint.scheduled_end_date,
      activation_type:
        this.toBackendActivationType(
          sprint.activation_type
        ),
      is_current:
        false
    };

    this.http.put(
      `${this.baseUrl}/sprints/${sprint.id}`,
      payload,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    )
    .subscribe({

      next: (res: any) => {

        const updated =
          this.normalizeSprint(
            res?.data || res
          );

        sprint.status =
          updated?.status || 'COMPLETED';

        sprint.completedPoints =
          sprint.target_velocity;

        this.closeSprintDetails();
        this.loadSprintsBackground(
          this.activeProjectFilterId ?? undefined
        );

      },

      error: err => {

        sprint.status =
          previousStatus;

        sprint.completedPoints =
          previousCompletedPoints;

        console.error(
          'Failed completing sprint:',
          err,
          err?.error
        );

        this.cdr.detectChanges();

      }

    });

  }


  public openCreateSprintModal(): void {

    this.editingSprintId =
      null;

    this.sprintForm = {

      name:
        '',

      projectCode:
        this.activeProjectFilterCode ||
        'PRJ',

      project_id:
        this.currentProjectsCache.find(
          project =>
            project.project_code ===
            this.activeProjectFilterCode
        )?.id,

      sprint_number:
        this.getNextSprintNumber(),

      target_velocity:
        30,

      duration_weeks:
        2,

      scheduled_start_date:
        new Date()
          .toISOString()
          .split('T')[0],

      scheduled_end_date:
        new Date(
          Date.now() +
          14 *
          86400000
        )
          .toISOString()
          .split('T')[0],

      status:
        'PLANNED',

      activation_type:
        this.previewActivationType

    };

    this.isSprintModalOpen =
      true;

    this.cdr.detectChanges();

  }


  private getNextSprintNumber(): number {

    const projectCode =
      this.activeProjectFilterCode;

    const projectSprints =
      projectCode
        ? this.globalSprintsCollection.filter(
            sprint =>
              sprint.projectCode ===
              projectCode
          )
        : this.globalSprintsCollection;

    if (!projectSprints.length) {
      return 1;
    }

    return Math.max(
      ...projectSprints.map(
        sprint =>
          Number(sprint.sprint_number) || 0
      )
    ) + 1;

  }


  public editSprint(
    sprint: SprintItem
  ): void {

    this.editingSprintId =
      sprint.id;

    this.sprintForm = {
      ...sprint,
      status: sprint.status,
      activation_type: sprint.activation_type
    };

    this.isSprintModalOpen =
      true;

    this.cdr.detectChanges();

  }


  public saveSprintModal(): void {

    if (!this.sprintForm.name?.trim()) {
      return;
    }

    const projectId =
      Number(
        this.sprintForm.project_id ??
        this.projectForm?.id ??
        this.currentProjectsCache.find(
          project =>
            project.project_code ===
            this.sprintForm.projectCode
        )?.id
      );

    if (
      !Number.isFinite(projectId) ||
      projectId <= 0
    ) {
      console.error(
        'Cannot save sprint: project ID could not be resolved.'
      );
      return;
    }

    const status =
      this.toBackendSprintStatus(
        this.sprintForm.status ||
        'PLANNED'
      );

    const activationType =
      this.toBackendActivationType(
        this.sprintForm.activation_type ||
        'AUTOMATIC'
      );

    const payload: any = {
      project_id: projectId,
      name:
        this.sprintForm.name.trim(),
      sprint_number:
        Number(this.sprintForm.sprint_number) || 1,
      status,
      start_date:
        this.sprintForm.scheduled_start_date,
      end_date:
        this.sprintForm.scheduled_end_date,
      scheduled_start_date:
        this.sprintForm.scheduled_start_date,
      scheduled_end_date:
        this.sprintForm.scheduled_end_date,
      duration_weeks:
        Number(this.sprintForm.duration_weeks) || 2,
      target_velocity:
        Number(this.sprintForm.target_velocity) || 0,
      activation_type:
        activationType
    };

    const request$ =
      this.editingSprintId
        ? this.http.put(
            `${this.baseUrl}/sprints/${this.editingSprintId}`,
            payload,
            {
              headers:
                this.auth.getAuthHeaders()
            }
          )
        : this.http.post(
            `${this.baseUrl}/sprints/create`,
            payload,
            {
              headers:
                this.auth.getAuthHeaders()
            }
          );

    request$
      .subscribe({

        next: (res: any) => {

          this.isSprintModalOpen =
            false;

          this.loadSprintsBackground(
            this.activeProjectFilterId != null
              ? this.activeProjectFilterId
              : projectId
          );

          this.cdr.detectChanges();

        },

        error: err => {
          console.error(
            'Failed saving sprint:',
            err,
            err?.error
          );
        }

      });

  }


  public deleteSprint(
    sprintId:
      string | number
  ): void {

    if (
      !confirm(
        'Are you sure you want to remove this sprint?'
      )
    ) {
      return;
    }


    this.globalSprintsCollection =
      this.globalSprintsCollection
        .filter(
          sprint =>
            sprint.id !==
            sprintId
        );


    this.http.delete(
      `${this.baseUrl}/sprints/${sprintId}`,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    )
    .pipe(
      catchError(() =>
        of(null)
      )
    )
    .subscribe(
      () =>
        this.cdr.detectChanges()
    );

  }


  /* ============================================================
     PRODUCTS
  ============================================================ */

  private loadProductsBackground(): void {

    this.http.get<any>(
      `${this.baseUrl}/products`,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    )
    .subscribe({

      next: res => {

        this.systemProducts =
          res?.data ||
          res ||
          [];

        this.cdr.detectChanges();

      },

      error: err =>
        console.error(
          'Failed loading products:',
          err
        )

    });

  }


  public getProductName(
    productId: number | null
  ): string {

    if (!productId) {
      return 'Unassigned Workspace';
    }

    const match =
      this.systemProducts
        .find(
          product =>
            Number(product.id) ===
            Number(productId)
        );

    return match
      ? match.name
      : `Product #${productId}`;

  }


  /* ============================================================
     USERS
  ============================================================ */

  private loadUsersBackground(): void {

    this.http.get<any>(
      `${this.baseUrl}/users`,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    )
    .subscribe({

      next: res => {

        this.organizationPersonnel =
          this.extractApiArray(res)
            .map((user: any) =>
              this.normalizeUser(user)
            )
            .filter((user: UserAccountNode) =>
              Number.isFinite(Number(user.id)) &&
              Number(user.id) > 0
            );

        this.usersSubject$.next(
          this.organizationPersonnel
        );

        this.hydrateTeamMembersFromUsers();

        this.rebuildChipsMatrix();

        this.cdr.detectChanges();

      },

      error: err =>
        console.error(
          'Failed loading users from /users:',
          err
        )

    });

  }


  /* ============================================================
     TEAMS
  ============================================================ */

  private loadTeamsBackground(): void {

    /*
     * GET /api/teams already returns the team collection.
     * Do not fan out into /team-members for the project selector.
     */
    this.http.get<any>(
      `${this.baseUrl}/teams`,
      {
        headers:
          this.auth.getAuthHeaders()
      }
    )
    .subscribe({

      next: res => {

        const teams =
          this.extractApiArray(res);

        this.liveActiveTeams =
          teams.map((team: any) =>
            this.normalizeTeam(team)
          );

        this.hydrateTeamMembersFromUsers();

        this.rebuildChipsMatrix();

        this.cdr.detectChanges();

      },

      error: err =>
        console.error(
          'Failed loading teams from /teams:',
          err
        )

    });

  }


  /* ============================================================
     PROJECT COMPOSER RESOURCES
  ============================================================ */

  private loadComposerResources(
    projectId?: number,
    project?: StrategicInitiative
  ): void {

    this.isLoadingResources = true;
    this.allocationLoadError = '';
    const requestSequence = ++this.composerLoadSequence;

    const users$ =
      this.http.get<any>(
        `${this.baseUrl}/users`,
        {
          headers:
            this.auth.getAuthHeaders()
        }
      )
      .pipe(
        map((res: any) => ({
          ok: true,
          rows: this.extractApiArray(res)
        })),
        catchError(err => {

          console.error(
            'Failed loading composer users:',
            err,
            err?.error
          );

          return of({
            ok: false,
            rows: [] as any[]
          });

        })
      );

    const teams$ =
      this.http.get<any>(
        `${this.baseUrl}/teams`,
        {
          headers:
            this.auth.getAuthHeaders()
        }
      )
      .pipe(
        map((res: any) => ({
          ok: true,
          rows: this.extractApiArray(res)
        })),
        catchError(err => {

          console.error(
            'Failed loading composer teams:',
            err,
            err?.error
          );

          return of({
            ok: false,
            rows: [] as any[]
          });

        })
      );

    const individuals$ =
      projectId != null
        ? this.http.get<any>(
            `${this.baseUrl}/project-individuals/${projectId}`,
            {
              headers:
                this.auth.getAuthHeaders()
            }
          )
          .pipe(
            map((res: any) => ({
              ok: true,
              rows: this.extractApiArray(res)
            })),
            catchError(err => {

              console.error(
                `Failed loading project ${projectId} users:`,
                err,
                err?.error
              );

              return of({
                ok: false,
                rows: [] as any[]
              });

            })
          )
        : of({
            ok: true,
            rows: [] as any[]
          });

    const projectTeams$ =
      projectId != null
        ? this.http.get<any>(
            `${this.baseUrl}/project-teams/${projectId}`,
            {
              headers:
                this.auth.getAuthHeaders()
            }
          )
          .pipe(
            map((res: any) => ({
              ok: true,
              rows: this.extractApiArray(res)
            })),
            catchError(err => {

              console.error(
                `Failed loading project ${projectId} teams:`,
                err,
                err?.error
              );

              return of({
                ok: false,
                rows: [] as any[]
              });

            })
          )
        : of({
            ok: true,
            rows: [] as any[]
          });

    forkJoin({
      users: users$,
      teams: teams$,
      individuals: individuals$,
      projectTeams: projectTeams$
    })
    .pipe(
      finalize(() => {
        if (requestSequence !== this.composerLoadSequence) return;

        this.isLoadingResources = false;

        this.hydrateTeamMembersFromUsers();

        this.rebuildChipsMatrix();

        this.cdr.detectChanges();

      })
    )
    .subscribe((result: any) => {
      if (requestSequence !== this.composerLoadSequence) return;
      if (!result.users.ok || !result.teams.ok || !result.individuals.ok || !result.projectTeams.ok) {
        this.allocationLoadError = 'Some allocation data could not be loaded. Reopen this project before saving to preserve its assignments.';
      }

      /*
       * Canonical user list for the composer and the user-select dialog.
       */
      if (result.users.ok) {

        this.organizationPersonnel =
          result.users.rows
            .map((user: any) =>
              this.normalizeUser(user)
            )
            .filter((user: UserAccountNode) =>
              Number.isFinite(Number(user.id)) &&
              Number(user.id) > 0
            );

        this.usersSubject$.next(
          this.organizationPersonnel
        );

      }

      if (result.teams.ok) {

        this.liveActiveTeams =
          result.teams.rows
            .map((team: any) =>
              this.normalizeTeam(team)
            );

      }

      if (projectId != null) {

        const fallbackUserIds =
          Array.isArray(project?.associatedUserIds)
            ? project!.associatedUserIds
                .map(Number)
                .filter(id =>
                  Number.isFinite(id) &&
                  id > 0
                )
            : [];

        const fallbackTeamIds =
          Array.isArray(project?.associatedTeamIds)
            ? project!.associatedTeamIds
                .map(id =>
                  this.safeToString(id)
                )
                .filter(Boolean)
            : [];

        if (result.individuals.ok) {

          this.selectedUsers =
            result.individuals.rows
              .map((item: any) =>
                Number(
                  item?.user_account_id ??
                  item?.userAccountId ??
                  item?.user_id ??
                  item?.userId ??
                  item?.id ?? item ?? 0
                )
              )
              .filter((id: number) =>
                Number.isFinite(id) &&
                id > 0
              );

        } else {

          this.selectedUsers =
            [...fallbackUserIds];

        }

        if (result.projectTeams.ok) {

          this.selectedTeamIds =
            result.projectTeams.rows
              .map((item: any) =>
                this.safeToString(
                  item?.team_id ??
                  item?.teamId ??
                  item?.id ??
                  item
                )
              )
              .filter(Boolean);

        } else {

          this.selectedTeamIds =
            [...fallbackTeamIds];

        }

        this.projectForm.associatedUserIds =
          [...this.selectedUsers];

        this.projectForm.associatedTeamIds =
          [...this.selectedTeamIds];
        if (this.selectedProject) {
          this.selectedProject.associatedTeamIds = [...this.selectedTeamIds];
          this.selectedProject.associatedUserIds = [...this.selectedUsers];
          this.profileEditSnapshot = this.normalizeProject(this.selectedProject);
        }

      }

      this.hydrateTeamMembersFromUsers();

      this.rebuildChipsMatrix();

      this.cdr.detectChanges();

    });

  }


  private normalizeUser(
    user: any
  ): UserAccountNode {

    return {
      ...user,
      roleId: Number(user?.role_id ?? user?.roleId ?? user?.role?.id) || undefined,
      designation: String(user?.designation ?? user?.job_title ?? user?.jobTitle ?? user?.role_name ?? user?.roleName ?? user?.role?.name ?? ''),
      jobTitle: user?.jobTitle ?? user?.job_title,
      id:
        Number(
          user?.id ??
          user?.user_id ??
          user?.userId ??
          0
        ),

      name:
        user?.name || user?.fullName || [user?.firstName ?? user?.first_name, user?.lastName ?? user?.last_name].filter(Boolean).join(' ') ||
        user?.username ||
        user?.displayName ||
        user?.email ||
        'Unknown User',

      username:
        user?.username,

      email:
        user?.email ||
        'No email available',

      role:
        user?.role ||
        user?.role_name ||
        user?.roleName,

      profilePictureUrl:
        user?.profilePictureUrl ??
        user?.profile_picture_url ??
        user?.avatarUrl ??
        user?.avatar_url ??
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


  private normalizeTeam(
    team: any
  ): FunctionalTeamNode {

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

    const members =
      rawMembers
        .map((member: any) =>
          this.normalizeTeamMember(member)
        )
        .filter((member: UserAccountNode) =>
          Number.isFinite(Number(member.id)) &&
          Number(member.id) > 0
        );

    return {
      ...team,

      id:
        team?.id ??
        team?.team_id ??
        team?.teamId,

      name:
        team?.name ||
        team?.team_name ||
        'Unnamed Team',

      members,

      membersCount:
        members.length,

      isLoadingMembers:
        false
    };

  }


  private normalizeTeamMember(
    member: any
  ): UserAccountNode {

    const rawUser =
      member?.user ||
      member?.member ||
      {};

    const id =
      Number(
        member?.user_account_id ?? member?.userAccountId ?? member?.user_id ??
        member?.userId ??
        member?.memberId ??
        rawUser?.id ?? member?.id ?? (typeof member === 'number' ? member : undefined) ??
        0
      );

    const matchedUser =
      this.organizationPersonnel.find(
        user =>
          Number(user.id) === id
      );

    const merged =
      {
        ...(matchedUser || {}),
        ...(typeof rawUser === 'object'
          ? rawUser
          : {}),
        ...member
      };

    return this.normalizeUser({
      ...matchedUser,
      ...merged,
      id
    });

  }


  private hydrateTeamMembersFromUsers(): void {

    if (!this.liveActiveTeams.length) {
      return;
    }

    this.liveActiveTeams =
      this.liveActiveTeams.map(
        team => ({
          ...team,
          members:
            (team.members || [])
              .map((member: any) =>
                this.normalizeTeamMember(member)
              ),
          membersCount:
            (team.members || []).length
        })
      );

  }


  /* ============================================================
     USER DIALOG
  ============================================================ */

  public removeProfileMember(userId: number, event?: Event): void {
    event?.stopPropagation();
    const id = Number(userId);
    this.selectedUsers = this.selectedUsers.filter(selectedId => Number(selectedId) !== id);
    if (this.projectForm) {
      this.projectForm.associatedUserIds = (this.projectForm.associatedUserIds || [])
        .filter(selectedId => Number(selectedId) !== id);
    }
    this.rebuildChipsMatrix();
    this.cdr.detectChanges();
  }

  public openUserSelectionDialog(): void {

    const dialogRef =
      this.dialog.open(
        UserSelectDialog,
        {
          width: '1000px',

          data: {

            title: 'Add individual project members',

            users:
              this.organizationPersonnel,

            currentSelection:
              [
                ...this.selectedUsers
              ]

          }
        }
      );


    dialogRef
      .afterClosed()
      .subscribe(
        (
          result:
            number[] |
            undefined
        ) => {

          if (
            result !==
            undefined
          ) {

            this.selectedUsers =
              result.map(
                id =>
                  Number(id)
              );

            this.projectForm
              .associatedUserIds =
              [
                ...this.selectedUsers
              ];

            this.rebuildChipsMatrix();

            this.cdr.detectChanges();

          }

        }
      );

  }


  public onTeamSelectionChange(
    selection: any
  ): void {

    let rawValues: any[] =
      [];

    if (
      Array.isArray(selection)
    ) {

      rawValues =
        selection;

    } else if (
      selection &&
      Array.isArray(
        selection.value
      )
    ) {

      rawValues =
        selection.value;

    } else if (
      selection !== null &&
      selection !== undefined
    ) {

      rawValues =
        [selection];

    }


    this.selectedTeamIds =
      rawValues
        .map(
          value =>
            this.safeToString(
              value
            )
        )
        .filter(
          value =>
            value !== ''
        );


    this.projectForm
      .associatedTeamIds =
      [
        ...this.selectedTeamIds
      ];

    this.rebuildChipsMatrix();

    this.cdr.detectChanges();
  }


  public isTeamSelected(
    teamId:
      number | string
  ): boolean {

    return this.selectedTeamIds
      .includes(
        this.safeToString(
          teamId
        )
      );

  }


  public removeUserChip(
    userObj: any
  ): void {

    if (
      userObj.isFromTeam
    ) {
      return;
    }


    const index =
      this.selectedUsers
        .indexOf(
          userObj.id
        );


    if (
      index > -1
    ) {

      this.selectedUsers
        .splice(
          index,
          1
        );

      this.projectForm
        .associatedUserIds =
        [
          ...this.selectedUsers
        ];

      this.rebuildChipsMatrix();

      this.cdr.detectChanges();

    }

  }


  public rebuildChipsMatrix(): void {

    const temporaryChipsMap =
      new Map<
        number,
        {
          id: number;
          name: string;
          email: string;
          employeeCode: string;
          profilePictureUrl?: string | null;
          designation?: string | null;
          jobTitle?: string | null;
          title?: string | null;
          role?: string | null;
          isFromTeam: boolean;
          teamName?: string;
        }
      >();

    this.liveActiveTeams
      .forEach(team => {

        if (!team) {
          return;
        }

        const cleanTeamId =
          this.safeToString(team.id);

        if (
          this.selectedTeamIds.includes(cleanTeamId) &&
          Array.isArray(team.members)
        ) {

          team.members.forEach((member: any) => {

            const cleanId =
              Number(
                member?.id ??
                member?.user_id ??
                member?.userId ??
                member?.memberId ??
                0
              );

            if (
              !Number.isFinite(cleanId) ||
              cleanId <= 0
            ) {
              return;
            }

            const identity =
              this.getUserIdentity(
                cleanId,
                member
              );

            temporaryChipsMap.set(
              cleanId,
              {
                id: cleanId,
                name: identity.name,
                email: identity.email,
                employeeCode: identity.employeeCode,
                profilePictureUrl:
                  identity.profilePictureUrl,
                designation: this.memberDesignation(member),
                jobTitle: member?.jobTitle ?? null,
                title: member?.title ?? null,
                role: member?.role ?? null,
                isFromTeam: true,
                teamName:
                  team.name ||
                  'Team Member'
              }
            );

          });

        }

      });

    this.selectedUsers
      .forEach(id => {

        const cleanId =
          Number(id);

        if (
          !Number.isFinite(cleanId) ||
          cleanId <= 0
        ) {
          return;
        }

        const existing =
          temporaryChipsMap.get(
            cleanId
          );

        const identity =
          this.getUserIdentity(
            cleanId
          );

        temporaryChipsMap.set(
          cleanId,
          {
            id: cleanId,
            name: identity.name,
            email: identity.email,
            employeeCode: identity.employeeCode,
            profilePictureUrl:
              identity.profilePictureUrl,
            designation: existing?.designation ?? null,
            jobTitle: existing?.jobTitle ?? null,
            title: existing?.title ?? null,
            role: existing?.role ?? null,
            isFromTeam:
              existing?.isFromTeam ?? false,
            teamName:
              existing?.teamName
          }
        );

      });

    this.chipUserObjects =
      Array.from(
        temporaryChipsMap.values()
      );

  }


  private getUserIdentity(
    userId: number,
    fallbackUser?: any
  ): {
    name: string;
    email: string;
    employeeCode: string;
    profilePictureUrl?: string | null;
  } {

    const selectedUser =
      this.organizationPersonnel.find(
        user =>
          Number(user.id) ===
          Number(userId)
      );

    const merged =
      this.normalizeUser({
        ...(selectedUser || {}),
        ...(fallbackUser || {}),
        id: userId
      });

    return {
      name:
        merged.name ||
        `User ${userId}`,

      email:
        merged.email ||
        'No email available',

      employeeCode:
        this.getUserEmployeeCode(
          merged
        ),

      profilePictureUrl:
        merged.profilePictureUrl
    };

  }


  public getUserEmployeeCode(
    user: UserAccountNode | any
  ): string {

    const prefix =
      user?.employeeIdPrefix ??
      user?.employee_id_prefix ??
      '';

    const number =
      user?.employeeIdNumber ??
      user?.employee_id_number ??
      '';

    if (!prefix && !number) {
      return 'No employee code';
    }

    if (prefix && number) {
      return `${prefix}//${number}`;
    }

    return String(prefix || number);

  }


  public getInitials(
    name: string
  ): string {

    const value =
      (name || '')
        .trim();

    if (!value) {
      return '?';
    }

    const parts =
      value.split(/\s+/)
        .filter(Boolean);

    if (parts.length >= 2) {
      return (
        `${parts[0][0]}${parts[parts.length - 1][0]}`
      ).toUpperCase();
    }

    return parts[0][0].toUpperCase();

  }


  public hasUserAvatar(
    user: any
  ): boolean {

    return !!(
      user?.profilePictureUrl ??
      user?.profile_picture_url ??
      user?.avatarUrl ??
      user?.avatar_url
    );

  }


  public getUserAvatar(
    user: any
  ): string {

    const path =
      String(
        user?.profilePictureUrl ??
        user?.profile_picture_url ??
        user?.avatarUrl ??
        user?.avatar_url ??
        ''
      ).trim();

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

    const cleanPath =
      path.replace(/^\/+/, '');

    const cleanBase =
      this.baseUrl.endsWith('/')
        ? this.baseUrl.slice(0, -1)
        : this.baseUrl;

    return `${cleanBase}/${cleanPath}`;

  }





  /* ============================================================
     HELPERS
  ============================================================ */

  private safeToString(
    value: any
  ): string {

    return (
      value !== null &&
      value !== undefined
    )
      ? String(value).trim()
      : '';

  }


  public get initiativeEditorTitle(): string {

    return this.projectForm?.id
      ? 'Edit Strategic Initiative'
      : 'Configure New Initiative';

  }


  public get initiativeEditorMode():
    'new' | 'edit' {

    return this.projectForm?.id
      ? 'edit'
      : 'new';

  }

}
