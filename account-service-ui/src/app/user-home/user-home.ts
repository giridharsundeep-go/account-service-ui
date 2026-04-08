import { Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { EditProfileDialog } from '../edit-profile-dialog/edit-profile-dialog';
import { Router } from '@angular/router';


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
  styleUrl: './user-home.css',
})
export class UserHome {

  constructor(private dialog: MatDialog, private router: Router) { }

  name = 'Giridhar Sundeep';
  email = 'giridharsundeep.pro@gmail.com';
  phone = '7799165659';

  profileImage: string | ArrayBuffer | null = null;

  openEditDialog() {
    const dialogRef = this.dialog.open(EditProfileDialog, {
      width: '400px',
      data: {
        name: this.name,
        email: this.email,
        phone: this.phone,
        image: this.profileImage
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.name = result.name;
        this.email = result.email;
        this.phone = result.phone;
        this.profileImage = result.image;
      }
    });
  }

  goToOrganisation() {
    this.router.navigate(['/organisation'])
  }

}