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
import { MatExpansionModule } from '@angular/material/expansion';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatExpansionModule
  ],
  templateUrl: './users.html',
  styleUrls: ['./users.css']
})
export class Users implements OnInit {

  baseUrl = environment.apiBaseUrl;

  users$: Observable<any[]> | undefined;

  name = '';
  email = '';
  editingUserId: number | null = null;

  searchTerm = '';
  loading = false;

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnInit() {
    this.loadUsers();
  }

  // ✅ LOAD USERS
  loadUsers() {
    this.users$ = this.http.get<any>(`${this.baseUrl}/users`, {
      headers: this.auth.getAuthHeaders()
    }).pipe(
      map(res => res?.data || [])
    );
  }

  // ✅ CREATE / UPDATE
  saveUser() {
    if (!this.name.trim() || !this.email.trim()) return;

    const payload = {
      name: this.name,
      email: this.email
    };

    this.loading = true;

    const request = this.editingUserId
      ? this.http.put(`${this.baseUrl}/users/${this.editingUserId}`, payload, {
          headers: this.auth.getAuthHeaders()
        })
      : this.http.post(`${this.baseUrl}/users/create`, payload, {
          headers: this.auth.getAuthHeaders()
        });

    request.subscribe({
      next: () => {
        this.resetForm();
        this.loadUsers();
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  // ✅ DELETE
  deleteUser(id: number) {
    if (!confirm('Delete user?')) return;

    this.http.delete(`${this.baseUrl}/users/${id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe(() => this.loadUsers());
  }

  // ✅ EDIT
  editUser(user: any) {
    this.name = user.name;
    this.email = user.email;
    this.editingUserId = user.id;
  }

  // ✅ RESET
  resetForm() {
    this.name = '';
    this.email = '';
    this.editingUserId = null;
  }

  // ✅ SEARCH FILTER
  filterUsers(users: any[]) {
    if (!this.searchTerm.trim()) return users;

    return users.filter(u =>
      u.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }
}