import { Component, OnInit } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { NavigationEnd } from '@angular/router';

import { EditProfileDialog } from '../edit-profile-dialog/edit-profile-dialog';
import { CreateOrgDialog } from '../create-org-dialog/create-org-dialog';

@Component({
  selector: 'app-user-home',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule
  ],
  templateUrl: './user-home.html',
  styleUrls: ['./user-home.css']
})
export class UserHome implements OnInit {

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private http: HttpClient   // ✅ FIXED
  ) { }

  organisations: any[] = [];

  ngOnInit() {
    this.loadOrganisations();

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.loadOrganisations();
      });
  }

  loadOrganisations() {
    const userId = sessionStorage.getItem('user');
    console.log("user id is:" + userId)

    if (!userId) return;

    this.http.get(`http://127.0.0.1:5000/api/organisations/${userId}`)
      .subscribe({
        next: (res: any) => {
          this.organisations = res.data || [];
        },
        error: (err) => {
          console.error('Error fetching organisations', err);
        }
      });
  }

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

  openEditDialog() {
    const dialogRef = this.dialog.open(EditProfileDialog, {
      width: '600px',
      height: '600px',
      data: {
        name: this.user.name,
        email: this.user.email,
        phone: this.user.phone,
        image: this.user.image
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.user = {
          name: result.name,
          email: result.email,
          phone: result.phone,
          image: result.image
        };
      }
      this.ngOnInit();
    });
  }

  openOrgCreateDialog() {
    const dialogRef = this.dialog.open(CreateOrgDialog, {
      width: '600px',
      height: '600px',
      data: {
        organisationTitle: this.organisation.title,
        organisationDescription: this.organisation.description,
        email: this.organisation.email,
        phone: this.organisation.phone
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.organisation = {
          title: result.organisationTitle,
          description: result.organisationDescription,
          email: result.email,
          phone: result.phone
        };

        this.ngOnInit();
      }
    });
  }

  goToOrganisation(orgId?: number) {
    if (!orgId) return;

    this.router.navigate(['/org', orgId]);
  }
}