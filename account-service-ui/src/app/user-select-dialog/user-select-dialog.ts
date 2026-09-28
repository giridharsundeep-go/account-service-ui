import { Component, Inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface UserPayload {
  id: number;
  name: string;
  email: string;
  profilePictureUrl?: string | null;
  employeeIdPrefix?: string | null;
  employeeIdNumber?: string | number | null;
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
  templateUrl: './user-select-dialog.html',
  styleUrls: ['./user-select-dialog.css']
})
export class UserSelectDialog implements OnInit {
  localSelectedIds: number[] = [];
  searchQuery = '';
  users: UserPayload[] = [];
  loadingUsers = false;
  usersLoadError = '';

  private readonly baseUrl = environment.apiBaseUrlM;

  constructor(
    public dialogRef: MatDialogRef<UserSelectDialog>,
    @Inject(MAT_DIALOG_DATA) public data: UserSelectDialogData,
    private http: HttpClient,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.localSelectedIds = this.data?.currentSelection
      ? [...this.data.currentSelection]
      : [];

    /*
     * Always load the selectable users from /api/users.
     * This keeps the dialog independent from the parent component's
     * cached user list and guarantees employee code + profile data.
     */
    this.loadUsers();
  }

  private loadUsers(): void {
    this.loadingUsers = true;
    this.usersLoadError = '';

    this.http.get<any>(
      `${this.baseUrl}/users`,
      {
        headers: this.auth.getAuthHeaders()
      }
    ).subscribe({
      next: (response: any) => {
        const rawUsers =
          Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response)
              ? response
              : [];

        this.users = rawUsers
          .map((user: any) => this.normalizeUser(user))
          .filter((user: UserPayload) =>
            Number.isFinite(user.id) && user.id > 0
          );

        this.mergeMissingSelectedUsersFromParent();

        this.loadingUsers = false;
      },
      error: (error) => {
        console.error('Failed to load users for team member selection:', error);

        this.users = this.data?.users ?? [];
        this.mergeMissingSelectedUsersFromParent();

        this.usersLoadError =
          'Unable to load users. Please try again.';
        this.loadingUsers = false;
      }
    });
  }

  private normalizeUser(user: any): UserPayload {
    return {
      id: Number(user?.id ?? user?.user_id),
      name:
        user?.name ||
        user?.username ||
        user?.email ||
        'Unknown User',
      email:
        user?.email ||
        'No email available',
      profilePictureUrl:
        user?.profilePictureUrl ??
        user?.profile_picture_url ??
        null,
      employeeIdPrefix:
        user?.employeeIdPrefix ??
        user?.employee_id_prefix ??
        null,
      employeeIdNumber:
        user?.employeeIdNumber ??
        user?.employee_id_number ??
        null
    };
  }

  private mergeMissingSelectedUsersFromParent(): void {
    const selectedIds = new Set(
      this.localSelectedIds.map(id => Number(id))
    );

    const existingIds = new Set(
      this.users.map(user => Number(user.id))
    );

    const missing = (this.data?.users ?? [])
      .filter(user =>
        selectedIds.has(Number(user.id)) &&
        !existingIds.has(Number(user.id))
      );

    this.users = [...this.users, ...missing];
  }

  toggleUserSelection(userId: number): void {
    const id = Number(userId);

    if (this.localSelectedIds.includes(id)) {
      this.localSelectedIds = this.localSelectedIds.filter(
        selectedId => selectedId !== id
      );
      return;
    }

    this.localSelectedIds = [
      ...this.localSelectedIds,
      id
    ];
  }

  getFilteredUsers(): UserPayload[] {
    const users = this.users ?? [];
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter(user =>
      (user?.name ?? '').toLowerCase().includes(query) ||
      (user?.email ?? '').toLowerCase().includes(query) ||
      this.getEmployeeCode(user).toLowerCase().includes(query)
    );
  }

  getEmployeeCode(user: UserPayload): string {
    const prefix =
      user?.employeeIdPrefix ??
      '';

    const number =
      user?.employeeIdNumber ??
      '';

    if (!prefix && !number) {
      return 'No employee code';
    }

    if (prefix && number) {
      return `${prefix}//${number}`;
    }

    return String(prefix || number);
  }

  getUserEmployeeCode(user: UserPayload): string {
    return this.getEmployeeCode(user);
  }

  getInitials(name: string): string {
    const value = (name ?? '').trim();

    if (!value) {
      return '?';
    }

    const parts = value.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }

    return parts[0][0].toUpperCase();
  }

  hasAvatar(user: UserPayload): boolean {
    return !!user?.profilePictureUrl?.trim();
  }

  getAvatarDisplaySrc(user: UserPayload): string {
    const path = user?.profilePictureUrl ?? '';

    if (!path) {
      return '';
    }

    if (
      path.startsWith('data:') ||
      path.startsWith('http://') ||
      path.startsWith('https://')
    ) {
      return path;
    }

    const cleanPath = path.trim().replace(/^\/+/, '');
    const cleanBase = this.baseUrl.endsWith('/')
      ? this.baseUrl.slice(0, -1)
      : this.baseUrl;

    return `${cleanBase}/${cleanPath}`;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    this.dialogRef.close([...this.localSelectedIds]);
  }
}
