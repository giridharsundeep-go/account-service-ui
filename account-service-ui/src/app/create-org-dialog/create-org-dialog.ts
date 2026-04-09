import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

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

  constructor(
    private dialogRef: MatDialogRef<CreateOrgDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any
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

    this.dialogRef.close({
      organisationTitle: this.organisationTitle,
      email: this.email,
      phone: this.phone,
      organisationDescription: this.organisationDescription
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}