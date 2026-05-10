import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { environment } from '../../environment';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../auth.service';
import { map, Observable } from 'rxjs';

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

  baseUrl = environment.apiBaseUrl;

  roles$: Observable<any[]> | undefined;

  roleName = '';
  roleDesc = '';
  editingRoleId: number | null = null;

  searchTerm = '';
  loading = false;

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnInit() {
    this.loadRoles();
  }

  // ✅ LOAD ROLES
  loadRoles() {
    this.roles$ = this.http.get<any>(`${this.baseUrl}/roles`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(
      map(res => res?.data || [])
    );
  }

  // ✅ CREATE / UPDATE
  saveRole() {
    if (!this.roleName.trim()) return;

    const payload = {
      name: this.roleName,
      description: this.roleDesc
    };

    this.loading = true;

    const request = this.editingRoleId
      ? this.http.put(`${this.baseUrl}/roles/${this.editingRoleId}`, payload, {
          headers: this.auth.getAuthHeaders()
        })
      : this.http.post(`${this.baseUrl}/roles/create`, payload, {
          headers: this.auth.getAuthHeaders()
        });

    request.subscribe({
      next: () => {
        this.resetForm();
        this.reloadPage(); // 🔥 full reload
      },
      error: () => this.loading = false
    });
  }

  // ✅ DELETE
  deleteRole(id: number) {
    if (!confirm('Delete role?')) return;

    this.http.delete(`${this.baseUrl}/roles/${id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe(() => this.reloadPage());
  }

  // ✅ EDIT
  editRole(role: any) {
    this.roleName = role.name;
    this.roleDesc = role.description;
    this.editingRoleId = role.id;
  }

  // ✅ RESET
  resetForm() {
    this.roleName = '';
    this.roleDesc = '';
    this.editingRoleId = null;
  }

  // 🔥 FULL PAGE RELOAD
  reloadPage() {
    window.location.reload();
  }

  // ✅ SEARCH FILTER
  filterRoles(roles: any[]) {
    if (!this.searchTerm.trim()) return roles;

    return roles.filter(r =>
      r.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }
}