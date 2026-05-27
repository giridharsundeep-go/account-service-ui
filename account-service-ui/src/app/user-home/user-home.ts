import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { EditProfileDialog } from '../edit-profile-dialog/edit-profile-dialog';
import { CreateOrgDialog } from '../create-org-dialog/create-org-dialog';
import { AuthService } from '../auth.service';
import { environment } from '../../environment';
import { Organisation } from "../organisation/organisation";
import { Dashboard } from "../dashboard/dashboard";
import { Roles } from "../roles/roles";
import { Users } from "../users/users";
import { Teams } from "../teams/teams";
import { Products } from '../products/products';
import { Backlog } from "../backlog/backlog";
import { Projects } from "../projects/projects";

@Component({
  selector: 'app-user-home',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    Organisation,
    Dashboard,
    Roles,
    Users,
    Teams,
    Products,
    Backlog,
    Projects
],
  templateUrl: './user-home.html',
  styleUrls: ['./user-home.css']
})
export class UserHome implements OnInit {
  baseUrl = environment.apiBaseUrl;
  organisations$!: Observable<any[]>;
  activeMenu = 'create';

  // 👤 User Info
  user = {
    name: 'Giridhar Sundeep',
    email: 'giridharsundeep.pro@gmail.com',
    phone: '7799165659',
    image: null as string | ArrayBuffer | null
  };

  organisation = {
    title: '',
    description: '',
    email: '',
    phone: ''
  };

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private http: HttpClient,
    private auth: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadOrganisations();
    } else {
      this.organisations$ = of([]); 
    }
  }

  loadOrganisations() {
    const userId = sessionStorage.getItem('user');
    if (!userId) return;

    this.organisations$ = this.http.get<any>(
      `${this.baseUrl}/organisations/get`,
      {
        headers: this.auth.getAuthHeaders()
      }
    ).pipe(
      map(res => res.data || [])
    );
  }

  setActive(menu: string) {
    this.activeMenu = menu;
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

  openOrgCreateDialog() {
    const dialogRef = this.dialog.open(CreateOrgDialog, {
      width: '600px',
      height: '600px',
      data: { ...this.organisation }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.organisation = result;
        if (isPlatformBrowser(this.platformId)) {
          this.loadOrganisations();
        }
      }
    });
  }

  goToOrganisation(orgId?: number) {
    if (!orgId) return;
    this.router.navigate(['/org', orgId]);
  }
}