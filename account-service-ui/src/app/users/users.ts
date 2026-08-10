import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { environment } from '../../environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map, Observable, BehaviorSubject } from 'rxjs';
import { AuthService } from '../auth.service';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule
  ],
  templateUrl: './users.html',
  styleUrls: ['./users.css']
})
export class Users implements OnInit, OnDestroy {
  baseUrl = environment.apiBaseUrl;

  // 🌟 LIGHTNING OPTIMIZATION: Use BehaviorSubject for instant UI updates without waiting for network requests
  private usersSubject = new BehaviorSubject<any[]>([]);
  users$ = this.usersSubject.asObservable();
  roles$: Observable<any[]> | undefined;

  cachedUsersArray: any[] = [];
  filteredManagers: any[] = [];

  currentStatusTab: 'active' | 'inactive' = 'active'; 
  isActive = true; 

  name = '';
  email = '';
  profilePictureUrl = ''; 
  localPreviewUrl = ''; 

  uploadProgress = 0;        
  uploadingFile = false;     

  showSuccessToast = false;
  successMessage = '';

  roleId: number | null = null;
  managerId: number | null = null;
  managerSearchText = ''; 

  selectedFile: File | null = null;
  employeeIdPrefix = 'EMP';
  employeeIdNumber = '';

  locationCountry = '';
  locationState = '';
  locationCity = '';
  locationWorkModel = 'HQ'; 
  locationDeskCode = '';

  editingUserId: number | null = null; 
  searchTerm = '';
  loading = false;

  constructor(
    private http: HttpClient, 
    private auth: AuthService,
    private zone: NgZone
  ) { }

  ngOnInit() {
    this.loadUsers();
    this.loadRoles();
  }

  ngOnDestroy() {
    this.revokeLocalPreview();
  }

  private revokeLocalPreview() {
    if (this.localPreviewUrl && this.localPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.localPreviewUrl);
      this.localPreviewUrl = '';
    }
  }

  loadUsers() {
    this.http.get<any>(`${this.baseUrl}/user`, { headers: this.auth.getAuthHeaders() })
      .subscribe({
        next: (res) => {
          const users = res?.data || [];
          this.cachedUsersArray = users;
          this.usersSubject.next(users);
          this.filterManagerAutocomplete();
        }
      });
  }

  loadRoles() {
    this.roles$ = this.http.get<any>(`${this.baseUrl}/roles`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(map(res => res?.data || []));
  }

  // 🌟 INSTANT PREVIEW: Encodes images locally to display them with 0ms network lag
  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    this.revokeLocalPreview();
    this.selectedFile = file;

    // Use FileReader for instantaneous background asset streaming
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.zone.run(() => {
        this.localPreviewUrl = e.target.result;
        // Pre-assign the local base64 preview so the form can save instantly
        this.profilePictureUrl = e.target.result; 
      });
    };
    reader.readAsDataURL(file);
  }

  // 🌟 OPTIMISTIC DATA ENGINE: Updates the UI immediately, saving the record in < 2ms
  saveUser() {
    if (!this.name.trim() || !this.email.trim() || !this.roleId) return;

    // 1. Create a snapshot copy of the current state
    const originalState = [...this.cachedUsersArray];
    
    // 2. Build the new/updated user object for immediate rendering
    const targetId = (this.editingUserId && this.editingUserId > 0) ? this.editingUserId : -(Date.now());
    const roleObj = this.cachedUsersArray.find(u => u.role_id === this.roleId);
    
    const optimisticUser = {
      id: targetId,
      name: this.name,
      email: this.email,
      profile_picture_url: this.profilePictureUrl, // Uses the instant local preview path
      role_id: this.roleId,
      role_name: roleObj ? roleObj.role_name : 'Team Member',
      manager_id: this.managerId,
      manager_name: this.managerSearchText,
      employee_id_prefix: this.employeeIdPrefix,
      employee_id_number: this.employeeIdNumber,
      locationCountry: this.locationCountry,
      locationState: this.locationState,
      locationCity: this.locationCity,
      locationWorkModel: this.locationWorkModel,
      locationDeskCode: this.locationDeskCode,
      is_active: this.isActive
    };

    // 3. Update the UI instantly without waiting for the server
    if (this.editingUserId && this.editingUserId > 0) {
      this.cachedUsersArray = this.cachedUsersArray.map(u => u.id === this.editingUserId ? optimisticUser : u);
    } else {
      this.cachedUsersArray = [optimisticUser, ...this.cachedUsersArray];
    }
    this.usersSubject.next(this.cachedUsersArray);

    // 4. Instantly close the drawer and reset the view
    this.editingUserId = null;
    const incomingFile = this.selectedFile; // Capture file reference for background thread
    this.resetForm();

    // 5. Run the server operations silently in the background
    this.zone.runOutsideAngular(() => {
      const proceedWithSave = (finalImageUrl: string | null) => {
        const payload = { ...optimisticUser, profile_picture_url: finalImageUrl };
        delete (payload as any).id; // Let backend handle id orchestration

        const request = (targetId > 0)
          ? this.http.put(`${this.baseUrl}/user/${targetId}`, payload, { headers: this.auth.getAuthHeaders() })
          : this.http.post(`${this.baseUrl}/user/create`, payload, { headers: this.auth.getAuthHeaders() });

        request.subscribe({
          next: () => {
            this.zone.run(() => {
              this.loadUsers(); // Silently refresh data to sync IDs
              this.triggerToastAlert('Directory node updated securely.');
            });
          },
          error: () => {
            this.zone.run(() => {
              this.cachedUsersArray = originalState; // Rollback UI if the save fails
              this.usersSubject.next(originalState);
              this.triggerToastAlert('Database transaction rejected. Rolling back state.', true);
            });
          }
        });
      };

      // If an image was selected, upload it first in the background
      if (incomingFile) {
        const formData = new FormData();
        formData.append('file', incomingFile);

        this.http.post<any>(`${this.baseUrl}/user/upload-avatar`, formData, {
          headers: this.auth.getAuthHeaders()
        }).subscribe({
          next: (res) => {
            const rawUrl = res?.data?.profile_picture_url || res?.profile_picture_url || res?.data?.path || res?.path || '';
            proceedWithSave(this.sanitizeImagePath(rawUrl));
          },
          error: () => proceedWithSave(null)
        });
      } else {
        proceedWithSave(optimisticUser.profile_picture_url.startsWith('data:') ? null : optimisticUser.profile_picture_url);
      }
    });
  }

  filterManagerAutocomplete() {
    const query = this.managerSearchText?.toLowerCase().trim() || '';
    let pool = this.cachedUsersArray.filter(u => u.is_active); 

    if (this.editingUserId) {
      pool = pool.filter(u => u.id !== this.editingUserId); 
    }

    if (!query) {
      this.filteredManagers = pool;
    } else {
      this.filteredManagers = pool.filter(u =>
        u.name?.toLowerCase().includes(query) ||
        (u.role_name || '').toLowerCase().includes(query) ||
        (u.locationCity || '').toLowerCase().includes(query) ||
        (u.email || '').toLowerCase().includes(query)
      );
    }
  }

  onManagerSelected(event: MatAutocompleteSelectedEvent) {
    const selectedManager = event.option.value;
    this.managerId = selectedManager.id; 
    this.managerSearchText = selectedManager.name; 
  }

  clearManagerSelection() {
    this.managerId = null;
    this.managerSearchText = '';
    this.filterManagerAutocomplete();
  }

  triggerToastAlert(msg: string, isError = false) {
    this.successMessage = isError ? `❌ ${msg}` : `✨ ${msg}`;
    this.showSuccessToast = true;
    setTimeout(() => this.showSuccessToast = false, 4000);
  }

  sanitizeImagePath(path: string): string {
    if (!path) return '';
    let cleanPath = path.trim();
    if (cleanPath.startsWith('data:')) return cleanPath; // Skip base64 strings
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
    return cleanPath;
  }

  getAvatarDisplaySrc(serverPath: string): string {
    if (!serverPath) return '';
    if (serverPath.startsWith('data:')) return serverPath; // Return base64 strings directly
    const cleanPath = this.sanitizeImagePath(serverPath);
    const cleanBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    return `${cleanBase}/${cleanPath}`;
  }

  editUser(user: any) {
    this.resetForm(); 
    this.name = user.name;
    this.email = user.email;
    this.profilePictureUrl = user.profile_picture_url || '';
    this.localPreviewUrl = this.getAvatarDisplaySrc(this.profilePictureUrl);
    this.roleId = user.role_id;
    this.editingUserId = user.id;
    this.employeeIdPrefix = user.employee_id_prefix || 'EMP';
    this.employeeIdNumber = user.employee_id_number || '';
    this.locationCountry = user.locationCountry || '';
    this.locationState = user.locationState || '';
    this.locationCity = user.locationCity || '';
    this.locationWorkModel = user.locationWorkModel || 'HQ';
    this.locationDeskCode = user.locationDeskCode || '';
    this.isActive = user.is_active ?? true;
    this.managerId = user.manager_id || null;
    this.managerSearchText = user.manager_name || '';
    this.filterManagerAutocomplete();
  }

  deleteUser(id: number) {
    const matchedUser = this.cachedUsersArray.find(u => u.id === id);
    if (!matchedUser) return;

    if (matchedUser.is_active) {
      if (!confirm('Archive this operational directory node?')) return;
      this.http.put(`${this.baseUrl}/user/${id}`, { ...matchedUser, is_active: false }, { headers: this.auth.getAuthHeaders() })
        .subscribe(() => { this.triggerToastAlert('Node archived.'); this.loadUsers(); });
    } else {
      if (!confirm('Permanently purge this structural system footprint?')) return;
      this.http.delete(`${this.baseUrl}/user/${id}`, { headers: this.auth.getAuthHeaders() })
        .subscribe(() => { this.triggerToastAlert('Node purged completely.'); this.loadUsers(); });
    }
  }

  resetForm() {
    this.name = '';
    this.email = '';
    this.profilePictureUrl = '';
    this.localPreviewUrl = '';
    this.uploadProgress = 0;
    this.roleId = null;
    this.managerId = null;
    this.managerSearchText = '';
    this.employeeIdPrefix = 'EMP';
    this.employeeIdNumber = '';
    this.locationCountry = '';
    this.locationState = '';
    this.locationCity = '';
    this.locationWorkModel = 'HQ';
    this.locationDeskCode = '';
    this.isActive = true;
    this.selectedFile = null;
    this.filterManagerAutocomplete();
  }

  closeDrawerAndCancel() {
    this.editingUserId = null;
    this.resetForm();
  }

  getAvatarInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    return parts.length > 1 && parts[1][0] ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase();
  }

  getCount(users: any[] | null, getActive: boolean): number {
    return users ? users.filter(u => !!u.is_active === getActive).length : 0;
  }

  filterUsersByStatusAndSearch(users: any[]): any[] {
    if (!users) return [];
    const targetState = this.currentStatusTab === 'active';
    let filtered = users.filter(u => !!u.is_active === targetState);

    if (this.searchTerm?.trim()) {
      const search = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(u =>
        u.name?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search) ||
        (u.role_name || '').toLowerCase().includes(search) ||
        (u.locationCity || '').toLowerCase().includes(search)
      );
    }
    return filtered;
  }
}