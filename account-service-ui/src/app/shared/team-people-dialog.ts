import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { PersonCard } from './person-card';

@Component({
  selector: 'app-team-people-dialog', standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, PersonCard],
  template: `<h2 mat-dialog-title>{{data.name}}</h2>
    <div class="team-people-toolbar"><span>{{data.members.length}} team members</span><input type="search" [(ngModel)]="search" placeholder="Search members or designation" aria-label="Search team members" /></div>
    <mat-dialog-content><div class="gp-people-grid"><app-person-card *ngFor="let member of filteredMembers" [id]="member.id" [name]="member.name" [email]="member.email" [designation]="member.designation" [avatar]="member.profilePictureUrl" [location]="member.location" [employeeCode]="member.employeeCode"></app-person-card></div><p *ngIf="!filteredMembers.length">No matching team members.</p></mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-stroked-button mat-dialog-close>Close</button></mat-dialog-actions>`,
  styles: [`:host{display:block;background:white;color:#24334a}.team-people-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:16px;padding:0 24px 20px;color:#6c788b;font-size:14px}.team-people-toolbar input{flex:1;min-width:180px;height:50px;padding:0 16px;border:1px solid #b7bfcb;border-radius:10px;font:inherit}.gp-people-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:16px}mat-dialog-content{max-height:65vh;padding:0 24px 24px}mat-dialog-actions{border-top:1px solid #e5eaf0;padding:16px 24px}`]
})
export class TeamPeopleDialog {
  search = '';
  constructor(@Inject(MAT_DIALOG_DATA) public data: {name: string; members: any[]}) {}
  get filteredMembers(): any[] { const query = this.search.trim().toLowerCase(); return this.data.members.filter(member => `${member.name} ${member.email} ${member.designation}`.toLowerCase().includes(query)); }
}
