import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { environment } from '../environment';
import { AuthService } from './auth.service';

export interface ProjectContextOption {
  id: number;
  name: string;
  avatarUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProjectContextService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly storageKey = 'greatley-poshley-selected-project';
  private loaded = false;
  private loading = false;

  readonly projects = signal<ProjectContextOption[]>([]);
  readonly selectedProjectId = signal<number | null>(this.readStoredProjectId());
  readonly selectedProject = computed(() =>
    this.projects().find(project => project.id === this.selectedProjectId()) ?? null
  );

  loadProjects(): void {
    if (this.loaded || this.loading) return;
    this.loading = true;
    this.projectCollection(['/projects', '/project']).subscribe(projects => {
      this.projects.set(projects);
      this.loaded = true;
      this.loading = false;
      if (!projects.length) return;
      const current = projects.find(project => project.id === this.selectedProjectId());
      this.setSelectedProject(current?.id ?? projects[0].id);
    });
  }

  setSelectedProject(projectId: number | null): void {
    const normalized = Number(projectId);
    const id = Number.isFinite(normalized) && normalized > 0 ? normalized : null;
    this.selectedProjectId.set(id);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (id === null) sessionStorage.removeItem(this.storageKey);
      else sessionStorage.setItem(this.storageKey, String(id));
    } catch { /* Storage may be disabled by browser policy. */ }
  }

  private projectCollection(paths: string[], index = 0): Observable<ProjectContextOption[]> {
    if (index >= paths.length) return of([]);
    const base = String(environment.apiBaseUrlM || '').replace(/\/$/, '');
    return this.http.get<any>(`${base}${paths[index]}`, { headers: this.auth.getAuthHeaders() }).pipe(
      map(response => this.extractArray(response).map(row => this.normalizeProject(row)).filter((project): project is ProjectContextOption => Boolean(project))),
      switchMap(projects => projects.length ? of(projects) : this.projectCollection(paths, index + 1)),
      catchError(() => this.projectCollection(paths, index + 1))
    );
  }

  private extractArray(value: any, depth = 0): any[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object' || depth > 5) return [];
    for (const key of ['content', 'data', 'items', 'results', 'records', 'projects', 'project']) {
      const candidate = value[key];
      if (Array.isArray(candidate)) return candidate;
      if (candidate && typeof candidate === 'object') {
        const nested = this.extractArray(candidate, depth + 1);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  private normalizeProject(row: any): ProjectContextOption | null {
    const id = Number(row?.id ?? row?.project_id ?? row?.projectId ?? row?.project?.id);
    const rawName = row?.name ?? row?.project_name ?? row?.projectName ?? row?.title ?? row?.project;
    const name = typeof rawName === 'object'
      ? String(rawName?.name ?? rawName?.title ?? rawName?.label ?? '').trim()
      : String(rawName ?? '').trim();
    if (!Number.isFinite(id) || id <= 0 || !name) return null;
    return {
      id,
      name,
      avatarUrl: row?.avatarUrl ?? row?.avatar_url ?? row?.iconUrl ?? row?.icon_url ?? null
    };
  }

  private readStoredProjectId(): number | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const value = Number(sessionStorage.getItem(this.storageKey));
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch { return null; }
  }
}
