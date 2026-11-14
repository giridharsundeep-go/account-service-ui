import {CommonModule} from '@angular/common';
import {ChangeDetectorRef,Component,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {A11yModule} from '@angular/cdk/a11y';
import {HttpClient} from '@angular/common/http';
import {MAT_DIALOG_DATA,MatDialogModule,MatDialogRef} from '@angular/material/dialog';
import {AuthService} from '../auth.service';
import {environment} from '../../environment';
import {OrganizationStructureComponent} from './organization-structure';
import {WorkspaceSettingsService} from './workspace-settings.service';

export type OrganizationUnitType='DEPARTMENT'|'FUNCTION'|'DIVISION';
export interface OrganizationUnit {id:number;type:OrganizationUnitType;name:string;parentId:number|null;active:boolean;}

@Component({
  standalone:true,imports:[CommonModule,FormsModule,A11yModule,MatDialogModule],
  template:`<form class="unit-dialog" (ngSubmit)="save()" #unitForm="ngForm">
    <header><div><small>ORGANIZATION STRUCTURE</small><h2>Add {{type.toLowerCase()}}</h2></div><button type="button" class="close" (click)="cancel()" [disabled]="saving" aria-label="Close">×</button></header>
    <p>Create an organization-wide option you can assign to people.</p>
    <label>Type<select name="type" [(ngModel)]="type" [disabled]="saving"><option value="DEPARTMENT">Department</option><option value="FUNCTION">Function</option><option value="DIVISION">Division</option></select></label>
    <label>Name<input cdkFocusInitial name="name" type="text" [(ngModel)]="name" required maxlength="120" [disabled]="saving" [placeholder]="'e.g. '+example"></label>
    <label>Parent unit <small>Optional</small><select name="parent" [(ngModel)]="parentId" [disabled]="saving"><option [ngValue]="null">No parent unit</option><option *ngFor="let unit of activeUnits" [ngValue]="unit.id">{{unit.name}} · {{unit.type.toLowerCase()|titlecase}}</option></select></label>
    <p class="error" *ngIf="error" role="alert">{{error}}</p>
    <footer><button type="button" class="gp-button gp-outline" (click)="cancel()" [disabled]="saving">Cancel</button><button class="gp-button gp-primary" type="submit" [disabled]="saving||unitForm.invalid||!name.trim()">{{saving?'Creating…':'Create '+type.toLowerCase()}}</button></footer>
  </form>`,
  styles:[`.unit-dialog{padding:24px;color:var(--gp-text);font-family:var(--gp-font,system-ui)}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}header small{font-size:11px;letter-spacing:.08em;color:var(--gp-muted)}h2{font-size:24px;margin:8px 0 0}.close{border:0;background:transparent;color:inherit;font-size:25px;width:34px;height:34px;cursor:pointer}p{font-size:14px;line-height:1.6;color:var(--gp-muted)}label{display:grid;gap:8px;margin-top:20px;font-size:14px;font-weight:600}label small{font-size:12px;color:var(--gp-muted)}input,select{height:50px;box-sizing:border-box;width:100%;padding:0 14px;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:12px;background:var(--gp-surface);color:var(--gp-text);font:16px var(--gp-font,system-ui)}footer{display:flex;justify-content:flex-end;gap:12px;margin-top:24px;flex-wrap:wrap}.error{padding:12px;color:#b42318;background:#fff0ee;border-radius:12px}`]
})
export class OrganizationUnitDialog {
  private readonly data=inject<{type?:OrganizationUnitType;units:OrganizationUnit[]}>(MAT_DIALOG_DATA);
  private readonly ref=inject(MatDialogRef<OrganizationUnitDialog>);
  private readonly http=inject(HttpClient);
  private readonly auth=inject(AuthService);
  private readonly settings=inject(WorkspaceSettingsService);
  private readonly cdr=inject(ChangeDetectorRef);
  type:OrganizationUnitType=this.data.type||'FUNCTION';name='';parentId:number|null=null;saving=false;error='';
  get activeUnits(){return this.data.units.filter(unit=>unit.active);}
  get example(){return {FUNCTION:'Engineering',DIVISION:'Enterprise products',DEPARTMENT:'Platform engineering'}[this.type];}
  cancel(){if(!this.saving)this.ref.close();}
  save(){
    if(this.saving||!this.name.trim()||!this.settings.can('USERS.UPDATE'))return;
    const name=this.name.trim();
    if(this.data.units.some(unit=>unit.type===this.type&&unit.name.toLowerCase()===name.toLowerCase())){this.error='This '+this.type.toLowerCase()+' already exists. Choose it from the list.';return;}
    this.saving=true;this.error='';this.ref.disableClose=true;
    this.http.post<OrganizationUnit[]>(environment.apiBaseUrlM+'/workspace/organization/units',{type:this.type,name,parentId:this.parentId,active:true},{headers:this.auth.getAuthHeaders()}).subscribe({
      next:units=>{const unit=units.find(value=>value.type===this.type&&value.name.toLowerCase()===name.toLowerCase());this.ref.close({units,unit});},
      error:error=>{this.saving=false;this.ref.disableClose=false;this.error=error?.status===409?'A '+this.type.toLowerCase()+' with this name already exists.':error?.error?.message||'Unable to create this '+this.type.toLowerCase()+'. Please try again.';this.cdr.markForCheck();}
    });
  }
}

@Component({
  standalone:true,imports:[MatDialogModule,OrganizationStructureComponent],
  template:`<header class="structure-header"><h2>Organization structure</h2><button type="button" mat-dialog-close aria-label="Close organization structure">×</button></header><mat-dialog-content><app-organization-structure></app-organization-structure></mat-dialog-content><mat-dialog-actions align="end"><button class="gp-button gp-outline" type="button" mat-dialog-close>Done</button></mat-dialog-actions>`,
  styles:[`.structure-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:24px 24px 0;color:var(--gp-text)}h2{margin:0;font:750 24px var(--gp-font,system-ui)}header button{width:36px;height:36px;font-size:25px;border:0;background:transparent;color:inherit;cursor:pointer}mat-dialog-content{max-height:70dvh;padding:24px}mat-dialog-actions{padding:16px 24px}`]
})
export class OrganizationStructureDialog {}
