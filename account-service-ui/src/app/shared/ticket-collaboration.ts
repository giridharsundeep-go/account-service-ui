import {WorkspaceSettingsService} from './workspace-settings.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, finalize, from, mergeMap, catchError, EMPTY } from 'rxjs';
import { AuthService } from '../auth.service';
import { environment } from '../../environment';

@Component({
  selector:'app-ticket-collaboration',standalone:true,imports:[CommonModule,FormsModule],
  template:`<section class="ticket-collaboration" aria-label="Attachments and activity">
    <header><h2>Attachments</h2><label class="tc-button" *ngIf="data?.permissions?.canAttach">{{busy?'Uploading…':'+ Add file'}}<input class="tc-file" type="file" [disabled]="busy" (change)="upload($event)"></label></header>
    <p class="tc-muted">Files up to 25 MB. Downloads require project access.</p>
    <div class="tc-files"><article *ngFor="let file of data?.attachments"><button *ngIf="isImage(file)" type="button" class="tc-thumbnail" (click)="openPreview(file)" [disabled]="!previews[file.id]" [attr.aria-label]="'Preview '+file.name"><img *ngIf="previews[file.id];else previewStatus" [src]="previews[file.id]" [alt]="file.name"><ng-template #previewStatus><span>{{previewErrors.has(file.id)?'Preview unavailable':'Loading preview…'}}</span></ng-template></button><div class="tc-file-copy"><button type="button" class="tc-file-name" (click)="isImage(file)&&previews[file.id]?openPreview(file):download(file)">{{file.name}} <small>{{size(file.size)}}</small></button><button type="button" class="tc-link" (click)="download(file)">Download</button><button *ngIf="previewErrors.has(file.id)" type="button" class="tc-link" (click)="loadPreview(file)">Retry preview</button></div><button *ngIf="file.canDelete" type="button" class="tc-link" [disabled]="busy" (click)="removeFile(file)">Remove</button></article><p *ngIf="!loading&&!data?.attachments?.length" class="tc-muted">No files attached.</p></div>
    <dialog #imageDialog class="tc-image-dialog" (close)="previewFile=null" (click)="$event.target===imageDialog&&imageDialog.close()"><header><strong>{{previewFile?.name}}</strong><button type="button" class="tc-button" (click)="imageDialog.close()" aria-label="Close image preview">×</button></header><img *ngIf="previewFile" [src]="previews[previewFile.id]" [alt]="previewFile.name"><footer><button type="button" class="tc-button" (click)="download(previewFile)">Download image</button></footer></dialog>
    <header class="tc-activity-heading"><h2>Activity</h2><button type="button" class="tc-button" *ngIf="data" (click)="watch()">{{data.watching?'Watching ✓':'Watch changes'}}</button></header>
    <nav class="tc-tabs" aria-label="Activity views"><button *ngFor="let option of ['All','Comments','History']" type="button" [class.active]="tab===option" (click)="tab=option">{{option}}</button><button type="button" class="tc-refresh" (click)="load()" [disabled]="loading">↻ Refresh</button></nav>
    <p role="alert" *ngIf="error" class="tc-error">{{error}}</p><p *ngIf="loading" role="status">Loading activity…</p>
    <ng-container *ngIf="tab!=='History'">
      <div class="tc-composer" *ngIf="data?.permissions?.canComment"><label for="ticket-comment-{{kind}}-{{ticketId}}">Add a comment</label><textarea id="ticket-comment-{{kind}}-{{ticketId}}" [(ngModel)]="comment" rows="4" maxlength="20000" placeholder="Share an update, ask a question, or record a decision."></textarea><div class="tc-actions"><button type="button" class="tc-button tc-primary" [disabled]="busy||!comment.trim()" (click)="saveComment()">{{busy?'Saving…':'Save comment'}}</button><button type="button" class="tc-link" (click)="comment=''">Cancel</button></div></div>
      <article class="tc-comment" *ngFor="let row of data?.comments"><span class="tc-avatar" [attr.data-tone]="row.authorId%5">{{initials(row.authorName)}}</span><div><strong>{{row.authorName}}</strong><time>{{row.createdAt | date:'medium'}}<span *ngIf="row.updatedAt!==row.createdAt"> · Edited</span></time><ng-container *ngIf="editing!==row.id;else editComment"><p>{{row.content}}</p><div class="tc-actions" *ngIf="row.canEdit"><button type="button" class="tc-link" (click)="editing=row.id;editText=row.content">Edit</button><button type="button" class="tc-link" [disabled]="busy" (click)="deleteComment(row)">Delete</button></div></ng-container><ng-template #editComment><textarea [(ngModel)]="editText" rows="3" maxlength="20000" aria-label="Edit comment"></textarea><div class="tc-actions"><button class="tc-button tc-primary" type="button" [disabled]="busy||!editText.trim()" (click)="updateComment(row)">Save</button><button type="button" class="tc-link" (click)="editing=null">Cancel</button></div></ng-template></div></article>
      <p *ngIf="data&&!data.comments.length" class="tc-muted">No comments yet.</p>
    </ng-container>
    <div *ngIf="tab!=='Comments'" class="tc-history"><article *ngFor="let row of activity"><span class="tc-event-dot"></span><div><strong>{{row.actorName || 'System'}}</strong> <span>{{label(row.event_type)}}</span><p>{{row.summary}}</p><details *ngIf="row.changes"><summary>View changes</summary><pre>{{row.changes | json}}</pre></details><time>{{row.created_at | date:'medium'}}</time></div></article><button *ngIf="hasMoreActivity" type="button" class="tc-button" [disabled]="loadingMore" (click)="moreActivity()">Load earlier activity</button><p *ngIf="data&&!activity.length" class="tc-muted">Changes will appear here.</p></div>
  </section>`,
  styleUrls:['./ticket-collaboration.css']
})
export class TicketCollaborationComponent implements OnChanges,OnDestroy {
  @Input() kind='';@Input() ticketId=0;@Input() revision=0;
  @Output() permissionsChange=new EventEmitter<{canEdit:boolean;canComment:boolean;canAttach:boolean}>();
  private http=inject(HttpClient);private auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);
  private readonly workspace=inject(WorkspaceSettingsService);
  private readonly liveActivity=effect(()=>{if(this.workspace.revision()>0)this.load();});
  private request?:Subscription;data:any=null;activity:any[]=[];tab='Comments';comment='';editText='';editing:number|null=null;busy=false;loading=false;loadingMore=false;hasMoreActivity=false;error='';
  @ViewChild('imageDialog') imageDialog?:ElementRef<HTMLDialogElement>;
  previews:Record<number,string>={};previewErrors=new Set<number>();previewFile:any=null;private previewRequests=new Subscription();private previewPending=new Set<number>();
  get url(){return `${environment.apiBaseUrlM}/tickets/${this.kind}/${this.ticketId}`;}
  get options(){return {headers:this.auth.getAuthHeaders()};}
  ngOnChanges(changes:any){if(changes.kind||changes.ticketId){this.clearPreviews();this.data=null;this.comment='';this.editing=null;this.permissionsChange.emit({canEdit:false,canAttach:false,canComment:false});}this.load();}
  ngOnDestroy(){this.request?.unsubscribe();this.clearPreviews();}
  private clearPreviews(){this.previewRequests.unsubscribe();this.previewRequests=new Subscription();this.imageDialog?.nativeElement.close();for(const url of Object.values(this.previews))URL.revokeObjectURL(url);this.previews={};this.previewErrors.clear();this.previewPending.clear();}
  isImage(file:any){return /^image\/(png|jpeg|gif|webp)$/i.test(file?.contentType||'')||/\.(png|jpe?g|gif|webp)$/i.test(file?.name||'');}
  private refreshPreviews(){const ids=new Set((this.data?.attachments||[]).map((file:any)=>file.id));for(const [id,url] of Object.entries(this.previews))if(!ids.has(Number(id))){URL.revokeObjectURL(url);delete this.previews[Number(id)];}this.previewRequests.add(from<any[]>(this.data?.attachments||[]).pipe(mergeMap((file:any)=>this.isImage(file)&&!this.previews[file.id]&&!this.previewPending.has(file.id)?this.previewRequest(file):EMPTY,3)).subscribe());}
  private previewRequest(file:any){this.previewErrors.delete(file.id);this.previewPending.add(file.id);return this.http.get(this.url+'/attachments/'+file.id+'/preview',{...this.options,responseType:'blob'}).pipe(finalize(()=>this.previewPending.delete(file.id)),mergeMap(blob=>{if(!this.data?.attachments?.some((entry:any)=>entry.id===file.id))return EMPTY;if(this.previews[file.id])URL.revokeObjectURL(this.previews[file.id]);this.previews[file.id]=URL.createObjectURL(blob);this.cdr.markForCheck();return EMPTY;}),catchError(()=>{this.previewErrors.add(file.id);this.cdr.markForCheck();return EMPTY;}));}
  loadPreview(file:any){this.previewRequests.add(this.previewRequest(file).subscribe());}
  openPreview(file:any){if(!this.previews[file.id])return;this.previewFile=file;this.cdr.detectChanges();this.imageDialog?.nativeElement.showModal();}
  load(){if(!this.ticketId||!this.kind)return;this.request?.unsubscribe();this.loading=true;this.request=this.http.get<any>(this.url,this.options).pipe(finalize(()=>{this.loading=false;this.cdr.markForCheck();})).subscribe({next:data=>{this.data=data;this.activity=data.activity||[];this.hasMoreActivity=this.activity.length===50;this.permissionsChange.emit(data.permissions);this.refreshPreviews();this.error='';},error:error=>{this.error=error.error?.message||'Unable to load ticket activity.';}});}
  private mutate(request:any,done:()=>void=()=>{}){if(this.busy)return;this.busy=true;this.error='';request.pipe(finalize(()=>{this.busy=false;this.cdr.markForCheck();})).subscribe({next:()=>{done();this.load();},error:(error:any)=>this.error=error.error?.message||'Unable to save. Please try again.'});}
  saveComment(){this.mutate(this.http.post(this.url+'/comments',{content:this.comment},this.options),()=>this.comment='');}
  updateComment(row:any){this.mutate(this.http.put(this.url+'/comments/'+row.id,{content:this.editText},this.options),()=>this.editing=null);}
  deleteComment(row:any){this.mutate(this.http.delete(this.url+'/comments/'+row.id,this.options));}
  upload(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return;if(file.size>25*1024*1024){this.error='Choose a file no larger than 25 MB.';return;}const body=new FormData();body.append('file',file);this.mutate(this.http.post(this.url+'/attachments',body,this.options));}
  removeFile(file:any){this.mutate(this.http.delete(this.url+'/attachments/'+file.id,this.options));}
  download(file:any){this.http.get(this.url+'/attachments/'+file.id,{...this.options,responseType:'blob'}).subscribe({next:blob=>{const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},error:()=>{this.error='Unable to download this file.';this.cdr.markForCheck();}});}
  watch(){this.mutate(this.data.watching?this.http.delete(this.url+'/watch',this.options):this.http.post(this.url+'/watch',{},this.options));}
  moreActivity(){if(this.loadingMore||!this.activity.length)return;this.loadingMore=true;this.http.get<any[]>(this.url+'/activity?before='+this.activity[this.activity.length-1].id,this.options).pipe(finalize(()=>{this.loadingMore=false;this.cdr.markForCheck();})).subscribe({next:rows=>{this.activity=[...this.activity,...rows];this.hasMoreActivity=rows.length===50;},error:()=>this.error='Unable to load earlier activity.'});}
  initials(value:string){return String(value||'System').split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase();}
  label(value:string){return String(value||'').replace(/_/g,' ').toLowerCase();}
  size(value:number){return value<1024*1024?`${Math.ceil(value/1024)} KB`:`${(value/1024/1024).toFixed(1)} MB`;}
}
