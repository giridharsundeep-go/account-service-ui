import { Component } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors
} from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';

import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { ReactiveFormsModule } from '@angular/forms';
import { MatOption } from '@angular/material/select';

/* ===== VALIDATORS ===== */

// Phone
function phoneValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (!value) return { required: true };

  return /^[0-9]{10}$/.test(value)
    ? null
    : { invalidPhone: true };
}

// Strong Password
function strongPasswordValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (!value) return { required: true };

  const regex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{6,}$/;
  return regex.test(value) ? null : { weakPassword: true };
}

// Match Password
function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const pass = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;

  return pass === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-create-account',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule, 
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    ReactiveFormsModule,
    MatOption
  ],
  templateUrl: './create-account.html',
  styleUrls: ['./create-account.css'],
})
export class CreateAccount {

  signupForm: FormGroup;

  hidePassword = true;
  hideConfirm = true;

  loading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private http: HttpClient
  ) {

    this.signupForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [phoneValidator]],
      gender: ['', Validators.required],
      password: ['', [strongPasswordValidator]],
      confirmPassword: ['']
    }, { validators: passwordMatchValidator });
  }

  onSubmit() {
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const form = this.signupForm.value;

    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      gender: form.gender,
      password: form.password
    };

    this.http.post<any>('http://127.0.0.1:5000/api/auth/create-account', payload)
      .subscribe({
        next: (res) => {
          this.loading = false;

          if (res?.success) {
            this.router.navigate(['/']);
          } else {
            this.errorMessage = res?.message || 'Account creation failed';
          }
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err?.error?.message || 'Server error. Try again.';
        }
      });
  }

  goToLogin() {
    this.router.navigate(['/']);
  }
}