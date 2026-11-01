import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { ProjectWorkService, ProjectWorkSnapshot } from './project-work.service';

describe('ProjectWorkService', () => {
  let service: ProjectWorkService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ProjectWorkService,
        { provide: AuthService, useValue: { getAuthHeaders: () => new HttpHeaders() } },
      ],
    });
    service = TestBed.inject(ProjectWorkService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('includes every page, scopes global tasks, and resolves ownership through parent records', () => {
    let snapshot!: ProjectWorkSnapshot;
    service.load(1).subscribe((result) => (snapshot = result));
    for (const request of http.match(() => true)) {
      const url = new URL(request.request.url, 'http://test');
      if (url.pathname.endsWith('/projects/1/stories'))
        request.flush([{ id: 20, title: 'Story', project_id: 1, team_id: 7 }]);
      else if (url.pathname.endsWith('/tasks'))
        request.flush({
          content: [
            { id: 30, story_id: 20, assignee_user_id: 4 },
            { id: 31, project_id: 2, story_id: 20 },
            { id: 32, story_id: 999 },
          ],
          totalPages: 2,
        });
      else if (url.pathname.endsWith('/users'))
        request.flush([{ user_account_id: 4, first_name: 'Maya', last_name: 'Chen' }]);
      else if (url.pathname.endsWith('/teams')) request.flush([{ id: 7, name: 'Platform' }]);
      else request.flush([]);
    }
    const pageTwo = http.expectOne((request) => request.url.endsWith('/tasks?page=1'));
    pageTwo.flush({
      content: [
        { id: 33, projectId: 1, title: 'Second page' },
        { id: 30, story_id: 20 },
      ],
      totalPages: 2,
    });
    expect(
      snapshot.items
        .filter((item) => item.kind === 'TASK')
        .map((item) => item.id)
        .sort(),
    ).toEqual([30, 33]);
    const task = snapshot.items.find((item) => item.id === 30)!;
    expect(task.teamId).toBe(7);
    // The canonical first-page record retains its owner when pages overlap.
    expect(task.assignee).toBe('Maya Chen');
    expect(snapshot.teams.map((team) => team.id)).toEqual([7]);
    expect(snapshot.unavailable).toEqual([]);
  });

  it('reports a failed source while preserving the successful project data', () => {
    let snapshot!: ProjectWorkSnapshot;
    service.load(1).subscribe((result) => (snapshot = result));
    for (const request of http.match(() => true)) {
      if (request.request.url.includes('/v1/issues?'))
        request.flush('Unavailable', { status: 503, statusText: 'Unavailable' });
      else if (request.request.url.endsWith('/projects/1/epics'))
        request.flush([{ id: 10, name: 'Project epic' }]);
      else request.flush([]);
    }
    expect(snapshot.items.map((item) => item.key)).toEqual(['EPIC-10']);
    expect(snapshot.unavailable).toEqual(['Issues']);
  });
});
