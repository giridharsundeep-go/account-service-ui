import {Component,Input,OnChanges,OnDestroy,inject,ChangeDetectorRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {AuthService} from '../auth.service';
import {environment} from '../../environment';
@Component({selector:'app-agent-runtime-config',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./agent-runtime-config.html',styleUrl:'./agent-execution.css'})
export class AgentRuntimeConfig implements OnChanges,OnDestroy {
 @Input() agentId=0;
 private http=inject(HttpClient);private auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);private timer:any;private generation=0;
 config:any=null;catalog:any[]=[];repos:any[]=[];reposNext=-1;paths='src, tests';busy=false;error='';notice='';
 get admin(){return this.auth.isAdmin();}get url(){return environment.apiBaseUrlM+'/operations';}get options(){return{headers:this.auth.getAuthHeaders()};}
 async ngOnChanges(){clearTimeout(this.timer);const generation=++this.generation;try{
  const [rows,catalog]=await Promise.all([firstValueFrom(this.http.get<any[]>(this.url+'/agents',this.options)),firstValueFrom(this.http.get<any[]>(this.url+'/agent-skills',this.options))]);
  if(generation!==this.generation)return;this.catalog=catalog;this.config=rows.find(r=>Number(r.id)===Number(this.agentId));
  if(this.config){this.config.model||='qwen2.5-coder:3b-instruct';this.config.skills||=[];this.config.executionDefaults={repositoryId:0,baseBranch:'main',testProfile:'PYTHON_UNITTEST',testDirectory:'tests',allowedPaths:['src','tests'],...this.config.executionDefaults};this.paths=this.config.executionDefaults.allowedPaths.join(', ');}
  await this.loadRepos();this.poll(generation);
 }catch(e:any){this.error=e.error?.detail||'Unable to load worker configuration.';}this.cdr.markForCheck();}
 poll(generation:number){this.timer=setTimeout(async()=>{try{const rows=await firstValueFrom(this.http.get<any[]>(this.url+'/agents',this.options));if(generation!==this.generation)return;const fresh=rows.find(r=>Number(r.id)===Number(this.agentId));if(fresh&&this.config){this.config.worker=fresh.worker;this.config.last_seen=fresh.last_seen;}}catch{}if(generation===this.generation){this.cdr.markForCheck();this.poll(generation);}},10000);}
 async loadRepos(more=false){try{const r=await firstValueFrom(this.http.get<any>(location.protocol+'//'+location.hostname+':8093/api/forge/repos?offset='+(more?this.reposNext:0),this.options));this.repos=more?[...this.repos,...r.items]:r.items;this.reposNext=r.nextOffset;}catch{this.error='Repository catalog unavailable. Existing defaults are retained.';}this.cdr.markForCheck();}
 enabled(id:string){return this.config?.skills.includes(id);}
 toggle(id:string){this.config.skills=this.enabled(id)?this.config.skills.filter((s:string)=>s!==id):[...this.config.skills,id];}
 installed(id:string){return this.config?.worker?.skills?.find((s:any)=>s.id===id);}
 async save(){this.busy=true;try{this.config.executionDefaults.allowedPaths=this.paths.split(',').map(p=>p.trim()).filter(Boolean);await firstValueFrom(this.http.put(this.url+'/agents/'+this.agentId,this.config,this.options));this.notice='Configuration saved. Defaults apply to tickets without saved execution settings.';this.error='';}catch(e:any){this.error=e.error?.detail||e.error?.message||'Unable to configure worker.';}finally{this.busy=false;this.cdr.markForCheck();}}
 async enroll(){this.busy=true;try{const result=await firstValueFrom(this.http.post<any>(this.url+'/agents/'+this.agentId+'/enroll',{},this.options));const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='local-agent.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.notice='Private enrollment downloaded. Save as ~/.config/professy/local-agent.json with mode 600, then start the worker.';}catch(e:any){this.error=e.error?.detail||e.error?.message||'Unable to enroll this worker.';}finally{this.busy=false;this.cdr.markForCheck();}}
 ngOnDestroy(){++this.generation;clearTimeout(this.timer);}
}
