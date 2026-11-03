import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { WorkspaceSettingsService } from './workspace-settings.service';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-planning-work-table', standalone: true,
  imports: [CommonModule, MatTableModule, MatCheckboxModule],
  template: `<div class="planning-work-table-scroll"><table mat-table [dataSource]="items" class="planning-work-table">
    <ng-container matColumnDef="select"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let item"><mat-checkbox [checked]="selectedIds.has(item.id)" [disabled]="disabled" (click)="$event.stopPropagation()" (change)="selectionChange.emit({id:item.id, selected:$event.checked})" [attr.aria-label]="'Select ' + item.key"></mat-checkbox></td></ng-container>
    <ng-container matColumnDef="work"><th mat-header-cell *matHeaderCellDef>Work item</th><td mat-cell *matCellDef="let item"><div class="planning-work-copy"><span class="planning-work-key">{{item.key}}</span><button type="button" (click)="$event.stopPropagation(); itemOpened.emit(item)">{{item.title}}</button><small *ngIf="item.parentName">{{item.parentName}}</small></div></td></ng-container>
    <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th><td mat-cell *matCellDef="let item"><span class="planning-work-status" [attr.data-status]="status(item.status)" [style.color]="workflow.color(item.status)" [style.background]="workflow.color(item.status)+'18'">{{workflow.label(item.status)}}</span></td></ng-container>
    <ng-container matColumnDef="assignee"><th mat-header-cell *matHeaderCellDef>Assignee</th><td mat-cell *matCellDef="let item"><span class="planning-work-person"><i [attr.data-tone]="(item.assigneeId || 0) % 5">{{initials(item.assigneeName || item.assignee)}}</i>{{item.assigneeName || item.assignee || 'Unassigned'}}</span></td></ng-container>
    <ng-container matColumnDef="sprint"><th mat-header-cell *matHeaderCellDef>Sprint</th><td mat-cell *matCellDef="let item">{{item.sprintName || sprintLabel || 'Backlog'}}</td></ng-container>
    <ng-container matColumnDef="priority"><th mat-header-cell *matHeaderCellDef>Priority</th><td mat-cell *matCellDef="let item">{{label(item.priority || item.raw?.priority || 'MEDIUM')}}</td></ng-container>
    <ng-container matColumnDef="points"><th mat-header-cell *matHeaderCellDef>Points</th><td mat-cell *matCellDef="let item">{{item.points ?? '—'}}</td></ng-container>
    <tr mat-header-row *matHeaderRowDef="columns; sticky:true"></tr><tr mat-row *matRowDef="let item; columns:columns" [class.is-selected]="selectedIds.has(item.id)" [draggable]="selectable && !disabled" (dragstart)="dragStarted.emit({item,event:$event})" (dragend)="dragEnded.emit()" (click)="itemOpened.emit(item)"></tr>
    <tr *matNoDataRow><td [attr.colspan]="columns.length" class="planning-work-empty">No work items in this sprint.</td></tr>
  </table></div>`,
  styleUrls: ['./planning-work-table.css'],
})
export class PlanningWorkTableComponent {
  readonly workflow = inject(WorkspaceSettingsService);
  @Input() items: any[] = [];
  @Input() selectedIds = new Set<any>();
  @Input() selectable = false;
  @Input() disabled = false;
  @Input() compact = false;
  @Input() showAssignee = false;
  @Input() sprintLabel = '';
  @Output() itemOpened = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<{id:string; selected:boolean}>();
  @Output() dragStarted = new EventEmitter<{item:any; event:DragEvent}>();
  @Output() dragEnded = new EventEmitter<void>();
  get columns(): string[] { return [...(this.selectable ? ['select'] : []), 'work', 'status', ...(this.showAssignee ? ['assignee'] : []), ...(!this.compact ? ['sprint','priority','points'] : [])]; }
  status(value: string): string { return String(value || 'BACKLOG').toUpperCase().replace(/\s+/g, '_'); }
  label(value: string): string { return String(value || '').replace(/_/g,' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()); }
  initials(value: string): string { return String(value || 'Unassigned').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase(); }
}
