import {TestBed} from '@angular/core/testing';
import {Component,EventEmitter,Input,Output,signal} from '@angular/core';
import {provideHttpClient,HttpClient,HttpHeaders} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {MAT_DIALOG_DATA,MatDialogRef} from '@angular/material/dialog';
import {provideRouter} from '@angular/router';
import {of,Subject} from 'rxjs';
import {Testcases} from '../testcases/testcases';
import {AuthService} from '../auth.service';
import {ProjectContextService} from '../project-context.service';
import {ProjectWorkService} from './project-work.service';
import {WorkItemDialogService} from './work-item-dialog.service';
import {TicketCollaborationComponent} from './ticket-collaboration';
import {SuiteSessionService} from './suite-session.service';
import {WorkspaceSettingsService} from './workspace-settings.service';
import {TeamMemberRemovalDialog} from './team-member-removal-dialog';
import {OrganizationUnitDialog} from './organization-unit-dialog';
import {environment} from '../../environment';
import {Teams} from '../teams/teams';
import {MatDialog} from '@angular/material/dialog';
import {ChatlyLauncher} from './chatly-launcher.service';
import {Users} from '../users/users';

const auth={getAuthHeaders:()=>new HttpHeaders(),getCurrentUserId:()=>7,isAdmin:()=>true,sessionRevision:signal(0)};
@Component({selector:'app-ticket-collaboration',standalone:true,template:''})
class CollaborationStub {
  @Input() kind='';@Input() ticketId=0;
  @Output() permissionsChange=new EventEmitter<{canEdit:boolean}>();
}

describe('Test cases in the shared ticket canvas',()=>{
  let http:HttpTestingController;
  const original={id:11,testCaseCode:'TC-11',title:'Checkout works',description:'Checkout test',steps:'Submit the order',expectedResult:'Order confirmed',actualResult:'',status:'PASSED',priority:'HIGH',type:'Regression',tags:['checkout'],user:{id:7},creator:{id:8}};
  beforeEach(()=>{
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([]),
      {provide:AuthService,useValue:auth},
      {provide:ProjectContextService,useValue:{selectedProjectId:signal(null),selectedProject:()=>({id:4,name:'Platform'})}},
      {provide:ProjectWorkService,useValue:{load:()=>of({items:[]})}},
      {provide:WorkItemDialogService,useValue:{open:vi.fn()}},
      {provide:WorkspaceSettingsService,useValue:{lastEvent:signal(null),revision:signal(0)}},
      {provide:SuiteSessionService,useValue:{open:vi.fn()}}]});
    TestBed.overrideComponent(Testcases,{remove:{imports:[TicketCollaborationComponent]},add:{imports:[CollaborationStub]}});
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>http.verify());
  function setup(){const fixture=TestBed.createComponent(Testcases);fixture.detectChanges();const c=fixture.componentInstance;c.projectId=4;c.cases=[{...original}];c.people=[{id:7,name:'Asha Rao',designation:'Quality lead'},{id:8,name:'Sam Jones',designation:'Engineer'}];fixture.changeDetectorRef.markForCheck();return {fixture,c};}
  it('uses the same canvas for creation and viewing, with a single-line title and people metadata',()=>{
    const {fixture,c}=setup();c.create();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=dialog].kb-work-item-dialog')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input.kb-title-edit-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('textarea.kb-title-edit-input')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Asha Rao');
    c.open(original);c.canEdit=true;fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=dialog].kb-work-item-dialog')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Sam Jones');
    expect(fixture.nativeElement.textContent).toContain('Quality lead');
    http.match(r=>r.method==='GET').forEach(r=>r.flush({permissions:{canEdit:true},comments:[],attachments:[],activity:[]}));
  });
  it('cancels a field without persisting and restores it before editing another field',()=>{
    const {c}=setup();c.open(original);c.canEdit=true;c.beginEdit('title');c.form.title='Changed';c.beginEdit('description');
    expect(c.form.title).toBe(original.title);c.form.description='Changed';c.cancelField();
    expect(c.form.description).toBe(original.description);http.expectNone(r=>r.method==='PUT');
  });
  it('saves a single field without resetting status, priority, assignee or creator, and keeps the view open',()=>{
    const {c}=setup();c.open(original);c.canEdit=true;c.beginEdit('title');c.form.title='Updated title';c.saveField('title');
    const request=http.expectOne(c.api+'/11');expect(request.request.body).toMatchObject({title:'Updated title',status:'PASSED',priority:'HIGH',user:{id:7}});
    expect(request.request.body.creator).toBeUndefined();expect(request.request.body.tagsText).toBeUndefined();
    request.flush({...original,title:'Updated title'});expect(c.showEditor).toBe(true);expect(c.activeField).toBeNull();expect(c.cases[0].title).toBe('Updated title');
  });
  it('retains a failed edit for retry and prevents blank required values',()=>{
    const {c}=setup();c.open(original);c.canEdit=true;c.beginEdit('steps');c.form.steps=' ';c.saveField('steps');http.expectNone(r=>r.method==='PUT');
    c.form.steps='Retry payment';c.saveField('steps');http.expectOne(c.api+'/11').flush({message:'Not saved'},{status:503,statusText:'Unavailable'});
    expect(c.form.steps).toBe('Retry payment');expect(c.activeField).toBe('steps');expect(c.error).toBe('Not saved');expect(c.saving).toBe(false);
  });
  it('unlinks work with the backend unassign API and retains other metadata',()=>{
    const {c}=setup();c.open({...original,task:{id:23}});c.canEdit=true;c.beginEdit('allocation');c.allocation='';c.saveField('allocation');
    const request=http.expectOne(c.api+'/11/unassign');expect(request.request.body).toEqual({type:'TASK',id:23});request.flush(original);expect(c.allocation).toBe('');expect(c.form.status).toBe('PASSED');
  });
  it('creates through the existing test case API before assigning linked work',()=>{
    const {c}=setup();vi.spyOn(c,'refresh').mockImplementation(()=>{});c.create();Object.assign(c.form,{title:'New test',steps:'Try it',expectedResult:'Works'});c.allocation='STORY:12';c.save();
    const create=http.expectOne(c.api);expect(create.request.method).toBe('POST');expect(create.request.body.creator).toEqual({id:7});create.flush({...original,id:41,title:'New test'});
    const assign=http.expectOne(c.api+'/41/assign');expect(assign.request.body).toEqual({type:'STORY',id:12});assign.flush({...original,id:41,story:{id:12}});expect(c.showEditor).toBe(false);expect(c.notice).toBe('Test case saved.');
  });
});

describe('Team member removal confirmation',()=>{
  let close:ReturnType<typeof vi.fn>;let remove:ReturnType<typeof vi.fn>;let result:Subject<any>;
  beforeEach(()=>{result=new Subject();close=vi.fn();remove=vi.fn(()=>result);TestBed.configureTestingModule({providers:[{provide:MAT_DIALOG_DATA,useValue:{teamName:'Platform',name:'Asha Rao',email:'asha@example.test',designation:'Quality lead',remove}},{provide:MatDialogRef,useValue:{close,disableClose:false}}]});});
  it('identifies the member and lets cancellation leave membership unchanged',()=>{
    const f=TestBed.createComponent(TeamMemberRemovalDialog);f.detectChanges();expect(f.nativeElement.textContent).toContain('Quality lead');expect(f.nativeElement.textContent).toContain('Platform');f.componentInstance.cancel();expect(remove).not.toHaveBeenCalled();expect(close).toHaveBeenCalledWith();
  });
  it('only removes on confirmation, guards double clicks and reports errors in the dialog',()=>{
    const c=TestBed.createComponent(TeamMemberRemovalDialog).componentInstance;c.confirm();c.confirm();expect(remove).toHaveBeenCalledTimes(1);result.error({error:{message:'Removal denied'}});expect(close).not.toHaveBeenCalled();expect(c.pending).toBe(false);expect(c.error).toBe('Removal denied');
  });
  it('closes with a confirmed result only after persistence succeeds',()=>{
    const c=TestBed.createComponent(TeamMemberRemovalDialog).componentInstance;c.confirm();expect(close).not.toHaveBeenCalled();result.next({data:{id:2}});expect(close).toHaveBeenCalledWith({removed:true,response:{data:{id:2}}});
  });
});

describe('Organization function and division creation',()=>{
  let http:HttpTestingController;let close:ReturnType<typeof vi.fn>;let permitted:boolean;
  beforeEach(()=>{close=vi.fn();permitted=true;TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:auth},{provide:WorkspaceSettingsService,useValue:{can:()=>permitted}},{provide:MAT_DIALOG_DATA,useValue:{type:'FUNCTION',units:[{id:1,type:'DIVISION',name:'Enterprise',active:true}]}},{provide:MatDialogRef,useValue:{close,disableClose:false}}]});http=TestBed.inject(HttpTestingController);});
  afterEach(()=>http.verify());
  it.each(['FUNCTION','DIVISION'] as const)('creates %s with its parent through Professy and returns the new option',type=>{
    const c=TestBed.createComponent(OrganizationUnitDialog).componentInstance;c.type=type;c.name=' Engineering ';c.parentId=1;c.save();const request=http.expectOne(environment.apiBaseUrlM+'/workspace/organization/units');expect(request.request.body).toEqual({type,name:'Engineering',parentId:1,active:true});const unit={id:3,type,name:'Engineering',parentId:1,active:true};request.flush([unit]);expect(close).toHaveBeenCalledWith({units:[unit],unit});
  });
  it('does not send a creation request without management permission',()=>{permitted=false;const c=TestBed.createComponent(OrganizationUnitDialog).componentInstance;c.name='Engineering';c.save();http.expectNone(r=>r.method==='POST');expect(close).not.toHaveBeenCalled();});
  it('keeps input and an actionable error on server failure',()=>{const c=TestBed.createComponent(OrganizationUnitDialog).componentInstance;c.name='Engineering';c.save();http.expectOne(environment.apiBaseUrlM+'/workspace/organization/units').flush({message:'A name conflict'},{status:409,statusText:'Conflict'});expect(c.saving).toBe(false);expect(c.name).toBe('Engineering');expect(c.error).toContain('already exists');expect(close).not.toHaveBeenCalled();});
});

describe('Team membership persistence',()=>{
  let http:HttpTestingController;let open:ReturnType<typeof vi.fn>;let closed:Subject<any>;
  beforeEach(()=>{closed=new Subject();open=vi.fn(()=>({afterClosed:()=>closed}));TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:auth},{provide:ChatlyLauncher,useValue:{person:vi.fn(),team:vi.fn()}}]});TestBed.overrideProvider(MatDialog,{useValue:{open}});http=TestBed.inject(HttpTestingController);});
  afterEach(()=>http.verify());
  function teamComponent(){return TestBed.runInInjectionContext(()=>new Teams(TestBed.inject(HttpClient),auth as unknown as AuthService,{open} as unknown as MatDialog,{markForCheck:vi.fn()} as any));}
  it('preserves the viewed team metadata and removes only the confirmed member',()=>{
    const c=teamComponent();
    c.selectedTeam={id:3,name:'Platform',description:'Payment platform',members:[{id:7,name:'Asha',email:'asha@example.test'},{id:8,name:'Sam',email:'sam@example.test'}]};
    c.name='';c.description='';c.removeMemberFromTeamInline(3,7);http.expectNone(r=>r.method==='PUT');
    const data=open.mock.calls[0][1].data;expect(data.name).toBe('Asha');data.remove().subscribe((response:any)=>closed.next({removed:true,response}));
    const request=http.expectOne(environment.apiBaseUrlM+'/teams/3');expect(request.request.body).toEqual({name:'Platform',description:'Payment platform',memberIds:[8]});request.flush({data:{id:3,name:'Platform',description:'Payment platform',members:[{id:8,name:'Sam',email:'sam@example.test'}]}});
    expect(c.selectedTeam?.name).toBe('Platform');expect(c.selectedTeam?.members.map(p=>p.id)).toEqual([8]);expect(c.memberUpdateNotice).toContain('Asha was removed');
  });
  it('leaves the team untouched when the dialog is canceled',()=>{
    const c=teamComponent();c.selectedTeam={id:3,name:'Platform',description:'Payment platform',members:[{id:7,name:'Asha',email:'asha@example.test'}]};c.removeMemberFromTeamInline(3,7);closed.next(undefined);expect(c.selectedTeam.members).toHaveLength(1);http.expectNone(r=>r.method==='PUT');
  });
});

describe('Organization options in user profiles',()=>{
  it('selects a newly created function without changing the user’s division or department',()=>{
    const closed=new Subject<any>();const open=vi.fn((_component:any,_config:any)=>({afterClosed:()=>closed}));
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:auth},{provide:MatDialog,useValue:{open}},{provide:WorkspaceSettingsService,useValue:{can:()=>true,lastEvent:signal(null)}}]});
    const c=TestBed.runInInjectionContext(()=>new Users(TestBed.inject(HttpClient),auth as unknown as AuthService,{markForCheck:vi.fn()} as any));
    c.profileEditMode=true;c.departmentId=2;c.divisionId=3;c.addOrganizationUnit('FUNCTION');
    expect(open.mock.calls[0][1].data.type).toBe('FUNCTION');const unit={id:8,type:'FUNCTION',name:'Engineering',active:true};closed.next({unit,units:[unit]});
    expect(c.functionId).toBe(8);expect(c.departmentId).toBe(2);expect(c.divisionId).toBe(3);expect(c.organizationUnits).toEqual([unit]);TestBed.inject(HttpTestingController).verify();
  });
});
