import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { environment } from '../../environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map, Observable } from 'rxjs';
import { AuthService } from '../auth.service';

// Angular Material Module Core Imports
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
export class Users implements OnInit {
  baseUrl = environment.apiBaseUrl;

  users$: Observable<any[]> | undefined;
  roles$: Observable<any[]> | undefined;

  // Local cache repositories to match configurations smoothly
  cachedUsersArray: any[] = [];
  filteredManagers: any[] = [];

  name = '';
  email = '';
  roleId: number | null = null;
  managerId: number | null = null;
  managerSearchText = ''; // Model boundary connected to autocomplete text

  // Employee Identity Fields
  employeeIdPrefix = '';
  employeeIdNumber = '';

  // Location Fields
  locationCountry = '';
  locationState = '';
  locationCity = '';
  locationWorkModel = ''; // e.g., 'REMOTE' | 'HYBRID' | 'ONSITE'
  locationDeskCode = '';

  editingUserId: number | null = null;
  searchTerm = '';
  loading = false;

  constructor(private http: HttpClient, private auth: AuthService) { }

  ngOnInit() {
    this.loadUsers();
    this.loadRoles();
  }

  loadUsers() {
    this.users$ = this.http.get<any>(`${this.baseUrl}/user`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(
      map(res => {
        const users = res?.data || [];
        this.cachedUsersArray = users;
        this.filterManagerAutocomplete(); // Sync and reset filtering repositories
        return users;
      })
    );
  }

  loadRoles() {
    this.roles$ = this.http.get<any>(`${this.baseUrl}/roles`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(map(res => res?.data || []));
  }

  // AUTOCOMPLETE FEATURE: Evaluates match pools across input keystrokes
  filterManagerAutocomplete() {
    const query = this.managerSearchText?.toLowerCase() || '';

    // Safety check: Prevent a user from selecting themselves as their own reporting manager
    let pool = this.cachedUsersArray;
    if (this.editingUserId) {
      pool = pool.filter(u => u.id !== this.editingUserId);
    }

    if (!query.trim()) {
      this.filteredManagers = pool;
    } else {
      this.filteredManagers = pool.filter(u =>
        u.name?.toLowerCase().includes(query) ||
        (u.role_name || '').toLowerCase().includes(query)
      );
    }
  }

  onManagerSelected(event: MatAutocompleteSelectedEvent) {
    this.managerId = event.option.value; // Store the chosen database identity key
  }

  displayManagerName(userId: number | null): string {
    if (!userId) return '';
    const matched = this.cachedUsersArray.find(u => u.id === userId);
    return matched ? matched.name : '';
  }

  clearManagerSelection() {
    this.managerId = null;
    this.managerSearchText = '';
    this.filterManagerAutocomplete();
  }

  saveUser() {
    if (!this.name.trim() || !this.email.trim() || !this.roleId) return;
    this.loading = true;

    const payload = {
      name: this.name,
      email: this.email,
      role_id: this.roleId,
      manager_id: this.managerId, // Attaches hierarchical corporate relation mapping
      employee_id_prefix: this.employeeIdPrefix,
      employee_id_number: this.employeeIdNumber,
      locationCountry: this.locationCountry,
      locationState: this.locationState,
      locationCity: this.locationCity,
      locationWorkModel: this.locationWorkModel,
      locationDeskCode: this.locationDeskCode
    };

    const request = this.editingUserId
      ? this.http.put(`${this.baseUrl}/user/${this.editingUserId}`, payload, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/user/create`, payload, { headers: this.auth.getAuthHeaders() });

    request.subscribe({
      next: () => {
        this.resetForm();
        this.loadUsers();
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  editUser(user: any) {
    this.name = user.name;
    this.email = user.email;
    this.roleId = user.role_id;
    this.editingUserId = user.id;
    this.managerId = user.manager_id || null;

    // Populating employee identity back into the edit states
    this.employeeIdPrefix = user.employee_id_prefix || '';
    this.employeeIdNumber = user.employee_id_number || '';

    // Populating location data back into the edit states
    this.locationCountry = user.locationCountry || '';
    this.locationState = user.locationState || '';
    this.locationCity = user.locationCity || '';
    this.locationWorkModel = user.locationWorkModel || '';
    this.locationDeskCode = user.locationDeskCode || '';

    // Safe execution with type-matching guaranteed
    this.managerSearchText = this.managerId ? this.displayManagerName(this.managerId) : '';
    this.filterManagerAutocomplete();
  }

  deleteUser(id: number) {
    if (!confirm('Permanently revoke user access tokens and delete profile?')) return;
    this.http.delete(`${this.baseUrl}/user/${id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe(() => this.loadUsers());
  }

  resetForm() {
    this.name = '';
    this.email = '';
    this.roleId = null;
    this.managerId = null;
    this.managerSearchText = '';
    
    // Clear identity variables cleanly
    this.employeeIdPrefix = '';
    this.employeeIdNumber = '';

    // Clear location variables cleanly
    this.locationCountry = '';
    this.locationState = '';
    this.locationCity = '';
    this.locationWorkModel = '';
    this.locationDeskCode = '';

    this.editingUserId = null;
    this.filterManagerAutocomplete();
  }

  getAvatarInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase();
  }

  filterUsers(users: any[]) {
    if (!this.searchTerm.trim()) return users;
    const search = this.searchTerm.toLowerCase();
    return users.filter(u =>
      u.name?.toLowerCase().includes(search) ||
      u.email?.toLowerCase().includes(search) ||
      (u.role_name || '').toLowerCase().includes(search) ||
      (u.manager_name || '').toLowerCase().includes(search)
    );
  }
}