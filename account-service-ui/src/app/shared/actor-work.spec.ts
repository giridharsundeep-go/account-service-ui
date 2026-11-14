import { TestBed } from '@angular/core/testing';
import { provideHttpClient, HttpHeaders } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ActorIconComponent, actorKind } from './actor-icon';
import { PersonPickerComponent } from './person-picker';
import { TicketActionsComponent } from './ticket-actions';
import { TicketCollaborationComponent } from './ticket-collaboration';
import { TicketExecutionPanel } from './ticket-execution-panel';
import { AuthService } from '../auth.service';
import { WorkspaceSettingsService } from './workspace-settings.service';
import { SuiteSessionService } from './suite-session.service';
import { WorkItemDialogService } from './work-item-dialog.service';

describe('Human and agent work identity',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('uses actor identity rather than names and distinguishes unassigned and system entries',()=>{
    expect(actorKind(-4)).toBe('AGENT');expect(actorKind(4,'AGENT')).toBe('AGENT');
    expect(actorKind(4)).toBe('HUMAN');expect(actorKind(null,'SYSTEM')).toBe('SYSTEM');expect(actorKind(null)).toBe('UNASSIGNED');
    const icon=TestBed.createComponent(ActorIconComponent);icon.componentRef.setInput('actorId',-4);icon.detectChanges();
    expect(icon.nativeElement.querySelector('svg').getAttribute('aria-label')).toBe('Agent');
  });
  it('separates identical human and agent names without changing an assignment on category change',()=>{
    const picker=new PersonPickerComponent();picker.people=[{id:8,name:'Alex'},{id:-4,name:'Alex',designation:'Quality agent'}];picker.value=8;picker.ngOnChanges();picker.search('al');
    const selected=vi.fn();picker.selected.subscribe(selected);expect(picker.visiblePeople.map(p=>p.id)).toEqual([8]);
    picker.selectCategory('AGENT',new Event('click'));picker.search('al');expect(picker.visiblePeople.map(p=>p.id)).toEqual([-4]);expect(picker.value).toBe(8);expect(selected).not.toHaveBeenCalled();
    picker.choose(-4);expect(selected).toHaveBeenCalledWith(-4);expect(picker.displayText).toBe('Alex');
    picker.resetSearch();expect(picker.category).toBe('AGENT');
  });
  it('searches designation and progressively reveals only the selected actor type',()=>{
    const picker=new PersonPickerComponent();picker.people=Array.from({length:70},(_,i)=>({id:-(i+1),name:'Assistant '+i,designation:'Quality reviewer'}));picker.selectCategory('AGENT',new Event('click'));picker.search('quality');expect(picker.visiblePeople.length).toBe(50);picker.loadMore(new Event('click'));expect(picker.visiblePeople.length).toBe(70);picker.selectCategory('HUMAN',new Event('click'));expect(picker.visiblePeople).toEqual([]);
  });
  it('keeps invalid agent-work navigation from altering the current ticket',()=>{
    const dialogs=new WorkItemDialogService();dialogs.open(2,'TASK',8);dialogs.openAgentWork(0,'TASK',9);expect(dialogs.request()).toEqual({projectId:2,type:'TASK',id:8});dialogs.openAgentWork(2,'TASK',8);expect(dialogs.request()?.view).toBe('agent-work');
  });
});
describe('Ticket cloning and comment ownership',()=>{
  beforeEach(()=>TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),
    {provide:AuthService,useValue:{getAuthHeaders:()=>new HttpHeaders(),getCurrentUserId:()=>7}},
    {provide:WorkspaceSettingsService,useValue:{can:()=>true,revision:signal(0)}},
    {provide:SuiteSessionService,useValue:{open:vi.fn()}}
  ]}));
  afterEach(()=>{try{TestBed.inject(HttpTestingController).verify();}finally{TestBed.resetTestingModule();}});
  it('creates only after confirmation, exposes progress and prevents duplicate requests',()=>{
    const f=TestBed.createComponent(TicketActionsComponent);f.componentRef.setInput('kind','TASK');f.componentRef.setInput('ticketId',8);f.componentRef.setInput('title','Review catalog');f.detectChanges();
    const c=f.componentInstance;f.nativeElement.querySelector('[aria-label="Ticket options"]').click();f.detectChanges();const cloneButton=Array.from(f.nativeElement.querySelectorAll('button')).find((b:any)=>b.textContent.includes('Clone ticket')) as HTMLButtonElement;cloneButton.click();f.detectChanges();expect(f.nativeElement.textContent).toContain('Create clone');TestBed.inject(HttpTestingController).expectNone(r=>r.method==='POST');
    const cloned=vi.fn();c.cloned.subscribe(cloned);f.nativeElement.querySelector('.primary').click();c.createClone();f.detectChanges();expect(f.nativeElement.textContent).toContain('getting cloned');const request=TestBed.inject(HttpTestingController).expectOne(r=>r.url.endsWith('/tickets/TASK/8/clone'));request.flush({id:9,kind:'TASK',projectId:2});expect(cloned).toHaveBeenCalledWith({id:9,kind:'TASK',projectId:2});expect(c.busy).toBe(false);
  });
  it('keeps the confirmation open and allows retry after a failed clone',()=>{
    const f=TestBed.createComponent(TicketActionsComponent);f.componentRef.setInput('kind','TASK');f.componentRef.setInput('ticketId',8);const c=f.componentInstance;c.confirm=true;c.createClone();TestBed.inject(HttpTestingController).expectOne(r=>r.url.endsWith('/clone')).flush({message:'Choose a valid project'},{status:400,statusText:'Bad Request'});expect(c.confirm).toBe(true);expect(c.busy).toBe(false);expect(c.error).toBe('Choose a valid project');
  });
  it('rejects other authors even if stale permissions claim editing is allowed',()=>{
    const f=TestBed.createComponent(TicketCollaborationComponent);const c=f.componentInstance;const other={id:3,authorId:8,canEdit:true};expect(c.canEditComment(other)).toBe(false);expect(c.canEditComment({authorId:7,canEdit:true})).toBe(true);c.updateComment(other);c.deleteComment(other);TestBed.inject(HttpTestingController).expectNone(()=>true);
  });
});

describe('Local agent runtime integration',()=>{
 it('starts from a constrained execution profile with mandatory review skills',()=>{
  const c=Object.create(TicketExecutionPanel.prototype) as TicketExecutionPanel;c.spec=c.defaults();
  expect(c.spec.allowedPaths).toEqual(['src','tests']);expect(c.mandatory).toEqual(['repository-snapshot','regression-review','python-stdlib','unittest']);
  expect(c.spec.requiredSkills).toEqual(c.mandatory);
 });
 it('updates language-specific required skills while retaining optional skills',()=>{
  const c=Object.create(TicketExecutionPanel.prototype) as TicketExecutionPanel;c.spec=c.defaults();c.spec.requiredSkills=['custom-review'];c.spec.testProfile='NODE_TEST';c.profileChanged();
  expect(c.mandatory).toEqual(['repository-snapshot','regression-review','node-runtime','node-test']);expect(c.spec.requiredSkills).toEqual(['custom-review',...c.mandatory]);
 });
});
