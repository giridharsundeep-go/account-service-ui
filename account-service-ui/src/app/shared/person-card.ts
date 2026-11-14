import { ActorIconComponent, actorKind } from './actor-icon';
import { ChatlyLauncher } from './chatly-launcher.service';
import { SuiteSessionService } from './suite-session.service';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { OverlayModule } from '@angular/cdk/overlay';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { environment } from '../../environment';

@Component({
  selector: 'app-person-card', standalone: true, imports: [ActorIconComponent, CommonModule, OverlayModule, A11yModule],
  template: `
    <article class="gp-person-surface" [attr.aria-label]="name + ', ' + designation" cdkOverlayOrigin #profileOrigin="cdkOverlayOrigin" (keydown.escape)="previewOpen = false">
      <div class="gp-person-avatar" [attr.data-tone]="tone">
        <img *ngIf="avatar && !imageFailed; else initials" [src]="avatar" [alt]="name" (error)="imageFailed = true" />
        <ng-template #initials>{{ initialsText }}</ng-template>
      </div>
      <div class="gp-person-copy"><strong [title]="name"><app-actor-icon [actorId]="id" [actorType]="actorType"></app-actor-icon><span class="gp-person-name">{{name}}</span></strong>
        <span class="gp-person-designation" [title]="designation || 'Designation not set'">{{designation || 'Designation not set'}}</span>
      </div>
      <button type="button" class="gp-person-details" (click)="$event.stopPropagation(); togglePreview()" [attr.aria-expanded]="previewOpen" [attr.aria-label]="'View profile of ' + name" aria-haspopup="dialog">ⓘ</button>
    </article>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="profileOrigin" [cdkConnectedOverlayOpen]="previewOpen" [cdkConnectedOverlayPositions]="previewPositions" [cdkConnectedOverlayHasBackdrop]="true" cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop" (backdropClick)="previewOpen=false" (overlayKeydown)="$event.key === 'Escape' && (previewOpen=false)" [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="12">
      <aside class="gp-person-preview" role="dialog" aria-modal="true" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" [attr.aria-label]="name + ' profile'" tabindex="0" (keydown.escape)="previewOpen = false"><button type="button" class="gp-person-preview-close" (click)="previewOpen=false" aria-label="Close profile">×</button><div class="gp-person-preview-cover"></div><div class="gp-person-avatar" [attr.data-tone]="tone"><img *ngIf="avatar && !imageFailed; else previewInitials" [src]="avatar" [alt]="name" /><ng-template #previewInitials>{{initialsText}}</ng-template></div><strong><app-actor-icon [actorId]="id" [actorType]="actorType"></app-actor-icon> {{name}}</strong><span>{{designation || 'Designation not set'}}</span><small *ngIf="loadingProfile">Loading profile…</small><small *ngIf="profileUnavailable">Showing available profile details.</small><div class="gp-person-profile-section" *ngFor="let section of profileSections"><h4>{{section.title}}</h4><dl><ng-container *ngFor="let field of section.fields"><dt>{{field.label}}</dt><dd>{{field.value}}</dd></ng-container></dl></div><small *ngIf="context">{{context}}</small><div class="gp-person-preview-actions"><button *ngIf="canOpenProfile" type="button" class="gp-person-remove" (click)="openFullProfile()">View full profile ↗</button><button *ngIf="canMessage" type="button" class="gp-person-remove" (click)="chatly.person(personId)">Message ↗</button><button *ngIf="removable" type="button" class="gp-person-remove" (click)="previewOpen=false;remove.emit()" [attr.aria-label]="'Remove ' + name">Remove</button></div></aside>
    </ng-template>`,
  styles: [`
    :host { display:block; min-width:0; }
    .gp-person-surface { height:auto; min-height:68px; box-sizing:border-box; overflow:hidden; display:grid; grid-template-columns:40px minmax(0,1fr) 32px; align-items:center; gap:10px; background:var(--gp-surface,#fff); border:0; border-radius:10px; padding:10px; text-align:left; }
    .gp-person-cover { width:calc(100% + 32px); height:78px; flex-shrink:0; background:#f4f8fa url('/assets/covers/teams.jpeg') center 43%/cover no-repeat; }
    .gp-person-avatar { width:40px; height:40px; flex-shrink:0; position:relative; margin:0; border:0; border-radius:50%; display:grid; place-items:center; background:#3c9b68; color:#fff; font-size:14px; font-weight:700; overflow:hidden; }
    .gp-person-avatar[data-tone="0"] { background:#ed7d2d; } .gp-person-avatar[data-tone="1"] { background:#d94b58; } .gp-person-avatar[data-tone="3"] { background:#1764d4; } .gp-person-avatar[data-tone="4"] { background:#6557c8; }
    .gp-person-avatar img { width:100%; height:100%; object-fit:cover; }
    .gp-person-copy { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .gp-person-copy strong { display:flex; align-items:center; gap:6px; min-width:0; font-size:14px; line-height:1.4; color:var(--gp-text,#111); }
    .gp-person-name,.gp-person-designation { display:block; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .gp-person-designation { color:var(--gp-muted,#596579); font-size:12px; line-height:1.4; }
    .gp-person-copy a { color:#69778e; font-size:13px; text-decoration:none; overflow-wrap:anywhere; }
    .gp-person-copy small { color:#738094; font-size:12px; }
    .gp-person-surface{position:relative}.gp-person-details{position:static;grid-column:3;grid-row:1;justify-self:end;width:32px;height:32px;min-height:32px;border:0;background:var(--gp-surface,#fff);color:var(--gp-text,#111);border-radius:50%;cursor:pointer;font-size:20px}.gp-person-preview{position:relative}.gp-person-preview-close{position:absolute;right:10px;top:10px;border:0;background:white;border-radius:50%;width:32px;height:32px;font-size:22px;cursor:pointer}
    .gp-person-preview-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; width:100%; }
    .gp-person-remove { margin-top:14px; padding:8px 16px; background:#f0f3f5; border:0; border-radius:10px; font:inherit; font-size:13px; color:#39465a; cursor:pointer; }
    .gp-person-remove:hover { background:#e4eaf0; }
    .gp-person-remove:focus-visible { outline:2px solid #175fc2; outline-offset:3px; }
    .gp-person-preview{width:min(420px,calc(100vw - 24px));max-height:75dvh;box-sizing:border-box;display:flex;align-items:center;flex-direction:column;gap:8px;padding:0 20px 20px;background:white;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:10px;box-shadow:0 12px 36px #172b4d30;color:#24334a;text-align:center;overflow-y:auto;overscroll-behavior:contain}
    .gp-person-preview-cover{height:70px;width:calc(100% + 40px);background:linear-gradient(120deg,#001c51,#007cc1,#79c7aa)}
    .gp-person-preview>.gp-person-avatar{margin:-32px 0 0}.gp-person-preview>strong{font-size:18px}.gp-person-preview>span{font-size:14px;color:#58677d}.gp-person-preview>small{font-size:13px;color:#748197;overflow-wrap:anywhere;max-width:100%}
    .gp-person-preview-cover{flex-shrink:0}.gp-person-profile-section{width:100%;text-align:left;border-top:1px solid var(--gp-border-color, #a0a6b1);margin-top:8px;padding-top:12px}.gp-person-profile-section h4{font-size:13px;margin:0 0 12px;color:#175fc2}.gp-person-profile-section dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;margin:0;font-size:13px}.gp-person-profile-section dt{color:#7b8797}.gp-person-profile-section dd{margin:0;color:#344054;overflow-wrap:anywhere}
  `]
})
export class PersonCard implements OnDestroy {
  readonly chatly=inject(ChatlyLauncher);
  private readonly suite=inject(SuiteSessionService);
  get personId(){return Number(this.id)||0;}
  get canOpenProfile(){return this.personId>0&&actorKind(this.id,this.actorType)!=='AGENT';}
  get canMessage(){return this.personId>0&&this.personId!==Number(this.auth.getCurrentUserId());}
  openFullProfile():void{if(this.canOpenProfile)this.suite.open('people',{view:'users',userId:this.personId});}

  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  @Input() actorType = 'HUMAN';
  @Input() profile: any = null;
  private loadedProfile: any = null;
  private loadedId: number | string | null = null;
  private closeTimer?: ReturnType<typeof setTimeout>;
  loadingProfile = false;
  profileUnavailable = false;
  @Input() id: number | string = 0;
  @Input() name = '';
  @Input() email = '';
  @Input() designation = '';
  @Input() avatar: string | null = '';
  @Input() context = '';
  @Input() removable = false;
  @Input() location = '';
  @Input() employeeCode = '';
  @Output() remove = new EventEmitter<void>();
  imageFailed = false;
  previewOpen = false;
  keepPreviewOpen(): void { clearTimeout(this.closeTimer); this.previewOpen = true; }
  scheduleClose(): void { this.closeTimer = setTimeout(()=>{this.previewOpen=false;this.cdr.markForCheck();},180); }
  togglePreview(): void { if(this.previewOpen)this.previewOpen=false;else this.openPreview(); }
  openPreview(): void {
    this.keepPreviewOpen();
    if (actorKind(this.id, this.actorType) === 'AGENT' || !Number(this.id) || this.loadedId === this.id) return;
    this.loadedId = this.id;
    const id=this.id;
    this.loadedProfile=null;
    this.profileUnavailable=false;
    this.loadingProfile = true;
    this.http.get<any>(`${environment.apiBaseUrlM}/users/${this.id}`, {headers:this.auth.getAuthHeaders()}).subscribe({
      next: response => {if(id!==this.id)return;this.loadedProfile=response?.data ?? response; this.loadingProfile=false;this.cdr.markForCheck(); },
      error: () => {if(id!==this.id)return;this.loadingProfile=false;this.profileUnavailable=true;this.cdr.markForCheck();},
    });
  }
  get profileSections(): {title:string;fields:{label:string;value:string}[]}[] {
    const person={...(this.profile??{}),...(this.loadedProfile??{})};
    const read=(...keys:string[])=>keys.map(key=>person[key]).find(value=>value!==null&&value!==undefined&&value!=='');
    const field=(label:string,value:any)=>({label,value:value==null||value===''?'Not set':String(value)});
    const manager=person.manager ?? person.reportsTo ?? person.reports_to;
    const managerName=typeof manager==='string'?manager:manager?.name || [manager?.firstName ?? manager?.first_name,manager?.lastName ?? manager?.last_name].filter(Boolean).join(' ');
    const active=read('isActive','is_active');
    return [
      {title:'Contact',fields:[field('Email',read('email')||this.email),field('Phone',read('phone','phoneNumber','phone_number')),field('Pronouns',read('pronouns')),field('Gender',read('gender'))]},
      {title:'Employment',fields:[field('Designation',this.designation),field('Employee ID',this.employeeCode||[read('employeeIdPrefix','employee_id_prefix'),read('employeeIdNumber','employee_id_number')].filter(Boolean).join('-')),field('Organization role',read('orgRole','org_role')),field('Status',active===undefined?undefined:active?'Active':'Inactive'),field('Manager',managerName||read('managerName','manager_name')),field('Department',read('department')),field('Joined',read('joiningDate','joining_date','dateOfJoining','date_of_joining'))]},
      {title:'Work location',fields:[field('Country',read('locationCountry','location_country','country')),field('State',read('locationState','location_state','state')),field('City',read('locationCity','location_city','city')||this.location),field('Work model',read('workModel','work_model')),field('Office',read('officeLocation','office_location','location'))]},
    ];
  }
  ngOnDestroy():void {clearTimeout(this.closeTimer);}
  readonly previewPositions = [
    {originX:'start' as const,originY:'bottom' as const,overlayX:'start' as const,overlayY:'top' as const,offsetY:6},
    {originX:'start' as const,originY:'top' as const,overlayX:'end' as const,overlayY:'top' as const,offsetX:-12},
    {originX:'center' as const,originY:'top' as const,overlayX:'center' as const,overlayY:'bottom' as const,offsetY:-8}
  ];
  get tone(): number { return Math.abs(Number(this.id) || 0) % 5; }
  get initialsText(): string { const parts = this.name.trim().split(/\s+/); return ((parts[0]?.[0] || 'U') + (parts.length > 1 ? parts[parts.length-1][0] : '')).toUpperCase(); }
}
