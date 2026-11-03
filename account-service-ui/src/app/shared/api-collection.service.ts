import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { map, mergeMap, switchMap, toArray } from 'rxjs/operators';
import { AuthService } from '../auth.service';

/** Read both array endpoints and Spring-style paginated collection envelopes. */
@Injectable({ providedIn: 'root' })
export class ApiCollectionService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  rows(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of ['data', 'content', 'items', 'results', 'records', 'projects', 'epics', 'stories', 'tasks', 'issues', 'users', 'teams', 'members', 'sprints', 'testCases', 'testcases', 'filters']) {
      if (value[key] == null) continue;
      const rows = this.rows(value[key]);
      if (rows.length || Array.isArray(value[key])) return rows;
    }
    for (const rows of Object.values(value._embedded ?? {})) {
      if (Array.isArray(rows)) return rows;
    }
    return [];
  }

  read(url: string): Observable<any[]> {
    const get = (page?: number) => {
      const address = new URL(url, 'http://localhost');
      if (page !== undefined) address.searchParams.set('page', String(page));
      return this.http.get<any>(address.href, { headers: this.auth.getAuthHeaders() });
    };
    return get().pipe(switchMap(response => {
      const first = this.rows(response);
      const page = response?.data && !Array.isArray(response.data) ? response.data : response;
      const size = Number(page?.size ?? page?.pageSize ?? page?.page?.size ?? first.length);
      const total = Number(page?.totalPages ?? page?.total_pages ?? page?.page?.totalPages ?? page?.pagination?.totalPages ??
        Math.ceil(Number(page?.totalElements ?? page?.total_elements ?? page?.page?.totalElements ?? 0) / Math.max(1, size)));
      if (!Number.isFinite(total) || total <= 1) return of(first);
      return from(Array.from({ length: total - 1 }, (_, index) => index + 1)).pipe(
        mergeMap(number => get(number).pipe(map(result => this.rows(result))), 4),
        toArray(),
        map(rest => [first, ...rest].flat()),
      );
    }));
  }
}
