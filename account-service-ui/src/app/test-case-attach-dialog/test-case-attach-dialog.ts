import { Component, Inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { Testcase } from '../testcases/testcases';

export interface TestCaseAttachDialogData {
  itemType: 'STORY' | 'TASK';
  itemTitle: string;
  availableTestCases: Testcase[];
  currentlyAttachedIds: number[];
}

@Component({
  selector: 'app-test-case-attach-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatChipsModule
  ],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon color="primary">playlist_add_check</mat-icon>
      Attach Test Cases
    </h2>

    <mat-dialog-content class="dialog-content">
      <p class="subtitle">
        Target {{ data.itemType }}: <strong>{{ data.itemTitle }}</strong>
      </p>

      <!-- Search Filter -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Search Test Cases</mat-label>
        <input 
          matInput 
          [ngModel]="searchTerm()" 
          (ngModelChange)="searchTerm.set($event)" 
          placeholder="Search by ID, code, or title..." 
        />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>

      <!-- Selection Controls -->
      <div class="selection-bar">
        <span>
          Selected: <strong>{{ selectedIds().size }}</strong> / {{ data.availableTestCases.length }}
        </span>
        <div class="selection-actions">
          <button mat-button color="primary" (click)="selectAll()">Select All</button>
          <button mat-button color="warn" (click)="deselectAll()">Clear All</button>
        </div>
      </div>

      <!-- Test Cases List -->
      <div class="list-container">
        <div 
          *ngFor="let tc of filteredTestCases()" 
          class="list-item" 
          [class.selected]="isSelected(tc.id!)"
          (click)="toggleSelection(tc.id!)"
        >
          <mat-checkbox 
            [checked]="isSelected(tc.id!)" 
            (change)="toggleSelection(tc.id!)"
            (click)="$event.stopPropagation()"
          >
          </mat-checkbox>

          <div class="tc-info">
            <span class="tc-code">{{ getCode(tc) }}</span>
            <span class="tc-title">{{ tc.title || tc.name }}</span>
          </div>

          <span 
            class="tc-badge" 
            [ngClass]="(tc.status || 'DRAFT').toLowerCase()"
          >
            {{ tc.status || 'DRAFT' }}
          </span>
        </div>

        <div *ngIf="filteredTestCases().length === 0" class="empty-state">
          <mat-icon>find_in_page</mat-icon>
          <p>No test cases found matching your search.</p>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" (click)="confirmSelection()">
        Attach Selected ({{ selectedIds().size }})
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .subtitle {
      margin: 0 0 16px 0;
      color: #5f6368;
      font-size: 13px;
    }
    .full-width {
      width: 100%;
    }
    .selection-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: #f1f3f4;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 12px;
    }
    .selection-actions button {
      font-size: 12px;
      min-width: auto;
      padding: 0 8px;
    }
    .list-container {
      max-height: 320px;
      overflow-y: auto;
      border: 1px solid #dadce0;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
    }
    .list-item {
      display: flex;
      align-items: center;
      padding: 10px 14px;
      border-bottom: 1px solid #f1f3f4;
      cursor: pointer;
      gap: 12px;
      transition: background 0.15s ease;
    }
    .list-item:hover {
      background: #f8f9fa;
    }
    .list-item.selected {
      background: #e8f0fe;
    }
    .tc-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }
    .tc-code {
      font-weight: 700;
      font-size: 11px;
      color: #1a73e8;
    }
    .tc-title {
      font-size: 13px;
      color: #202124;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tc-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
      text-transform: uppercase;
    }
    .tc-badge.pass, .tc-badge.passed { background: #e6f4ea; color: #1e8e3e; }
    .tc-badge.fail, .tc-badge.failed { background: #fce8e6; color: #d93025; }
    .tc-badge.blocked { background: #fef7e0; color: #b06000; }
    .tc-badge.draft { background: #f1f3f4; color: #5f6368; }
    .empty-state {
      padding: 32px;
      text-align: center;
      color: #5f6368;
    }
  `]
})
export class TestCaseAttachDialogComponent {
  searchTerm = signal<string>('');
  selectedIds = signal<Set<number>>(new Set());

  filteredTestCases = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    return this.data.availableTestCases.filter(tc => {
      const title = (tc.title || tc.name || '').toLowerCase();
      const code = this.getCode(tc).toLowerCase();
      return title.includes(q) || code.includes(q);
    });
  });

  constructor(
    public dialogRef: MatDialogRef<TestCaseAttachDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TestCaseAttachDialogData
  ) {
    this.selectedIds.set(new Set(data.currentlyAttachedIds || []));
  }

  getCode(tc: Testcase): string {
    return tc.testCaseCode || tc.code || (tc.id ? `TC-${tc.id}` : 'TC-N/A');
  }

  isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelection(id: number) {
    if (!id) return;
    const set = new Set(this.selectedIds());
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.selectedIds.set(set);
  }

  selectAll() {
    const all = new Set(
      this.filteredTestCases()
        .map(tc => tc.id)
        .filter((id): id is number => id !== undefined)
    );
    this.selectedIds.set(all);
  }

  deselectAll() {
    this.selectedIds.set(new Set());
  }

  confirmSelection() {
    const selectedList = this.data.availableTestCases.filter(
      tc => tc.id !== undefined && this.selectedIds().has(tc.id)
    );
    this.dialogRef.close(selectedList);
  }
}