import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { environment } from '../../environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map, Observable } from 'rxjs';
import { AuthService } from '../auth.service';

// Angular Material Core Imports
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

  // Local caching arrays for synchronization
  cachedUsersArray: any[] = [];
  filteredManagers: any[] = [];

  // System Configuration Tracking Params
  currentStatusTab: 'active' | 'inactive' = 'active'; 
  isActive = true; 

  name = '';
  email = '';
  roleId: number | null = null;
  managerId: number | null = null;
  managerSearchText = ''; 

  // Employee Corporate Identity Fields
  employeeIdPrefix = '';
  employeeIdNumber = '';

  // Geographic Properties (Unified to match camelCase Python engine responses)
  locationCountry = '';
  locationState = '';
  locationCity = '';
  locationWorkModel = ''; 
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
        this.filterManagerAutocomplete(); 
        return users;
      })
    );
  }

  loadRoles() {
    this.roles$ = this.http.get<any>(`${this.baseUrl}/roles`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(map(res => res?.data || []));
  }

  // AUTOCOMPLETE PROCESSING LAYER: Evaluates options dynamically based on text changes
  filterManagerAutocomplete() {
    const query = this.managerSearchText?.toLowerCase() || '';

    // Prevent recursive management reporting lines back to oneself
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
    // 🔧 COMPONENT FIX: Destructure the chosen manager entity emitted directly from option selection
    const selectedManager = event.option.value;
    this.managerId = selectedManager.id; 
    this.managerSearchText = selectedManager.name; 
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
      manager_id: this.managerId, 
      employee_id_prefix: this.employeeIdPrefix,
      employee_id_number: this.employeeIdNumber,
      locationCountry: this.locationCountry,
      locationState: this.locationState,
      locationCity: this.locationCity,
      locationWorkModel: this.locationWorkModel,
      locationDeskCode: this.locationDeskCode,
      is_active: this.isActive 
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

    this.employeeIdPrefix = user.employee_id_prefix || '';
    this.employeeIdNumber = user.employee_id_number || '';

    // camelCase mappings match your SQL column configuration responses perfectly
    this.locationCountry = user.locationCountry || '';
    this.locationState = user.locationState || '';
    this.locationCity = user.locationCity || '';
    this.locationWorkModel = user.locationWorkModel || '';
    this.locationDeskCode = user.locationDeskCode || '';

    this.isActive = user.is_active ?? true;

    // 🔧 COMPONENT FIX: Map the matching string name field directly to the form property
    this.managerId = user.manager_id || null;
    this.managerSearchText = user.manager_name || '';
    
    // Refresh local autocomplete mapping trees
    this.filterManagerAutocomplete();
  }

  deleteUser(id: number) {
    const matchedUser = this.cachedUsersArray.find(u => u.id === id);
    const currentlyActive = matchedUser ? matchedUser.is_active : true;

    if (currentlyActive) {
      if (!confirm('Downgrade profile lifecycle state and shift to the Inactive Archive directory?')) return;
      
      const payload = { 
        name: matchedUser.name,
        email: matchedUser.email,
        role_id: matchedUser.role_id,
        manager_id: matchedUser.manager_id || null,
        employee_id_prefix: matchedUser.employee_id_prefix || '',
        employee_id_number: matchedUser.employee_id_number || '',
        locationCountry: matchedUser.locationCountry || '',
        locationState: matchedUser.locationState || '',
        locationCity: matchedUser.locationCity || '',
        locationWorkModel: matchedUser.locationWorkModel || '',
        locationDeskCode: matchedUser.locationDeskCode || '',
        is_active: false 
      };

      this.http.put(`${this.baseUrl}/user/${id}`, payload, { headers: this.auth.getAuthHeaders() })
        .subscribe(() => this.loadUsers());
    } else {
      if (!confirm('CRITICAL ACTION: Permanently purge this node footprint completely out of the Active Directory index matrix? This cannot be undone.')) return;
      
      this.http.delete(`${this.baseUrl}/user/${id}`, {
        headers: this.auth.getAuthHeaders()
      }).subscribe(() => this.loadUsers());
    }
  }

  resetForm() {
    this.name = '';
    this.email = '';
    this.roleId = null;
    this.managerId = null;
    this.managerSearchText = '';
    
    this.employeeIdPrefix = '';
    this.employeeIdNumber = '';

    this.locationCountry = '';
    this.locationState = '';
    this.locationCity = '';
    this.locationWorkModel = '';
    this.locationDeskCode = '';

    this.isActive = true;
    this.editingUserId = null;
    this.filterManagerAutocomplete();
  }

  getAvatarInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    return parts.length > 1 && parts[1][0] 
      ? (parts[0][0] + parts[1][0]).toUpperCase() 
      : parts[0][0].toUpperCase();
  }

  getCount(users: any[] | null, getActive: boolean): number {
    if (!users) return 0;
    return users.filter(u => !!u.is_active === getActive).length;
  }

  filterUsersByStatusAndSearch(users: any[]): any[] {
    if (!users) return [];

    const targetState = this.currentStatusTab === 'active';
    let filtered = users.filter(u => !!u.is_active === targetState);

    if (this.searchTerm && this.searchTerm.trim() !== '') {
      const search = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(u =>
        u.name?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search) ||
        (u.role_name || '').toLowerCase().includes(search) ||
        (u.manager_name || '').toLowerCase().includes(search) ||
        (u.locationCity || '').toLowerCase().includes(search)
      );
    }

    return filtered;
  }
}