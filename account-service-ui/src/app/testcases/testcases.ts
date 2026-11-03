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

@Component({selector:'app-testcases',standalone:true,imports:[CommonModule,FormsModule,WorkspaceHeroComponent,TestcaseWorkTableComponent,TicketCollaborationComponent,PersonPickerComponent,MatFormFieldModule,MatSelectModule,A11yModule],templateUrl:'./testcases.html',styleUrls:['./testcases.css','../shared/field-controls.css']})
export class Testcases implements OnDestroy {
  private http=inject(HttpClient);private auth=inject(AuthService);private context=inject(ProjectContextService);private cdr=inject(ChangeDetectorRef);private collection=inject(ApiCollectionService);private work=inject(ProjectWorkService);private dialog=inject(WorkItemDialogService);private route=inject(ActivatedRoute);
  readonly api=environment.apiBaseUrlM+'/v1/testcases';readonly statuses=['DRAFT','IN_PROGRESS','PASSED','FAILED','BLOCKED'];readonly priorities=['LOW','MEDIUM','HIGH','CRITICAL'];
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
  create(){this.editing=null;this.canEdit=true;this.form={title:'',testCaseCode:'TC-'+Date.now().toString(36).toUpperCase(),description:'',preconditions:'',steps:'',expectedResult:'',actualResult:'',status:'DRAFT',priority:'MEDIUM',type:'Functional',tagsText:'',userId:this.auth.getCurrentUserId()};this.allocation='';this.originalAllocation='';this.showEditor=true;this.error='';}
  open(row:any){this.editing=row;this.canEdit=false;this.form={...row,tagsText:row.tags.join(', '),userId:row.user?.id??null};this.allocation=this.linkKey(row);this.originalAllocation=this.allocation;this.showEditor=true;this.error='';}
  linkKey(row:any){for(const type of ['epic','story','task','issue']){const id=row[type]?.id??row[type+'Id']??row[type+'_id'];if(id)return type.toUpperCase()+':'+id;}return '';}
  get tagValues():string[]{return [...new Set<string>(String(this.form.tagsText||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean))];}
  get allocationOptions(){const q=this.allocationSearch.toLowerCase();return this.items.filter(i=>[i.key,i.title].join(' ').toLowerCase().includes(q)).slice(0,this.allocationLimit);}
  label(value:string){return String(value||'').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,l=>l.toUpperCase());}
  save(){if(this.saving||!this.canEdit||!this.form.title?.trim()||!this.form.steps?.trim()||!this.form.expectedResult?.trim())return;if(this.tagValues.length>20||this.tagValues.some(t=>t.length>40)){this.error='Use at most 20 tags, each up to 40 characters.';return;}
    this.saving=true;const project=this.projectId;const payload={...this.form,id:this.editing?.id,project:{id:project},tags:this.tagValues,user:this.form.userId?{id:this.form.userId}:null,creator:{id:this.editing?.creator?.id??this.auth.getCurrentUserId()}};delete payload.tagsText;delete payload.userId;
    const request=this.editing?this.http.put<any>(this.api+'/'+this.editing.id,payload,this.options):this.http.post<any>(this.api,payload,this.options);
    request.pipe(switchMap(response=>{const saved=response.data??response;this.editing=saved;if(this.allocation===this.originalAllocation)return of(null);const [type,id]=(this.allocation||this.originalAllocation).split(':');return this.http.put(this.api+'/'+saved.id+'/'+(this.allocation?'assign':'unassign'),{type,id:Number(id)},this.options);}),finalize(()=>{this.saving=false;this.cdr.markForCheck();})).subscribe({next:()=>{if(project!==this.projectId)return;this.showEditor=false;this.notice='Test case saved.';this.refresh();},error:error=>{this.error=error.error?.message||'Unable to save the test case or linked item. Your saved case remains open for retry.';}});}
  allocate(){if(!this.bulkTarget||this.saving)return;const [type,id]=this.bulkTarget.split(':');this.saving=true;const project=this.projectId;from([...this.selected]).pipe(mergeMap(caseId=>this.http.put(this.api+'/'+caseId+'/assign',{type,id:Number(id)},this.options).pipe(map(()=>({caseId,ok:true})),catchError(()=>of({caseId,ok:false}))),4),toArray(),finalize(()=>{this.saving=false;this.cdr.markForCheck();})).subscribe(results=>{if(project!==this.projectId)return;this.selected=new Set(results.filter(r=>!r.ok).map(r=>r.caseId));this.bulkOpen=!!this.selected.size;this.notice=`${results.filter(r=>r.ok).length} cases allocated.${this.selected.size?' Failed cases remain selected.':''}`;this.refresh();});}
  openLinked(){const [type,id]=this.allocation.split(':');if(id)this.dialog.open(this.projectId,type,Number(id));}
}
