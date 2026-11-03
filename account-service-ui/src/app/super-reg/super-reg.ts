import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  catchError,
  finalize,
  switchMap
} from 'rxjs/operators';
import { throwError } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { environment } from '../../environment';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-super-reg',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule
  ],
  templateUrl: './super-reg.html',
  styleUrls: ['./super-reg.css', '../shared/field-controls.css']
})
export class SuperReg {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly baseUrl = environment.apiBaseUrlM;

  private readonly createOrganisationEndpoint = '/auth/organisation';
  private readonly createUserEndpoint =
    '/auth/user/master/account/create';

  private readonly getOrganisationBySlugEndpoint =
    '/auth/organisation';

  currentStep = 0;
  isSubmitting = false;
  showPassword = false;
  showConfirmPassword = false;

  readonly selectedPlan = 'FREE';

  stepError = '';
  submitError = '';
  submitSuccess = '';

  readonly registrationForm = this.fb.group({
    organisation: this.fb.group({
      title: [
        '',
        [
          Validators.required,
          Validators.maxLength(255)
        ]
      ],
      slug: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(100),
          Validators.pattern(
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/
          )
        ]
      ]
    }),

    masterUser: this.fb.group(
      {
        firstName: [
          '',
          [
            Validators.required,
            Validators.maxLength(100)
          ]
        ],
        lastName: [
          '',
          [
            Validators.required,
            Validators.maxLength(100)
          ]
        ],
        email: [
          '',
          [
            Validators.required,
            Validators.email,
            Validators.maxLength(150)
          ]
        ],
        phone: [
          '',
          [
            Validators.required,
            Validators.pattern(/^[+]?\d[\d\s()\-]{6,14}$/),
            Validators.maxLength(15)
          ]
        ],
        gender: ['', Validators.required],

        // This exact control name matches the backend's password field.
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(12),
            Validators.maxLength(128)
          ]
        ],

        confirmPassword: ['', Validators.required]
      },
      {
        validators: this.passwordMatchValidator
      }
    )
  });

  private buildApiUrl(endpoint: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
  }

  get organisationTitle(): string {
    return this.registrationForm.controls.organisation.controls.title
      .value?.trim() ?? '';
  }

  get organisationSlug(): string {
    return this.registrationForm.controls.organisation.controls.slug
      .value ?? '';
  }

  fieldInvalid(path: string, code: string): boolean {
    const control = this.registrationForm.get(path);
    return !!control && control.touched && control.hasError(code);
  }

  normaliseSlug(): void {
    const control =
      this.registrationForm.controls.organisation.controls.slug;

    const value = (control.value ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (value !== control.value) {
      control.setValue(value, { emitEvent: false });
    }

    this.stepError = '';
  }

  continueToAccount(): void {
    this.stepError = '';

    const organisation =
      this.registrationForm.controls.organisation;

    organisation.markAllAsTouched();

    if (organisation.invalid) {
      this.stepError =
        'Please correct the organisation details to continue.';
      return;
    }

    this.currentStep = 1;
  }

  backToOrganisation(): void {
    this.currentStep = 0;
    this.stepError = '';
    this.submitError = '';
    this.submitSuccess = '';
  }

  continueToPlan(): void {
    this.submitError = '';
    this.submitSuccess = '';

    const masterUser =
      this.registrationForm.controls.masterUser;

    masterUser.markAllAsTouched();

    if (masterUser.invalid) {
      this.submitError = masterUser.hasError('passwordMismatch')
        ? 'Passwords do not match.'
        : 'Please complete all required account details correctly.';

      return;
    }

    this.currentStep = 2;
  }

  backToAccount(): void {
    this.currentStep = 1;
    this.submitError = '';
    this.submitSuccess = '';
  }

  submitRegistration(): void {
    if (this.isSubmitting) {
      return;
    }

    this.submitError = '';
    this.submitSuccess = '';

    this.registrationForm.markAllAsTouched();

    if (this.registrationForm.invalid) {
      this.submitError =
        this.registrationForm.controls.masterUser.hasError(
          'passwordMismatch'
        )
          ? 'Passwords do not match.'
          : 'Please complete all required fields correctly.';

      return;
    }

    const formValue = this.registrationForm.getRawValue();

    const organisationTitle =
      formValue.organisation.title?.trim() ?? '';

    const slug =
      formValue.organisation.slug?.trim().toLowerCase() ?? '';

    const firstName =
      formValue.masterUser.firstName?.trim() ?? '';

    const lastName =
      formValue.masterUser.lastName?.trim() ?? '';

    const email =
      formValue.masterUser.email?.trim().toLowerCase() ?? '';

    const phone =
      formValue.masterUser.phone?.trim() ?? '';

    const gender =
      String(formValue.masterUser.gender ?? '')
        .trim()
        .toUpperCase();

    // Read the password directly from the reactive form control.
    // Do not use confirmPassword as the backend password.
    const passwordControl =
      this.registrationForm.controls.masterUser.controls.password;

    const password = String(passwordControl.getRawValue() ?? '');

    // Validate the actual values that will be sent to the backend.
    if (!password.trim()) {
      passwordControl.markAsTouched();
      this.currentStep = 1;
      this.submitError = 'Password is required.';
      return;
    }

    if (password.length < 8 || password.length > 128) {
      this.currentStep = 1;
      this.submitError =
        'Password must contain between 8 and 128 characters.';
      return;
    }

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !gender
    ) {
      this.currentStep = 1;
      this.submitError =
        'Please complete all required account details.';
      return;
    }

    if (password !== formValue.masterUser.confirmPassword) {
      this.currentStep = 1;
      this.submitError = 'Passwords do not match.';
      return;
    }

    const organisationPayload = {
      title: organisationTitle,
      slug
    };

    // IMPORTANT:
    // The property name must be "password" because the backend
    // controller reads user.getPassword().
    // Never send confirmPassword to the backend.
    const masterUserPayload = {
      firstName,
      lastName,
      email,
      phone,
      gender,
      password,
      orgRole: 'SUPER_USER'
    };

    if(password.length<12 || new TextEncoder().encode(password).length>72){this.submitError='Use a password with at least 12 characters and at most 72 bytes.';return;}
    this.isSubmitting=true;
    this.http.post<{success?:boolean;message?:string;data?:unknown}>(this.buildApiUrl('/auth/register'),{organisation:organisationPayload,user:masterUserPayload}).pipe(
      catchError(error=>{this.submitError=this.extractErrorMessage(error);this.submitSuccess='';return throwError(()=>error);}),
      finalize(()=>this.isSubmitting=false)
    )
      .subscribe({
        next: userResponse => {
          if (userResponse?.success === false) {
            this.submitError =
              userResponse.message ??
              'Master-account creation failed.';
            return;
          }

          this.submitSuccess =
            userResponse?.message ??
            'Master account created successfully.';
        },

        error: () => {
          // The error message is assigned in catchError above.
        }
      });
  }

  private extractOrganisationId(
    response: unknown
  ): string | null {
    const root = response as any;

    const candidates = [
      root?.data?.organisation,
      root?.data?.organization,
      root?.data?.org,
      root?.data,
      root?.organisation,
      root?.organization,
      root?.org,
      root
    ];

    for (const candidate of candidates) {
      const id =
        candidate?.id ??
        candidate?.orgId ??
        candidate?.org_id ??
        candidate?.organisationId ??
        candidate?.organizationId;

      if (
        id !== undefined &&
        id !== null &&
        String(id).trim() !== ''
      ) {
        return String(id);
      }
    }

    return null;
  }

  private extractErrorMessage(error: any): string {
    const body = error?.error;

    const candidates = [
      body?.message,
      body?.detail,
      body?.errorDescription,
      body?.errors,
      body?.fieldErrors,
      typeof body === 'string' ? body : null,
      error?.message
    ];

    for (const candidate of candidates) {
      if (
        typeof candidate === 'string' &&
        candidate.trim()
      ) {
        return candidate.trim();
      }

      if (Array.isArray(candidate) && candidate.length) {
        const messages = candidate
          .map(item => {
            if (typeof item === 'string') {
              return item;
            }

            if (item?.defaultMessage) {
              return item.defaultMessage;
            }

            if (item?.message) {
              return item.message;
            }

            if (item?.field && item?.error) {
              return `${item.field}: ${item.error}`;
            }

            return '';
          })
          .filter(Boolean);

        if (messages.length) {
          return messages.join(' ');
        }
      }

      if (
        candidate &&
        typeof candidate === 'object' &&
        !Array.isArray(candidate)
      ) {
        const messages = Object.entries(candidate)
          .map(([field, value]) => {
            if (typeof value === 'string') {
              return `${field}: ${value}`;
            }

            if (Array.isArray(value)) {
              return `${field}: ${value.join(', ')}`;
            }

            return '';
          })
          .filter(Boolean);

        if (messages.length) {
          return messages.join(' ');
        }
      }
    }

    if (error?.status === 0) {
      return (
        'Could not reach the server. ' +
        'Check that the backend is running and try again.'
      );
    }

    if (error?.status) {
      return (
        `Request failed (HTTP ${error.status}` +
        `${error.statusText ? ` ${error.statusText}` : ''}).`
      );
    }

    return 'Registration failed. Please try again.';
  }

  private passwordMatchValidator(
    control: AbstractControl
  ): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;

    if (!password || !confirm) {
      return null;
    }

    return password === confirm
      ? null
      : { passwordMismatch: true };
  }
}