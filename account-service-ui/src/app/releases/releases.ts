import { untracked } from '@angular/core';
import { WorkItemDialogService } from '../shared/work-item-dialog.service';
import { ChangeDetectionStrategy, Component, OnInit, effect, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';

interface ReleaseProject { id: number; name: string; [key: string]: any; }
interface ReleaseSprint { id: number; name: string; state?: string; [key: string]: any; }
interface ReleaseUser { id: number; name: string; email?: string; [key: string]: any; }
interface ReleaseRecord {
  id: number; org_id?: number; project_id: number; sprint_id: number; user_id: number; assignee_id: number;
  name: string; version_number: string; status: 'PLANNED' | 'IN_PROGRESS' | 'RELEASED' | 'CANCELLED';
  release_date?: string | null; notes?: string | null; created_at?: string; updated_at?: string; [key: string]: any;
}
interface ReleaseItem {
  id?: number; release_id?: number; work_item_id?: number; item_type?: string; status?: string;
  title?: string; key?: string; summary?: string; [key: string]: any;
}
interface CandidateWorkItem { id: number; item_type: 'EPIC' | 'STORY' | 'TASK'; title: string; status: string; key?: string; sprint_id?: number | null; project_id?: number; selected?: boolean; }
type ReleaseStatus = ReleaseRecord['status'];

@Component({
  selector: 'app-releases', standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatTooltipModule, MatProgressBarModule, MatCardModule, MatTableModule, MatCheckboxModule, MatDatepickerModule, MatNativeDateModule, WorkspaceHeroComponent],
  templateUrl: './releases.html', styleUrls: ['./releases.css', '../shared/field-controls.css'], changeDetection: ChangeDetectionStrategy.OnPush
})
export class Releases implements OnInit {
  private readonly itemDialog = inject(WorkItemDialogService);
  private lastItemRevision = this.itemDialog.revision();
  private readonly itemRefresh = effect(() => {
    const revision = this.itemDialog.revision();
    if (revision === this.lastItemRevision) return;
    this.lastItemRevision = revision;
    untracked(() => { if (this.selectedProjectId()) this.loadProjectData(this.selectedProjectId()!); });
  });
  openReleaseItem(item: ReleaseItem | CandidateWorkItem): void {
    this.itemDialog.open(Number(this.selectedProjectId()), item.item_type || 'TASK', Number((item as ReleaseItem).work_item_id ?? item.id));
  }

  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly projectContext = inject(ProjectContextService);
  readonly baseUrl = environment.apiBaseUrlM;
  readonly projects = signal<ReleaseProject[]>([]);
  readonly sprints = signal<ReleaseSprint[]>([]);
  readonly users = signal<ReleaseUser[]>([]);
  readonly releases = signal<ReleaseRecord[]>([]);
  readonly releaseItems = signal<ReleaseItem[]>([]);
  readonly candidateItems = signal<CandidateWorkItem[]>([]);
  readonly itemsLoading = signal(false);
  readonly selectedWorkItemIds = signal<string[]>([]);
  readonly selectedProjectId = signal<number | null>(null);
  private readonly projectContextSync = effect(() => {
    const sharedProjectId = this.projectContext.selectedProjectId();
    const projects = this.projects();
    if (!projects.length) return;
    if (!sharedProjectId) {
      if (this.selectedProjectId() !== null) {
        this.selectedProjectId.set(null);
        this.releases.set([]);
        this.sprints.set([]);
        this.loading.set(false);
      }
      return;
    }
    if (this.selectedProjectId() === sharedProjectId) return;
    if (projects.some(project => Number(project.id) === sharedProjectId)) this.onProjectChange(sharedProjectId);
  });
  readonly selectedReleaseId = signal<number | null>(null);
  readonly profileMode = signal<'create' | 'view' | 'edit' | null>(null);
  readonly profileTab = signal<'overview' | 'items'>('overview');
  readonly searchTerm = signal('');
  readonly statusFilter = signal('ALL');
  readonly sprintFilter = signal('ALL');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly filtersOpen = signal(false);
  readonly activeFilterCount = computed(() => (this.searchTerm().trim() ? 1 : 0) + (this.sprintFilter() !== 'ALL' ? 1 : 0) + (this.dateFrom() ? 1 : 0) + (this.dateTo() ? 1 : 0));
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly detailLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly editingStatusId = signal<number | null>(null);
  readonly isEditing = signal(false);
  readonly filteredReleases = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    return this.releases().filter(r => {
      const matchesStatus = this.statusFilter() === 'ALL' || r.status === this.statusFilter();
      const matchesSprint = this.sprintFilter() === 'ALL' || String(r.sprint_id ?? '') === this.sprintFilter();
      const releaseDate = String(r.release_date ?? '').slice(0, 10);
      const matchesDateFrom = !this.dateFrom() || (!!releaseDate && releaseDate >= this.dateFrom());
      const matchesDateTo = !this.dateTo() || (!!releaseDate && releaseDate <= this.dateTo());
      const searchableText = [r.name, r.version_number, r.notes, this.projectName(r.project_id), this.sprintName(r.sprint_id)]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      const matchesSearch = !query || searchableText.includes(query);
      return matchesStatus && matchesSprint && matchesDateFrom && matchesDateTo && matchesSearch;
    });
  });
  readonly selectedRelease = computed(() => this.releases().find(r => r.id === this.selectedReleaseId()) ?? null);
  readonly statusOptions: ReleaseStatus[] = ['PLANNED', 'IN_PROGRESS', 'RELEASED', 'CANCELLED'];
  readonly form = signal<Partial<ReleaseRecord>>({ status: 'PLANNED' });
  readonly formErrors = signal<Record<string, string>>({});

  ngOnInit(): void { this.projectContext.loadProjects(); this.loadProjects(); this.loadUsers(); }

  private headers() { return { headers: this.auth.getAuthHeaders() }; }
  private url(path: string) { return `${String(this.baseUrl ?? '').replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`; }

  /** Same authenticated collection fallback pattern used by the Epics component. */
  private getCollection(urls: string[]) {
    const tryNext = (index: number): any => {
      if (index >= urls.length) return of([]);
      return this.http.get<any>(urls[index], this.headers()).pipe(catchError(() => tryNext(index + 1)));
    };
    return tryNext(0);
  }

  /** The Sprints API used elsewhere in PROFESSY is /sprints?project_id={id}. */
  private loadSprintsForProject(projectId: number) {
    return this.http.get<any>(this.url(`/sprints?project_id=${projectId}`), this.headers()).pipe(
      catchError(() => this.http.get<any>(this.url('/sprints'), this.headers())),
      map(response => this.extractArray(response)
        .map(s => ({
          ...s,
          id: Number(s?.id ?? s?.sprint_id ?? s?.sprintId),
          project_id: Number(s?.project_id ?? s?.projectId ?? s?.project?.id ?? s?.project?.project_id),
          name: s?.name ?? s?.sprint_name ?? s?.sprintName ?? s?.title ?? `Sprint ${s?.id ?? ''}`
        }))
        .filter(s => s.id > 0 && (!s.project_id || s.project_id === projectId)))
    );
  }

  /** Resolve the creator ID from the application's AuthService/session; it is not a form field. */
  private getAuthenticatedUserId(): number | null {
    const readId = (value: any): number | null => {
      if (value && typeof value === 'object') {
        value = value.id ?? value.user_id ?? value.userId ?? value.user?.id ?? value.user?.user_id ?? value.user?.userId;
      }
      const id = Number(value);
      return Number.isFinite(id) && id > 0 ? id : null;
    };


    try {
      for (const storage of [sessionStorage, localStorage]) {
        for (const key of ['user', 'currentUser', 'loggedInUser', 'authUser']) {
          const raw = storage.getItem(key);
          if (!raw) continue;
          try {
            const user = JSON.parse(raw);
            const id = readId(user);
            if (id) return id;
            const email = String(user?.email ?? user?.user?.email ?? '').trim().toLowerCase();
            if (email) {
              const matchedId = readId(this.users().find(candidate => String(candidate.email ?? '').trim().toLowerCase() === email));
              if (matchedId) return matchedId;
            }
          } catch { /* Continue to token lookup. */ }
        }
        for (const key of ['token', 'access_token', 'accessToken']) {
          const token = storage.getItem(key);
          if (!token || token.split('.').length !== 3) continue;
          try {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            const id = readId(payload?.user_id ?? payload?.userId ?? payload?.id ?? payload?.sub);
            if (id) return id;
            const email = String(payload?.email ?? payload?.preferred_username ?? '').trim().toLowerCase();
            if (email) {
              const matchedId = readId(this.users().find(candidate => String(candidate.email ?? '').trim().toLowerCase() === email));
              if (matchedId) return matchedId;
            }
          } catch { /* Ignore malformed token and try the next key. */ }
        }
      }
    } catch { /* Storage may be unavailable in some execution contexts. */ }
    return null;
  }

  /** Resolve the organization from the selected project or the authenticated app session. */
  private getOrganizationId(projectId?: number): number | null {
    const readId = (value: any): number | null => {
      if (value && typeof value === 'object') {
        value = value.id ?? value.org_id ?? value.orgId ?? value.organization_id ?? value.organizationId;
      }
      const id = Number(value);
      return Number.isFinite(id) && id > 0 ? id : null;
    };
    const project = this.projects().find(p => Number(p.id) === Number(projectId ?? this.form().project_id ?? this.selectedProjectId()));
    const projectOrgId = readId(project?.['org_id'] ?? project?.['orgId'] ?? project?.['organization_id'] ?? project?.['organizationId'] ?? project?.['organization'] ?? project?.['org']);
    if (projectOrgId) return projectOrgId;

    try {
      const orgKeys = ['orgId', 'org_id', 'organizationId', 'organization_id', 'currentOrgId', 'current_org_id', 'selectedOrgId', 'selected_org_id'];
      const objectKeys = ['organization', 'currentOrganization', 'selectedOrganization', 'currentOrg', 'selectedOrg', 'org', 'currentUser', 'loggedInUser', 'authUser', 'user'];
      for (const storage of [localStorage, sessionStorage]) {
        for (const key of orgKeys) {
          const id = readId(storage.getItem(key));
          if (id) return id;
        }
        for (const key of objectKeys) {
          const raw = storage.getItem(key);
          if (!raw) continue;
          try {
            const value = JSON.parse(raw);
            const id = readId(value?.org_id ?? value?.orgId ?? value?.organization_id ?? value?.organizationId ?? value?.organization ?? value?.org);
            if (id) return id;
          } catch { /* Not a JSON session value; try token claims below. */ }
        }
        for (const key of ['access_token', 'accessToken', 'token']) {
          const token = storage.getItem(key);
          if (!token || token.split('.').length !== 3) continue;
          try {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            const id = readId(payload?.org_id ?? payload?.orgId ?? payload?.organization_id ?? payload?.organizationId ?? payload?.organization ?? payload?.org);
            if (id) return id;
          } catch { /* Ignore malformed token claims. */ }
        }
      }
    } catch { /* Browser storage may be unavailable. */ }
    return null;
  }

  loadProjects(): void {
    this.loading.set(true);
    this.getCollection([this.url('/projects'), this.url('/project')]).subscribe({
      next: (response: any) => {
        const list = this.extractArray(response).map(p => ({ ...p, id: Number(p?.id ?? p?.project_id ?? p?.projectId), name: p?.name ?? p?.project_name ?? p?.projectName ?? p?.title ?? `Project ${p?.id ?? ''}` }))
          .filter(p => Number.isFinite(p.id) && p.id > 0);
        this.projects.set(list);
        const sharedId = this.projectContext.selectedProjectId();
        const sharedProject = list.find(project => project.id === sharedId);
        if (sharedProject) {
          if (this.selectedProjectId() !== sharedProject.id) this.onProjectChange(sharedProject.id);
        } else {
          this.selectedProjectId.set(null);
          this.releases.set([]);
          this.sprints.set([]);
          this.loading.set(false);
        }
      },
      error: () => { this.projects.set([]); this.loading.set(false); this.errorMessage.set('Projects could not be loaded. Check the projects API and authentication.'); }
    });
  }

  loadUsers(): void {
    this.http.get<any>(this.url('/users'), this.headers()).pipe(catchError(() => of([]))).subscribe(response => {
      this.users.set(this.extractArray(response).map(u => ({ ...u, id: Number(u?.id ?? u?.user_id), name: u?.name ?? u?.full_name ?? u?.fullName ?? [u?.first_name, u?.last_name].filter(Boolean).join(' ') ?? u?.email ?? `User ${u?.id ?? ''}`, email: u?.email }))
        .filter(u => Number.isFinite(u.id) && u.id > 0));
    });
  }

  String(value: unknown): string { return String(value ?? ''); }

  dateFromDate(): Date | null { return this.parseDateValue(this.dateFrom()); }
  dateToDate(): Date | null { return this.parseDateValue(this.dateTo()); }
  private parseDateValue(value: string): Date | null {
    if (!value) return null;
    const parts = value.slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  formatDateValue(value: Date | null): string {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  statusCount(status: string): number {
    return this.releases().filter(release => status === 'ALL' || String(release.status || 'PLANNED').toUpperCase() === status).length;
  }

  clearFilters(): void { this.statusFilter.set('ALL'); this.sprintFilter.set('ALL'); this.dateFrom.set(''); this.dateTo.set(''); }

  onProjectChange(value: number | string | null): void {
    const id = Number(value);
    const projectId = Number.isFinite(id) && id > 0 ? id : null;
    const projectChanged = this.selectedProjectId() !== projectId;
    this.selectedProjectId.set(projectId);
    if (projectChanged) this.sprintFilter.set('ALL');
    this.profileMode.set(null);
    this.selectedReleaseId.set(null); this.releaseItems.set([]);
    if (this.selectedProjectId()) this.loadProjectData(this.selectedProjectId()!);
    else { this.releases.set([]); this.sprints.set([]); this.loading.set(false); }
  }

  private loadProjectData(projectId: number): void {
    this.loading.set(true); this.errorMessage.set('');
    forkJoin({
      releases: this.http.get<any>(this.url(`/releases/project/${projectId}`), this.headers()).pipe(catchError(err => { this.errorMessage.set(err?.error?.message ?? `Releases could not be loaded (HTTP ${err?.status ?? 'unknown'}). Check GET /releases/project/${projectId}.`); return of([]); })),
      sprints: this.loadSprintsForProject(projectId).pipe(catchError(() => of([])))
    }).pipe(finalize(() => this.loading.set(false))).subscribe(({ releases, sprints }) => {
      if (this.selectedProjectId() !== projectId) return;
      let releaseRows = this.extractArray(releases).map(r => this.normalizeRelease(r)).filter(r => Number.isFinite(r.id) && r.id > 0);
      const selectedId = this.selectedReleaseId();
      const locallySavedSelection = selectedId ? this.releases().find(release => release.id === selectedId) : undefined;
      if (locallySavedSelection && !releaseRows.some(release => release.id === selectedId)) releaseRows = [locallySavedSelection, ...releaseRows];
      this.releases.set(releaseRows);

      this.sprints.set(this.extractArray(sprints).map(s => ({ ...s, id: Number(s?.id ?? s?.sprint_id ?? s?.sprintId), name: s?.name ?? s?.sprint_name ?? s?.sprintName ?? s?.title ?? `Sprint ${s?.id ?? ''}` })).filter(s => s.id > 0));
      // Keep a just-created or edited release open when refreshing its directory.
      if (selectedId && releaseRows.some(release => release.id === selectedId) && this.profileMode() === 'view') {
        this.loadReleaseItems(selectedId);
      } else if (selectedId && !releaseRows.some(release => release.id === selectedId)) {
        this.selectedReleaseId.set(null);
        this.releaseItems.set([]);
        this.detailLoading.set(false);
      }
    });
  }

  openCreate(): void {
    this.errorMessage.set(''); this.successMessage.set(''); this.formErrors.set({}); this.isEditing.set(false);
    this.selectedReleaseId.set(null);
    this.profileTab.set('overview');
    const loggedInUserId = this.getAuthenticatedUserId();
    this.form.set({ project_id: this.selectedProjectId() ?? undefined, sprint_id: undefined, user_id: loggedInUserId ?? undefined, assignee_id: loggedInUserId ?? undefined, name: '', version_number: '', status: 'PLANNED', release_date: null, notes: '' });
    this.candidateItems.set([]); this.selectedWorkItemIds.set([]);
    if (this.selectedProjectId()) this.loadSprintsForProject(this.selectedProjectId()!).pipe(catchError(() => of([]))).subscribe(items => { if (Number(this.form().project_id) === this.selectedProjectId()) this.sprints.set(items); });
    this.profileMode.set('create');
  }

  openEdit(release: ReleaseRecord): void {
    this.errorMessage.set(''); this.successMessage.set(''); this.formErrors.set({}); this.isEditing.set(true);
    this.selectedReleaseId.set(release.id);
    this.profileTab.set('overview');
    const loggedInUserId = this.getAuthenticatedUserId();
    this.form.set({ ...release, user_id: loggedInUserId ?? undefined, assignee_id: loggedInUserId ?? undefined, release_date: release.release_date ? String(release.release_date).slice(0, 10) : null });
    this.selectedWorkItemIds.set([]); this.loadCandidateItems(Number(release.sprint_id), Number(release.project_id), release.id);
    this.profileMode.set('edit');
  }

  closeDrawer(): void {
    if (this.saving()) return;
    if (this.profileMode() === 'edit' && this.selectedRelease()) {
      this.profileMode.set('view');
      this.isEditing.set(false);
      this.formErrors.set({});
      this.loadReleaseItems(this.selectedRelease()!.id);
      return;
    }
    this.profileMode.set(null);
    this.isEditing.set(false);
  }
  updateForm<K extends keyof ReleaseRecord>(key: K, value: ReleaseRecord[K] | null): void {
    this.form.update(current => ({ ...current, [key]: value }));
    if (key === 'sprint_id') this.loadCandidateItems(Number(value), Number(this.form().project_id));
  }

  private loadCandidateItems(sprintId: number, projectId: number, releaseId?: number): void {
    this.candidateItems.set([]); this.selectedWorkItemIds.set([]);
    if (!sprintId || !projectId) return;
    this.itemsLoading.set(true);
    const headers = this.headers();
    forkJoin({
      epics: this.http.get<any>(this.url(`/projects/${projectId}/epics`), headers).pipe(catchError(() => of([]))),
      stories: this.http.get<any>(this.url(`/projects/${projectId}/stories`), headers).pipe(catchError(() => of([]))),
      tasks: this.http.get<any>(this.url(`/tasks?project_id=${projectId}`), headers).pipe(catchError(() => this.http.get<any>(this.url('/tasks'), headers).pipe(catchError(() => of([]))))),
      linked: releaseId ? this.http.get<any>(this.url(`/release-items/release/${releaseId}`), headers).pipe(catchError(() => of([]))) : of([])
    }).pipe(finalize(() => this.itemsLoading.set(false))).subscribe(({ epics, stories, tasks, linked }) => {
      if (Number(this.form().sprint_id) !== sprintId || Number(this.form().project_id) !== projectId) return;
      const normalize = (raw: any, type: CandidateWorkItem['item_type']): CandidateWorkItem | null => {
        const id = Number(raw?.id ?? raw?.work_item_id ?? raw?.workItemId);
        const itemProject = Number(raw?.project_id ?? raw?.projectId ?? raw?.project?.id ?? projectId);
        const itemSprint = Number(raw?.sprint_id ?? raw?.sprintId ?? raw?.sprint?.id ?? 0) || null;
        if (!id || itemProject !== projectId || (itemSprint != null && itemSprint !== sprintId)) return null;
        return { id, item_type: type, project_id: itemProject, sprint_id: itemSprint, title: String(raw?.title ?? raw?.name ?? raw?.summary ?? raw?.epic_name ?? `${type} ${id}`), status: String(raw?.status ?? 'UNKNOWN'), key: raw?.key ?? raw?.epic_code ?? raw?.story_code ?? raw?.task_code };
      };
      const candidates = [
        ...this.extractArray(epics).map(x => normalize(x, 'EPIC')),
        ...this.extractArray(stories).map(x => normalize(x, 'STORY')),
        ...this.extractArray(tasks).map(x => normalize(x, 'TASK'))
      ].filter((x): x is CandidateWorkItem => !!x);
      const unique = new Map<string, CandidateWorkItem>();
      candidates.forEach(item => unique.set(`${item.item_type}:${item.id}`, item));
      const sorted = [...unique.values()].sort((a,b) => ['EPIC','STORY','TASK'].indexOf(a.item_type)-['EPIC','STORY','TASK'].indexOf(b.item_type) || a.title.localeCompare(b.title));
      this.candidateItems.set(sorted);
      if (releaseId) {
        const linkedKeys = this.extractArray(linked).map((raw: any) => {
          const item = this.normalizeItem(raw);
          return item.work_item_id && item.item_type ? `${item.item_type}:${item.work_item_id}` : null;
        }).filter((key: string | null): key is string => !!key);
        this.selectedWorkItemIds.set(linkedKeys);
      }
    });
  }

  workItemSelectionKey(item: Pick<CandidateWorkItem, 'id' | 'item_type'>): string { return `${item.item_type}:${item.id}`; }
  toggleWorkItem(item: CandidateWorkItem, checked: boolean): void {
    const key = this.workItemSelectionKey(item);
    this.selectedWorkItemIds.update(ids => checked ? (ids.includes(key) ? ids : [...ids, key]) : ids.filter(x => x !== key));
  }
  isWorkItemSelected(item: CandidateWorkItem): boolean { return this.selectedWorkItemIds().includes(this.workItemSelectionKey(item)); }
  removeWorkItem(item: CandidateWorkItem): void { this.toggleWorkItem(item, false); }
  selectAllWorkItems(checked: boolean): void { this.selectedWorkItemIds.set(checked ? this.candidateItems().map(item => this.workItemSelectionKey(item)) : []); }
  readonly selectedCandidateItems = computed(() => this.candidateItems().filter(item => this.selectedWorkItemIds().includes(this.workItemSelectionKey(item))));
  readonly allWorkItemsSelected = computed(() => this.candidateItems().length > 0 && this.candidateItems().every(item => this.selectedWorkItemIds().includes(this.workItemSelectionKey(item))));
  workItemsByType(type: CandidateWorkItem['item_type']): CandidateWorkItem[] { return this.candidateItems().filter(item => item.item_type === type); }
  trackCandidate(_: number, item: CandidateWorkItem): string { return `${item.item_type}:${item.id}`; }

  saveRelease(): void {
    if (this.saving()) return;
    // The header owns project scope for the whole application. Bind the form
    // to that shared selection at save time so stale page state cannot leak.
    const f = { ...this.form(), project_id: this.projectContext.selectedProjectId() ?? this.selectedProjectId() ?? undefined };
    const errors: Record<string, string> = {};
    if (!Number(f.project_id)) errors['project_id'] = 'Choose a project from the top header.';
    if (!Number(f.sprint_id)) errors['sprint_id'] = 'Choose a sprint.';
    if (!String(f.name ?? '').trim()) errors['name'] = 'Enter a release name.';
    if (!String(f.version_number ?? '').trim()) errors['version_number'] = 'Enter a version.';
    // Always bind ownership to the authenticated session; never trust a stale/form-supplied user ID.
    const creatorId = this.getAuthenticatedUserId();
    const orgId = this.getOrganizationId(Number(f.project_id));
    if (!creatorId) errors['user_id'] = 'Could not identify the signed-in user. Please sign out and sign in again, then retry.';
    if (!orgId) errors['org_id'] = 'Organization ID is missing. Select a project in an organization or restore the organization context in your session.';
    this.formErrors.set(errors); if (Object.keys(errors).length) return;

    const projectId = Number(f.project_id);
    const sprintId = Number(f.sprint_id);
    const payload: any = {
      orgId, org_id: orgId,
      projectId, project_id: projectId, sprintId, sprint_id: sprintId,
      ...(creatorId ? { userId: creatorId, user_id: creatorId } : {}),
      assigneeId: creatorId, assignee_id: creatorId,
      name: String(f.name).trim(), versionNumber: String(f.version_number).trim(), version_number: String(f.version_number).trim(),
      status: f.status ?? 'PLANNED', releaseDate: f.release_date || null, release_date: f.release_date || null, notes: f.notes ?? null
    };
    this.saving.set(true); this.errorMessage.set(''); this.successMessage.set('');
    const editing = this.isEditing() && !!f.id;
    const request = editing
      ? this.http.put<ReleaseRecord>(this.url(`/releases/${f.id}`), payload, this.headers())
      : this.http.post<ReleaseRecord>(this.url('/releases/create'), payload, this.headers());
    request.pipe(
      switchMap(saved => {
        const savedRecord = this.extractArray(saved)[0] ?? saved;
        const release = this.normalizeRelease(savedRecord);
        const releaseId = Number(release.id ?? (savedRecord as any)?.releaseId ?? (savedRecord as any)?.release_id);
        if (!releaseId) throw new Error('The release API returned no release ID. The release may have been saved; refresh the list before retrying.');
        const chosen = this.candidateItems().filter(item => this.selectedWorkItemIds().includes(this.workItemSelectionKey(item)));
        if (editing) {
          const itemOrgId = this.getOrganizationId(projectId) ?? Number((savedRecord as any)?.orgId ?? (savedRecord as any)?.org_id ?? release.org_id);
          const deleteExisting = this.http.delete<void>(this.url(`/release-items/release/${releaseId}/all`), this.headers()).pipe(catchError(linkErr => { throw linkErr; }));
          return deleteExisting.pipe(switchMap(() => {
            if (!chosen.length) return of({ saved, releaseId, linkedCount: 0, linkError: false, linkMessage: '' });
            if (!Number.isFinite(itemOrgId) || itemOrgId <= 0) return of({ saved, releaseId, linkedCount: 0, linkError: true, linkMessage: 'Release updated, but scope could not be saved because organization ID is missing.' });
            const itemPayload = chosen.map(item => ({ orgId: itemOrgId, org_id: itemOrgId, releaseId, release_id: releaseId, sprintId, sprint_id: sprintId, workItemId: item.id, work_item_id: item.id, itemType: item.item_type, item_type: item.item_type }));
            return this.http.post<any>(this.url(`/release-items/release/${releaseId}/bulk`), itemPayload, this.headers()).pipe(map(() => ({ saved, releaseId, linkedCount: chosen.length, linkError: false, linkMessage: '' })), catchError(linkErr => of({ saved, releaseId, linkedCount: 0, linkError: true, linkMessage: linkErr?.error?.message ?? 'Release updated, but selected work items could not be linked.' })));
          }), catchError(linkErr => of({ saved, releaseId, linkedCount: 0, linkError: true, linkMessage: linkErr?.error?.message ?? 'Release was updated, but its existing scope could not be replaced.' })));
        }
        if (!chosen.length) return of({ saved, releaseId, linkedCount: 0, linkError: false, linkMessage: '' });
        // ReleaseItemsService.validateItem requires orgId on every item.
        const itemOrgId = this.getOrganizationId(projectId) ?? Number((savedRecord as any)?.orgId ?? (savedRecord as any)?.org_id ?? release.org_id);
        if (!Number.isFinite(itemOrgId) || itemOrgId <= 0) {
          return of({ saved, releaseId, linkedCount: 0, linkError: true, linkMessage: 'Release was saved, but work items were not linked because the organization ID is missing. Ensure the project/session exposes orgId.' });
        }
        // ReleaseItemsService.validateItem requires sprintId on every release item.
        // Use the sprint selected for this release (candidate items are already filtered to it).
        const itemPayload = chosen.map(item => ({
          orgId: itemOrgId, org_id: itemOrgId,
          releaseId, release_id: releaseId,
          sprintId, sprint_id: sprintId,
          workItemId: item.id, work_item_id: item.id,
          itemType: item.item_type, item_type: item.item_type
        }));
        return this.http.post<any>(this.url(`/release-items/release/${releaseId}/bulk`), itemPayload, this.headers()).pipe(
          map(() => ({ saved, releaseId, linkedCount: chosen.length, linkError: false, linkMessage: '' })),
          catchError(linkErr => of({ saved, releaseId, linkedCount: 0, linkError: true, linkMessage: linkErr?.error?.message ?? 'The release was created, but its work items could not be linked. Check POST /release-items/release/{id}/bulk.' }))
        );
      }),
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: result => {
        const savedRecord = this.extractArray(result.saved)[0] ?? result.saved;
        const savedRelease = this.normalizeRelease(savedRecord);
        if (savedRelease.id) this.releases.update(list => [savedRelease, ...list.filter(release => release.id !== savedRelease.id)]);
        this.profileMode.set('view');
        this.isEditing.set(false);
        this.successMessage.set(result.linkError ? result.linkMessage : (editing ? `Release updated${result.linkedCount ? ` with ${result.linkedCount} scoped work item${result.linkedCount === 1 ? '' : 's'}` : ' with no work items selected'}.` : (result.linkedCount ? `Release created with ${result.linkedCount} work item${result.linkedCount === 1 ? '' : 's'}.` : 'Release created.')));
        // Preserve the newly saved release as the selection when the refreshed
        // release list arrives; loadProjectData will then load its linked items.
        this.selectedReleaseId.set(result.releaseId);
        this.loadProjectData(projectId);
      },
      error: err => {
        const message = err?.error?.message ?? err?.message;
        this.errorMessage.set(message || 'Could not save the release. Check the Network tab for the failing release or release-items API request.');
      }
    });
  }

  openOverview(release: ReleaseRecord): void {
    if (this.selectedReleaseId() !== release.id) {
      this.selectedReleaseId.set(release.id);
      this.loadReleaseItems(release.id);
    }
    this.profileTab.set('overview');
    this.profileMode.set('view');
  }

  closeOverview(): void { this.profileMode.set(null); this.profileTab.set('overview'); }

  editOverviewRelease(release: ReleaseRecord): void {
    this.openEdit(release);
  }

  setProfileTab(tab: 'overview' | 'items'): void { this.profileTab.set(tab); }

  selectRelease(id: number): void {
    // Clicking the open row collapses it; clicking another row opens that release.
    if (this.selectedReleaseId() === id) {
      this.selectedReleaseId.set(null);
      this.releaseItems.set([]);
      this.detailLoading.set(false);
      return;
    }
    this.selectedReleaseId.set(id);
    this.loadReleaseItems(id);
  }

  private loadReleaseItems(id: number): void {
    this.detailLoading.set(true);
    this.releaseItems.set([]);
    this.errorMessage.set('');

    // Try the canonical endpoint first, then common collection-query variants used by the API.
    this.getCollection([
      this.url(`/release-items/release/${id}`),
      this.url(`/release-items?release_id=${id}`),
      this.url(`/release-items?releaseId=${id}`)
    ]).pipe(
      map((response): ReleaseItem[] => this.extractArray(response).map((item: any) => this.normalizeItem(item))
        .filter((item: ReleaseItem) => !!item.work_item_id || !!item.id)),
      switchMap((linked: ReleaseItem[]) => {
        if (!linked.length) return of({ linked, workItems: [] as any[] });
        const release = this.releases().find(item => item.id === id) ?? this.selectedRelease();
        const projectId = Number(release?.project_id);
        // /work-items/{id} is not implemented consistently across work-item types.
        // Load the existing Epic/Story/Task collections and resolve IDs against them instead.
        if (!projectId) return of({ linked, workItems: [] as any[] });
        return forkJoin({
          epics: this.getCollection([this.url(`/projects/${projectId}/epics`), this.url(`/epics?project_id=${projectId}`)]),
          stories: this.getCollection([this.url(`/projects/${projectId}/stories`), this.url(`/stories?project_id=${projectId}`)]),
          tasks: this.getCollection([this.url(`/tasks?project_id=${projectId}`), this.url('/tasks')])
        }).pipe(map(collections => ({
          linked,
          workItems: [
            ...this.extractArray(collections.epics).map(item => ({ ...item, __type: 'EPIC' })),
            ...this.extractArray(collections.stories).map(item => ({ ...item, __type: 'STORY' })),
            ...this.extractArray(collections.tasks).map(item => ({ ...item, __type: 'TASK' }))
          ]
        })));
      }),
      finalize(() => this.detailLoading.set(false))
    ).subscribe({
      next: (result: { linked: ReleaseItem[]; workItems: any[] }) => {
        if (this.selectedReleaseId() !== id) return;
        const { linked, workItems } = result;
        const byId = new Map<string, any>();
        for (const raw of workItems) {
          const workId = Number(raw?.id ?? raw?.work_item_id ?? raw?.workItemId);
          if (workId > 0) byId.set(`${raw.__type}:${workId}`, raw);
        }
        const resolved = linked.map((item: ReleaseItem) => {
          const detail = item.work_item_id ? byId.get(`${item.item_type}:${item.work_item_id}`) : null;
          return {
            ...detail,
            ...item,
            work_item_id: item.work_item_id,
            item_type: item.item_type || detail?.__type || 'TASK',
            key: item.key ?? detail?.key ?? detail?.epic_code ?? detail?.story_code ?? detail?.task_code,
            title: item.title ?? item.summary ?? detail?.title ?? detail?.name ?? detail?.summary ?? detail?.epic_name ?? `Work item #${item.work_item_id ?? item.id}`,
            status: item.status ?? detail?.status ?? 'UNKNOWN'
          } as ReleaseItem;
        });
        this.releaseItems.set(resolved);

      },
      error: (err: any) => {
        this.releaseItems.set([]);
        this.errorMessage.set(err?.error?.message ?? 'Could not load linked items. Please try again.');
      }
    });
  }

  updateStatus(release: ReleaseRecord, value: ReleaseStatus): void {
    if (release.status === value || this.editingStatusId() === release.id) return;
    this.editingStatusId.set(release.id); this.errorMessage.set('');
    const previous=release.status;
    this.releases.update(list=>list.map(r=>r.id===release.id?{...r,status:value}:r));
    this.http.patch<ReleaseRecord>(this.url(`/releases/${release.id}/status?status=${encodeURIComponent(value)}`), {}, this.headers())
      .pipe(finalize(() => this.editingStatusId.set(null))).subscribe({
        next: updated => { this.releases.update(list => list.map(r => r.id === release.id ? { ...r, ...updated, status: updated?.status ?? value } : r)); if (this.selectedReleaseId() === release.id) this.loadReleaseItems(release.id); },
        error: err => { this.releases.update(list=>list.map(r=>r.id===release.id?{...r,status:previous}:r)); this.errorMessage.set(err?.error?.message ?? 'Status update failed. Please try again.'); }
      });
  }

  projectName(id: number): string { return this.projects().find(p => p.id === Number(id))?.name ?? `Project ${id}`; }
  toSprintId(value: number | string | null | undefined): number {
    const id = Number(value ?? 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }
  sprintName(id: number): string { return this.sprints().find(s => s.id === Number(id))?.name ?? `Sprint ${id}`; }
  userName(id: number | undefined): string { if (!id) return 'Unassigned'; const u = this.users().find(x => x.id === Number(id)); return u?.name ?? `User ${id}`; }
  loggedInUserName(): string { const id = this.getAuthenticatedUserId(); return id ? this.userName(id) : 'Signed-in user'; }
  statusLabel(status: string | undefined): string { return String(status ?? 'UNKNOWN').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
  itemHref(item: ReleaseItem): string { return item.work_item_id ? `/work-items/${item.work_item_id}` : '#'; }
  onSearchChange(value: string): void { this.searchTerm.set(value ?? ''); }
  clearSearch(): void { this.searchTerm.set(''); }
  trackRelease(_: number, item: ReleaseRecord): number { return item.id; }
  trackItem(index: number, item: ReleaseItem): number { return Number(item.id ?? item.work_item_id ?? index); }

  private normalizeRelease(raw: any): ReleaseRecord {
    return { ...raw, id: Number(raw?.id ?? raw?.release_id ?? raw?.releaseId), org_id: Number(raw?.org_id ?? raw?.orgId ?? raw?.organization_id ?? raw?.organizationId) || undefined, project_id: Number(raw?.project_id ?? raw?.projectId ?? raw?.project?.id), sprint_id: Number(raw?.sprint_id ?? raw?.sprintId ?? raw?.sprint?.id), user_id: Number(raw?.user_id ?? raw?.userId), assignee_id: Number(raw?.assignee_id ?? raw?.assigneeId), name: raw?.name ?? raw?.release_name ?? '', version_number: raw?.version_number ?? raw?.versionNumber ?? '', status: raw?.status ?? 'PLANNED', release_date: raw?.release_date ?? raw?.releaseDate ?? null, notes: raw?.notes ?? '' } as ReleaseRecord;
  }
  private normalizeItem(raw: any): ReleaseItem {
    const nested = raw?.work_item ?? raw?.workItem ?? raw?.item ?? raw?.workItemDetails ?? raw?.work_item_details;
    const workItemId = Number(raw?.work_item_id ?? raw?.workItemId ?? raw?.work_item?.id ?? raw?.workItem?.id ?? raw?.item_id ?? raw?.itemId ?? nested?.id);
    return {
      ...raw,
      id: Number(raw?.id ?? raw?.release_item_id ?? raw?.releaseItemId) || undefined,
      release_id: Number(raw?.release_id ?? raw?.releaseId) || undefined,
      work_item_id: Number.isFinite(workItemId) && workItemId > 0 ? workItemId : undefined,
      item_type: String(raw?.item_type ?? raw?.itemType ?? raw?.work_item_type ?? raw?.workItemType ?? raw?.type ?? nested?.type ?? 'TASK').toUpperCase(),
      status: raw?.work_item_status ?? raw?.workItemStatus ?? raw?.status ?? nested?.status,
      title: raw?.title ?? raw?.summary ?? raw?.work_item_title ?? raw?.workItemTitle ?? nested?.title ?? nested?.name ?? nested?.summary,
      key: raw?.key ?? raw?.work_item_key ?? raw?.workItemKey ?? nested?.key
    };
  }
  private extractArray(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== 'object') return [];
    for (const key of ['content', 'data', 'items', 'results', 'records', 'projects', 'project', 'users', 'user', 'teams', 'team', 'sprints', 'sprint', 'releases', 'release', 'releaseList', 'release_list', 'releaseItems', 'release_items', 'releaseItemList', 'release_item_list', 'epics', 'stories', 'tasks']) {
      const value = response[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        const nested = this.extractArray(value);
        if (nested.length) return nested;
      }
    }
    // Some APIs return one DTO directly instead of an array or {data: [...] }.
    if (response.id != null || response.release_item_id != null || response.releaseItemId != null || response.work_item_id != null || response.workItemId != null || response.release_id != null || response.releaseId != null || response.project_id != null || response.projectId != null) return [response];
    return [];
  }
}
