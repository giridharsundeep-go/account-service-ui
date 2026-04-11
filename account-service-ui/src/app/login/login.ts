import { Component } from '@angular/core';
import { CommonModule } from '@angular/common'; // ✅ FIX
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors
} from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../auth.service';

/* ===== VALIDATOR ===== */
function emailOrPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;

  if (!value) return null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[0-9]{10}$/;

  return (emailRegex.test(value) || phoneRegex.test(value))
    ? null
    : { invalidUsername: true };
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, // ✅ REQUIRED FOR *ngIf
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    HttpClientModule
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {

  loginForm: FormGroup;
  hidePassword = true;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required, emailOrPhoneValidator]],
      password: ['', [Validators.required]]
    });
  }

  get username() {
    return this.loginForm.get('username');
  }

  get password() {
    return this.loginForm.get('password');
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const payload = this.loginForm.value;

    this.http.post<any>('http://127.0.0.1:5000/api/auth/login', payload)
      .subscribe({
        next: (res) => {
          if (res?.success) {
            console.log(res)
            this.authService.setSession({
              user: res.data.user,
              token: res.data.token
            });

            sessionStorage.setItem('user', JSON.stringify(res.data.user.id));

            //this.router.navigate(['/user-home']);
            setTimeout(() => {
              this.router.navigate(['/user-home']);
            }, 1000);

          } else {
            this.errorMessage = 'Username or password does not match';
          }
        },
        error: () => {
          this.errorMessage = 'Invalid username or password';
        }
      });
  }

  goToCreateAccount() {
    this.router.navigate(['/create-account']);
  }

  goToForgotPassword() {
    this.router.navigate(['/forgot-password']);
  }
}