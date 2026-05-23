import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface UserPayload {
  id: number;
  name: string;
  role_name?: string | null;
}

export interface UserSelectDialogData {
  users: UserPayload[];
  currentSelection: number[];
}

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
          {{ data.users?.length === 0 ? 'No users available in system' : 'No users match your search criteria' }}
        </div>
        
        <div class="users-list">
          <div 
            class="user-row" 
            *ngFor="let user of getFilteredUsers()"
            [class.selected]="localSelectedIds.includes(user.id)"
            (click)="toggleUserSelection(user.id)">
            
            <div class="user-left">
              <!-- ✅ SYNCED STATE CHECKBOXES -->
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
          <button mat-stroked-button class="gp-button gp-cancel" style="width:150px" (click)="onCancel()">Cancel</button>
          <button mat-stroked-button class="gp-button gp-primary" style="background-color: #001c51;" (click)="onSave()">Apply Selection</button>
        </div>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .gp-button.gp-primary {
      background-color: #001c51;
      color: #ffffff !important;
      box-shadow: 0 4px 12px rgba(0, 28, 81, 0.15);
    }
    .gp-button.gp-primary:hover {
      background-color: #002b7a;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(0, 28, 81, 0.25);
    }
    .gp-button.gp-cancel {
      background-color: transparent;
      color: #555;
      border: 1px solid #ccc;
    }
    .gp-button.gp-cancel:hover {
      background-color: rgba(0,0,0,0.04);
    }
    .dialog-container {
      width: 85vw;
      max-width: 1000px;
      height: 80vh;
      max-height: 850px;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    .dialog-content {
      flex: 1;
      margin: 0 !important;
      padding: 0 24px !important;
      overflow-y: auto;
      border-top: 1px solid #f0f0f0;
      border-bottom: 1px solid #f0f0f0;
    }
    .dialog-title {
      margin: 0 !important;
      padding: 20px 24px 10px 24px !important;
      font-size: 20px;
      font-weight: 600;
      color: #1a1a1a;
    }
    .search-wrapper {
      padding: 0 24px 12px 24px;
    }
    .search-field {
      width: 100%;
    }
    ::ng-deep .search-field .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }
    .clear-btn {
      background: transparent;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #999;
    }
    .users-list {
      display: flex;
      flex-direction: column;
    }
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
    .styled-checkbox {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: #1976d2;
    }
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
    .gp-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 0 24px;
      height: 40px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      box-sizing: border-box;
      transition: all 0.2s;
    }
  `]
})
export class UserSelectDialog implements OnInit {
  localSelectedIds: number[] = [];
  searchQuery: string = '';

  constructor(
    public dialogRef: MatDialogRef<UserSelectDialog>,
    @Inject(MAT_DIALOG_DATA) public data: UserSelectDialogData
  ) { }

  ngOnInit() {
    // Clean, isolated deep-copy preserves the pristine root state values
    this.localSelectedIds = this.data?.currentSelection ? [...this.data.currentSelection] : [];
  }

  toggleUserSelection(userId: number) {
    if (this.localSelectedIds.includes(userId)) {
      this.localSelectedIds = this.localSelectedIds.filter(id => id !== userId);
    } else {
      this.localSelectedIds.push(userId);
    }
  }

  getFilteredUsers(): UserPayload[] {
    if (!this.data?.users) return [];
    if (!this.searchQuery.trim()) return this.data.users;

    const query = this.searchQuery.toLowerCase().trim();
    return this.data.users.filter(user =>
      user.name?.toLowerCase().includes(query) ||
      (user.role_name || '').toLowerCase().includes(query)
    );
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length > 1 && parts[1][0]) {
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