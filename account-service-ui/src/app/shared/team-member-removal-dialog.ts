import {CommonModule} from '@angular/common';
import {ChangeDetectorRef,Component,inject} from '@angular/core';
import {MAT_DIALOG_DATA,MatDialogModule,MatDialogRef} from '@angular/material/dialog';
import {Observable} from 'rxjs';
import {A11yModule} from '@angular/cdk/a11y';

export interface TeamMemberRemovalData {
  teamName:string;
  name:string;
  email:string;
  designation:string;
  remove:()=>Observable<any>;
}

@Component({
  selector:'app-team-member-removal-dialog',standalone:true,imports:[CommonModule,MatDialogModule,A11yModule],
  template:`<section class="removal-dialog" aria-labelledby="remove-member-title">
    <header><div><small>TEAM MEMBERSHIP</small><h2 id="remove-member-title">Remove team member?</h2></div><button type="button" class="close" (click)="cancel()" [disabled]="pending" aria-label="Close removal dialog">×</button></header>
    <div class="person"><span class="avatar" aria-hidden="true">{{initials}}</span><div><strong>{{data.name}}</strong><small>{{data.designation || 'Designation not set'}}</small><span>{{data.email}}</span></div></div>
    <p>Remove <strong>{{data.name}}</strong> from <strong>{{data.teamName}}</strong>?</p>
    <p class="hint">Their account and existing work items will remain. You can add them to the team again.</p>
    <p *ngIf="error" role="alert" class="error">{{error}}</p>
    <footer><button class="gp-button gp-outline" type="button" (click)="cancel()" [disabled]="pending" cdkFocusInitial>Cancel</button><button class="gp-button remove" type="button" (click)="confirm()" [disabled]="pending">{{pending?'Removing…':'Remove member'}}</button></footer>
  </section>`,
  styles:[`:host{display:block;color:var(--gp-text);font-family:var(--gp-font,system-ui)}.removal-dialog{padding:24px}header{display:flex;gap:20px;justify-content:space-between;align-items:flex-start}header small{font-size:11px;letter-spacing:.08em;color:var(--gp-muted)}h2{font-size:24px;margin:8px 0 20px}.close{width:34px;height:34px;border:0;border-radius:50%;font-size:25px;background:transparent;color:inherit;cursor:pointer}.person{display:flex;gap:14px;align-items:center;padding:16px;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:16px}.avatar{display:grid;place-items:center;width:48px;height:48px;flex-shrink:0;border-radius:14px;background:#edf3ff;color:#1764d4;font-size:18px;font-weight:750}.person>div{display:grid;gap:5px;min-width:0}.person strong{font-size:17px}.person small,.person span:not(.avatar){color:var(--gp-muted);font-size:13px;overflow-wrap:anywhere}p{font-size:16px;line-height:1.6}.hint{color:var(--gp-muted);font-size:14px}.error{padding:12px;border-radius:12px;color:#b42318;background:#fff0ee}footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:12px;margin-top:24px}.remove{background:#be3030;color:#fff;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:24px;height:48px;padding:0 20px;font:650 15px var(--gp-font,system-ui);cursor:pointer}button:disabled{opacity:.55;cursor:default}`]
})
export class TeamMemberRemovalDialog {
  readonly data=inject<TeamMemberRemovalData>(MAT_DIALOG_DATA);
  private readonly ref=inject(MatDialogRef<TeamMemberRemovalDialog>);
  private readonly cdr=inject(ChangeDetectorRef);
  pending=false;error='';
  get initials(){return this.data.name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();}
  cancel(){if(!this.pending)this.ref.close();}
  confirm(){
    if(this.pending)return;
    this.pending=true;this.error='';this.ref.disableClose=true;
    this.data.remove().subscribe({
      next:response=>this.ref.close({removed:true,response}),
      error:error=>{this.pending=false;this.ref.disableClose=false;this.error=error?.error?.message||'Unable to remove this member. Please try again.';this.cdr.markForCheck();}
    });
  }
}
