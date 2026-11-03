import {Injectable, PLATFORM_ID, effect, inject, signal, untracked} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {HttpClient} from '@angular/common/http';
import {AuthService} from '../auth.service';
import {environment} from '../../environment';
export interface WorkflowStatus {code:string;name:string;color:string;category:string;sortOrder:number;active:boolean;}
export interface WorkspaceUpdate {eventId?:string;type?:string;userId?:number;ticketId?:number;ticketType?:string;projectId?:number;calendarEventId?:number;conversationId?:number;}
const defaults:WorkflowStatus[]=[['BACKLOG','Backlog','#64748b','BACKLOG'],['TODO','To Do','#3b82f6','TODO'],['IN_PROGRESS','In Progress','#8b5cf6','IN_PROGRESS'],['IN_REVIEW','In Review','#6366f1','IN_PROGRESS'],['TESTING','Testing','#f59e0b','IN_PROGRESS'],['COMPLETED','Completed','#16a34a','DONE'],['BLOCKED','Blocked','#ef4444','IN_PROGRESS']].map(([code,name,color,category],sortOrder)=>({code,name,color,category,sortOrder,active:true}));
@Injectable({providedIn:'root'})
export class WorkspaceSettingsService {
 private http=inject(HttpClient);private auth=inject(AuthService);private browser=isPlatformBrowser(inject(PLATFORM_ID));
 readonly url=environment.apiBaseUrlM+'/workspace/settings';readonly config=signal<any>({statuses:defaults,roles:[],effective:{},permissions:[],canManageAccess:false});readonly revision=signal(0);readonly available=signal(false);
 readonly lastEvent=signal<WorkspaceUpdate|null>(null);
 private stream?:AbortController;private reconnect?:ReturnType<typeof setTimeout>;private running=false;private generation=0;
 constructor(){effect(()=>{this.auth.sessionRevision();untracked(()=>{this.stop();if(this.browser)this.start();});});}
 get statuses():WorkflowStatus[]{return this.config().statuses||defaults;}
 get names(){return this.statuses.filter(s=>s.active).map(s=>s.name);}
 can(permission:string){return this.auth.isAdmin()||this.config().effective?.[permission]===true;}
 get superUser(){return this.auth.isAdmin();}
 code(value:any){const raw=String(value||'BACKLOG').trim();const match=this.statuses.find(s=>s.code===raw.toUpperCase().replace(/[ -]+/g,'_')||s.name.toLowerCase()===raw.toLowerCase());if(match)return match.code;const normalized=raw.toUpperCase().replace(/[ -]+/g,'_');return ({DONE:'COMPLETED',CLOSED:'COMPLETED',RESOLVED:'COMPLETED',OPEN:'TODO',NEW:'TODO',TO_DO:'TODO',ON_HOLD:'BLOCKED'} as Record<string,string>)[normalized]||normalized;}
 label(value:any){const code=this.code(value);return this.statuses.find(s=>s.code===code)?.name||String(value||'Backlog').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,v=>v.toUpperCase());}
 color(value:any){return this.statuses.find(s=>s.code===this.code(value))?.color||'#64748b';}
 done(value:any){return this.statuses.find(s=>s.code===this.code(value))?.category==='DONE';}
 refresh(){if(!this.browser||!this.auth.isLoggedIn())return;const generation=this.generation;this.http.get(this.url,{headers:this.auth.getAuthHeaders()}).subscribe({next:value=>{if(generation!==this.generation)return;this.config.set(value);this.available.set(true);},error:()=>{if(generation===this.generation)this.available.set(false);}});}
 start(){if(!this.browser||this.running||!this.auth.isLoggedIn())return;this.running=true;this.refresh();void this.connect();}
 private stop(){this.running=false;this.generation++;this.stream?.abort();clearTimeout(this.reconnect);this.available.set(false);this.lastEvent.set(null);this.config.set({statuses:defaults,roles:[],effective:{},permissions:[],canManageAccess:false});}
 private async connect(){if(!this.auth.isLoggedIn()){this.running=false;return;}const generation=this.generation;this.stream=new AbortController();try{const response=await fetch(this.url+'/events',{headers:{Authorization:this.auth.getAuthHeaders().get('Authorization')||'',Accept:'text/event-stream'},signal:this.stream.signal});if(!response.ok||!response.body)throw new Error('Event stream unavailable');const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(generation===this.generation&&this.running){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true}).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!/^event:\s*workspace$/m.test(frame)||generation!==this.generation)continue;if(!this.auth.isLoggedIn()){this.stop();return;}try{const event:WorkspaceUpdate=JSON.parse(frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n'));this.lastEvent.set(event);if(['WORKFLOW_UPDATED','ROLE_UPDATED','USER_ACCESS_UPDATED'].includes(event.type||''))this.refresh();if(!['CHAT_UPDATED','CALENDAR_UPDATED'].includes(event.type||''))this.revision.update(v=>v+1);}catch{}}}}catch{}finally{if(this.running&&generation===this.generation)this.reconnect=setTimeout(()=>void this.connect(),3000);}}
}
