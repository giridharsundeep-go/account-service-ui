import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth.service';
import { UserSelectDialog } from '../user-select-dialog/user-select-dialog';
import { Users } from '../users/users';
import { Projects } from '../projects/projects';
import { ProjectContextService } from '../project-context.service';
import { ProjectWorkService } from './project-work.service';

describe('People selection and project allocation regressions', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  const auth = {getAuthHeaders: () => new HttpHeaders()};
  const cdr = {detectChanges: () => {}, markForCheck: () => {}} as ChangeDetectorRef;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports:[UserSelectDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        {provide: MAT_DIALOG_DATA, useValue:{users:[],currentSelection:[]}},
        {provide: MatDialogRef, useValue:{close:()=>{}}},
        {provide: AuthService, useValue: auth}, {provide: MatDialog, useValue: {}},
        {provide: ProjectContextService, useValue: {}}, {provide: ProjectWorkService, useValue: {}}]
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });
  afterEach(() => { try { http.verify(); } finally { TestBed.resetTestingModule(); } });

  it('resolves role IDs, combines multi-role / region filters, and retains hidden selections', () => {
    const picker = new UserSelectDialog({close: () => {}} as any, {users: [], currentSelection: [3]}, client, auth as any, cdr);
    picker.ngOnInit();
    http.expectOne(request => request.url.endsWith('/users')).flush({data:[
      {id:1, firstName:'Maya', lastName:'Chen', roleId:7, locationCountry:'IN'},
      {id:2, firstName:'Alex', lastName:'Ray', roleId:8, locationCountry:'US'},
      {id:3, firstName:'Dana', lastName:'Lee', roleId:8, locationCountry:'IN'}
    ]});
    http.expectOne(request => request.url.endsWith('/roles')).flush({data:[{id:7,roleName:'CEO'},{id:8,roleName:'CTO'}]});
    expect(picker.users[0].designation).toBe('CTO');
    picker.selectedRoles=['CEO','CTO']; picker.selectedRegions=['IN'];
    expect(picker.getFilteredUsers().map(user => user.id).sort()).toEqual([1,3]);
    picker.selectedRoles=['CEO']; picker.toggleVisible();
    expect(picker.localSelectedIds.sort()).toEqual([1,3]);
    picker.toggleVisible();
    expect(picker.localSelectedIds).toEqual([3]);
    picker.resetFilters();
    expect(picker.getFilteredUsers().length).toBe(3);
  });

  it('a checkbox click toggles selection exactly once', async () => {
    const fixture = TestBed.createComponent(UserSelectDialog);
    fixture.detectChanges();
    http.expectOne(request=>request.url.endsWith('/users')).flush([{id:1,name:'Maya Chen',email:'maya@example.test',roleId:7}]);
    http.expectOne(request=>request.url.endsWith('/roles')).flush([{id:7,roleName:'CEO'}]);
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector('.member-option input') as HTMLInputElement;
    checkbox.click(); fixture.detectChanges();
    expect(fixture.componentInstance.localSelectedIds).toEqual([1]);
    checkbox.click(); fixture.detectChanges();
    expect(fixture.componentInstance.localSelectedIds).toEqual([]);
  });

  it('pages the filtered user directory and computes real organization totals', () => {
    const directory = new Users(client, auth as any, cdr);
    directory.loadUsers(); directory.loadRoles();
    http.expectOne(request=>request.url.endsWith('/users')).flush(Array.from({length:61},(_,i)=>({
      id:i+1,firstName:'Person',lastName:String(i+1),email:`person${i+1}@example.test`,
      isActive:i<60, roleId:i<30?7:8,locationCountry:i<40?'IN':'US',managerId:i>0?1:null
    })));
    http.expectOne(request=>request.url.endsWith('/roles')).flush([{id:7,roleName:'CEO'},{id:8,roleName:'CTO'}]);
    expect(directory.pagedUsers(directory.cachedUsersArray).length).toBe(25);
    directory.pageIndex=2;
    expect(directory.pagedUsers(directory.cachedUsersArray).length).toBe(10);
    directory.selectedRoleFilters=['CTO']; directory.selectedRegionFilters=['US']; directory.pageIndex=0;
    expect(directory.filterUsersByStatusAndSearch(directory.cachedUsersArray).length).toBe(20);
    expect(directory.peopleStats).toEqual({total:61,active:60,managers:1,regions:2});
  });

  function project(): Projects {
    return TestBed.runInInjectionContext(() => new Projects(client, auth as any, TestBed.inject(MatDialog), cdr));
  }

  it('loads numeric team IDs and individual allocations, showing only allocated teams', () => {
    const p=project();
    p.projectForm.id=10; p.selectedProject={...p.projectForm};
    (p as any).loadComposerResources(10, p.projectForm);
    http.expectOne(request=>request.url.endsWith('/users')).flush([{id:1,firstName:'Maya',lastName:'Chen',roleId:7}]);
    http.expectOne(request=>request.url.endsWith('/teams')).flush([{id:4,name:'Platform',members:[{id:1}]},{id:5,name:'Mobile',members:[]}]);
    http.expectOne(request=>request.url.endsWith('/project-individuals/10')).flush({data:[{id:1}]});
    http.expectOne(request=>request.url.endsWith('/project-teams/10')).flush({data:[4]});
    expect(p.allocatedTeams.map(team=>team.name)).toEqual(['Platform']);
    expect(p.individualMembers.map(person=>person.name)).toEqual(['Maya Chen']);
    expect(p.selectedProject?.associatedUserIds).toEqual([1]);
    p.removeAllocatedTeam(4);
    expect(p.allocatedTeams).toEqual([]);
    expect(p.individualMembers.map(person=>person.id)).toEqual([1]);
  });

  it('editing a project persists both allocation sets without modifying its sprint schedule', () => {
    const p=project();
    p.projectForm={...p.projectForm,id:10,name:'Customer portal'};
    p.selectedProject={...p.projectForm}; p.isProfileEditing=true;
    p.selectedTeamIds=['4']; p.selectedUsers=[1,2];
    p.saveProfileProject();
    const update=http.expectOne(request=>request.method==='PUT' && request.url.endsWith('/projects/10'));
    expect(update.request.body.associatedTeamIds).toEqual([4]);
    update.flush({data:{id:10,name:'Customer portal'}});
    const teams=http.expectOne(request=>request.url.endsWith('/project-teams/sync'));
    expect(teams.request.body).toEqual({project_id:10,team_ids:[4]});
    http.expectNone(request=>request.url.endsWith('/project-individuals/sync'));
    teams.flush({data:{}});
    const members=http.expectOne(request=>request.url.endsWith('/project-individuals/sync'));
    expect(members.request.body).toEqual({project_id:10,user_account_ids:[1,2]});
    members.flush({data:{allocated_individuals_count:2}});
    http.expectOne(request=>request.url.endsWith('/sprints?project_id=10')).flush({data:
      p.calculatedSprintsPreview.map((sprint,index)=>({...sprint,id:index+1,project_id:10}))
    });
    http.expectNone(request=>request.method==='POST' && request.url.endsWith('/sprints/create'));
    expect(p.isProfileEditing).toBe(false);
    expect(p.selectedProject?.associatedUserIds).toEqual([1,2]);
    for(const request of http.match(()=>true)) {
      if(request.request.url.endsWith('/project-teams/10')) request.flush({data:[4]});
      else if(request.request.url.endsWith('/project-individuals/10')) request.flush({data:[{id:1},{id:2}]});
      else request.flush([]);
    }
  });

  it('updates sprint count and preview immediately when delivery parameters change', () => {
    const p=project(); p.isProfileEditing=true;
    p.projectForm.total_backlog_points=120; p.projectForm.target_velocity=30; p.projectForm.sprint_duration_weeks=2;
    p.deliveryParametersChanged();
    expect(p.projectForm.computed_sprint_count).toBe(p.calculatedSprintsPreview.length);
    expect(p.getProjectProfileSprints(p.projectForm).length).toBeGreaterThan(0);
    const previous=p.calculatedSprintsPreview.length;
    p.projectForm.total_backlog_points=240; p.deliveryParametersChanged();
    expect(p.calculatedSprintsPreview.length).toBeGreaterThan(previous);
    expect(p.projectForm.computed_total_duration_weeks).toBe(p.calculatedSprintsPreview.length*2);
    const names=p.calculatedSprintsPreview.map(sprint=>sprint.name);
    p.generateSprintPreview(); expect(p.calculatedSprintsPreview.map(sprint=>sprint.name)).toEqual(names);
  });
});
