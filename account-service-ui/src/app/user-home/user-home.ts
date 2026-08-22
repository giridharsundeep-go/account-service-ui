import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatMenuModule } from '@angular/material/menu'; 
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

import { EditProfileDialog } from '../edit-profile-dialog/edit-profile-dialog';
import { AuthService } from '../auth.service';
import { Dashboard } from "../dashboard/dashboard";
import { Roles } from "../roles/roles";
import { Users } from "../users/users";
import { Teams } from "../teams/teams";
import { Products } from '../products/products';
import { Projects } from "../projects/projects";
import { Epics } from '../epics/epics';
import { Issues } from '../issues/issues';
import { Testcases } from '../testcases/testcases';
import { Releases } from '../releases/releases';
import { Docs } from '../docs/docs';

@Component({
  selector: 'app-user-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatSidenavModule,
    MatMenuModule,
    MatDividerModule,
    Dashboard,
    Roles,
    Users,
    Teams,
    Products,
    Epics,
    Projects,
    Issues,
    Testcases,
    Releases,
    Docs
  ],
  templateUrl: './user-home.html',
  styleUrls: ['./user-home.css']
})
export class UserHome implements OnInit {
  activeMenu = 'dashboard';
  currentYear = new Date().getFullYear();
  
  isCollapsed = false;
  searchQuery = '';

  user = {
    name: 'Giridhar Sundeep',
    email: 'giridharsundeep.pro@gmail.com',
    phone: '7799165659',
    image: null as string | ArrayBuffer | null
  };

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private auth: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {}

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
  }

  setActive(menu: string) {
    this.activeMenu = menu;
  }

  isUserGroupActive(): boolean {
    return ['roles', 'users', 'teams'].includes(this.activeMenu);
  }

  onCreateItem(type: string) {
    console.log(`Opening creation dialog for: ${type}`);
  }

  openEditDialog() {
    const dialogRef = this.dialog.open(EditProfileDialog, {
      width: '600px',
      height: '600px',
      data: { ...this.user }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.user = result;
      }
    });
  }

  logout() {
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.clear();
      localStorage.clear();
    }
    this.router.navigate(['/login']);
  }
}