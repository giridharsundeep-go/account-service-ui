import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Angular Material Core Visual Infrastructure
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';

// RxJS Stream Pipeline Interfaces
import { Observable, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

// Data Interfaces to Protect Strong Typing
export interface TeamCluster {
  id: string;
  name: string;
  membersCount: number;
  memberCount?: number; // Handle template fallback variants
}

export interface AgileParameters {
  sprintDurationWeeks: number;
  targetVelocity: number;
  autoRolloverBacklog: boolean;
}

export interface WaterfallParameters {
  gatekeeperRole: string;
  bufferPercentage: number;
}

export interface StrategicInitiative {
  id: string;
  name: string;
  methodology: 'AGILE_SCRUM' | 'WATERFALL_GANTT' | 'HYBRID_SHAPEUP';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  associatedTeamIds: string[];
  teamsWorkingOn?: TeamCluster[];
  agileConfig?: AgileParameters;
  waterfallConfig?: WaterfallParameters;
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
    MatCheckboxModule,
    MatButtonModule
  ]
})
export class Projects implements OnInit {
  
  // --- STATE CONTROLLERS ---
  isComposerOpen: boolean = false;
  isSaving: boolean = false;
  editingProjectId: string | null = null;
  projectLookupFilter: string = '';

  // --- COMPOSER STRATEGIC DATA STRUCTURES ---
  projectForm = {
    name: '',
    methodology: 'AGILE_SCRUM' as 'AGILE_SCRUM' | 'WATERFALL_GANTT' | 'HYBRID_SHAPEUP',
    priority: 'HIGH' as 'CRITICAL' | 'HIGH' | 'MEDIUM',
    description: '',
    associatedTeamIds: [] as string[],
    agileConfig: {
      sprintDurationWeeks: 2,
      targetVelocity: 80,
      autoRolloverBacklog: true
    } as AgileParameters,
    waterfallConfig: {
      gatekeeperRole: '',
      bufferPercentage: 10
    } as WaterfallParameters
  };

  // --- WORKSPACE SOURCE MATRICES ---
  private mockTeams$ = new BehaviorSubject<TeamCluster[]>([
    { id: 't-1', name: 'Alpha Core Infrastructure', membersCount: 8, memberCount: 8 },
    { id: 't-2', name: 'Nexus Experience UI Devs', membersCount: 5, memberCount: 5 },
    { id: 't-3', name: 'Data Pipeline Optimization Team', membersCount: 6, memberCount: 6 },
    { id: 't-4', name: 'Security & Auth Services Cluster', membersCount: 4, memberCount: 4 }
  ]);

  private projectsSubject = new BehaviorSubject<StrategicInitiative[]>([
    {
      id: 'p-101',
      name: 'PRJ-101 Cloud Matrix Core Engine',
      methodology: 'AGILE_SCRUM',
      priority: 'CRITICAL',
      description: 'Engineering the next-generation microservice cluster runtime environment. Optimizing core data pipeline streaming telemetry velocities.',
      associatedTeamIds: ['t-1', 't-3'],
      teamsWorkingOn: [],
      agileConfig: { sprintDurationWeeks: 2, targetVelocity: 85, autoRolloverBacklog: true }
    },
    {
      id: 'p-202',
      name: 'PRJ-202 Corporate Portal Overhaul',
      methodology: 'WATERFALL_GANTT',
      priority: 'MEDIUM',
      description: 'Legacy web matrix deprecation sequence, transitioning corporate framework footprints into scalable standalone microfrontends.',
      associatedTeamIds: ['t-2'],
      teamsWorkingOn: [],
      waterfallConfig: { gatekeeperRole: 'Chief Product Officer', bufferPercentage: 15 }
    }
  ]);

  // Read-only stream exposing standard projects collection
  projects$: Observable<StrategicInitiative[]> = this.projectsSubject.asObservable();

  ngOnInit(): void {
    this.refreshProjectCrossReferences();
  }

  // --- ACTIONS & OPERATIONAL CONTROLLER METHODS ---

  initiateNewProject(): void {
    this.resetFormState();
    this.editingProjectId = null;
    this.isComposerOpen = true;
  }

  onMethodologyShift(): void {
    // Dynamic component action hook if parameters need configuration clearing on shifts
  }

  closeComposerDrawer(): void {
    this.isComposerOpen = false;
    this.resetFormState();
  }

  triggerTeamAllocationModal(): void {
    // Interactive allocation loop: Auto-binds next unassigned team cluster to speed up UX
    const currentBound = this.projectForm.associatedTeamIds;
    const available = this.mockTeams$.value.find(t => !currentBound.includes(t.id));
    
    if (available) {
      this.projectForm.associatedTeamIds = [...currentBound, available.id];
    }
  }

  getBoundTeamObjects(): TeamCluster[] {
    return this.mockTeams$.value.filter(team => 
      this.projectForm.associatedTeamIds.includes(team.id)
    );
  }

  revokeTeamBinding(teamId: string): void {
    this.projectForm.associatedTeamIds = this.projectForm.associatedTeamIds.filter(id => id !== teamId);
  }

  commitProjectToSystem(): void {
    if (!this.projectForm.name.trim() || this.projectForm.associatedTeamIds.length === 0) return;

    this.isSaving = true;

    // Mimic API thread latency framework
    setTimeout(() => {
      const currentProjects = this.projectsSubject.value;

      if (this.editingProjectId) {
        // Run Modification Rollout Update
        const updated = currentProjects.map(proj => {
          if (proj.id === this.editingProjectId) {
            return {
              ...proj,
              name: this.projectForm.name,
              methodology: this.projectForm.methodology,
              priority: this.projectForm.priority,
              description: this.projectForm.description,
              associatedTeamIds: this.projectForm.associatedTeamIds,
              agileConfig: this.projectForm.methodology === 'AGILE_SCRUM' ? { ...this.projectForm.agileConfig } : undefined,
              waterfallConfig: this.projectForm.methodology === 'WATERFALL_GANTT' ? { ...this.projectForm.waterfallConfig } : undefined
            };
          }
          return proj;
        });
        this.projectsSubject.next(updated);
      } else {
        // Instantiate Brand New System Architecture
        const newProject: StrategicInitiative = {
          id: `p-${Date.now()}`,
          name: this.projectForm.name,
          methodology: this.projectForm.methodology,
          priority: this.projectForm.priority,
          description: this.projectForm.description,
          associatedTeamIds: this.projectForm.associatedTeamIds,
          agileConfig: this.projectForm.methodology === 'AGILE_SCRUM' ? { ...this.projectForm.agileConfig } : undefined,
          waterfallConfig: this.projectForm.methodology === 'WATERFALL_GANTT' ? { ...this.projectForm.waterfallConfig } : undefined
        };
        this.projectsSubject.next([...currentProjects, newProject]);
      }

      this.refreshProjectCrossReferences();
      this.isSaving = false;
      this.isComposerOpen = false;
      this.resetFormState();
    }, 700);
  }

  loadProjectToComposer(initiative: StrategicInitiative): void {
    this.editingProjectId = initiative.id;
    this.projectForm.name = initiative.name;
    this.projectForm.methodology = initiative.methodology;
    this.projectForm.priority = initiative.priority;
    this.projectForm.description = initiative.description;
    this.projectForm.associatedTeamIds = [...initiative.associatedTeamIds];
    
    if (initiative.agileConfig) {
      this.projectForm.agileConfig = { ...initiative.agileConfig };
    }
    if (initiative.waterfallConfig) {
      this.projectForm.waterfallConfig = { ...initiative.waterfallConfig };
    }

    this.isComposerOpen = true;
  }

  decommissionProject(id: string): void {
    const retained = this.projectsSubject.value.filter(proj => proj.id !== id);
    this.projectsSubject.next(retained);
  }

  filterStrategicInitiatives(projects: StrategicInitiative[]): StrategicInitiative[] {
    if (!this.projectLookupFilter || !this.projectLookupFilter.trim()) {
      return projects;
    }
    const query = this.projectLookupFilter.toLowerCase().trim();
    return projects.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.description.toLowerCase().includes(query) ||
      p.methodology.toLowerCase().includes(query)
    );
  }

  // --- INTERNAL ENGINE UTILITIES ---
  private refreshProjectCrossReferences(): void {
    const currentProjects = this.projectsSubject.value;
    const currentTeams = this.mockTeams$.value;

    currentProjects.forEach(project => {
      project.teamsWorkingOn = currentTeams.filter(t => project.associatedTeamIds.includes(t.id));
    });

    this.projectsSubject.next([...currentProjects]);
  }

  private resetFormState(): void {
    this.projectForm = {
      name: '',
      methodology: 'AGILE_SCRUM',
      priority: 'HIGH',
      description: '',
      associatedTeamIds: [],
      agileConfig: { sprintDurationWeeks: 2, targetVelocity: 80, autoRolloverBacklog: true },
      waterfallConfig: { gatekeeperRole: '', bufferPercentage: 10 }
    };
    this.editingProjectId = null;
  }
}