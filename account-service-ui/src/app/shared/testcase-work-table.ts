import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule } from '@angular/material/paginator';

@Component({
  selector:'app-testcase-work-table', standalone:true,
  imports:[CommonModule,MatTableModule,MatCheckboxModule,MatPaginatorModule],
  template:`<div class="work-items-table-scroll"><table mat-table [dataSource]="pageCases" class="work-items-table">
    <ng-container matColumnDef="select"><th mat-header-cell *matHeaderCellDef><mat-checkbox [checked]="allSelected" [indeterminate]="someSelected && !allSelected" (change)="togglePage($event.checked)" aria-label="Select visible test cases"></mat-checkbox></th><td mat-cell *matCellDef="let row"><mat-checkbox [checked]="selectedIds.has(row.id) || lockedIds.has(row.id)" [disabled]="lockedIds.has(row.id)" (click)="$event.stopPropagation()" (change)="selectionChange.emit({id:row.id,selected:$event.checked})" [attr.aria-label]="'Select ' + row.title"></mat-checkbox></td></ng-container>
    <ng-container matColumnDef="work"><th mat-header-cell *matHeaderCellDef>Work</th><td mat-cell *matCellDef="let row"><button class="case-work-title" type="button" (click)="$event.stopPropagation(); caseOpened.emit(row)"><strong>{{row.title || row.name}}</strong><small>{{row.testCaseCode || row.code || 'TC-' + row.id}}</small></button></td></ng-container>
    <ng-container matColumnDef="assignee"><th mat-header-cell *matHeaderCellDef>Assignee</th><td mat-cell *matCellDef="let row"><span class="case-person"><i [attr.data-tone]="(row.user?.id || row.assignee?.id || 0) % 5">{{initials(person(row.assignee || row.user))}}</i>{{person(row.assignee || row.user)}}</span></td></ng-container>
    <ng-container matColumnDef="reporter"><th mat-header-cell *matHeaderCellDef>Reporter</th><td mat-cell *matCellDef="let row"><span class="case-person"><i [attr.data-tone]="(row.reporter?.id || row.creator?.id || 0) % 5">{{initials(person(row.reporter || row.creator))}}</i>{{person(row.reporter || row.creator)}}</span></td></ng-container>
    <ng-container matColumnDef="priority"><th mat-header-cell *matHeaderCellDef>Priority</th><td mat-cell *matCellDef="let row">{{label(row.priority || 'MEDIUM')}}</td></ng-container>
    <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th><td mat-cell *matCellDef="let row"><span class="case-status" [attr.data-status]="row.status">{{label(row.status || 'DRAFT')}}</span></td></ng-container>
    <ng-container matColumnDef="tags"><th mat-header-cell *matHeaderCellDef>Tags</th><td mat-cell *matCellDef="let row"><button type="button" class="case-tags" (click)="$event.stopPropagation(); caseOpened.emit(row)"><span *ngFor="let tag of row.tags">{{tag}}</span><small *ngIf="!row.tags?.length">Add tags</small></button></td></ng-container>
    <ng-container matColumnDef="allocation"><th mat-header-cell *matHeaderCellDef>Linked item</th><td mat-cell *matCellDef="let row"><button type="button" class="case-link" (click)="$event.stopPropagation(); caseOpened.emit(row)">{{allocation(row)}}</button></td></ng-container>
    <ng-container matColumnDef="updated"><th mat-header-cell *matHeaderCellDef>Updated</th><td mat-cell *matCellDef="let row">{{(row.updatedAt || row.createdAt) ? ((row.updatedAt || row.createdAt) | date:'mediumDate') : '—'}}</td></ng-container>
    <tr mat-header-row *matHeaderRowDef="columns;sticky:true"></tr><tr mat-row *matRowDef="let row;columns:columns" [class.is-selected]="selectedIds.has(row.id)" (click)="caseOpened.emit(row)"></tr><tr *matNoDataRow><td [attr.colspan]="columns.length" class="case-empty">No test cases match these filters.</td></tr>
  </table></div><mat-paginator [length]="cases.length" [pageIndex]="pageIndex" [pageSize]="pageSize" [pageSizeOptions]="[10,25,50,100]" (page)="pageIndex=$event.pageIndex;pageSize=$event.pageSize" showFirstLastButtons aria-label="Test cases pagination"></mat-paginator>`,
  styleUrls:['../work-items/work-items.css','./testcase-work-table.css'],
})
export class TestcaseWorkTableComponent implements OnChanges {
  @Input() cases:any[]=[];
  @Input() selectedIds=new Set<number>();
  @Input() lockedIds=new Set<number>();
  @Output() selectionChange=new EventEmitter<{id:number;selected:boolean}>();
  @Output() caseOpened=new EventEmitter<any>();
  readonly columns=['select','work','assignee','reporter','priority','status','tags','allocation','updated'];
  pageIndex=0;pageSize=25;
  ngOnChanges():void { if(this.pageIndex*this.pageSize>=this.cases.length)this.pageIndex=0; }
  get pageCases():any[]{return this.cases.slice(this.pageIndex*this.pageSize,(this.pageIndex+1)*this.pageSize);}
  get selectable():any[]{return this.pageCases.filter(row=>!this.lockedIds.has(row.id));}
  get allSelected():boolean{return !!this.selectable.length&&this.selectable.every(row=>this.selectedIds.has(row.id));}
  get someSelected():boolean{return this.selectable.some(row=>this.selectedIds.has(row.id));}
  togglePage(selected:boolean):void{this.selectable.forEach(row=>this.selectionChange.emit({id:row.id,selected}));}
  label(value:string):string{return String(value).replace(/_/g,' ').toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase());}
  person(value:any):string{return typeof value==='string'?value:value?.name || [value?.firstName??value?.first_name,value?.lastName??value?.last_name].filter(Boolean).join(' ') || 'Unassigned';}
  initials(value:string):string{return value.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();}
  allocation(row:any):string{for(const type of ['epic','story','task','issue']){const item=row[type];if(item?.id)return item.epic_code||item.story_code||item.task_code||item.issueCode||item.issue_code||type.toUpperCase()+'-'+item.id;}return 'Allocate item';}
}
