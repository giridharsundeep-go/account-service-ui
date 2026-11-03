import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, from, of } from 'rxjs';
import {
  catchError,
  map,
  mergeMap,
  switchMap,
  toArray,
  finalize,
  shareReplay,
} from 'rxjs/operators';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { WorkspaceSettingsService } from './workspace-settings.service';
export interface ProjectWorkItem {
  id: number;
  kind: 'EPIC' | 'STORY' | 'TASK' | 'ISSUE';
  key: string;
  title: string;
  status: string;
  projectId: number;
  sprintId: number | null;
  teamId: number | null;
  assigneeId: number | null;
  assignee: string;
  points: number;
  due: string;
  raw: any;
}
export interface ProjectWorkSnapshot {
  items: ProjectWorkItem[];
  sprints: any[];
  releases: any[];
  teams: any[];
  users: any[];
  unavailable: string[];
}

export function workItemTitle(row: any, kind: ProjectWorkItem['kind']): string {
  const candidates = kind === 'EPIC'
    ? [row.name, row.epic_name, row.epicName, row.title]
    : [row.title, row[`${kind.toLowerCase()}_title`], row[`${kind.toLowerCase()}Title`], row.name];
  return [...candidates, row.summary, row.display_name, row.displayName].find(
    value => typeof value === 'string' && value.trim(),
  )?.trim() || 'Untitled item';
}
@Injectable({ providedIn: 'root' })
export class ProjectWorkService {
  private workflow = inject(WorkspaceSettingsService);
  private inFlight = new Map<number, Observable<ProjectWorkSnapshot>>();
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = String(environment.apiBaseUrlM || '').replace(/\/$/, '');
  rows(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of [
      'content',
      'data',
      'items',
      'results',
      'records',
      'epics',
      'stories',
      'tasks',
      'issues',
      'sprints',
      'releases',
      'teams',
      'users',
      'members',
      '_embedded',
    ]) {
      if (value[key]) {
        const found = this.rows(value[key]);
        if (found.length || Array.isArray(value[key])) return found;
      }
    }
    return [];
  }
  private pid(r: any): number {
    return Number(r?.project_id ?? r?.projectId ?? r?.project?.id ?? 0);
  }
  load(projectId: number): Observable<ProjectWorkSnapshot> {
    const pending = this.inFlight.get(projectId);
    if (pending) return pending;
    const unavailable: string[] = [];
    const read = (label: string, path: string) => {
      const unavailableSource = () => {
        if (!unavailable.includes(label)) unavailable.push(label);
      };
      const getPage = (page?: number) =>
        this.http.get<any>(
          this.base +
            path +
            (page === undefined ? '' : (path.includes('?') ? '&' : '?') + 'page=' + page),
          { headers: this.auth.getAuthHeaders() },
        );
      return getPage().pipe(
        switchMap((response) => {
          const first = this.rows(response);
          const page = response?.data && !Array.isArray(response.data) ? response.data : response;
          const total = Number(page?.totalPages ?? page?.total_pages ?? page?.page?.totalPages ?? page?.pagination?.totalPages ??
            Math.ceil(Number(page?.totalElements ?? page?.total_elements ?? 0) / Math.max(1, Number(page?.size ?? page?.pageSize ?? first.length))));
          if (!Number.isFinite(total) || total <= 1) return of(first);
          return from(Array.from({ length: Math.ceil(total) - 1 }, (_, index) => index + 1)).pipe(
            mergeMap(
              (page) =>
                getPage(page).pipe(
                  map((r) => this.rows(r)),
                  catchError(() => {
                    unavailableSource();
                    return of([]);
                  }),
                ),
              4,
            ),
            toArray(),
            map((pages) => [first, ...pages].flat()),
          );
        }),
        catchError(() => {
          unavailableSource();
          return of([]);
        }),
      );
    };
    const request = forkJoin({
      epics: read('Epics', `/projects/${projectId}/epics`),
      stories: read('Stories', `/projects/${projectId}/stories`),
      tasks: read('Tasks', `/tasks`),
      issues: read('Issues', `/v1/issues?projectId=${projectId}`),
      sprints: read('Sprints', `/sprints?project_id=${projectId}`),
      releases: read('Releases', `/releases/project/${projectId}`),
      projectTeams: read('Project teams', `/project-teams/${projectId}`),
      teams: read('Teams', '/teams'),
      users: read('People', '/users'),
    }).pipe(
      map((data) => {
        const scoped = (r: any) => !this.pid(r) || this.pid(r) === projectId;
        const epics = data.epics.filter(scoped),
          stories = data.stories.filter(scoped);
        const recordId = (r: any) =>
          Number(r.id ?? r.work_item_id ?? r.epic_id ?? r.story_id ?? r.task_id ?? r.issue_id);
        const storyById = new Map(stories.map((r) => [recordId(r), r]));
        const epicById = new Map(epics.map((r) => [recordId(r), r]));
        const storyIds = new Set(storyById.keys()),
          epicIds = new Set(epicById.keys());
        const userById = new Map(
          data.users.map((r) => [
            Number(r.user_account_id ?? r.userAccountId ?? r.user_id ?? r.id),
            r,
          ]),
        );
        const sprints = data.sprints.filter(scoped),
          sprintIds = new Set(sprints.map((r) => Number(r.id)));
        const tasks = data.tasks.filter((r) =>
          this.pid(r)
            ? this.pid(r) === projectId
            : storyIds.has(Number(r.story_id ?? r.storyId ?? r.story?.id)) ||
              epicIds.has(Number(r.epic_id ?? r.epicId)) ||
              sprintIds.has(Number(r.sprint_id ?? r.sprintId ?? r.sprint?.id)),
        );
        const userName = (u: any) =>
          typeof u === 'string' && !/^\d+$/.test(u)
            ? u
            : String(
                u?.fullName ??
                  u?.full_name ??
                  u?.name ??
                  [u?.first_name ?? u?.firstName, u?.last_name ?? u?.lastName]
                    .filter(Boolean)
                    .join(' '),
              );
        const normalize = (r: any, kind: ProjectWorkItem['kind']): ProjectWorkItem => {
          const aid =
            Number(
              r.assignee_user_id ??
                r.assigneeUserId ??
                r.assignee_user_account_id ??
                r.assigneeUserAccountId ??
                r.assignee_id ??
                r.assigneeId ??
                r.assignee?.user_id ??
                r.assignee?.id,
            ) || null;
          const user = userById.get(Number(aid));
          const parent =
            kind === 'TASK'
              ? storyById.get(Number(r.story_id ?? r.storyId ?? r.story?.id))
              : kind === 'STORY'
                ? epicById.get(Number(r.epic_id ?? r.epicId ?? r.epic?.id))
                : null;
          return {
            id: recordId(r),
            kind,
            key: String(
              r.key ??
                r.epic_code ??
                r.story_code ??
                r.task_code ??
                r.issue_code ??
                `${kind}-${r.id}`,
            ),
            title: workItemTitle(r, kind),
            status: String(r.status ?? 'BACKLOG')
              .toUpperCase()
              .replace(/[ -]/g, '_'),
            projectId,
            sprintId: Number(r.sprint_id ?? r.sprintId ?? r.sprint?.id) || null,
            teamId:
              Number(r.team_id ?? r.teamId ?? r.team?.id ?? parent?.team_id ?? parent?.teamId) ||
              null,
            assigneeId: aid,
            assignee:
              userName(r.assignee ?? r.assignee_user ?? r.assigneeUser) ||
              String(r.assignee_name ?? r.assigneeName ?? '') ||
              userName(user) ||
              'Unassigned',
            points: Number(r.story_points ?? r.storyPoints ?? r.points ?? 0) || 0,
            due: String(r.due_date ?? r.dueDate ?? ''),
            raw: r,
          };
        };
        const all = [
          ...epics.map((r) => normalize(r, 'EPIC')),
          ...stories.map((r) => normalize(r, 'STORY')),
          ...tasks.map((r) => normalize(r, 'TASK')),
          ...data.issues.filter(scoped).map((r) => normalize(r, 'ISSUE')),
        ];
        const uniqueItems = new Map<string, ProjectWorkItem>();
        for (const item of all) {
          const key = `${item.kind}:${item.id}`;
          if (item.id > 0 && !uniqueItems.has(key)) uniqueItems.set(key, item);
        }
        return {
          items: [...uniqueItems.values()],
          sprints,
          releases: data.releases.filter(scoped).map((r) => ({
            ...r,
            name: r.name ?? r.title ?? 'Untitled release',
            status: String(r.status ?? 'UNKNOWN').toUpperCase(),
          })),
          teams: data.teams.filter(
            (t) =>
              data.projectTeams.some(
                (link) =>
                  Number(link.team_id ?? link.teamId ?? link.team?.id ?? link.id) === Number(t.id),
              ) ||
              sprints.some(
                (sp) => Number(sp.team_id ?? sp.teamId ?? sp.team?.id) === Number(t.id),
              ) ||
              all.some((i) => i.teamId === Number(t.id)),
          ),
          users: data.users,
          unavailable,
        };
      }),
      finalize(() => this.inFlight.delete(projectId)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.inFlight.set(projectId, request);
    return request;
  }
  done(status: string): boolean {
    return this.workflow.done(status) || ['DONE', 'COMPLETED', 'CLOSED', 'RESOLVED', 'RELEASED'].includes(
      String(status).toUpperCase(),
    );
  }
}
