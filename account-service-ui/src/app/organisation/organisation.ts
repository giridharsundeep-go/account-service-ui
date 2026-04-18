import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-organisation',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    FormsModule
  ],
  templateUrl: './organisation.html',
  styleUrl: './organisation.css'
})
export class Organisation implements OnInit {

  constructor(private route: ActivatedRoute) { }

  orgId!: number;

  activeTab: 'overview' | 'teams' | 'users' = 'overview';

  organisation = {
    title: '',
    description: ''
  };

  users: any[] = [];
  teams: any[] = [];

  searchText = '';

  pageSize = 5;
  currentPage = 1;

  selectedTeam: any = null;

  teamUsersMap: any = {
    1: [1, 3],
    2: [2],
    3: [1, 2, 3]
  };

  ngOnInit() {
    this.orgId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadOrganisation();
    this.loadUsers();
    this.loadTeams();
  }

  loadOrganisation() {
    this.organisation = {
      title: 'Greatley Poshley',
      description: 'Building scalable SaaS platforms'
    };
  }

  loadUsers() {
    this.users = [
      { id: 1, name: 'John Doe', email: 'john@test.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@test.com' },
      { id: 3, name: 'Sundeep', email: 'sundeep@test.com' }
    ];
  }

  loadTeams() {
    this.teams = [
      { id: 1, name: 'Engineering' },
      { id: 2, name: 'Marketing' },
      { id: 3, name: 'Product' }
    ];
  }

  setTab(tab: 'overview' | 'teams' | 'users') {
    this.activeTab = tab;
    this.currentPage = 1;
  }

  get filteredUsers() {
    let list = this.users;

    if (this.selectedTeam) {
      const ids = this.teamUsersMap[this.selectedTeam.id] || [];
      list = list.filter(u => ids.includes(u.id));
    }

    if (this.searchText) {
      const s = this.searchText.toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s)
      );
    }

    return list;
  }

  get paginatedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get totalPages() {
    return Math.ceil(this.filteredUsers.length / this.pageSize);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  prevPage() {
    if (this.currentPage > 1) this.currentPage--;
  }

  openTeam(team: any) {
    this.selectedTeam = team;
    this.activeTab = 'users';
  }

  clearTeamFilter() {
    this.selectedTeam = null;
  }

  createUser() { }
  createTeam() { }
  openUser(user: any) {
    console.log(user);
  }
}