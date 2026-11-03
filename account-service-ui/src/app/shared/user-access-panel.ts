import {Component,Input,OnChanges,inject,ChangeDetectorRef} from '@angular/core';
import {CommonModule} from '@angular/common';import {FormsModule} from '@angular/forms';
import {HttpClient} from '@angular/common/http';import {MatFormFieldModule} from '@angular/material/form-field';import {MatSelectModule} from '@angular/material/select';
import {AuthService} from '../auth.service';import {WorkspaceSettingsService} from './workspace-settings.service';
@Component({selector:'app-user-access-panel',standalone:true,imports:[CommonModule,FormsModule,MatFormFieldModule,MatSelectModule],styleUrls:['./workspace-settings.css','./field-controls.css'],template:`
<section class="settings-card"><header><div><h2>Roles and access</h2><p>Designation describes this person's job. Multiple access roles control what they can manage.</p></div></header>
<p class="settings-error" *ngIf="error" role="alert">{{error}}</p><p *ngIf="message" role="status">{{message}}</p>
<p *ngIf="loading">Loading access…</p><ng-container *ngIf="access&&!loading"><p *ngIf="access.superUser">SUPER_USER retains full organization access.</p>
<mat-form-field appearance="outline"><mat-label>Access roles</mat-label><mat-select multiple [(ngModel)]="selectedRoles" [disabled]="!settings.superUser||access.superUser"><mat-option *ngFor="let role of settings.config().roles" [value]="role.code" [disabled]="role.code==='MEMBER'">{{role.name}}</mat-option></mat-select></mat-form-field>
<p class="settings-hint">Everyone can read, create tickets and releases, and move tickets by default. Roles add management permissions; explicit overrides take precedence.</p>
<div class="settings-table-scroll" *ngIf="settings.superUser&&!access.superUser"><table class="settings-table"><thead><tr><th>Resource</th><th *ngFor="let action of actions">{{action|titlecase}}</th></tr></thead><tbody><tr *ngFor="let resource of resources"><th>{{resource|titlecase}}</th><td *ngFor="let action of actions"><select *ngIf="action!=='MOVE'||resource==='TICKETS'" [ngModel]="overrideValue(resource+'.'+action)" (ngModelChange)="setOverride(resource+'.'+action,$event)" [attr.aria-label]="resource+' '+action+' permission'"><option value="inherit">Use roles</option><option value="allow">Allow</option><option value="deny">Deny</option></select><span *ngIf="action==='MOVE'&&resource!=='TICKETS'">—</span></td></tr></tbody></table></div>
<div class="settings-effective" *ngIf="!settings.superUser"><span *ngFor="let permission of granted">{{permission.toLowerCase().replace('.',' · ')}}</span></div>
<footer *ngIf="settings.superUser&&!access.superUser"><button type="button" class="gp-button gp-cancel" (click)="load()" [disabled]="saving">Cancel changes</button><button type="button" class="gp-button gp-action" (click)="save()" [disabled]="saving">{{saving?'Saving…':'Save access'}}</button></footer></ng-container></section>`})
export class UserAccessPanel implements OnChanges {
 @Input()userId=0;readonly settings=inject(WorkspaceSettingsService);private http=inject(HttpClient);private auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);
 access:any=null;selectedRoles:string[]=[];overrides:Record<string,boolean>={};loading=false;saving=false;error='';message='';actions=['READ','CREATE','UPDATE','DELETE','MOVE'];private generation=0;
 get resources(){return [...new Set<string>((this.settings.config().permissions||[]).map((p:string)=>p.split('.')[0]))];}
 get granted(){return Object.keys(this.access?.effective||{}).filter(key=>this.access.effective[key]);}
 ngOnChanges(){this.load();}
 load(){if(!(this.userId>0))return;const generation=++this.generation;this.loading=true;this.error='';this.http.get<any>(this.settings.url+'/users/'+this.userId,{headers:this.auth.getAuthHeaders()}).subscribe({next:data=>{if(generation!==this.generation)return;this.access=data;this.selectedRoles=[...data.roles];this.overrides={...data.overrides};this.loading=false;this.cdr.markForCheck();},error:e=>{if(generation!==this.generation)return;this.loading=false;this.error=e.error?.message||'Unable to load access.';this.cdr.markForCheck();}});}
 overrideValue(key:string){return key in this.overrides?this.overrides[key]?'allow':'deny':'inherit';}
 setOverride(key:string,value:string){if(value==='inherit')delete this.overrides[key];else this.overrides[key]=value==='allow';}
 save(){if(this.saving)return;this.saving=true;this.message='';this.http.put(this.settings.url+'/users/'+this.userId,{roles:this.selectedRoles,overrides:this.overrides},{headers:this.auth.getAuthHeaders()}).subscribe({next:()=>{this.saving=false;this.message='Access saved across your workspace apps.';this.load();this.settings.refresh();},error:e=>{this.saving=false;this.error=e.error?.message||'Unable to save access.';this.cdr.markForCheck();}});}
}
