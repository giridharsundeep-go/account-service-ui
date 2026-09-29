import {
  Component,
  Inject,
  signal,
  computed
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule
} from '@angular/material/dialog';

import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';


/* ============================================================
   LOCAL TYPE
   ------------------------------------------------------------
   Do NOT import Testcases here.

   The main Testcases component and Testcase interface live in
   the same file. Keeping the attach-dialog type local prevents
   Angular/TypeScript from resolving Testcases incorrectly.
============================================================ */

export interface AttachTestCase {
  id?: number;

  testCaseCode?: string;
  code?: string;
  test_case_code?: string;

  title?: string;
  name?: string;

  description?: string;
  preconditions?: string;
  steps?: string;
  expectedResult?: string;
  actualResult?: string;

  status?: string;
  priority?: string;

  project?: any;
  projectId?: any;
  project_id?: any;

  epic?: any;
  epicId?: any;
  epic_id?: any;
  epicName?: any;
  epicTitle?: any;

  story?: any;
  userStory?: any;
  user_story?: any;

  storyId?: any;
  story_id?: any;
  userStoryId?: any;
  user_story_id?: any;

  storyName?: any;
  storyTitle?: any;

  task?: any;
  taskId?: any;
  task_id?: any;

  taskName?: any;
  taskTitle?: any;

  user?: any;
  userId?: any;
  user_id?: any;

  creator?: any;
}


/* ============================================================
   DIALOG DATA
============================================================ */

export interface TestCaseAttachDialogData {
  itemType: 'STORY' | 'TASK';

  itemTitle: string;

  availableTestCases: AttachTestCase[];

  currentlyAttachedIds: number[];
}


/* ============================================================
   COMPONENT
============================================================ */

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
    MatChipsModule
  ],

  template: `

    <!-- ========================================================
         HEADER
    ========================================================= -->

    <div class="dialog-header">

      <div class="dialog-title">

        <div class="title-icon">
          <span class="gp-dialog-icon">＋</span>
        </div>

        <div class="title-content">

          <h2>
            Attach Test Cases
          </h2>

          <div class="subtitle">
            Target
            <strong>{{ data.itemType }}</strong>
            :
            <strong>{{ data.itemTitle }}</strong>
          </div>

        </div>

      </div>

      <button
        type="button"
        mat-icon-button
        mat-dialog-close
        aria-label="Close"
        class="close-button">

        <span class="gp-dialog-icon">×</span>

      </button>

    </div>


    <!-- ========================================================
         CONTENT
    ========================================================= -->

    <mat-dialog-content class="dialog-content">

      <!-- Search -->

      <div class="search-wrapper">

        <span class="gp-dialog-icon" aria-hidden="true">⌕</span>

        <input
          type="text"
          class="search-input"
          [ngModel]="searchTerm()"
          (ngModelChange)="searchTerm.set($event)"
          placeholder="Search test cases by ID, code or title..."
        />

        <button
          *ngIf="searchTerm()"
          type="button"
          class="clear-search"
          (click)="searchTerm.set('')">

          <span class="gp-dialog-icon" aria-hidden="true">×</span>

        </button>

      </div>


      <!-- ======================================================
           SELECTION TOOLBAR
      ======================================================= -->

      <div class="selection-toolbar">

        <div class="selection-summary">

          <span class="selection-label">
            Selected
          </span>

          <span class="selection-count">
            {{ selectedIds().size }}
          </span>

          <span class="selection-total">
            /
            {{ data.availableTestCases.length }}
          </span>

        </div>


        <div class="selection-actions">

          <button
            type="button"
            mat-button
            class="toolbar-button"
            (click)="selectAll()">

            <span class="gp-dialog-icon" aria-hidden="true">✓</span>

            Select All

          </button>


          <button
            type="button"
            mat-button
            class="toolbar-button"
            (click)="deselectAll()">

            <span class="gp-dialog-icon" aria-hidden="true">↶</span>

            Clear All

          </button>

        </div>

      </div>


      <!-- ======================================================
           TEST CASE LIST
      ======================================================= -->

      <div class="list-container">

        <div
          *ngFor="let tc of filteredTestCases(); trackBy: trackByTestCase"
          class="list-item"
          [class.selected]="isSelectedId(tc.id)"
          (click)="toggleSelectionSafe(tc.id)">


          <!-- Checkbox -->

          <mat-checkbox
            [checked]="isSelectedId(tc.id)"
            [disabled]="tc.id === undefined"
            (change)="toggleSelectionSafe(tc.id)"
            (click)="$event.stopPropagation()">
          </mat-checkbox>


          <!-- Test Case Info -->

          <div class="tc-info">

            <div class="tc-top-row">

              <span class="tc-code">
                {{ getCode(tc) }}
              </span>

              <span
                *ngIf="tc.priority"
                class="priority-badge">

                {{ tc.priority }}

              </span>

            </div>


            <div class="tc-title">

              {{ getTitle(tc) }}

            </div>


            <div
              *ngIf="getDescription(tc)"
              class="tc-description">

              {{ getDescription(tc) }}

            </div>

          </div>


          <!-- Status -->

          <span
            class="tc-badge"
            [ngClass]="getStatusClass(tc)">

            {{ getStatus(tc) }}

          </span>


          <!-- Selected Indicator -->

          <span class="gp-dialog-icon" aria-hidden="true">✓</span>

        </div>


        <!-- Empty -->

        <div
          *ngIf="filteredTestCases().length === 0"
          class="empty-state">

          <div class="empty-icon">

            <span class="gp-dialog-icon" aria-hidden="true">⌕</span>

          </div>

          <div class="empty-title">
            No test cases found
          </div>

          <div class="empty-text">
            Try a different search term.
          </div>

        </div>

      </div>

    </mat-dialog-content>


    <!-- ========================================================
         FOOTER
    ========================================================= -->

    <mat-dialog-actions class="dialog-actions">

      <div class="footer-summary">

        <span>
          {{ selectedIds().size }}
        </span>

        test case{{ selectedIds().size === 1 ? '' : 's' }} selected

      </div>


      <div class="footer-buttons">

        <button
          type="button"
          mat-button
          mat-dialog-close
          class="cancel-button">

          Cancel

        </button>


        <button
          type="button"
          mat-flat-button
          color="primary"
          class="attach-button"
          [disabled]="selectedIds().size === 0"
          (click)="confirmSelection()">

          <span class="gp-dialog-icon" aria-hidden="true">↗</span>

          Attach Selected

          <span class="attach-count">
            {{ selectedIds().size }}
          </span>

        </button>

      </div>

    </mat-dialog-actions>

  `,

  styles: [`

    /* ==========================================================
       BASE
    ========================================================== */

    :host {
      display: block;
      width: 100%;
      font-family: Arial, Helvetica, sans-serif;
      color: #000000;
      font-size: 14px;
      box-sizing: border-box;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }


    /* ==========================================================
       HEADER
    ========================================================== */

    .dialog-header {
      min-height: 68px;
      padding: 14px 18px;

      display: flex;
      align-items: center;
      justify-content: space-between;

      border-bottom: 1px solid #eeeeee;

      background: #ffffff;
    }

    .dialog-title {
      display: flex;
      align-items: center;
      gap: 12px;

      min-width: 0;
    }

    .title-icon {
      width: 38px;
      height: 38px;

      display: flex;
      align-items: center;
      justify-content: center;

      border-radius: 10px;

      background: #e8f0fe;

      flex: 0 0 auto;
    }

    .title-icon mat-icon {
      color: #1a73e8;
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .title-content {
      min-width: 0;
    }

    .title-content h2 {
      margin: 0;

      font-size: 17px;
      line-height: 22px;

      font-weight: 600;

      color: #000000;
    }

    .subtitle {
      margin-top: 3px;

      font-size: 13px;
      line-height: 18px;

      color: #000000;

      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .subtitle strong {
      color: #000000;
      font-weight: 600;
    }

    .close-button {
      color: #000000 !important;
      flex: 0 0 auto;
    }


    /* ==========================================================
       CONTENT
    ========================================================== */

    .dialog-content {
      padding: 16px 18px 10px !important;

      max-height: 580px;
      overflow: auto;

      background: #ffffff;
    }


    /* ==========================================================
       SEARCH
    ========================================================== */

    .search-wrapper {
      width: 100%;
      height: 44px;

      display: flex;
      align-items: center;

      background: #f1f3f4;

      border-radius: 22px;

      padding: 0 12px;

      transition:
        background 0.15s ease,
        box-shadow 0.15s ease;
    }

    .search-wrapper:focus-within {
      background: #ffffff;

      box-shadow:
        0 1px 3px rgba(60, 64, 67, 0.18),
        0 4px 12px rgba(60, 64, 67, 0.10);
    }

    .search-icon {
      width: 20px;
      height: 20px;

      font-size: 20px;

      color: #000000;

      flex: 0 0 auto;

      margin-right: 8px;
    }

    .search-input {
      width: 100%;
      height: 100%;

      border: 0;
      outline: 0;

      background: transparent;

      color: #000000;

      font-size: 14px;

      font-family: inherit;
    }

    .search-input::placeholder {
      color: #000000;
      opacity: 0.65;
    }

    .clear-search {
      width: 30px;
      height: 30px;

      border: 0;
      background: transparent;

      display: flex;
      align-items: center;
      justify-content: center;

      cursor: pointer;

      border-radius: 50%;

      color: #000000;
    }

    .clear-search:hover {
      background: #e8eaed;
    }

    .clear-search mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }


    /* ==========================================================
       SELECTION TOOLBAR
    ========================================================== */

    .selection-toolbar {
      min-height: 44px;

      display: flex;
      align-items: center;
      justify-content: space-between;

      margin-top: 12px;
      margin-bottom: 10px;

      padding: 6px 10px;

      background: #f8f9fa;

      border-radius: 8px;
    }

    .selection-summary {
      display: flex;
      align-items: baseline;
      gap: 4px;

      color: #000000;
    }

    .selection-label {
      font-size: 13px;
      font-weight: 500;
    }

    .selection-count {
      font-size: 14px;
      font-weight: 700;
    }

    .selection-total {
      font-size: 13px;
    }

    .selection-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .toolbar-button {
      min-height: 32px !important;
      height: 32px !important;

      padding: 0 8px !important;

      color: #1a73e8 !important;

      font-size: 13px !important;
      font-weight: 500 !important;
    }

    .toolbar-button mat-icon {
      width: 17px;
      height: 17px;

      font-size: 17px;

      margin-right: 4px;
    }


    /* ==========================================================
       LIST
    ========================================================== */

    .list-container {
      width: 100%;

      max-height: 380px;

      overflow-y: auto;

      border-radius: 10px;

      background: #ffffff;
    }

    .list-item {
      min-height: 70px;

      display: flex;
      align-items: center;

      gap: 10px;

      padding: 10px 12px;

      cursor: pointer;

      border-bottom: 1px solid #eeeeee;

      transition:
        background 0.12s ease,
        transform 0.12s ease;
    }

    .list-item:first-child {
      border-top: 1px solid #eeeeee;
      border-radius: 10px 10px 0 0;
    }

    .list-item:last-child {
      border-radius: 0 0 10px 10px;
    }

    .list-item:hover {
      background: #f8f9fa;
    }

    .list-item.selected {
      background: #e8f0fe;
    }

    .list-item.selected:hover {
      background: #dce9fc;
    }


    /* ==========================================================
       TEST CASE INFO
    ========================================================== */

    .tc-info {
      min-width: 0;

      flex: 1;

      display: flex;
      flex-direction: column;

      gap: 3px;
    }

    .tc-top-row {
      display: flex;
      align-items: center;
      gap: 8px;

      min-width: 0;
    }

    .tc-code {
      color: #1a73e8;

      font-size: 12px;

      font-weight: 700;

      white-space: nowrap;
    }

    .tc-title {
      color: #000000;

      font-size: 14px;

      font-weight: 600;

      line-height: 19px;

      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tc-description {
      color: #000000;

      font-size: 12px;

      line-height: 16px;

      opacity: 0.75;

      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }


    /* ==========================================================
       PRIORITY
    ========================================================== */

    .priority-badge {
      display: inline-flex;
      align-items: center;

      padding: 2px 7px;

      border-radius: 10px;

      background: #fff3e0;

      color: #000000;

      font-size: 11px;

      font-weight: 600;

      white-space: nowrap;
    }


    /* ==========================================================
       STATUS
    ========================================================== */

    .tc-badge {
      flex: 0 0 auto;

      padding: 4px 9px;

      border-radius: 12px;

      font-size: 11px;

      font-weight: 700;

      text-transform: uppercase;

      color: #000000;

      background: #f1f3f4;
    }

    .tc-badge.pass,
    .tc-badge.passed,
    .tc-badge.success,
    .tc-badge.completed {
      background: #e6f4ea;
      color: #000000;
    }

    .tc-badge.fail,
    .tc-badge.failed,
    .tc-badge.error {
      background: #fce8e6;
      color: #000000;
    }

    .tc-badge.blocked {
      background: #fef7e0;
      color: #000000;
    }

    .tc-badge.in-progress,
    .tc-badge.in_progress,
    .tc-badge.running {
      background: #e8f0fe;
      color: #000000;
    }

    .tc-badge.draft {
      background: #f1f3f4;
      color: #000000;
    }


    /* ==========================================================
       SELECTED ICON
    ========================================================== */

    .selected-icon {
      width: 20px;
      height: 20px;

      font-size: 20px;

      color: #1a73e8;

      flex: 0 0 auto;
    }


    /* ==========================================================
       EMPTY STATE
    ========================================================== */

    .empty-state {
      min-height: 220px;

      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;

      text-align: center;

      color: #000000;

      border: 1px solid #eeeeee;

      border-radius: 10px;

      background: #ffffff;
    }

    .empty-icon {
      width: 48px;
      height: 48px;

      display: flex;
      align-items: center;
      justify-content: center;

      border-radius: 50%;

      background: #f1f3f4;

      margin-bottom: 10px;
    }

    .empty-icon mat-icon {
      color: #000000;

      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .empty-title {
      font-size: 14px;
      font-weight: 600;

      color: #000000;
    }

    .empty-text {
      margin-top: 4px;

      font-size: 13px;

      color: #000000;
    }


    /* ==========================================================
       FOOTER
    ========================================================== */

    .dialog-actions {
      min-height: 64px;

      display: flex !important;
      align-items: center;
      justify-content: space-between;

      padding: 10px 18px !important;

      border-top: 1px solid #eeeeee;

      background: #ffffff;
    }

    .footer-summary {
      color: #000000;

      font-size: 13px;
    }

    .footer-summary span {
      font-weight: 700;
    }

    .footer-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cancel-button {
      color: #000000 !important;

      font-size: 14px !important;
    }

    .attach-button {
      min-height: 38px !important;

      padding: 0 14px !important;

      border-radius: 20px !important;

      background: #1a73e8 !important;

      color: #ffffff !important;

      font-size: 14px !important;

      font-weight: 600 !important;
    }

    .attach-button:hover:not(:disabled) {
      background: #1765cc !important;
    }

    .attach-button:disabled {
      opacity: 0.45;
    }

    .attach-button mat-icon {
      width: 18px;
      height: 18px;

      font-size: 18px;

      margin-right: 5px;
    }

    .attach-count {
      min-width: 20px;
      height: 20px;

      display: inline-flex;
      align-items: center;
      justify-content: center;

      margin-left: 7px;

      padding: 0 5px;

      border-radius: 10px;

      background: rgba(255, 255, 255, 0.20);

      color: #ffffff;

      font-size: 11px;
    }


    /* ==========================================================
       SCROLLBAR
    ========================================================== */

    .list-container::-webkit-scrollbar,
    .dialog-content::-webkit-scrollbar {
      width: 7px;
    }

    .list-container::-webkit-scrollbar-track,
    .dialog-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .list-container::-webkit-scrollbar-thumb,
    .dialog-content::-webkit-scrollbar-thumb {
      background: #dadce0;
      border-radius: 10px;
    }

    .list-container::-webkit-scrollbar-thumb:hover,
    .dialog-content::-webkit-scrollbar-thumb:hover {
      background: #bdc1c6;
    }


    /* ==========================================================
       RESPONSIVE
    ========================================================== */

    @media (max-width: 600px) {

      .dialog-header {
        padding: 12px;
      }

      .dialog-content {
        padding: 12px !important;
      }

      .selection-toolbar {
        align-items: flex-start;
        flex-direction: column;
        gap: 6px;
      }

      .selection-actions {
        width: 100%;
      }

      .toolbar-button {
        flex: 1;
      }

      .dialog-actions {
        padding: 10px 12px !important;
      }

      .footer-summary {
        display: none;
      }

      .footer-buttons {
        width: 100%;
        justify-content: flex-end;
      }

    }


    :host { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; color: #111827; }
    .dialog-header, .dialog-content, .dialog-actions { background: #fff !important; }
    .dialog-header { border-bottom: 1px solid #eef1f4 !important; }
    .title-icon { width: 42px !important; height: 42px !important; border-radius: 14px !important; background: #eef8fd !important; border: 1px solid #d6eaf5 !important; color: #006fae !important; }
    .title-content h2 { font-weight: 700 !important; color: #111827 !important; }
    .subtitle { color: #667085 !important; }
    .search-wrapper { border: 1px solid #cfd5dc; background: #f8fafc; box-shadow: none !important; }
    .search-wrapper:focus-within { border-color: #0788CC; box-shadow: 0 0 0 3px rgba(7,136,204,.10) !important; }
    .selection-toolbar { border: 1px solid #eef1f4; background: #f8fafc; border-radius: 14px !important; }
    .list-container { border: 1px solid #dfe3e8; border-radius: 14px !important; }
    .list-item { border-bottom-color: #eef1f4 !important; }
    .list-item:hover { background: #f7fbfe !important; }
    .list-item.selected { background: #eaf5fb !important; }
    .tc-code { color: #006fae !important; }
    .tc-title { color: #111827 !important; }
    .tc-description { color: #667085 !important; }
    .priority-badge { border: 1px solid #fed7aa; background: #fff7ed; color: #c2410c; }
    .selected-icon { color: #0788CC !important; }
    .attach-button { background: rgb(0,124,193) !important; border-radius: 20px !important; }
    .attach-button:hover:not(:disabled) { background: #006fae !important; }
    .toolbar-button { color: #006fae !important; border-radius: 18px !important; }
    .cancel-button { border: 1px solid #000 !important; border-radius: 20px !important; background: #fff !important; }
    .cancel-button:hover { background: #eef8fd !important; border-color: #0788CC !important; color: #006fae !important; }
    .title-icon .gp-dialog-icon { color: #006fae; font-size: 20px !important; }
    .close-button .gp-dialog-icon { color: #667085; font-size: 22px !important; }
    .search-icon.gp-dialog-icon { color: #667085; }
    .gp-dialog-icon { width: 20px; height: 20px; display: inline-flex; align-items:center; justify-content:center; flex: 0 0 20px; font-family: Inter, system-ui, sans-serif !important; font-size: 18px !important; font-weight: 700; line-height: 1; color: currentColor; }

  `]
})
export class TestCaseAttachDialogComponent {

  /* ============================================================
     SEARCH
  ============================================================ */

  searchTerm = signal<string>('');


  /* ============================================================
     SELECTED IDS
  ============================================================ */

  selectedIds = signal<Set<number>>(new Set<number>());


  /* ============================================================
     FILTERED TEST CASES
  ============================================================ */

  filteredTestCases = computed(() => {

    const query = this.searchTerm()
      .toLowerCase()
      .trim();

    return this.data.availableTestCases.filter(tc => {

      if (!query) {
        return true;
      }

      const title = this.getTitle(tc)
        .toLowerCase();

      const code = this.getCode(tc)
        .toLowerCase();

      const description = this.getDescription(tc)
        .toLowerCase();

      const status = this.getStatus(tc)
        .toLowerCase();

      return (
        title.includes(query) ||
        code.includes(query) ||
        description.includes(query) ||
        status.includes(query)
      );

    });

  });


  /* ============================================================
     CONSTRUCTOR
  ============================================================ */

  constructor(
    public dialogRef: MatDialogRef<TestCaseAttachDialogComponent>,

    @Inject(MAT_DIALOG_DATA)
    public data: TestCaseAttachDialogData
  ) {

    const existingIds = new Set<number>(
      (data.currentlyAttachedIds || [])
        .filter(
          (id): id is number =>
            typeof id === 'number'
        )
    );

    this.selectedIds.set(existingIds);

  }


  /* ============================================================
     TRACK BY
  ============================================================ */

  trackByTestCase(
    index: number,
    tc: AttachTestCase
  ): number | string {

    return tc.id ?? `index-${index}`;

  }


  /* ============================================================
     TITLE
  ============================================================ */

  getTitle(
    tc: AttachTestCase
  ): string {

    return (
      tc.title ??
      tc.name ??
      'Untitled Test Case'
    );

  }


  /* ============================================================
     CODE
  ============================================================ */

  getCode(
    tc: AttachTestCase
  ): string {

    return (
      tc.testCaseCode ??
      tc.code ??
      tc.test_case_code ??
      (tc.id !== undefined
        ? `TC-${tc.id}`
        : 'TC-N/A')
    );

  }


  /* ============================================================
     DESCRIPTION
  ============================================================ */

  getDescription(
    tc: AttachTestCase
  ): string {

    return (
      tc.description ??
      ''
    );

  }


  /* ============================================================
     STATUS
  ============================================================ */

  getStatus(
    tc: AttachTestCase
  ): string {

    return (
      tc.status ??
      'DRAFT'
    );

  }


  /* ============================================================
     STATUS CSS CLASS
  ============================================================ */

  getStatusClass(
    tc: AttachTestCase
  ): string {

    return this.getStatus(tc)
      .toLowerCase()
      .replace(/\s+/g, '-');

  }


  /* ============================================================
     CHECK SELECTED
  ============================================================ */

  isSelectedId(
    id: number | undefined
  ): boolean {

    if (id === undefined) {
      return false;
    }

    return this.selectedIds().has(id);

  }


  /* ============================================================
     TOGGLE
  ============================================================ */

  toggleSelectionSafe(
    id: number | undefined
  ): void {

    if (id === undefined) {
      return;
    }

    const current = new Set(
      this.selectedIds()
    );

    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }

    this.selectedIds.set(current);

  }


  /* ============================================================
     SELECT ALL
  ============================================================ */

  selectAll(): void {

    const ids = this.filteredTestCases()
      .map(tc => tc.id)
      .filter(
        (id): id is number =>
          typeof id === 'number'
      );

    const current = new Set(
      this.selectedIds()
    );

    ids.forEach(id => {
      current.add(id);
    });

    this.selectedIds.set(current);

  }


  /* ============================================================
     DESELECT ALL
  ============================================================ */

  deselectAll(): void {

    this.selectedIds.set(
      new Set<number>()
    );

  }


  /* ============================================================
     CONFIRM
  ============================================================ */

  confirmSelection(): void {

    const selectedList =
      this.data.availableTestCases.filter(
        tc =>
          tc.id !== undefined &&
          this.selectedIds().has(tc.id)
      );

    this.dialogRef.close(
      selectedList
    );

  }

}