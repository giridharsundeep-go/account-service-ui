import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector:'app-team-select-dialog', standalone:true,
  imports:[CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template:`<h2 mat-dialog-title>Allocate teams</h2><p class="team-picker-hint">Choose the teams working on this project.</p>
    <div class="team-picker-search"><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Search teams</mat-label><input matInput [(ngModel)]="search" autocomplete="off" /></mat-form-field></div>
    <mat-dialog-content><label class="team-picker-row" *ngFor="let team of filteredTeams" [class.selected]="selected.includes('' + team.id)"><input type="checkbox" [checked]="selected.includes('' + team.id)" (change)="toggle('' + team.id)" /><span class="team-picker-avatar">{{team.name.slice(0, 2) | uppercase}}</span><span><strong>{{team.name}}</strong><small>{{team.membersCount || 0}} members</small></span></label><p *ngIf="!filteredTeams.length">No teams match your search.</p></mat-dialog-content>
    <mat-dialog-actions><span>{{selected.length}} teams selected</span><div><button mat-stroked-button (click)="ref.close()">Cancel</button><button mat-flat-button color="primary" (click)="ref.close(selected)">Apply selection</button></div></mat-dialog-actions>`,
  styles:[`
    :host{display:block;background:white;color:#24334a} h2{margin-bottom:0}.team-picker-hint{margin:0 24px 16px;color:#6c788b;font-size:14px}.team-picker-search{padding:0 24px 16px}.team-picker-search mat-form-field{width:100%}
    mat-dialog-content{display:grid;gap:10px;min-height:120px}.team-picker-row{display:flex;gap:14px;align-items:center;border:1px solid #dce3ec;border-radius:10px;padding:14px;cursor:pointer;box-shadow:var(--gp-card-shadow)}.team-picker-row.selected{border-color:#3978d1;background:#f0f6ff}.team-picker-row input{width:18px;height:18px;accent-color:#175fc2}.team-picker-row>span:last-child{display:flex;flex-direction:column;gap:4px}.team-picker-row strong{font-size:15px}.team-picker-row small{color:#6c788b}.team-picker-avatar{width:42px;height:42px;flex:none;border-radius:10px;display:grid;place-items:center;background:#e7efff;color:#175fc2;font-weight:700}
    mat-dialog-actions{display:flex;justify-content:space-between;gap:16px;padding:16px 24px;border-top:1px solid #e5eaf0;font-size:13px;color:#6c788b}mat-dialog-actions>div{display:flex;gap:10px}
  `], styleUrls:['./field-controls.css']
})
export class TeamSelectDialog {
  search = '';
  selected: string[];
  constructor(public ref: MatDialogRef<TeamSelectDialog>, @Inject(MAT_DIALOG_DATA) public data: {teams:any[]; selected:string[]}) { this.selected = [...data.selected]; }
  get filteredTeams(): any[] { return this.data.teams.filter(team => team.name.toLowerCase().includes(this.search.trim().toLowerCase())); }
  toggle(id:string): void { this.selected = this.selected.includes(id) ? this.selected.filter(value=>value!==id) : [...this.selected,id]; }
}
