import {FilterMenu} from '../shared/filter-menu';
import { ActorIconComponent } from '../shared/actor-icon';
import { ChangeDetectorRef, Component, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { A11yModule } from '@angular/cdk/a11y';
import { Subscription, forkJoin, from, of, mergeMap, toArray, catchError, map, finalize, switchMap } from 'rxjs';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';
import { environment } from '../../environment';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { TestcaseWorkTableComponent } from '../shared/testcase-work-table';
import { TicketCollaborationComponent } from '../shared/ticket-collaboration';
import { PersonPickerComponent } from '../shared/person-picker';
import { ProjectWorkService, ProjectWorkItem } from '../shared/project-work.service';
import { WorkItemDialogService } from '../shared/work-item-dialog.service';
import { ApiCollectionService } from '../shared/api-collection.service';
import { peopleRows, personDesignation } from '../shared/people-directory';

@Component({selector:'app-testcases',standalone:true,imports: [FilterMenu,ActorIconComponent,CommonModule,FormsModule,WorkspaceHeroComponent,TestcaseWorkTableComponent,TicketCollaborationComponent,PersonPickerComponent,MatFormFieldModule,MatSelectModule,A11yModule],templateUrl:'./testcases.html',styleUrls:['./testcases.css','../shared/field-controls.css']})
export class Testcases implements OnDestroy {
  private http=inject(HttpClient);private auth=inject(AuthService);private context=inject(ProjectContextService);private cdr=inject(ChangeDetectorRef);private collection=inject(ApiCollectionService);private work=inject(ProjectWorkService);private dialog=inject(WorkItemDialogService);private route=inject(ActivatedRoute);
  readonly api=environment.apiBaseUrlM+'/v1/testcases';readonly statuses=['DRAFT','IN_PROGRESS','PASSED','FAILED','BLOCKED'];readonly priorities=['LOW','MEDIUM','HIGH','CRITICAL'];
  readonly textFields = [
    {key:'description',label:'Description',required:false,rows:5},
    {key:'preconditions',label:'Preconditions',required:false,rows:3},
    {key:'steps',label:'Test steps',required:true,rows:5},
    {key:'expectedResult',label:'Expected result',required:true,rows:3},
    {key:'actualResult',label:'Actual result',required:false,rows:3},
  ];
  readonly types=['Functional','Regression','Smoke','Integration','UI','Performance','Security'];
  activeField:string|null=null;editorFullscreen=false;private originalField:any;
  get projectName(){return this.context.selectedProject()?.name||'Project';}
  get creatorId(){return this.editing?.creator?.id??this.auth.getCurrentUserId();}
  projectId=0;cases:any[]=[];people:any[]=[];items:ProjectWorkItem[]=[];search='';status='';tags:string[]=[];selected=new Set<number>();loading=false;saving=false;error='';notice='';showEditor=false;editing:any=null;canEdit=false;form:any={};allocation='';originalAllocation='';allocationSearch='';allocationLimit=50;bulkOpen=false;bulkTarget='';private load?:Subscription;private generation=0;
  private sync=effect(()=>{const id=this.context.selectedProjectId()||0;if(id===this.projectId)return;this.projectId=id;this.showEditor=false;this.bulkOpen=false;this.selected=new Set();this.items=[];this.cases=[];if(id)this.refresh();});
  private openFromRoute=this.route.queryParamMap.subscribe(params=>{const id=Number(params.get('caseId'));if(id&&this.cases.length){const row=this.cases.find(c=>c.id===id);if(row)this.open(row);}});
  get options(){return {headers:this.auth.getAuthHeaders()};}
  ngOnDestroy(){this.load?.unsubscribe();this.openFromRoute.unsubscribe();}
  refresh(){if(!this.projectId)return;const version=++this.generation;this.loading=true;this.error='';this.load?.unsubscribe();this.load=forkJoin({cases:this.collection.read(this.api+'?projectId='+this.projectId),users:this.collection.read(environment.apiBaseUrlM+'/users'),roles:this.collection.read(environment.apiBaseUrlM+'/roles')}).pipe(finalize(()=>{if(version===this.generation){this.loading=false;this.cdr.markForCheck();}})).subscribe({next:data=>{if(version!==this.generation)return;this.people=peopleRows(data.users).map(user=>({...user,id:Number(user.id),name:[user.firstName??user.first_name,user.lastName??user.last_name].filter(Boolean).join(' ')||user.email,designation:personDesignation(user,data.roles),avatarUrl:user.profilePictureUrl??user.profile_picture_url}));const byId=new Map(this.people.map(p=>[p.id,p]));this.cases=data.cases.map(row=>({...row,id:Number(row.id),tags:row.tags||[],user:byId.get(Number(row.user?.id))||row.user,creator:byId.get(Number(row.creator?.id))||row.creator}));const id=Number(this.route.snapshot.queryParamMap.get('caseId'));if(id&&!this.showEditor){const row=this.cases.find(c=>c.id===id);if(row)this.open(row);}},error:()=>this.error='Unable to load test cases. Check your project access and try again.'});this.work.load(this.projectId).subscribe({next:data=>{if(version===this.generation){this.items=data.items;this.cdr.markForCheck();}},error:()=>{}});}
  get availableTags():string[]{return [...new Set<string>(this.cases.flatMap(c=>c.tags))].sort();}
  get filtered(){const q=this.search.trim().toLowerCase();return this.cases.filter(c=>(!this.status||c.status===this.status)&&(!this.tags.length||this.tags.every(t=>c.tags.includes(t)))&&[c.title,c.testCaseCode,...c.tags].join(' ').toLowerCase().includes(q));}
  get passed(){return this.cases.filter(c=>c.status==='PASSED').length;}get failed(){return this.cases.filter(c=>c.status==='FAILED'||c.status==='BLOCKED').length;}
  select(id:number,value:boolean){const next=new Set(this.selected);value?next.add(id):next.delete(id);this.selected=next;}
  create(){this.activeField=null;this.editorFullscreen=false;this.editing=null;this.canEdit=true;this.form={title:'',testCaseCode:'TC-'+Date.now().toString(36).toUpperCase(),description:'',preconditions:'',steps:'',expectedResult:'',actualResult:'',status:'DRAFT',priority:'MEDIUM',type:'Functional',tagsText:'',userId:this.auth.getCurrentUserId()};this.allocation='';this.originalAllocation='';this.showEditor=true;this.error='';this.cdr.markForCheck();}
  open(row:any){this.activeField=null;this.editorFullscreen=false;this.editing=row;this.canEdit=false;this.form={...row,tagsText:(row.tags||[]).join(', '),userId:row.user?.id??null};this.allocation=this.linkKey(row);this.originalAllocation=this.allocation;this.showEditor=true;this.error='';this.cdr.markForCheck();}
  closeEditor(){if(this.saving)return;this.cancelField();this.showEditor=false;}
  isEditing(field:string){return !this.editing||this.activeField===field;}
  beginEdit(field:string){if(!this.editing||!this.canEdit||this.saving)return;this.cancelField();this.originalField=field==='allocation'?this.allocation:this.form[field];this.activeField=field;this.error='';}
  cancelField(){if(this.saving)return;if(this.activeField==='allocation')this.allocation=this.originalField;else if(this.activeField)this.form[this.activeField]=this.originalField;this.activeField=null;this.error='';}
  person(id:number|null, fallback:any=null){return this.people.find(p=>p.id===Number(id))||fallback;}
  personName(id:number|null, fallback:any=null){const p=this.person(id,fallback);return p?.name||[p?.firstName,p?.lastName].filter(Boolean).join(' ')||p?.email||(id?'User '+id:'Unassigned');}
  initials(name:string){return name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();}
  avatarTone(id:number){return Math.abs(Number(id))%5;}
  get linkedItem(){return this.items.find(item=>item.kind+':'+item.id===this.allocation);}
  get linkedItemLabel(){return this.linkedItem?[this.linkedItem.key,this.linkedItem.title].join(' · '):this.allocation||'No linked work item';}
  statusClass(status:string){return 'tc-status-'+String(status).toLowerCase().replace(/_/g,'-');}
  linkKey(row:any){for(const type of ['epic','story','task','issue']){const id=row[type]?.id??row[type+'Id']??row[type+'_id'];if(id)return type.toUpperCase()+':'+id;}return '';}
  get tagValues():string[]{return [...new Set<string>(String(this.form.tagsText||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean))];}
  get allocationOptions(){const q=this.allocationSearch.toLowerCase();return this.items.filter(i=>[i.key,i.title].join(' ').toLowerCase().includes(q)).slice(0,this.allocationLimit);}
  label(value:string){return String(value||'').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,l=>l.toUpperCase());}
  private payload(){
    // Send the complete editable record: the backend applies enum defaults to partial bodies.
    const result:any={project:{id:this.projectId},testCaseCode:this.form.testCaseCode,tags:this.tagValues,user:this.form.userId?{id:this.form.userId}:null};
    for(const key of ['title','description','preconditions','steps','expectedResult','actualResult','status','priority','type'])result[key]=this.form[key]??'';
    if(!this.editing)result.creator={id:this.auth.getCurrentUserId()};
    return result;
  }
  private valid(field?:string){
    const required=['title','steps','expectedResult'];
    if(required.some(key=>(!field||field===key)&&!String(this.form[key]||'').trim())){this.error='Title, test steps and expected result are required.';return false;}
    if((!field||field==='tagsText')&&(this.tagValues.length>20||this.tagValues.some(t=>t.length>40))){this.error='Use at most 20 tags, each up to 40 characters.';return false;}
    return true;
  }
  private remember(response:any){
    const saved=response.data??response;
    // This endpoint returns the complete record; merging would resurrect an omitted/null link after unassignment.
    this.editing={...saved};
    this.form={...this.editing,tagsText:(this.editing.tags||[]).join(', '),userId:this.editing.user?.id??null};
    this.allocation=this.linkKey(this.editing);this.originalAllocation=this.allocation;
    this.cases=this.cases.map(row=>row.id===this.editing.id?{...this.editing,user:this.person(this.form.userId,this.editing.user),creator:this.person(this.creatorId,this.editing.creator)}:row);
    this.activeField=null;
  }
  saveField(field:string){
    if(!this.editing||!this.canEdit||this.saving||this.activeField!==field||!this.valid(field))return;
    if(field==='allocation'&&this.allocation===this.originalAllocation){this.activeField=null;return;}
    this.saving=true;this.error='';const project=this.projectId;
    const [type,id]=(this.allocation||this.originalAllocation).split(':');
    const request=field==='allocation'?this.http.put<any>(this.api+'/'+this.editing.id+'/'+(this.allocation?'assign':'unassign'),{type,id:Number(id)},this.options):this.http.put<any>(this.api+'/'+this.editing.id,this.payload(),this.options);
    request.pipe(finalize(()=>{this.saving=false;this.cdr.markForCheck();})).subscribe({next:response=>{if(project===this.projectId)this.remember(response);},error:error=>this.error=error.error?.message||'Unable to save this field. Your changes are still here.'});
  }
  save(){
    if(this.saving||!this.canEdit||!this.valid())return;
    this.saving=true;this.error='';const project=this.projectId;
    const request=this.editing?this.http.put<any>(this.api+'/'+this.editing.id,this.payload(),this.options):this.http.post<any>(this.api,this.payload(),this.options);
    request.pipe(switchMap(response=>{const saved=response.data??response;this.editing=saved;if(this.allocation===this.originalAllocation)return of(saved);const [type,id]=(this.allocation||this.originalAllocation).split(':');return this.http.put<any>(this.api+'/'+saved.id+'/'+(this.allocation?'assign':'unassign'),{type,id:Number(id)},this.options);}),finalize(()=>{this.saving=false;this.cdr.markForCheck();})).subscribe({next:()=>{if(project!==this.projectId)return;this.showEditor=false;this.notice='Test case saved.';this.refresh();},error:error=>{this.error=error.error?.message||'Unable to save the test case or linked item. Your saved case remains open for retry.';}});
  }
  allocate(){if(!this.bulkTarget||this.saving)return;const [type,id]=this.bulkTarget.split(':');this.saving=true;const project=this.projectId;from([...this.selected]).pipe(mergeMap(caseId=>this.http.put(this.api+'/'+caseId+'/assign',{type,id:Number(id)},this.options).pipe(map(()=>({caseId,ok:true})),catchError(()=>of({caseId,ok:false}))),4),toArray(),finalize(()=>{this.saving=false;this.cdr.markForCheck();})).subscribe(results=>{if(project!==this.projectId)return;this.selected=new Set(results.filter(r=>!r.ok).map(r=>r.caseId));this.bulkOpen=!!this.selected.size;this.notice=`${results.filter(r=>r.ok).length} cases allocated.${this.selected.size?' Failed cases remain selected.':''}`;this.refresh();});}
  openLinked(){const [type,id]=this.allocation.split(':');if(id)this.dialog.open(this.projectId,type,Number(id));}
}
