import { ChangeDetectorRef, Component, Inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { catchError, forkJoin, of } from 'rxjs';
import { peopleRows, personDesignation, personRegions, personRoleLabels } from '../shared/people-directory';

export interface UserPayload {
  id: number;
  name: string;
  email: string;
  profilePictureUrl?: string | null;
  employeeIdPrefix?: string | null;
  employeeIdNumber?: string | number | null;
  designation?: string;
  roleId?: number;
  roleLabels?: string[];
  regions?: string[];
}

export interface UserSelectDialogData {
  users: UserPayload[];
  currentSelection: number[];
  title?: string;
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
    MatInputModule,
    MatIconModule, MatSelectModule
  ],
  templateUrl: './user-select-dialog.html',
  styleUrls: ['./user-select-dialog.css', '../shared/field-controls.css']
})
export class UserSelectDialog implements OnInit {
  localSelectedIds: number[] = [];
  searchQuery = '';
  users: UserPayload[] = [];
  loadingUsers = false;
  usersLoadError = '';
  selectedRoles: string[] = [];
  selectedRegions: string[] = [];
  visibleLimit = 50;

  private readonly baseUrl = environment.apiBaseUrlM;

  constructor(
    public dialogRef: MatDialogRef<UserSelectDialog>,
    @Inject(MAT_DIALOG_DATA) public data: UserSelectDialogData,
    private http: HttpClient,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
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

    const base = this.baseUrl.replace(/\/+$/, '');
    const headers = this.auth.getAuthHeaders();
    forkJoin({
      users: this.http.get<any>(`${base}/users`, {headers}),
      roles: this.http.get<any>(`${base}/roles`, {headers}).pipe(catchError(() => of([])))
    }).subscribe({
      next: ({users: response, roles: roleResponse}) => {
        const roles = peopleRows(roleResponse);
        const rawUsers = this.extractUsers(response);
        const normalized = rawUsers
          .map((user: any) => ({...this.normalizeUser(user), designation: personDesignation(user, roles),
            roleLabels: personRoleLabels(user, roles), regions: personRegions(user)}))
          .filter((user: UserPayload) =>
            Number.isFinite(user.id) && user.id > 0
          );

        // Prefer freshly fetched user details, while preserving selected users
        // supplied by the caller if the API response omits them.
        this.users = this.mergeUsers(normalized, this.data?.users ?? []);
        this.loadingUsers = false;
        this.usersLoadError = this.users.length
          ? ''
          : 'No users were returned by the users API.';
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to load users for team member selection:', error);
        this.users = this.mergeUsers([], this.data?.users ?? []);
        this.usersLoadError = this.users.length
          ? ''
          : 'Unable to load users. Check the users API response and permissions.';
        this.loadingUsers = false;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Accepts common API envelope shapes without assuming a single backend DTO:
   * [], {data: []}, {data: {users: []}}, {result: []}, {content: []}, etc.
   */
  private extractUsers(response: any): any[] {
    const queue: any[] = [response];
    const visited = new Set<any>();

    while (queue.length) {
      const value = queue.shift();
      if (!value || typeof value !== 'object' || visited.has(value)) continue;
      visited.add(value);

      if (Array.isArray(value)) {
        if (value.length === 0) return value;
        const first = value[0];
        if (first && typeof first === 'object' &&
            ('id' in first || 'user_id' in first || 'userId' in first ||
             'email' in first || 'username' in first)) {
          return value;
        }
        queue.push(...value);
        continue;
      }

      for (const key of [
        'data', 'users', 'content', 'results', 'result',
        'payload', 'items', 'records', 'employees'
      ]) {
        if (value[key] !== undefined && value[key] !== null) {
          if (Array.isArray(value[key])) {
            const candidate = value[key];
            if (!candidate.length ||
                (candidate[0] && typeof candidate[0] === 'object' &&
                 ('id' in candidate[0] || 'user_id' in candidate[0] ||
                  'userId' in candidate[0] || 'email' in candidate[0] ||
                  'username' in candidate[0]))) {
              return candidate;
            }
          }
          queue.push(value[key]);
        }
      }
    }

    return [];
  }

  private mergeUsers(primary: UserPayload[], fallback: UserPayload[]): UserPayload[] {
    const byId = new Map<number, UserPayload>();
    [...fallback, ...primary].forEach(user => {
      const id = Number(user?.id);
      if (Number.isFinite(id) && id > 0) {
        const previous = byId.get(id);
        const merged = { ...previous, ...user };
        if (!user.name || user.name === 'Name not provided' || user.name === 'Unknown User') {
          merged.name = previous?.name || user.name || 'Name not provided';
        }
        if (!user.email) merged.email = previous?.email || '';
        if (!user.profilePictureUrl) merged.profilePictureUrl = previous?.profilePictureUrl ?? null;
        if (!user.employeeIdPrefix) merged.employeeIdPrefix = previous?.employeeIdPrefix ?? null;
        if (user.employeeIdNumber == null) merged.employeeIdNumber = previous?.employeeIdNumber ?? null;
        byId.set(id, merged);
      }
    });
    return [...byId.values()].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );
  }

  private normalizeUser(user: any): UserPayload {
    const employeeCode = user?.employeeCode ?? user?.employee_code ??
      user?.employeeId ?? user?.employee_id ?? user?.empCode ?? user?.emp_code;
    const prefix = user?.employeeIdPrefix ?? user?.employee_id_prefix ??
      user?.employeeCodePrefix ?? user?.employee_code_prefix ??
      (employeeCode ? String(employeeCode).replace(/[0-9]+$/, '') : null);
    const number = user?.employeeIdNumber ?? user?.employee_id_number ??
      user?.employeeCodeNumber ?? user?.employee_code_number ??
      (employeeCode ? String(employeeCode).match(/[0-9]+$/)?.[0] : null);

    const email = String(
      user?.email ?? user?.emailAddress ?? user?.email_address ?? ''
    ).trim();

    const firstName = String(
      user?.firstName ?? user?.first_name ?? user?.givenName ?? user?.given_name ?? ''
    ).trim();
    const lastName = String(
      user?.lastName ?? user?.last_name ?? user?.surname ?? user?.familyName ?? user?.family_name ?? ''
    ).trim();

    const rawName = [
      user?.name,
      user?.fullName,
      user?.full_name,
      user?.displayName,
      user?.display_name,
      user?.preferredName,
      user?.preferred_name,
      [firstName, lastName].filter(Boolean).join(' '),
      user?.username,
      user?.userName,
      user?.user_name
    ].find((candidate: any) =>
      typeof candidate === 'string' &&
      candidate.trim() &&
      !this.looksLikeEmail(candidate.trim()) &&
      !this.isSyntheticUsername(candidate.trim())
    );

    const name = rawName
      ? String(rawName).trim()
      : this.friendlyNameFallback(user, email, employeeCode, number);

    return {
      id: Number(user?.id ?? user?.user_id ?? user?.userId ?? user?.user_account_id),
      name,
      email,
      profilePictureUrl: user?.profilePictureUrl ??
        user?.profile_picture_url ?? user?.avatarUrl ?? user?.avatar_url ??
        user?.photoUrl ?? user?.photo_url ?? user?.imageUrl ??
        user?.image_url ?? user?.profileImage ?? user?.profile_image ?? null,
      employeeIdPrefix: prefix != null ? String(prefix) : null,
      employeeIdNumber: number != null ? String(number) : null,
      designation: personDesignation(user),
      roleId: Number(user?.roleId ?? user?.role_id ?? user?.role?.id) || undefined,
      roleLabels: user?.roleLabels ?? personRoleLabels(user),
      regions: user?.regions ?? personRegions(user)
    };
  }

  private looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isSyntheticUsername(value: string): boolean {
    return /^(?:seed\d+[._-]?)?user\d+(?:@.*)?$/i.test(value) ||
      /^user\d+$/i.test(value);
  }

  /**
   * Do not render an email address or generated seed username as the person's
   * display name. If the API has no real name fields, use a readable fallback.
   */
  private friendlyNameFallback(user: any, email: string, employeeCode: any, number: any): string {
    const candidates = [
      user?.username,
      user?.userName,
      user?.user_name,
      email
    ].filter((value: any) => typeof value === 'string' && value.trim());

    for (const candidate of candidates) {
      const localPart = String(candidate).trim().split('@')[0];
      const seedUserMatch = localPart.match(/user\s*0*(\d+)/i);
      if (seedUserMatch) {
        return `User ${seedUserMatch[1].padStart(4, '0')}`;
      }

      // Convert a human-readable username such as "alex.johnson" to a name.
      if (!/^seed\d+/i.test(localPart)) {
        const cleaned = localPart
          .replace(/[._-]+/g, ' ')
          .replace(/\d+/g, ' ')
          .trim();
        if (cleaned && !this.looksLikeEmail(cleaned)) {
          return cleaned.replace(/\b\w/g, (letter: string) => letter.toUpperCase());
        }
      }
    }

    if (employeeCode || number) {
      return `User ${String(employeeCode ?? number)}`;
    }

    return 'Name not provided';
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

    return users.filter(user =>
      (!this.selectedRoles.length || user.roleLabels?.some(role => this.selectedRoles.includes(role))) &&
      (!this.selectedRegions.length || user.regions?.some(region => this.selectedRegions.includes(region))) &&
      (!query || (user?.name ?? '').toLowerCase().includes(query) ||
      (user?.email ?? '').toLowerCase().includes(query) ||
      (user.designation ?? '').toLowerCase().includes(query) ||
      this.getEmployeeCode(user).toLowerCase().includes(query))
    );
  }

  get roleOptions(): string[] { return [...new Set(this.users.flatMap(user => user.roleLabels ?? []))].sort(); }
  get regionOptions(): string[] { return [...new Set(this.users.flatMap(user => user.regions ?? []))].sort(); }
  get visibleUsers(): UserPayload[] { return this.getFilteredUsers().slice(0, this.visibleLimit); }
  get allVisibleSelected(): boolean { return this.visibleUsers.length > 0 && this.visibleUsers.every(user => this.localSelectedIds.includes(user.id)); }
  toggleVisible(): void {
    const ids = new Set(this.visibleUsers.map(user => user.id));
    this.localSelectedIds = this.allVisibleSelected ? this.localSelectedIds.filter(id => !ids.has(id))
      : [...new Set([...this.localSelectedIds, ...ids])];
  }
  resetFilters(): void { this.searchQuery = ''; this.selectedRoles = []; this.selectedRegions = []; this.visibleLimit = 50; }
  trackUser(_index: number, user: UserPayload): number { return user.id; }

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
      return `${prefix}/${number}`;
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

  onAvatarError(event: Event): void {
    const image = event.target as HTMLImageElement | null;
    if (image) image.style.display = 'none';
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
