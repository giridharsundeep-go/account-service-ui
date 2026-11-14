import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, HttpHeaders } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import { Agents } from '../agents/agents';
import { Roadmap } from '../roadmap/roadmap';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';
import { ProjectWorkService } from './project-work.service';
import { WorkspaceSettingsService } from './workspace-settings.service';
import { WorkItemDialogService } from './work-item-dialog.service';
import { SuiteAppMenu } from './suite-app-menu';
import { SuiteSessionService } from './suite-session.service';
import { UserHome } from '../user-home/user-home';
import { NotificationCenter } from './notification-center';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';

describe('Workspace destinations', () => {
  const projectId = signal<number | null>(4);
  const open = vi.fn();
  const navigate = vi.fn().mockResolvedValue(true);
  beforeEach(() => {
    projectId.set(4);
    open.mockClear();
    navigate.mockClear();
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {provide: Router, useValue:{navigate,url:'/user-home'}},
        {provide: ActivatedRoute, useValue:{queryParamMap:of(convertToParamMap({})),snapshot:{queryParamMap:convertToParamMap({}),paramMap:convertToParamMap({}),params:{}}}},
        {
          provide: AuthService,
          useValue: {
            getAuthHeaders: () => new HttpHeaders(),
            isAdmin: () => true,
            getCurrentUser: () => ({ name: 'Member' }),
            getCurrentUserId: () => null,
            updateCurrentUser: vi.fn(),
          },
        },
        {
          provide: ProjectContextService,
          useValue: {
            selectedProjectId: projectId,
            selectedProject: () => ({ id: 4, name: 'Platform' }),
            projects: () => [{ id: 4, name: 'Platform' }],
            loadProjects: vi.fn(),
            error: signal(''),
          },
        },
        {
          provide: WorkspaceSettingsService,
          useValue: { can: () => true, revision: signal(0), lastEvent: signal(null), superUser: true, start: vi.fn() },
        },
        {
          provide: ProjectWorkService,
          useValue: { load: () => of({ items: [], users: [], unavailable: [] }) },
        },
        {
          provide: WorkItemDialogService,
          useValue: { open: vi.fn(), request: signal(null), revision: signal(0) },
        },
        { provide: SuiteSessionService, useValue: { open, register: () => Promise.resolve(null) } },
      ],
    });
    TestBed.overrideComponent(NotificationCenter, { set: { template: '', providers: [] } });
  });
  afterEach(() => {
    try { TestBed.inject(HttpTestingController).match(() => true).forEach(request => request.flush({})); }
    finally { TestBed.resetTestingModule(); }
  });
  it('uses the robot identity for the Agents destination',()=>{
    const f=TestBed.createComponent(UserHome);const c=f.componentInstance;
    const entries=[...c.primaryNavigation,...c.planningNavigation,...c.qualityNavigation,...c.deliveryNavigation,...c.peopleNavigation];
    expect(c.peopleNavigation.find(e=>e.id==='agents')?.icon).toBe('agents');
    expect(entries.some(e=>e.id==='agents')).toBe(true);
    f.destroy();
  });
  it('renders Agents immediately and reports a failed API instead of losing the page', async () => {
    const fixture = TestBed.createComponent(Agents);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Create agent');
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.includes('/workspace/agents'))
      .flush({ message: 'Service unavailable' }, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Service unavailable');
    expect(fixture.nativeElement.textContent).toContain('Agents');
  });
  it('renders the roadmap and its empty state on initial navigation', async () => {
    const fixture = TestBed.createComponent(Roadmap);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.includes('/workspace/roadmap'))
      .flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Plan the next three years');
    expect(fixture.nativeElement.textContent).toContain('New initiative');
  });
  it('keeps agent cards visible when optional profile fields are absent', async () => {
    const fixture = TestBed.createComponent(Agents);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.includes('/workspace/agents'))
      .flush({ data: [{ id: 12, display_name: 'Review agent', projectIds: null }] });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Review agent');
    expect(fixture.nativeElement.textContent).toContain('0 projects');
  });
  it('renders roadmap data without waiting for the ticket directory', async () => {
    const pending = new Subject<any>();
    TestBed.overrideProvider(ProjectWorkService, { useValue: { load: () => pending } });
    const fixture = TestBed.createComponent(Roadmap);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.includes('/workspace/roadmap'))
      .flush([
        { id: 8, title: 'Launch', starts_on: '2026-11-01', target_on: '2027-01-01', tickets: null },
      ]);
    await fixture.whenStable();
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Launch');
    fixture.destroy();
  });
  it('renders the app switcher and routes an app-open event through the shared launcher', () => {
    const fixture = TestBed.createComponent(SuiteAppMenu);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('gp-apps')).toBeTruthy();
    fixture.componentInstance.open(new CustomEvent('gp-app-open', {detail:{app:'meetings',projectId:4}}));
    expect(open).toHaveBeenCalledWith('meetings', { projectId: 4 });
    fixture.destroy();
  });
  it('routes Agents into the People app with the matching section selected', () => {
    const fixture = TestBed.createComponent(UserHome);
    fixture.componentInstance.setActive('agents');
    expect(navigate).toHaveBeenCalledWith(['/people'], {queryParams:{view:'agents'}});
    fixture.destroy();
  });
  it('keeps Roadmap in Professy navigation', () => {
    const fixture = TestBed.createComponent(UserHome);
    fixture.componentInstance.setActive('roadmap');
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.activeMenu).toBe('roadmap');
    fixture.destroy();
  });
});
