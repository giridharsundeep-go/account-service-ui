import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { environment } from '../../environment';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { map, Observable, catchError, of } from 'rxjs';

// Angular Material Layout Module System
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './roles.html',
  styleUrls: ['./roles.css']
})
export class Roles implements OnInit {
  baseUrl = environment.apiBaseUrlM;

  roles$: Observable<any[]> | undefined;

  roleName = '';
  roleDesc = '';
  editingRoleId: number | null = null;

  searchTerm = '';
  loading = false;
  errorMessage = '';
  successMessage = '';

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnInit() {
    this.loadRoles();
  }

  // ✅ LOAD ROLES (Reactive stream fetcher)
  loadRoles() {
    // The backend derives orgId from the authenticated principal/JWT.
    // Do not send orgId from the browser or trust a client-supplied orgId.
    this.roles$ = this.http.get<any>(`${this.baseUrl}/roles`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(
      map(res => Array.isArray(res?.data) ? res.data : []),
      catchError(error => {
        this.errorMessage = this.getErrorMessage(error, 'Unable to load roles.');
        return of([] as any[]);
      })
    );
  }

  // ✅ CREATE / UPDATE
  saveRole() {
    const name = this.roleName.trim();
    if (!name || this.loading) return;

    this.errorMessage = '';
    this.successMessage = '';

    // Intentionally omit orgId: the authenticated backend resolves the user's
    // organization and scopes create/update operations to that organization.
    const payload = { name, description: this.roleDesc.trim() };
    const isEditingExistingRole = this.editingRoleId !== null && this.editingRoleId > 0;

    this.loading = true;
    const request = isEditingExistingRole
      ? this.http.put<any>(`${this.baseUrl}/roles/${this.editingRoleId}`, payload, { headers: this.auth.getAuthHeaders() })
      : this.http.post<any>(`${this.baseUrl}/roles`, payload, { headers: this.auth.getAuthHeaders() });

    request.subscribe({
      next: (res) => {
        this.successMessage = res?.message || (isEditingExistingRole ? 'Role updated successfully.' : 'Role created successfully.');
        this.resetForm();
        this.loadRoles();
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = this.getErrorMessage(error, 'Unable to save role.');
        this.loading = false;
      }
    });
  }

  // ✅ DELETE
  deleteRole(id: number) {
    if (!confirm('Are you sure you want to permanently delete this system access role?')) return;

    this.errorMessage = '';
    this.successMessage = '';
    this.http.delete<any>(`${this.baseUrl}/roles/${id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: (res) => {
        this.successMessage = res?.message || 'Role deleted successfully.';
        if (this.editingRoleId === id) this.resetForm();
        this.loadRoles();
      },
      error: (error) => {
        this.errorMessage = this.getErrorMessage(error, 'Unable to delete role.');
      }
    });
  }

  // ✅ EDIT
  editRole(role: any) {
    this.errorMessage = '';
    this.successMessage = '';
    this.roleName = role.name || '';
    this.roleDesc = role.description || '';
    this.editingRoleId = Number(role.id);
  }

  // ✅ RESET FORM BOUNDARIES
  resetForm() {
    this.roleName = '';
    this.roleDesc = '';
    this.editingRoleId = null;
    this.errorMessage = '';
  }

  private getErrorMessage(error: any, fallback: string): string {
    if (error?.status === 401 || error?.status === 403) {
      return 'Your session is invalid or you do not have permission to access roles. Please sign in again if needed.';
    }
    if (error?.status === 404) return error?.error?.message || 'Role not found in your organization.';
    if (error?.status === 409) return error?.error?.message || 'A role with this name already exists in your organization.';
    return error?.error?.message || error?.error?.error || fallback;
  }

  // ✅ LOCAL SEARCH FILTER
  filterRoles(roles: any[]) {
    if (!this.searchTerm.trim()) return roles;
    const cleanSearch = this.searchTerm.toLowerCase();

    return roles.filter(r =>
      (r.name || '').toLowerCase().includes(cleanSearch) ||
      (r.description || '').toLowerCase().includes(cleanSearch)
    );
  }
}