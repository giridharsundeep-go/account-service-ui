import {WorkspaceSettingsService} from '../shared/workspace-settings.service';
import {WorkspaceSettingsComponent} from '../shared/workspace-settings';

import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { environment } from '../../environment';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { map, Observable, catchError, of } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [
    CommonModule, WorkspaceSettingsComponent,
    FormsModule,
    WorkspaceHeroComponent,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './roles.html',
  styleUrls: ['./roles.css', '../shared/field-controls.css']
})
export class Roles implements OnInit {
  readonly workspace=inject(WorkspaceSettingsService);
  baseUrl = environment.apiBaseUrlM;

  roles$: Observable<any[]> | undefined;

  roleName = '';
  roleDesc = '';
  editingRoleId: number | null = null;

  searchTerm = '';
  loading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.loadRoles();
  }

  loadRoles(): void {
    // The backend resolves the organization from the authenticated principal.
    // Do not send an organization ID from the browser.
    this.roles$ = this.http.get<any>(`${this.baseUrl}/roles`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(
      map(res => {
        if (Array.isArray(res)) return res;
        if (Array.isArray(res?.data)) return res.data;
        if (Array.isArray(res?.data?.roles)) return res.data.roles;
        if (Array.isArray(res?.roles)) return res.roles;
        if (Array.isArray(res?.items)) return res.items;
        return [];
      }),
      catchError(error => {
        this.errorMessage = this.getErrorMessage(
          error,
          'Unable to load roles.'
        );
        return of([] as any[]);
      })
    );
  }

  saveRole(): void {
    const name = this.roleName.trim();

    if (!name || this.loading) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    // The authenticated backend scopes this operation to the user's
    // organization. Do not send orgId from the client.
    const payload = {
      name,
      description: this.roleDesc.trim()
    };

    const isEditingExistingRole =
      this.editingRoleId !== null && this.editingRoleId > 0;

    this.loading = true;

    const request = isEditingExistingRole
      ? this.http.put<any>(
          `${this.baseUrl}/roles/${this.editingRoleId}`,
          payload,
          { headers: this.auth.getAuthHeaders() }
        )
      : this.http.post<any>(
          `${this.baseUrl}/roles`,
          payload,
          { headers: this.auth.getAuthHeaders() }
        );

    request.subscribe({
      next: res => {
        this.successMessage = res?.message || (
          isEditingExistingRole
            ? 'Role updated successfully.'
            : 'Role created successfully.'
        );

        this.resetForm();
        this.loadRoles();
        this.loading = false;
      },
      error: error => {
        this.errorMessage = this.getErrorMessage(
          error,
          'Unable to save role.'
        );
        this.loading = false;
      }
    });
  }

  deleteRole(id: number): void {
    if (!confirm(
      'Are you sure you want to permanently delete this system access role?'
    )) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    this.http.delete<any>(`${this.baseUrl}/roles/${id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: res => {
        this.successMessage = res?.message || 'Role deleted successfully.';

        if (this.editingRoleId === id) {
          this.resetForm();
        }

        this.loadRoles();
      },
      error: error => {
        this.errorMessage = this.getErrorMessage(
          error,
          'Unable to delete role.'
        );
      }
    });
  }

  editRole(role: any): void {
    this.errorMessage = '';
    this.successMessage = '';

    this.roleName = role.name || '';
    this.roleDesc = role.description || '';
    this.editingRoleId = Number(role.id);
  }

  resetForm(): void {
    this.roleName = '';
    this.roleDesc = '';
    this.editingRoleId = null;
    this.errorMessage = '';
  }

  private getErrorMessage(error: any, fallback: string): string {
    if (error?.status === 401 || error?.status === 403) {
      return 'Your session is invalid or you do not have permission to access roles. Please sign in again if needed.';
    }

    if (error?.status === 404) {
      return error?.error?.message || 'Role not found in your organization.';
    }

    if (error?.status === 409) {
      return error?.error?.message ||
        'A role with this name already exists in your organization.';
    }

    return error?.error?.message || error?.error?.error || fallback;
  }

  filterRoles(roles: any[]): any[] {
    const cleanSearch = this.searchTerm.trim().toLowerCase();

    if (!cleanSearch) return roles;

    return roles.filter(role => [role?.name, role?.roleName, role?.role_name, role?.description]
      .some(value => String(value ?? '').toLowerCase().includes(cleanSearch)));
  }
}
