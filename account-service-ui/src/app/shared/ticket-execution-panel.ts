import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Component,Input,OnChanges,OnDestroy,inject,ChangeDetectorRef} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {AuthService} from '../auth.service';
import {environment} from '../../environment';
@Component({selector:'app-ticket-execution',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./ticket-execution-panel.html',styleUrl:'./agent-execution.css'})
export class TicketExecutionPanel implements OnChanges,OnDestroy {
 @Input() kind='';@Input() ticketId=0;@Input() assigneeId:number|null=null;
 private http=inject(HttpClient);private auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);private timer:any;private generation=0;private eventRun='';private cursor=0;private fetchingEvents=false;
 ticket:any=null;agent:any=null;catalog:any[]=[];spec:any=this.defaults();revision=0;paths='src, tests';repos:any[]=[];services:any[]=[];reposNext=-1;runs:any[]=[];events:any[]=[];hasMoreEvents=false;selectedId='';error='';notice='';busy=false;
 defaults(){return{repositoryId:0,baseBranch:'main',testProfile:'PYTHON_UNITTEST',testDirectory:'tests',serviceId:'',serviceName:'',acceptanceCriteria:'',allowedPaths:['src','tests'],requiredSkills:['repository-snapshot','regression-review','python-stdlib','unittest']};}
 get mandatory(){return ['repository-snapshot','regression-review',...(this.spec.testProfile==='NODE_TEST'?['node-runtime','node-test']:['python-stdlib','unittest'])];}
 get url(){return environment.apiBaseUrlM+'/tickets/'+this.kind+'/'+this.ticketId+'/execution';}get options(){return{headers:this.auth.getAuthHeaders()};}get active(){return this.runs.some(r=>['QUEUED','RUNNING'].includes(r.state));}get selected(){return this.runs.find(r=>r.id===this.selectedId)||this.runs[0];}
 async ngOnChanges(){clearTimeout(this.timer);++this.generation;this.selectedId='';this.eventRun='';this.events=[];this.cursor=0;await this.load();await this.loadRepos();}
 async request(url:string,method='GET',body?:any){return firstValueFrom(this.http.request<any>(method,url,{...this.options,...(body===undefined?{}:{body})}));}
 async load(refresh=false){const generation=this.generation;try{
  const value=await this.request(this.url);if(generation!==this.generation)return;
  this.ticket=value.ticket;this.runs=value.runs;this.agent=value.agent;this.catalog=value.skillCatalog;
  if(!refresh){this.revision=value.configuration.revision;this.spec={...this.defaults(),...this.agent?.defaults,...value.configuration.spec};this.paths=this.spec.allowedPaths.join(', ');this.spec.requiredSkills=[...new Set([...this.spec.requiredSkills,...this.mandatory])];this.error='';this.loadServices(generation);}
  if(this.selected)await this.loadEvents();
 }catch(e:any){if(generation===this.generation)this.error=e.error?.detail||e.error?.message||'Unable to load ticket execution.';}finally{if(generation===this.generation){clearTimeout(this.timer);this.timer=setTimeout(()=>this.load(true),this.active?3000:10000);this.cdr.markForCheck();}}}
 async loadServices(generation:number){try{const rows=await this.request(location.protocol+'//'+location.hostname+':8094/api/instru/infrastructure?projectId='+this.ticket.projectId);if(generation===this.generation)this.services=rows;}catch{}this.cdr.markForCheck();}
 async loadRepos(more=false){try{const r=await this.request(location.protocol+'//'+location.hostname+':8093/api/forge/repos?offset='+(more?this.reposNext:0));this.repos=more?[...this.repos,...r.items]:r.items;this.reposNext=r.nextOffset;}catch{this.error='Repository catalog is unavailable. Saved execution settings are retained.';}this.cdr.markForCheck();}
 async selectRun(id:string){this.selectedId=id;await this.loadEvents();this.cdr.markForCheck();}
 async loadEvents(){const run=this.selected?.id;if(!run||this.fetchingEvents)return;if(this.eventRun!==run){this.eventRun=run;this.cursor=0;this.events=[];this.hasMoreEvents=false;}this.fetchingEvents=true;try{const r=await this.request(this.url+'/runs/'+run+'/events?after='+this.cursor);if(this.selected?.id===run){this.events=[...this.events,...r.items];this.cursor=r.cursor;this.hasMoreEvents=r.hasMore;}}catch{this.notice='Live log temporarily unavailable. Refresh to retry; final evidence remains available.';}finally{this.fetchingEvents=false;this.cdr.markForCheck();}}
 profileChanged(){this.spec.requiredSkills=[...new Set([...this.spec.requiredSkills.filter((s:string)=>!['python-stdlib','unittest','node-runtime','node-test'].includes(s)),...this.mandatory])];}
 toggleSkill(id:string){if(this.mandatory.includes(id))return;this.spec.requiredSkills=this.spec.requiredSkills.includes(id)?this.spec.requiredSkills.filter((s:string)=>s!==id):[...this.spec.requiredSkills,id];}
 selectService(){this.spec.serviceName=this.services.find(s=>s.id===this.spec.serviceId)?.name||'';}
 async save(){if(this.busy)return;this.busy=true;try{this.spec.allowedPaths=this.paths.split(',').map(p=>p.trim()).filter(Boolean);const r=await this.request(this.url,'PUT',{revision:this.revision,spec:this.spec});this.revision=r.revision;this.spec=r.spec;this.notice='Settings saved. The ticket description and repository revision are captured when you start a run.';this.error='';await this.load(true);}catch(e:any){this.error=e.error?.detail||e.error?.message||'Unable to save execution settings.';}finally{this.busy=false;this.cdr.markForCheck();}}
 async run(){if(this.busy||this.active)return;await this.save();if(this.error)return;this.busy=true;try{const r=await this.request(this.url+'/runs','POST',{});this.selectedId=r.id;this.notice='Run queued. Execution events will update here automatically.';await this.load(true);}catch(e:any){this.error=e.error?.detail||e.error?.message||'Unable to start the assigned agent.';}finally{this.busy=false;this.cdr.markForCheck();}}
 async download(r:any){try{const blob=await firstValueFrom(this.http.get(environment.apiBaseUrlM+'/tickets/'+this.kind+'/'+this.ticketId+'/attachments/'+r.attachment_id,{...this.options,responseType:'blob'}));const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ticket-run-'+r.id+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{this.error='Unable to download evidence.';this.cdr.markForCheck();}}
 stage(event:string){return event.replaceAll('_',' ').toLowerCase().replace(/^./,s=>s.toUpperCase());}
 trackEvent(_:number,event:any){return event.id;}
 ngOnDestroy(){++this.generation;clearTimeout(this.timer);}
}
