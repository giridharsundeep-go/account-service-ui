import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-create-org-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './create-org-dialog.html',
  styleUrls: ['./create-org-dialog.css']
})
export class CreateOrgDialog {

  organisationTitle: string = '';
  email: string = '';
  phone: string = '';
  organisationDescription: string = '';

  loading = false;
  errorMessage = '';

  constructor(
    private dialogRef: MatDialogRef<CreateOrgDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private http: HttpClient,
    private auth: AuthService
  ) {
    if (data) {
      this.organisationTitle = data.organisationTitle || '';
      this.email = data.email || '';
      this.phone = data.phone || '';
      this.organisationDescription = data.organisationDescription || '';
    }
  }

  save() {

    if (!this.organisationTitle?.trim()) return;

    this.loading = true;
    this.errorMessage = '';

    const payload = {
      title: this.organisationTitle,
      description: this.organisationDescription,
      email: this.email,
      phone: this.phone,
      user_id : localStorage.getItem('user')
    };

    this.http.post('http://127.0.0.1:5000/api/organisation', payload, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: (res: any) => {
        this.loading = false;

        if (res?.success) {
          // ✅ close dialog with created org
          this.dialogRef.close(res.data);
        } else {
          this.errorMessage = res.message || 'Failed to create organisation';
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Something went wrong';
      }
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}