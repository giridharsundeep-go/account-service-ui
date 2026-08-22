import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { environment } from '../../environment';
import { EditProfileDialog } from '../edit-profile-dialog/edit-profile-dialog';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { CreateOrgDialog } from '../create-org-dialog/create-org-dialog';

@Component({
  selector: 'app-organisation',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    HttpClientModule
  ],
  templateUrl: './organisation.html',
  styleUrl: './organisation.css'
})
export class Organisation implements OnInit {

  baseUrl = environment.apiBaseUrl;

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private http: HttpClient,
    private auth: AuthService
  ) { }

  organisations$!: Observable<any[]>;

  ngOnInit() {
    this.loadOrganisations();
  }

  loadOrganisations() {
    const userId = sessionStorage.getItem('user');
    if (!userId) return;

    this.organisations$ = this.http.get<any>(
      `${this.baseUrl}/organisation/get`,
      {
        headers: this.auth.getAuthHeaders()
      }
    ).pipe(
      map(res => res.data || [])
    );
  }

  activeMenu = 'create';

  setActive(menu: string) {
    this.activeMenu = menu;
  }

  user = {
    name: 'Giridhar Sundeep',
    email: 'giridharsundeep.pro@gmail.com',
    phone: '7799165659',
    image: null as string | ArrayBuffer | null
  };

  // ✅ Added slug field to organization model
  organisation = {
    title: '',
    slug: '',
    description: '',
    email: '',
    phone: ''
  };

  openEditDialog() {
    const dialogRef = this.dialog.open(EditProfileDialog, {
      width: '600px',
      height: '600px',
      data: { ...this.user }
    });

    dialogRef.afterClosed().subscribe((result: { name: string; email: string; phone: string; image: string | ArrayBuffer | null; }) => {
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
        this.loadOrganisations();
      }
    });
  }

  /**
   * ✅ Handles navigation using either slug or id
   * Strips leading slashes if slug is formatted like "/my-org"
   */
  goToOrganisation(identifier?: string | number) {
    if (!identifier) return;

    const routeParam = typeof identifier === 'string' && identifier.startsWith('/')
      ? identifier.substring(1)
      : identifier;

    this.router.navigate(['/org', routeParam]);
  }
}