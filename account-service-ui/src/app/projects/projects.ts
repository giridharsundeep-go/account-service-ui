import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { finalize, switchMap, map } from 'rxjs/operators';
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
  members?: UserAccountNode[]; // Contains team members profiles
}

export interface StrategicInitiative {
  id?: number;
  user_id?: number;
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
  projectLookupFilter = '';

  isComposerOpen = false;
  isSaving = false;
  isLoadingResources = false;
  activeBuilderStep = 1;

  agileTuning = { focusFactor: 0.80, scopeBufferPercent: 15 };
  
  selectedUsers: number[] = [];
  chipUserObjects: Array<{id: number, name: string, isFromTeam?: boolean, teamName?: string}> = [];
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
          return project as StrategicInitiative;
        });
      })
    );
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
    this.http.get<any>(`${this.baseUrl}/teams`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.liveActiveTeams = res?.data || [];
        this.rebuildChipsMatrix();
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Failed to load functional teams list:', err)
    });
  }

  openUserSelectionDialog(): void {
    const dialogRef = this.dialog.open(UserSelectDialog, {
      width: '1000px', 
      data: {
        users: this.organizationPersonnel, 
        currentSelection: this.selectedUsers
      }
    });

    dialogRef.afterClosed().subscribe((result: number[] | undefined) => {
      if (result !== undefined) {
        this.selectedUsers = result.map((id: number | string) => Number(id));
        this.projectForm.associatedUserIds = [...this.selectedUsers];
        this.rebuildChipsMatrix();
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Compiles both explicit independent specialists and all members belonging
   * to active selected functional teams into a single flat display array for the chip deck.
   */
  private rebuildChipsMatrix(): void {
    const temporaryChipsMap = new Map<number, {id: number, name: string, isFromTeam: boolean, teamName?: string}>();

    // 1. Process team personnel based on active team selection configurations
    this.liveActiveTeams.forEach(team => {
      if (team?.id && this.selectedTeamIds.includes(team.id.toString()) && team.members) {
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

    // 2. Process independent contractors (if overlapping, team status tag takes design precedence)
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

  /**
   * Safe chip-deck removal function
   */
  removeUserChip(chip: {id: number, isFromTeam?: boolean}): void {
    if (chip.isFromTeam) {
      // If user belongs to an active team, notify them they must remove the whole team block
      alert('This resource is allocated via an assigned Team. To remove this engineer, deselect their corresponding functional team cohort.');
      return;
    }
    
    this.selectedUsers = this.selectedUsers.filter(id => Number(id) !== Number(chip.id));
    this.projectForm.associatedUserIds = [...this.selectedUsers];
    this.rebuildChipsMatrix();
    this.cdr.markForCheck();
  }

  isTeamSelected(teamId: string | undefined | number): boolean {
    if (!teamId) return false;
    return this.selectedTeamIds.includes(teamId.toString());
  }

  toggleTeamSelection(teamId: string | undefined | number): void {
    if (!teamId) return;
    const cleanId = teamId.toString();
    const index = this.selectedTeamIds.indexOf(cleanId);
    
    if (index > -1) {
      this.selectedTeamIds.splice(index, 1);
    } else {
      this.selectedTeamIds.push(cleanId);
    }
    
    this.projectForm.associatedTeamIds = [...this.selectedTeamIds];
    this.rebuildChipsMatrix();
    this.cdr.markForCheck();
  }

  getLiveManpowerHeadcount(): number {
    // Collect unique user ids to calculate clean workspace statistics
    const uniqueIds = new Set<number>();
    
    this.liveActiveTeams
      .filter(team => team?.id && this.selectedTeamIds.includes(team.id.toString()))
      .forEach(team => {
        if (team.members) {
          team.members.forEach(m => uniqueIds.add(Number(m.id)));
        } else {
          // Fallback context if backend gives length count but no array data structural blocks
          const count = team.membersCount || 0;
          for(let i=0; i < count; i++) { uniqueIds.add(Math.random()); }
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

  loadProjectToComposer(project: StrategicInitiative): void {
    this.projectForm = JSON.parse(JSON.stringify(project));
    
    this.selectedUsers = project.associatedUserIds ? project.associatedUserIds.map((id: any) => Number(id)) : [];
    this.selectedTeamIds = project.associatedTeamIds ? project.associatedTeamIds.map((id: any) => id.toString()) : [];
    
    this.rebuildChipsMatrix();
    this.activeBuilderStep = 1;
    this.isComposerOpen = true;
    this.calculateAgileMetrics();
    this.cdr.markForCheck();
  }

  commitProjectToSystem(): void {
    if (!this.projectForm.name.trim()) return;
    this.calculateAgileMetrics();
    this.isSaving = true;
    this.cdr.markForCheck();

    this.projectForm.associatedUserIds = [...this.selectedUsers];
    this.projectForm.associatedTeamIds = [...this.selectedTeamIds];

    if (this.projectForm.id && this.projectForm.id > 0) {
      this.http.put(`${this.baseUrl}/projects/${this.projectForm.id}`, this.projectForm, { headers: this.auth.getAuthHeaders() })
        .pipe(finalize(() => { this.isSaving = false; this.cdr.markForCheck(); }))
        .subscribe({
          next: () => this.completeSaveWorkflow(),
          error: (err) => console.error('Failed to update project entity:', err)
        });
    } else {
      this.http.post(`${this.baseUrl}/projects/create`, this.projectForm, { headers: this.auth.getAuthHeaders() })
        .pipe(finalize(() => { this.isSaving = false; this.cdr.markForCheck(); }))
        .subscribe({
          next: () => this.completeSaveWorkflow(),
          error: (err) => console.error('Failed to create project:', err)
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
      name: '', description: '', status: 'ACTIVE', methodology: 'AGILE_SCRUM', priority: 'MEDIUM',
      total_backlog_points: 120, sprint_duration_weeks: 2, target_velocity: 30, auto_rollover_backlog: true,
      computed_sprint_count: 0, computed_total_duration_weeks: 0, associatedTeamIds: [], associatedUserIds: []
    };
    this.selectedUsers = [];
    this.selectedTeamIds = [];
    this.chipUserObjects = [];
    this.calculateAgileMetrics();
  }
}