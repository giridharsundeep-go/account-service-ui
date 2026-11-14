import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { Component, Input, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { AuthService } from '../auth.service';
import { environment } from '../../environment';
import { WorkspaceSettingsService } from './workspace-settings.service';

@Component({
  selector:'app-ticket-actions', standalone:true, imports:[CommonModule,A11yModule],
  template:`<div class="ticket-options" (keydown.escape)="close($event)">
    <button type="button" class="action" (click)="fullscreenChange.emit(!fullscreen)" [attr.aria-label]="fullscreen?'Exit full screen':'Full screen ticket'" [title]="fullscreen?'Exit full screen':'Full screen'">{{fullscreen?'↙':'⛶'}}</button>
    <button type="button" class="action" aria-label="Ticket options" [attr.aria-expanded]="menu" (click)="menu=!menu">⋯</button>
    <div *ngIf="menu" class="options-list" role="group" aria-label="Ticket options">
      <button type="button" *ngIf="workflow.can('TICKETS.CREATE')" (click)="menu=false;confirm=true;error=''">⧉ Clone ticket</button>
      <button type="button" *ngIf="assigneeId && assigneeId < 0" (click)="menu=false;agentWork.emit()">Agent work &amp; logs →</button>
      <button type="button" (click)="menu=false">Close menu</button>
    </div>
    <div *ngIf="confirm" class="confirm-backdrop" (click)="$event.target===$event.currentTarget&&!busy&&(confirm=false)">
      <section class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="clone-heading" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
        <h2 id="clone-heading">Clone ticket</h2><p>Create a copy of <strong>{{title}}</strong> in this project’s backlog.</p>
        <p class="muted">The copy gets a new key. Comments, attachments and assignment history stay with the original.</p>
        <p role="status" *ngIf="busy">This ticket is getting cloned…</p><p role="alert" *ngIf="error">{{error}}</p>
        <footer><button type="button" [disabled]="busy" (click)="confirm=false">Cancel</button><button type="button" class="primary" [disabled]="busy" (click)="createClone()">{{busy?'Cloning…':'Create clone'}}</button></footer>
      </section>
    </div>
  </div>`,
  styles:[`:host{display:inline-flex}.ticket-options{display:flex;gap:6px;position:relative}.action{width:36px;height:36px;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:10px;background:white;color:#344054;font-size:22px;cursor:pointer}.options-list{position:absolute;top:42px;right:0;z-index:20;min-width:210px;padding:6px;background:white;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:10px;box-shadow:0 8px 24px #172b4d25}.options-list button{display:block;width:100%;text-align:left;background:white;border:0;padding:12px;border-radius:6px;color:#344054;font:inherit;cursor:pointer}.options-list button:hover{background:#edf4ff}.confirm-backdrop{position:fixed;inset:0;background:#14223965;z-index:120010;display:grid;place-items:center;padding:20px}.confirm-card{width:min(460px,100%);max-height:90dvh;overflow:auto;padding:24px;background:white;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:10px;box-shadow:0 20px 60px #172b4d30;color:#243247}.confirm-card h2{margin:0 0 14px;font-size:22px}.confirm-card p{font-size:15px;line-height:1.6;overflow-wrap:anywhere}.muted{color:#68778c}.confirm-card footer{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.confirm-card footer button{border:1px solid var(--gp-border-color, #a0a6b1);border-radius:10px;padding:10px 18px;background:white;font:inherit;cursor:pointer}.confirm-card footer .primary{background:#175fc2;border-color:var(--gp-border-color, #a0a6b1);color:white}button:disabled{opacity:.6;cursor:wait}button:focus-visible{outline:2px solid #175fc2;outline-offset:2px}`],
})
export class TicketActionsComponent {
  @Input() kind=''; @Input() ticketId=0; @Input() title=''; @Input() assigneeId:number|null=null; @Input() fullscreen=false;
  @Output() cloned=new EventEmitter<{id:number;kind:string;projectId:number}>();
  @Output() fullscreenChange=new EventEmitter<boolean>(); @Output() agentWork=new EventEmitter<void>();
  readonly workflow=inject(WorkspaceSettingsService); private http=inject(HttpClient); private auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);
  menu=false;confirm=false;busy=false;error='';
  close(event:Event){event.stopPropagation();if(!this.busy){this.confirm=false;this.menu=false;}}
  createClone(){if(this.busy||!this.workflow.can('TICKETS.CREATE'))return;this.busy=true;this.error='';this.http.post<any>(`${environment.apiBaseUrlM}/tickets/${this.kind}/${this.ticketId}/clone`,{},{headers:this.auth.getAuthHeaders()}).pipe(finalize(()=>{this.busy=false;this.cdr.markForCheck();})).subscribe({next:clone=>{this.confirm=false;this.cloned.emit(clone);},error:e=>this.error=e.error?.message||'Unable to clone this ticket. Please try again.'});}
}
