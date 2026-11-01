import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, map, of, catchError, tap, shareReplay } from 'rxjs';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';

interface DirectoryUser {
  id: number;
  firstName?: string;
  lastName?: string;
  fullName: string;
  email: string;
  phone?: string;
  gender?: string;
  is_active: boolean;
  role_id: number | null;
  role_name: string;
  org_role?: string;
  manager_id: number | null;
  manager_name: string;
  employee_id_prefix: string;
  employee_id_number: string;
  profile_picture_url: string;
  locationCountry: string;
  locationState: string;
  locationCity: string;
  locationWorkModel: string;
  locationDeskCode: string;
  [key: string]: any;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WorkspaceHeroComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule
  ],
  templateUrl: './users.html',
  styleUrls: ['./users.css', '../shared/field-controls.css']
})
export class Users implements OnInit, OnChanges, OnDestroy {
  readonly baseUrl = environment.apiBaseUrlM.replace(/\/$/, '');

  private readonly usersSubject = new BehaviorSubject<DirectoryUser[]>([]);
  readonly users$ = this.usersSubject.asObservable();

  roles$: Observable<any[]> = of([]);

  /** Cached role options let the table resolve the same designation selected in the form. */
  private roleOptions: any[] = [];

  cachedUsersArray: DirectoryUser[] = [];
  filteredManagers: DirectoryUser[] = [];
  currentStatusTab: 'active' | 'inactive' = 'active';
  isActive = true;

  firstName = '';
  lastName = '';
  email = '';
  phone = '';
  gender = '';
  password = '';
  sendingRegistrationEmail = false;
  profilePictureUrl = '';
  localPreviewUrl = '';
  selectedFile: File | null = null;

  roleId: number | null = null;
  orgRole = '';
  managerId: number | null = null;
  managerSearchText: any = '';
  employeeIdPrefix = 'EMP';
  employeeIdNumber = '';
  locationCountry = 'IN';
  locationState = '';
  locationCity = '';
  locationWorkModel = 'HQ';
  locationDeskCode = '';

  editingUserId: number | null = null;
  selectedProfileUser: DirectoryUser | null = null;
  @Input() currentUserProfileId: number | null = null;
  @Input() profileOpenRequest = 0;
  private pendingProfileUserId: number | null = null;
  private handledProfileOpenRequest = 0;
  profileEditMode = false;
  profileCreating = false;
  profileTab: 'overview' | 'work' | 'reporting' | 'access' = 'overview';
  isDrawerOpen = false;
  searchTerm = '';
  loading = false;
  showSuccessToast = false;
  successMessage = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadRoles();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profileOpenRequest'] && this.profileOpenRequest > this.handledProfileOpenRequest) {
      this.handledProfileOpenRequest = this.profileOpenRequest;
      this.pendingProfileUserId = this.currentUserProfileId;
      this.openRequestedProfile();
    }
  }

  ngOnDestroy(): void {
    this.revokeLocalPreview();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.usersSubject.complete();
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get canSave(): boolean {
    return !!this.firstName.trim()
      && !!this.lastName.trim()
      && !!this.email.trim()
      && !!this.phone.trim()
      && !!this.gender
      && this.phone.trim().length <= 15;
  }

  private headers(): HttpHeaders {
    return this.auth.getAuthHeaders() as HttpHeaders;
  }

  private unwrapArray(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.content)) return response.content;
    return [];
  }

  loadUsers(): void {
    this.http.get<any>(`${this.baseUrl}/users`, {
      headers: this.headers()
    }).subscribe({
      next: response => {
        const users = this.unwrapArray(response).map(user => this.normalizeUser(user));
        this.cachedUsersArray = users;
        this.usersSubject.next(users);
        this.filterManagerAutocomplete();
        this.openRequestedProfile();
      },
      error: error => {
        this.cachedUsersArray = [];
        this.usersSubject.next([]);
        this.filterManagerAutocomplete();
        this.triggerToastAlert(
          this.errorMessage(error, 'Unable to load users.'),
          true
        );
      }
    });
  }

  private toBoolean(value: any, fallback = false): boolean {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return ['true', '1', 'yes', 'active'].includes(
      String(value).trim().toLowerCase()
    );
  }

  private normalizeUser(user: any): DirectoryUser {
    const role = user?.role
      ?? user?.applicationRole
      ?? user?.application_role
      ?? null;

    const manager = user?.manager
      ?? user?.reportingManager
      ?? user?.reporting_manager
      ?? null;

    const firstName = user?.firstName
      ?? user?.first_name
      ?? manager?.firstName
      ?? manager?.['first_name']
      ?? '';

    const lastName = user?.lastName
      ?? user?.last_name
      ?? manager?.lastName
      ?? manager?.['last_name']
      ?? '';

    const fullName = user?.fullName
      ?? user?.name
      ?? (`${firstName} ${lastName}`.trim() || user?.email || 'Unknown user');

    const rawRoleId = user?.roleId
      ?? user?.role_id
      ?? user?.applicationRoleId
      ?? user?.application_role_id
      ?? role?.id
      ?? role?.roleId
      ?? null;

    const rawManagerId = user?.managerId
      ?? user?.manager_id
      ?? user?.reportingManagerId
      ?? user?.reporting_manager_id
      ?? manager?.id
      ?? manager?.userId
      ?? manager?.user_id
      ?? null;

    const managerFirst = manager?.firstName
      ?? manager?.['first_name']
      ?? '';

    const managerLast = manager?.lastName
      ?? manager?.['last_name']
      ?? '';

    const managerName = user?.managerName
      ?? user?.manager_name
      ?? user?.reportingManagerName
      ?? user?.reporting_manager_name
      ?? manager?.fullName
      ?? manager?.name
      ?? `${managerFirst} ${managerLast}`.trim();

    const roleName = user?.roleName
      ?? user?.role_name
      ?? user?.applicationRoleName
      ?? user?.application_role_name
      ?? role?.name
      ?? role?.roleName
      ?? '';

    const numericId = (value: any): number | null =>
      value === null
      || value === undefined
      || value === ''
      || !Number.isFinite(Number(value))
        ? null
        : Number(value);

    return {
      ...user,
      id: numericId(
        user?.id
        ?? user?.userId
        ?? user?.user_id
        ?? user?.userAccountId
        ?? user?.user_account_id
      ) ?? 0,
      firstName: user?.firstName ?? user?.first_name ?? '',
      lastName: user?.lastName ?? user?.last_name ?? '',
      fullName,
      is_active: this.toBoolean(user?.isActive ?? user?.is_active, true),
      role_id: numericId(rawRoleId),
      role_name: roleName,
      org_role: user?.orgRole
        ?? user?.org_role
        ?? user?.organizationRole
        ?? user?.organization_role
        ?? user?.jobTitle
        ?? user?.job_title
        ?? '',
      manager_id: numericId(rawManagerId),
      manager_name: managerName || '',
      employee_id_prefix: user?.employeeIdPrefix
        ?? user?.employee_id_prefix
        ?? '',
      employee_id_number: user?.employeeIdNumber
        ?? user?.employee_id_number
        ?? '',
      profile_picture_url: user?.profilePictureUrl
        ?? user?.profile_picture_url
        ?? '',
      locationCountry: user?.locationCountry
        ?? user?.location_country
        ?? '',
      locationState: user?.locationState
        ?? user?.location_state
        ?? '',
      locationCity: user?.locationCity
        ?? user?.location_city
        ?? '',
      locationWorkModel: user?.locationWorkModel
        ?? user?.location_work_model
        ?? '',
      locationDeskCode: user?.locationDeskCode
        ?? user?.location_desk_code
        ?? ''
    } as DirectoryUser;
  }

  loadRoles(): void {
    this.roles$ = this.http.get<any>(`${this.baseUrl}/roles`, {
      headers: this.headers()
    }).pipe(
      map(response => this.unwrapArray(response)),
      tap(roles => {
        this.roleOptions = roles;
      }),
      catchError(() => {
        this.roleOptions = [];
        this.triggerToastAlert('Unable to load application roles.', true);
        return of([]);
      }), shareReplay(1)
    );
    this.roles$.subscribe();
  }

  openCreateForm(): void {
    this.resetForm(); this.editingUserId=null; this.profileCreating=true;
    this.selectedProfileUser=this.normalizeUser({id:0,fullName:'New user',firstName:'',lastName:'',email:'',is_active:true});
    this.profileEditMode=true; this.isDrawerOpen=false; this.filterManagerAutocomplete();
    document.querySelector('.content')?.scrollTo({top:0});
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.triggerToastAlert('Please select an image file.', true);
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.triggerToastAlert('Image must be 5 MB or smaller.', true);
      input.value = '';
      return;
    }

    this.revokeLocalPreview();
    this.selectedFile = file;
    this.localPreviewUrl = URL.createObjectURL(file);
  }

  clearProfilePicture(): void {
    this.revokeLocalPreview();
    this.profilePictureUrl = '';
    this.selectedFile = null;
  }

  private revokeLocalPreview(): void {
    if (this.localPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.localPreviewUrl);
    }
    this.localPreviewUrl = '';
  }

  private buildUserPayload(avatarUrl?: string | null): Record<string, any> {
    const normalizedRoleId =
      this.roleId === null
      || this.roleId === undefined
      || (this.roleId as any) === ''
        ? null
        : Number(this.roleId);

    const normalizedManagerId =
      this.managerId === null || this.managerId === undefined
        ? null
        : Number(this.managerId);

    return {
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      email: this.email.trim().toLowerCase(),
      phone: this.phone.trim(),
      gender: this.gender,
      profilePictureUrl: avatarUrl !== undefined
        ? avatarUrl
        : (this.profilePictureUrl && this.profilePictureUrl !== 'null'
          ? this.profilePictureUrl
          : null),
      employeeIdPrefix: this.employeeIdPrefix || 'EMP',
      employeeIdNumber: this.employeeIdNumber.trim() || null,
      locationCountry: this.locationCountry || null,
      locationState: this.locationState.trim() || null,
      locationCity: this.locationCity.trim() || null,
      locationWorkModel: this.locationWorkModel || 'HQ',
      locationDeskCode: this.locationWorkModel === 'REMOTE'
        ? null
        : (this.locationDeskCode.trim() || null),
      isActive: Boolean(this.isActive),
      orgRole: this.orgRole.trim() || null,
      role: Number.isFinite(normalizedRoleId as number) && normalizedRoleId !== null
        ? { id: normalizedRoleId }
        : null,
      manager: Number.isFinite(normalizedManagerId as number) && normalizedManagerId !== null
        ? { id: normalizedManagerId }
        : null,
      roleId: Number.isFinite(normalizedRoleId as number)
        ? normalizedRoleId
        : null,
      managerId: Number.isFinite(normalizedManagerId as number)
        ? normalizedManagerId
        : null
    };
  }

  private validateForm(showMessage = true): boolean {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
    const validPhone = !!this.phone.trim() && this.phone.trim().length <= 15;

    const valid = !!this.firstName.trim()
      && !!this.lastName.trim()
      && validEmail
      && validPhone
      && !!this.gender;

    if (!valid && showMessage) {
      const message =
        !this.firstName.trim() || !this.lastName.trim()
          ? 'Enter both first name and last name.'
          : !validEmail
            ? 'Enter a valid email address.'
            : !validPhone
              ? 'Enter a phone number with at most 15 characters.'
              : 'Select a gender.';

      this.triggerToastAlert(message, true);
    }

    return valid;
  }

  sendRegistrationEmail(): void {
    if (!this.validateForm()) return;
    if (this.sendingRegistrationEmail || this.loading) return;

    this.sendingRegistrationEmail = true;
    const payload = this.buildUserPayload();

    this.http.post<any>(
      `${this.baseUrl}/users/send-registration-email`,
      payload,
      { headers: this.headers() }
    ).subscribe({
      next: () => {
        this.sendingRegistrationEmail = false;
        this.triggerToastAlert(
          `Registration invitation sent to ${payload['email']}.`
        );
      },
      error: error => {
        this.sendingRegistrationEmail = false;
        this.triggerToastAlert(
          this.errorMessage(
            error,
            'Unable to send registration invitation. Verify the backend invitation endpoint and request DTO.'
          ),
          true
        );
      }
    });
  }

  saveUser(): void {
    if (this.loading || !this.validateForm()) return;

    const isCreate = this.editingUserId === null;
    this.loading = true;

    const submit = (avatarUrl?: string | null): void => {
      const payload = this.buildUserPayload(avatarUrl);

      const request = isCreate
        ? this.http.post<any>(`${this.baseUrl}/users`, payload, {
            headers: this.headers()
          })
        : this.http.put<any>(
            `${this.baseUrl}/users/${this.editingUserId}`,
            payload,
            { headers: this.headers() }
          );

      request.subscribe({
        next: (response: any) => {
          this.loading = false;
          if (this.profileEditMode && this.selectedProfileUser) {
            const updatedProfile = this.normalizeUser({
              ...this.selectedProfileUser,
              ...(response && !response.data ? response : {}),
              ...(response?.data && typeof response.data === 'object' ? response.data : {}),
              firstName: this.firstName.trim(),
              lastName: this.lastName.trim(),
              fullName: `${this.firstName.trim()} ${this.lastName.trim()}`.trim(),
              email: this.email.trim().toLowerCase(),
              phone: this.phone.trim(),
              gender: this.gender,
              roleId: this.roleId,
              role_id: this.roleId,
              orgRole: this.orgRole,
              org_role: this.orgRole,
              managerId: this.managerId,
              manager_id: this.managerId,
              manager_name: this.cachedUsersArray.find(u => Number(u.id) === Number(this.managerId))?.fullName ?? '',
              employeeIdPrefix: this.employeeIdPrefix,
              employee_id_prefix: this.employeeIdPrefix,
              employeeIdNumber: this.employeeIdNumber,
              employee_id_number: this.employeeIdNumber,
              profilePictureUrl: avatarUrl ?? this.profilePictureUrl,
              profile_picture_url: avatarUrl ?? this.profilePictureUrl,
              isActive: this.isActive,
              is_active: this.isActive,
              locationCountry: this.locationCountry,
              locationState: this.locationState,
              locationCity: this.locationCity,
              locationWorkModel: this.locationWorkModel,
              locationDeskCode: this.locationDeskCode
            });
            this.selectedProfileUser = updatedProfile;
            this.profileCreating=false;
            this.profileEditMode = false;
            this.editingUserId = null;
            this.resetForm();
          } else {
            this.closeDrawerAndCancel();
          }
          this.triggerToastAlert(
            isCreate ? 'User created successfully.' : 'User updated successfully.'
          );
          this.loadUsers();
        },
        error: error => {
          this.loading = false;
          this.triggerToastAlert(
            this.errorMessage(
              error,
              isCreate
                ? 'Unable to create user. Check the POST /users endpoint and required fields.'
                : 'Unable to update user.'
            ),
            true
          );
        }
      });
    };

    if (this.selectedFile) {
      const formData = new FormData();
      formData.append('file', this.selectedFile);

      this.http.post<any>(
        `${this.baseUrl}/user/upload-avatar`,
        formData,
        { headers: this.headers() }
      ).subscribe({
        next: response => {
          const path = response?.data?.profilePictureUrl
            ?? response?.data?.profile_picture_url
            ?? response?.profilePictureUrl
            ?? response?.profile_picture_url
            ?? response?.data?.path
            ?? response?.path
            ?? null;

          submit(path ? this.sanitizeImagePath(String(path)) : null);
        },
        error: () => {
          this.loading = false;
          this.triggerToastAlert(
            'Avatar upload failed. The user was not submitted; please retry or remove the photo.',
            true
          );
        }
      });
    } else {
      submit(this.profilePictureUrl || null);
    }
  }



  inlineEditField: string | null = null;
  inlineEditValue = '';

  startInlineEdit(user: DirectoryUser, field: string): void {
    this.inlineEditField = field;
    const values: Record<string, any> = {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      gender: user.gender ?? '',
      org_role: user.org_role ?? '',
      employee_id_prefix: user.employee_id_prefix || 'EMP',
      employee_id_number: user.employee_id_number ?? '',
      is_active: String(Boolean(user.is_active)),
      locationCountry: user.locationCountry ?? 'IN',
      locationState: user.locationState ?? '',
      locationCity: user.locationCity ?? '',
      locationWorkModel: user.locationWorkModel ?? 'HQ',
      locationDeskCode: user.locationDeskCode ?? '',
      role_id: user.role_id === null || user.role_id === undefined ? '' : String(user.role_id),
      manager_id: user.manager_id === null || user.manager_id === undefined ? '' : String(user.manager_id)
    };
    this.inlineEditValue = String(values[field] ?? '');
  }

  cancelInlineEdit(): void {
    this.inlineEditField = null;
    this.inlineEditValue = '';
  }

  saveInlineField(user: DirectoryUser, field: string): void {
    if (this.loading || !this.inlineEditField) return;

    const value = this.inlineEditValue.trim();
    if (['firstName', 'lastName', 'email', 'phone'].includes(field) && !value) {
      this.triggerToastAlert('This field cannot be empty.', true);
      return;
    }
    if (field === 'email' && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
      this.triggerToastAlert('Enter a valid email address.', true);
      return;
    }
    if (field === 'phone' && value.length > 15) {
      this.triggerToastAlert('Phone number must be 15 characters or fewer.', true);
      return;
    }

    // Reuse the existing payload builder so API shape and untouched values remain consistent.
    this.editUser(user);
    this.isDrawerOpen = false;
    const fieldMap: Record<string, () => void> = {
      firstName: () => this.firstName = value,
      lastName: () => this.lastName = value,
      email: () => this.email = value,
      phone: () => this.phone = value,
      gender: () => this.gender = value,
      org_role: () => this.orgRole = value,
      employee_id_prefix: () => this.employeeIdPrefix = value,
      employee_id_number: () => this.employeeIdNumber = value,
      is_active: () => this.isActive = value === 'true',
      locationCountry: () => this.locationCountry = value,
      locationState: () => this.locationState = value,
      locationCity: () => this.locationCity = value,
      locationWorkModel: () => this.locationWorkModel = value,
      locationDeskCode: () => this.locationDeskCode = value,
      role_id: () => this.roleId = value ? Number(value) : null,
      manager_id: () => this.managerId = value ? Number(value) : null
    };
    fieldMap[field]?.();

    const payload = this.buildUserPayload();
    this.loading = true;
    this.http.put<any>(`${this.baseUrl}/users/${user.id}`, payload, {
      headers: this.headers()
    }).subscribe({
      next: response => {
        this.loading = false;
        const updatedRaw = response?.data ?? response?.user ?? response;
        const updated = this.normalizeUser({
          ...user,
          ...(updatedRaw && typeof updatedRaw === 'object' ? updatedRaw : {}),
          firstName: this.firstName,
          lastName: this.lastName,
          email: this.email,
          phone: this.phone,
          gender: this.gender,
          role_id: this.roleId,
          role_name: this.roleOptions.find(r => Number(r.id ?? r.roleId ?? r.role_id) === Number(this.roleId))?.roleName
            ?? this.roleOptions.find(r => Number(r.id ?? r.roleId ?? r.role_id) === Number(this.roleId))?.role_name
            ?? user.role_name,
          org_role: this.orgRole,
          manager_id: this.managerId,
          manager_name: this.cachedUsersArray.find(u => Number(u.id) === Number(this.managerId))?.fullName ?? user.manager_name,
          employee_id_prefix: this.employeeIdPrefix,
          employee_id_number: this.employeeIdNumber,
          profile_picture_url: this.profilePictureUrl,
          is_active: this.isActive,
          locationCountry: this.locationCountry,
          locationState: this.locationState,
          locationCity: this.locationCity,
          locationWorkModel: this.locationWorkModel,
          locationDeskCode: this.locationDeskCode
        });
        this.cachedUsersArray = this.cachedUsersArray.map(u => Number(u.id) === Number(user.id) ? updated : u);
        this.usersSubject.next(this.cachedUsersArray);
        this.selectedProfileUser = updated;
        this.cancelInlineEdit();
        this.triggerToastAlert('Field updated successfully.');
      },
      error: error => {
        this.loading = false;
        this.triggerToastAlert(this.errorMessage(error, 'Unable to update this field.'), true);
      }
    });
  }

  viewUser(user: DirectoryUser): void {
    if (!user) return;
    this.profileEditMode = false;
    this.selectedProfileUser = user;
    this.profileTab = 'overview';
    this.isDrawerOpen = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private openRequestedProfile(): void {
    const requestedId = this.pendingProfileUserId;
    if (requestedId === null || requestedId === undefined) return;

    const user = this.cachedUsersArray.find(candidate => Number(candidate.id) === Number(requestedId));
    if (user) {
      this.pendingProfileUserId = null;
      this.viewUser(user);
      return;
    }

    if (this.cachedUsersArray.length) {
      this.pendingProfileUserId = null;
      this.triggerToastAlert('Your account profile was not found in the user directory.', true);
    }
  }

  closeUserProfile(): void {
    this.profileCreating=false;
    this.profileEditMode = false;
    this.selectedProfileUser = null;
    this.profileTab = 'overview';
    this.editingUserId = null;
    this.resetForm();
  }

  editProfileUser(user: DirectoryUser): void {
    // Edit directly inside the profile's existing two-column layout.
    this.selectedProfileUser = user;
    this.editUser(user);
    this.isDrawerOpen = false;
    this.profileEditMode = true;
    this.filterManagerAutocomplete();
  }

  cancelProfileEdit(): void {
    if(this.profileCreating){ this.closeUserProfile(); return; }
    this.profileEditMode = false;
    this.editingUserId = null;
    this.resetForm();
    if (this.selectedProfileUser) {
      const current = this.cachedUsersArray.find(user => Number(user.id) === Number(this.selectedProfileUser?.id));
      if (current) this.selectedProfileUser = current;
    }
  }

  editUser(user: DirectoryUser): void {
    this.resetForm();
    this.firstName = user.firstName ?? '';
    this.lastName = user.lastName ?? '';
    this.email = user.email ?? '';
    this.phone = user.phone ?? '';
    this.gender = user.gender ?? '';
    this.profilePictureUrl = user.profile_picture_url ?? '';
    this.localPreviewUrl = this.profilePictureUrl
      ? this.getAvatarDisplaySrc(this.profilePictureUrl)
      : '';

    this.roleId = user.role_id === null || user.role_id === undefined
      ? null
      : Number(user.role_id);

    this.orgRole = user.org_role
      ?? user['orgRole']
      ?? user['organizationRole']
      ?? user['jobTitle']
      ?? '';

    this.editingUserId = user.id;
    this.employeeIdPrefix = user.employee_id_prefix || 'EMP';
    this.employeeIdNumber = user.employee_id_number || '';
    this.locationCountry = user.locationCountry || '';
    this.locationState = user.locationState || '';
    this.locationCity = user.locationCity || '';
    this.locationWorkModel = user.locationWorkModel || 'HQ';
    this.locationDeskCode = user.locationDeskCode || '';
    this.isActive = user.is_active;

    this.managerId = user.manager_id === null || user.manager_id === undefined
      ? null
      : Number(user.manager_id);

    const managerRecord = this.cachedUsersArray.find(
      candidate => Number(candidate.id) === Number(this.managerId)
    );

    this.managerSearchText = user.manager_name || managerRecord?.fullName || '';
    this.isDrawerOpen = true;
    this.filterManagerAutocomplete();
  }

  /**
   * Resolve the designation from the same application-role option selected by roleId.
   * Prefer the role lookup by ID so the table stays consistent even when /users returns
   * only role_id and does not include role_name.
   */
  getDesignation(user: DirectoryUser): string {
    const userRoleId = user?.role_id;

    if (userRoleId !== null && userRoleId !== undefined) {
      const assignedRole = this.roleOptions.find(role => {
        const optionId = role?.id ?? role?.roleId ?? role?.role_id;
        return optionId !== null
          && optionId !== undefined
          && Number(optionId) === Number(userRoleId);
      });

      const assignedName = assignedRole?.roleName
        ?? assignedRole?.role_name
        ?? assignedRole?.name
        ?? assignedRole?.title;

      if (assignedName) return String(assignedName);
    }

    return user?.role_name?.trim() || 'Not assigned';
  }

  getDirectReports(user: DirectoryUser): DirectoryUser[] {
    return this.cachedUsersArray.filter(candidate => Number(candidate.manager_id) === Number(user.id));
  }

  getManagerName(user: DirectoryUser): string {
    if (user?.manager_name?.trim()) return user.manager_name.trim();

    const managerId = user?.manager_id;
    if (managerId === null || managerId === undefined) return 'Not assigned';

    const manager = this.cachedUsersArray.find(
      candidate => Number(candidate.id) === Number(managerId)
    );

    if (manager?.fullName?.trim()) return manager.fullName.trim();

    const first = manager?.firstName ?? manager?.['first_name'] ?? '';
    const last = manager?.lastName ?? manager?.['last_name'] ?? '';

    return `${first} ${last}`.trim() || 'Not assigned';
  }

  deactivateUser(user: DirectoryUser): void {
    if (!user?.id || !user.is_active || !confirm(`Deactivate ${user.fullName}?`)) {
      return;
    }

    this.http.patch(
      `${this.baseUrl}/users/${user.id}/deactivate`,
      {},
      { headers: this.headers() }
    ).subscribe({
      next: () => {
        this.triggerToastAlert('User deactivated successfully.');
        this.loadUsers();
      },
      error: error => this.triggerToastAlert(
        this.errorMessage(error, 'Unable to deactivate user.'),
        true
      )
    });
  }

  filterManagerAutocomplete(): void {
    const query = typeof this.managerSearchText === 'string'
      ? this.managerSearchText.toLowerCase().trim()
      : '';

    let pool = this.cachedUsersArray.filter(
      user => user.is_active && user.id !== this.editingUserId
    );

    if (query) {
      pool = pool.filter(user =>
        user.fullName.toLowerCase().includes(query)
        || user.email.toLowerCase().includes(query)
        || user.employee_id_number.toLowerCase().includes(query)
        || user.role_name.toLowerCase().includes(query)
        || (user.org_role || '').toLowerCase().includes(query)
      );
    }

    this.filteredManagers = pool;
  }

  onManagerSearchInput(): void {
    const typed = typeof this.managerSearchText === 'string'
      ? this.managerSearchText.trim()
      : '';

    const selectedManager = this.cachedUsersArray.find(
      user => user.id === this.managerId
    );

    if (!selectedManager || typed !== selectedManager.fullName) {
      this.managerId = null;
    }

    this.filterManagerAutocomplete();
  }

  onManagerSelected(event: MatAutocompleteSelectedEvent): void {
    const selected = event.option.value as DirectoryUser;
    this.managerId = selected?.id == null ? null : Number(selected.id);
    this.managerSearchText = selected?.fullName ?? '';
  }

  displayManager(value: DirectoryUser | string | null): string {
    return typeof value === 'string' ? value : value?.fullName ?? '';
  }

  clearManagerSelection(): void {
    this.managerId = null;
    this.managerSearchText = '';
    this.filterManagerAutocomplete();
  }

  triggerToastAlert(message: string, isError = false): void {
    this.successMessage = isError ? `Error: ${message}` : message;
    this.showSuccessToast = true;

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.showSuccessToast = false, 4000);
  }

  private errorMessage(error: HttpErrorResponse, fallback: string): string {
    return error?.error?.message || error?.error?.error || fallback;
  }

  private sanitizeImagePath(path: string): string {
    const clean = (path || '').trim();
    if (/^(https?:|data:|blob:)/i.test(clean)) return clean;
    return clean.replace(/^\//, '');
  }

  getAvatarDisplaySrc(path: string): string {
    if (!path) return '';
    if (/^(https?:|data:|blob:)/i.test(path)) return path;

    const cleanBase = this.baseUrl.replace(/\/$/, '');
    return `${cleanBase}/${path.replace(/^\//, '')}`;
  }

  getAvatarInitials(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);

    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : (parts[0]?.[0] || 'U').toUpperCase();
  }

  personToneClass(id: number | string | null | undefined): string {
    const numericId = Math.trunc(Number(id) || 0);
    return `person-tone-${((numericId % 4) + 4) % 4}`;
  }

  getCount(users: DirectoryUser[], active: boolean): number {
    return users.filter(user => user.is_active === active).length;
  }

  filterUsersByStatusAndSearch(users: DirectoryUser[]): DirectoryUser[] {
    const targetActive = this.currentStatusTab === 'active';
    const query = this.searchTerm.trim().toLowerCase();

    return users.filter(user =>
      user.is_active === targetActive
      && (!query ||
        user.fullName.toLowerCase().includes(query)
        || user.email.toLowerCase().includes(query)
        || user.phone?.toLowerCase().includes(query)
        || this.getDesignation(user).toLowerCase().includes(query)
        || user.locationCity.toLowerCase().includes(query)
        || user.employee_id_number.toLowerCase().includes(query))
    );
  }

  trackByUserId(_index: number, user: DirectoryUser): number {
    return user.id;
  }

  resetForm(): void {
    this.revokeLocalPreview();
    this.firstName = '';
    this.lastName = '';
    this.email = '';
    this.phone = '';
    this.gender = '';
    this.password = '';
    this.profilePictureUrl = '';
    this.selectedFile = null;
    this.roleId = null;
    this.orgRole = '';
    this.managerId = null;
    this.managerSearchText = '';
    this.employeeIdPrefix = 'EMP';
    this.employeeIdNumber = '';
    this.locationCountry = 'IN';
    this.locationState = '';
    this.locationCity = '';
    this.locationWorkModel = 'HQ';
    this.locationDeskCode = '';
    this.isActive = true;
  }

  closeDrawerAndCancel(): void {
    this.profileEditMode = false;
    this.isDrawerOpen = false;
    this.editingUserId = null;
    this.resetForm();
  }
}
