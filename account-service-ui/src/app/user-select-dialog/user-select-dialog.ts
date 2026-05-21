import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-user-select-dialog',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatButtonModule, 
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule
  ],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title class="dialog-title">Select Team Members</h2>
      
      <!-- SEARCH UTILITY -->
      <div class="search-wrapper">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search users by name or role...</mat-label>
          <input 
            matInput 
            [(ngModel)]="searchQuery" 
            placeholder="Type to filter..."
            autocomplete="off"
          />
          <button 
            *ngIf="searchQuery" 
            matSuffix 
            mat-icon-button 
            aria-label="Clear" 
            (click)="searchQuery = ''" 
            class="clear-btn">
            &times;
          </button>
        </mat-form-field>
      </div>

      <!-- SCROLLABLE CONTENT BODY -->
      <mat-dialog-content class="dialog-content">
        <div *ngIf="getFilteredUsers().length === 0" class="empty-state">
          {{ data.users.length === 0 ? 'No users available in system' : 'No users match your search criteria' }}
        </div>
        
        <div class="users-list">
          <div 
            class="user-row" 
            *ngFor="let user of getFilteredUsers()"
            [class.selected]="localSelectedIds.includes(user.id)"
            (click)="toggleUserSelection(user.id)">
            
            <div class="user-left">
              <input
                type="checkbox"
                class="styled-checkbox"
                [checked]="localSelectedIds.includes(user.id)"
                (click)="$event.stopPropagation()"
                (change)="toggleUserSelection(user.id)"
              />
              <div class="avatar">
                {{ getInitials(user.name) }}
              </div>
              <div class="user-details">
                <span class="user-name">{{ user.name }}</span>
                <span class="user-role">{{ user.role_name || 'No Assigned Role' }}</span>
              </div>
            </div>
          </div>
        </div>
      </mat-dialog-content>

      <!-- DIALOG FOOTER ACTIONS -->
      <mat-dialog-actions align="end" class="dialog-actions">
        <span class="selection-counter">
          {{ localSelectedIds.length }} user(s) selected
        </span>
        <div class="action-buttons">
          <button mat-button (click)="onCancel()">Cancel</button>
          <button mat-raised-button color="primary" (click)="onSave()">Apply Selection</button>
        </div>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    /* Fixed Page Constraints */
    .dialog-container {
    
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    .dialog-title {
      margin: 0 !important;
      padding: 20px 24px 10px 24px !important;
      font-size: 20px;
      font-weight: 600;
      color: #1a1a1a;
    }

    /* Search Input Styling */
    .search-wrapper {
      padding: 0 24px 12px 24px;
    }

    .search-field {
      width: 100%;
    }

    ::ng-deep .search-field .mat-mdc-form-field-subscript-wrapper {
      display: none; /* Hide standard error space padding under input */
    }

    .clear-btn {
      background: transparent;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #999;
    }

    /* Fixed Height Scrollable Layout Body */
    .dialog-content {
      margin: 0 !important;
      padding: 0 24px !important;
      height: 100%;
      width: 100%;
      overflow-y: auto;
      border-top: 1px solid #f0f0f0;
      border-bottom: 1px solid #f0f0f0;
    }

    .users-list {
      display: flex;
      flex-direction: column;
    }

    /* Modern Row Layout */
    .user-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      margin: 6px 0;
      border: 1px solid #eef0f2;
      border-radius: 8px;
      cursor: pointer;
      background-color: #fff;
      transition: all 0.2s ease-in-out;
    }

    .user-row:hover {
      border-color: #1976d2;
      background-color: #f4f9ff;
    }

    .user-row.selected {
      border-color: #1976d2;
      background-color: #ebf3fc;
    }

    .user-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    /* Styled Custom Checkboxes */
    .styled-checkbox {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: #1976d2; /* Native styling wrapper color matches material button */
    }

    /* Avatar Initials Badge */
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: #e0e0e0;
      color: #4a4a4a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .user-row.selected .avatar {
      background-color: #1976d2;
      color: #ffffff;
    }

    /* Text Data Metadata */
    .user-details {
      display: flex;
      flex-direction: column;
    }

    .user-name {
      font-size: 14px;
      font-weight: 600;
      color: #2c3e50;
    }

    .user-role {
      font-size: 12px;
      color: #7f8c8d;
      margin-top: 1px;
    }

    .empty-state {
      padding: 40px 20px;
      text-align: center;
      color: #95a5a6;
      font-style: italic;
      font-size: 14px;
    }

    /* Action Toolbar Footer Styling */
    .dialog-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px !important;
      margin: 0 !important;
      background-color: #fafbfc;
    }

    .selection-counter {
      font-size: 13px;
      font-weight: 500;
      color: #555;
    }

    .action-buttons {
      display: flex;
      gap: 8px;
    }
  `]
})
export class UserSelectDialog implements OnInit {
  localSelectedIds: number[] = [];
  searchQuery: string = '';

  constructor(
    public dialogRef: MatDialogRef<UserSelectDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { users: any[], currentSelection: number[] }
  ) {}

  ngOnInit() {
    this.localSelectedIds = this.data?.currentSelection ? [...this.data.currentSelection] : [];
  }

  toggleUserSelection(userId: number) {
    if (this.localSelectedIds.includes(userId)) {
      this.localSelectedIds = this.localSelectedIds.filter(id => id !== userId);
    } else {
      this.localSelectedIds.push(userId);
    }
  }

  // Live filter computation engine
  getFilteredUsers(): any[] {
    if (!this.data?.users) return [];
    if (!this.searchQuery.trim()) return this.data.users;

    const query = this.searchQuery.toLowerCase().trim();
    return this.data.users.filter(user => 
      user.name?.toLowerCase().includes(query) || 
      (user.role_name || '').toLowerCase().includes(query)
    );
  }

  // Generates 2 characters max fallback avatar initials cleanly
  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    this.dialogRef.close(this.localSelectedIds);
  }
}