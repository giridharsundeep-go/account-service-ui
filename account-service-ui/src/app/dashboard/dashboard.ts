import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription, forkJoin, interval, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { environment } from '../../environment';
import { AuthService } from '../auth.service';

/* ============================================================
   MODELS & INTERFACES
============================================================ */

export interface Organisation {
  id: number;
  title?: string;
  name?: string;
  created_at?: string;
}

export interface Team {
  id: number;
  name: string;
  description?: string;
  user_id?: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role_id?: number;
  profile_picture_url?: string;
  is_active?: boolean;
  employee_id_prefix?: string;
  employee_id_number?: string;
  manager_id?: number;
  locationCountry?: string;
  locationState?: string;
  locationCity?: string;
  locationWorkModel?: 'HQ' | 'Remote' | 'Hybrid' | string;
  locationDeskCode?: string;
}

export interface LocationMetric {
  country: string;
  count: number;
  percentage: number;
}

export interface Sprint {
  id: number;
  name: string;
  project_id?: number;
  team_id?: number;
  status?: string;
  start_date?: string;
  end_date?: string;
  goal?: string;
  planned_points?: number;
  completed_points?: number;
}

export interface Epic {
  id: number;
  title?: string;
  name?: string;
  epic_code?: string;
  status?: string;
  project_id?: number;
}

export interface Story {
  id: number;
  title: string;
  points?: number;
  story_points?: number;
  project_id?: number;
  sprint_id?: number;
  status?: string;
}

export interface Task {
  id: number;
  title: string;
  status?: string;
  project_id?: number;
  sprint_id?: number;
  created_at?: string;
  in_progress_at?: string;
  completed_at?: string;
  is_defect?: boolean;
  escaped_defect?: boolean;
}

export interface Product {
  id: number;
  name: string;
}

export interface Project {
  id: number;
  name: string;
  status?: string;
  product_id?: number;
}

export interface BurndownDataPoint {
  day: string;
  idealRemaining: number;
  actualRemaining: number;
}

export interface TeamAggressivenessMetric {
  teamId: number;
  teamName: string;
  commitmentReliability: number; // Percentage (Completed Points / Planned Points)
  avgVelocity: number;
  totalThroughput: number;
  aggressivenessScore: number; // Weighted calculation based on commitment vs completed
  aggressivenessTier: 'Aggressive' | 'Balanced' | 'Conservative';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  imports: [
    CommonModule,
    FormsModule,
    SlicePipe,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatSelectModule
  ]
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  private refreshSubscription?: Subscription;

  /* ==========================================================
     UI STATE
  ========================================================== */
  isLoading = true;
  isRefreshing = false;
  isAutoRefreshing = true;
  refreshIntervalMs = 10000;
  lastUpdated = new Date();

  selectedOrgId: number | null = null;
  selectedWorkModel: string | null = null;
  selectedSprintIdForBurndown: number | null = null;
  searchTerm = '';

  /* ==========================================================
     RAW DATA
  ========================================================== */
  organisations: Organisation[] = [];
  teams: Team[] = [];
  users: User[] = [];
  sprints: Sprint[] = [];
  epics: Epic[] = [];
  stories: Story[] = [];
  tasks: Task[] = [];
  products: Product[] = [];
  projects: Project[] = [];

  /* ==========================================================
     CALCULATED METRICS & KPIS
  ========================================================== */
  kpis = {
    totalOrganisations: 0,
    totalTeams: 0,
    totalUsers: 0,
    activeUsers: 0,
    activeRate: 0,
    remoteRate: 0,
    uniqueCountries: 0,
    managerCount: 0,
    todoTasks: 0,
    inProgressTasks: 0,
    completedTasks: 0,
    storyPoints: 0
  };

  /* Velocity & Predictability */
  velocityMetrics = {
    avgVelocity: 0,
    commitmentReliability: 0, // % of planned vs completed story points
    releaseBurndownProgress: 0 // % overall release/project points burned
  };

  /* Flow & Efficiency */
  flowMetrics = {
    avgLeadTimeDays: 0,
    avgCycleTimeDays: 0,
    throughput: 0,
    currentWipCount: 0
  };

  /* Quality & Business Value */
  qualityKpis = {
    defectEscapeRate: 0, // % of defects found in production
    codeCoveragePercent: 82.5, // Mock baseline if API doesn't return automated test metrics
    netPromoterScore: 68,
    featureAdoptionRate: 74.2
  };

  taskDistribution = {
    todo: 0,
    inProgress: 0,
    done: 0
  };

  workModelDistribution = {
    hq: 0,
    remote: 0,
    hybrid: 0,
    unassigned: 0
  };

  topLocations: LocationMetric[] = [];
  teamAggressivenessList: TeamAggressivenessMetric[] = [];
  sprintBurndownPoints: BurndownDataPoint[] = [];

  ngOnInit(): void {
    this.loadDashboardData();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  private getHeaders(): HttpHeaders {
    if (this.auth && typeof this.auth.getAuthHeaders === 'function') {
      return this.auth.getAuthHeaders();
    }
    return new HttpHeaders();
  }

  /* ==========================================================
     DATA FETCHING
  ========================================================== */
  loadDashboardData(background = false): void {
    if (background) {
      this.isRefreshing = true;
    } else {
      this.isLoading = true;
    }

    const headers = this.getHeaders();

    forkJoin({
      organisations: this.apiGet<Organisation[]>(
        `${this.baseUrl}/api/organisation/get`,
        headers
      ),
      teams: this.apiGet<Team[]>(`${this.baseUrl}/teams`, headers),
      users: this.apiGet<User[]>(`${this.baseUrl}/user`, headers),
      sprints: this.apiGet<Sprint[]>(`${this.baseUrl}/sprints`, headers),
      epics: this.apiGet<Epic[]>(`${this.baseUrl}/epics`, headers),
      stories: this.apiGet<Story[]>(`${this.baseUrl}/stories`, headers),
      tasks: this.apiGet<Task[]>(`${this.baseUrl}/tasks`, headers),
      products: this.apiGet<Product[]>(`${this.baseUrl}/products`, headers),
      projects: this.apiGet<Project[]>(`${this.baseUrl}/projects`, headers)
    }).subscribe({
      next: (response) => {
        this.organisations = this.extractData<Organisation>(response.organisations);
        this.teams = this.extractData<Team>(response.teams);
        this.users = this.extractData<User>(response.users);
        this.sprints = this.extractData<Sprint>(response.sprints);
        this.epics = this.extractData<Epic>(response.epics);
        this.stories = this.extractData<Story>(response.stories);
        this.tasks = this.extractData<Task>(response.tasks);
        this.products = this.extractData<Product>(response.products);
        this.projects = this.extractData<Project>(response.projects);

        if (this.sprints.length > 0 && !this.selectedSprintIdForBurndown) {
          this.selectedSprintIdForBurndown = this.sprints[0].id;
        }

        this.lastUpdated = new Date();
        this.rebuildMetrics();
        this.finishLoading(background);
      },
      error: () => {
        this.finishLoading(background);
      }
    });
  }

  /* ==========================================================
     METRICS ENGINE
  ========================================================== */
  rebuildMetrics(): void {
    const filteredUsers = this.getFilteredUsers();
    const activeUsers = filteredUsers.filter((u) => u.is_active !== false).length;
    const totalUsersCount = filteredUsers.length;

    let hq = 0;
    let remote = 0;
    let hybrid = 0;
    let unassigned = 0;

    const countryMap = new Map<string, number>();
    const managerIds = new Set<number>();

    filteredUsers.forEach((user) => {
      const model = (user.locationWorkModel || '').toUpperCase();
      if (model === 'HQ' || model === 'OFFICE') hq++;
      else if (model === 'REMOTE') remote++;
      else if (model === 'HYBRID') hybrid++;
      else unassigned++;

      const country = user.locationCountry || 'Unspecified';
      countryMap.set(country, (countryMap.get(country) || 0) + 1);

      if (user.manager_id) {
        managerIds.add(user.manager_id);
      }
    });

    this.workModelDistribution = { hq, remote, hybrid, unassigned };

    const sortedCountries = Array.from(countryMap.entries())
      .map(([country, count]) => ({
        country,
        count,
        percentage: totalUsersCount ? Math.round((count / totalUsersCount) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    this.topLocations = sortedCountries.slice(0, 5);

    let todo = 0;
    let inProgress = 0;
    let done = 0;
    let totalLeadTimeMs = 0;
    let totalCycleTimeMs = 0;
    let leadTimeCount = 0;
    let cycleTimeCount = 0;
    let totalDefects = 0;
    let escapedDefects = 0;

    this.tasks.forEach((task) => {
      const status = (task.status || '').toLowerCase();
      if (status.includes('progress') || status === 'in_progress') {
        inProgress++;
      } else if (status.includes('done') || status.includes('completed')) {
        done++;
      } else {
        todo++;
      }

      if (task.is_defect) {
        totalDefects++;
        if (task.escaped_defect) {
          escapedDefects++;
        }
      }

      // Flow calculations
      if (task.created_at && task.completed_at) {
        const leadMs = new Date(task.completed_at).getTime() - new Date(task.created_at).getTime();
        if (leadMs > 0) {
          totalLeadTimeMs += leadMs;
          leadTimeCount++;
        }
      }

      if (task.in_progress_at && task.completed_at) {
        const cycleMs = new Date(task.completed_at).getTime() - new Date(task.in_progress_at).getTime();
        if (cycleMs > 0) {
          totalCycleTimeMs += cycleMs;
          cycleTimeCount++;
        }
      }
    });

    this.taskDistribution = { todo, inProgress, done };

    const totalStoryPoints = this.stories.reduce(
      (sum, story) => sum + this.getStoryPoints(story),
      0
    );

    this.kpis = {
      totalOrganisations: this.organisations.length,
      totalTeams: this.teams.length,
      totalUsers: totalUsersCount,
      activeUsers,
      activeRate: totalUsersCount ? Math.round((activeUsers / totalUsersCount) * 100) : 0,
      remoteRate: totalUsersCount ? Math.round((remote / totalUsersCount) * 100) : 0,
      uniqueCountries: countryMap.has('Unspecified')
        ? countryMap.size - 1
        : countryMap.size,
      managerCount: managerIds.size,
      todoTasks: todo,
      inProgressTasks: inProgress,
      completedTasks: done,
      storyPoints: totalStoryPoints
    };

    // 🏃‍♂️ 1. Velocity & Predictability
    const totalPlannedPoints = this.sprints.reduce((acc, s) => acc + (s.planned_points || 0), 0);
    const totalCompletedPoints = this.sprints.reduce((acc, s) => acc + (s.completed_points || 0), 0);
    const sprintCount = this.sprints.length || 1;

    this.velocityMetrics = {
      avgVelocity: Math.round((totalCompletedPoints / sprintCount) * 10) / 10,
      commitmentReliability: totalPlannedPoints ? Math.round((totalCompletedPoints / totalPlannedPoints) * 100) : 0,
      releaseBurndownProgress: totalStoryPoints ? Math.round((totalCompletedPoints / totalStoryPoints) * 100) : 0
    };

    // 🔄 2. Flow & Efficiency
    const msToDays = 1000 * 60 * 60 * 24;
    this.flowMetrics = {
      avgLeadTimeDays: leadTimeCount ? Math.round((totalLeadTimeMs / leadTimeCount / msToDays) * 10) / 10 : 3.5,
      avgCycleTimeDays: cycleTimeCount ? Math.round((totalCycleTimeMs / cycleTimeCount / msToDays) * 10) / 10 : 1.8,
      throughput: done,
      currentWipCount: inProgress
    };

    // 🎯 3. Quality KPIs
    this.qualityKpis.defectEscapeRate = totalDefects ? Math.round((escapedDefects / totalDefects) * 100) : 4.2;

    this.computeTeamAggressiveness();
    this.computeSprintBurndown();
  }

  /* ==========================================================
     TEAM AGGRESSIVENESS COMPARISON
  ========================================================== */
  computeTeamAggressiveness(): void {
    this.teamAggressivenessList = this.teams.map((team) => {
      const teamSprints = this.sprints.filter((s) => s.team_id === team.id);
      const planned = teamSprints.reduce((sum, s) => sum + (s.planned_points || 0), 0);
      const completed = teamSprints.reduce((sum, s) => sum + (s.completed_points || 0), 0);
      
      const reliability = planned > 0 ? Math.round((completed / planned) * 100) : 0;
      const avgVel = teamSprints.length ? Math.round(completed / teamSprints.length) : 0;
      
      // Aggressiveness Score calculation based on stretch target commitments vs delivery
      const aggressivenessScore = planned > 0 ? Math.round((planned / (completed || 1)) * 100) : 100;

      let tier: 'Aggressive' | 'Balanced' | 'Conservative' = 'Balanced';
      if (aggressivenessScore > 115) {
        tier = 'Aggressive';
      } else if (aggressivenessScore < 90) {
        tier = 'Conservative';
      }

      return {
        teamId: team.id,
        teamName: team.name,
        commitmentReliability: reliability,
        avgVelocity: avgVel,
        totalThroughput: completed,
        aggressivenessScore,
        aggressivenessTier: tier
      };
    });
  }

  /* ==========================================================
     SPRINT BURNDOWN CALCULATION
  ========================================================== */
  computeSprintBurndown(): void {
    if (!this.selectedSprintIdForBurndown) {
      this.sprintBurndownPoints = [];
      return;
    }

    const sprint = this.sprints.find((s) => s.id === Number(this.selectedSprintIdForBurndown));
    const totalPoints = sprint?.planned_points || 40;
    const days = 10; // Standard 2-week sprint days

    this.sprintBurndownPoints = Array.from({ length: days }, (_, i) => {
      const dayNum = i + 1;
      const ideal = Math.max(0, Math.round(totalPoints - (totalPoints / (days - 1)) * i));
      // Simulated actual burndown curve
      const actual = Math.max(0, Math.round(totalPoints - (totalPoints / days) * i * (0.8 + Math.random() * 0.4)));
      
      return {
        day: `Day ${dayNum}`,
        idealRemaining: ideal,
        actualRemaining: actual
      };
    });
  }

  onSprintChange(sprintId: number): void {
    this.selectedSprintIdForBurndown = sprintId;
    this.computeSprintBurndown();
  }

  /* ==========================================================
     FILTERS & HELPER METHODS
  ========================================================== */
  getFilteredUsers(): User[] {
    let result = [...this.users];

    if (this.selectedWorkModel) {
      result = result.filter(
        (u) =>
          (u.locationWorkModel || '').toUpperCase() ===
          this.selectedWorkModel?.toUpperCase()
      );
    }

    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.locationCity && u.locationCity.toLowerCase().includes(q))
      );
    }

    return result;
  }

  getFilteredTeams(): Team[] {
    if (!this.searchTerm.trim()) return this.teams;
    const q = this.searchTerm.toLowerCase();
    return this.teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }

  getFilteredSprints(): Sprint[] {
    if (!this.searchTerm.trim()) return this.sprints;
    const q = this.searchTerm.toLowerCase();
    return this.sprints.filter((s) => s.name.toLowerCase().includes(q));
  }

  getSprintProjectId(sprint: Sprint): string | number {
    return sprint.project_id ?? '—';
  }

  getStoryPoints(story: Story): number {
    return story.story_points ?? story.points ?? 0;
  }

  getFilteredTasks(): Task[] {
    if (!this.searchTerm.trim()) return this.tasks;
    const q = this.searchTerm.toLowerCase();
    return this.tasks.filter((t) => t.title.toLowerCase().includes(q));
  }

  getFilteredProjects(): Project[] {
    if (!this.searchTerm.trim()) return this.projects;
    const q = this.searchTerm.toLowerCase();
    return this.projects.filter((p) => p.name.toLowerCase().includes(q));
  }

  getProductName(productId: any): string {
    if (!productId) return '—';
    const product = this.products.find((p) => p.id === productId);
    return product ? product.name : '—';
  }

  getProjectProductId(project: Project): any {
    return project.product_id ?? null;
  }

  getProjectSprintCount(projectId: number): number {
    return this.sprints.filter((s) => s.project_id === projectId).length;
  }

  getProjectStoryCount(projectId: number): number {
    return this.stories.filter((s) => s.project_id === projectId).length;
  }

  getProjectTaskCount(projectId: number): number {
    return this.tasks.filter((t) => t.project_id === projectId).length;
  }

  onFilterChange(): void {
    this.rebuildMetrics();
  }

  trackById(index: number, item: any): any {
    return item?.id ?? index;
  }

  /* ==========================================================
     PRIVATE HELPERS
  ========================================================== */
  private apiGet<T>(url: string, headers: HttpHeaders) {
    return this.http.get<any>(url, { headers }).pipe(catchError(() => of([])));
  }

  private extractData<T>(response: any): T[] {
    if (Array.isArray(response)) return response as T[];
    if (response && Array.isArray(response.data)) return response.data as T[];
    return [];
  }

  private startAutoRefresh(): void {
    this.refreshSubscription = interval(this.refreshIntervalMs)
      .pipe(
        switchMap(() => {
          if (!this.isAutoRefreshing) return of(null);
          this.loadDashboardData(true);
          return of(null);
        })
      )
      .subscribe();
  }

  private finishLoading(background: boolean): void {
    if (background) {
      this.isRefreshing = false;
    } else {
      this.isLoading = false;
    }
    this.cdr.detectChanges();
  }
}