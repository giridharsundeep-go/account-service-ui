import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { throwError } from 'rxjs';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-super-reg', standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule],
  templateUrl: './super-reg.html', styleUrl: './super-reg.css'
})
export class SuperReg {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly baseUrl = environment.apiBaseUrlM;
  private readonly createOrganisationEndpoint = '/auth/organisation';
  private readonly createUserEndpoint = '/auth/user/master/account/create';
  // Assumes an existing GET endpoint that resolves an organisation by slug.
  private readonly getOrganisationBySlugEndpoint = '/auth/organisation';

  private buildApiUrl(endpoint: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
  }
  currentStep = 0; isSubmitting = false; showPassword = false; showConfirmPassword = false;
  stepError = ''; submitError = ''; submitSuccess = '';

  readonly registrationForm = this.fb.group({
    organisation: this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(255)]],
      slug: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100), Validators.pattern(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/)]],
      description: ['', Validators.maxLength(5000)], email: ['', [Validators.email, Validators.maxLength(150)]],
      phone: ['', Validators.maxLength(15)], address: ['', Validators.maxLength(5000)]
    }),
    masterUser: this.fb.group({
      firstName: ['', [Validators.required, Validators.maxLength(100)]], lastName: ['', [Validators.required, Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
      phone: ['', [Validators.required, Validators.pattern(/^[+]?\d[\d\s()\-]{6,14}$/), Validators.maxLength(15)]],
      gender: ['', Validators.required], password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]], confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator })
  });

  get organisationTitle(): string { return this.registrationForm.controls.organisation.controls.title.value?.trim() ?? ''; }
  get organisationSlug(): string { return this.registrationForm.controls.organisation.controls.slug.value ?? ''; }
  fieldInvalid(path: string, code: string): boolean { const c = this.registrationForm.get(path); return !!c && c.touched && c.hasError(code); }

  normaliseSlug(): void {
    const c = this.registrationForm.controls.organisation.controls.slug;
    const value = (c.value ?? '').toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (value !== c.value) c.setValue(value, { emitEvent: false });
    this.stepError = '';
  }

  continueToAccount(): void {
    this.stepError = '';
    const organisation = this.registrationForm.controls.organisation;
    organisation.markAllAsTouched();

    if (organisation.invalid) {
      this.stepError = 'Please correct the organisation details to continue.';
      return;
    }

    // No separate slug-validation request; the create API validates uniqueness.
    this.currentStep = 1;
  }

  backToOrganisation(): void { this.currentStep = 0; this.submitError = ''; this.submitSuccess = ''; }

  submitRegistration(): void {
    this.submitError = '';
    this.submitSuccess = '';
    this.registrationForm.markAllAsTouched();

    if (this.registrationForm.invalid) {
      this.submitError = this.registrationForm.controls.masterUser.hasError('passwordMismatch')
        ? 'Passwords do not match.'
        : 'Please complete all required fields correctly.';
      return;
    }

    const v = this.registrationForm.getRawValue();
    const slug = v.organisation.slug?.trim().toLowerCase() ?? '';

    const organisationPayload = {
      title: v.organisation.title?.trim(),
      slug,
      description: v.organisation.description?.trim() || null,
      email: v.organisation.email?.trim() || null,
      phone: v.organisation.phone?.trim() || null,
      address: v.organisation.address?.trim() || null
    };

    const masterUserPayload = {
      firstName: v.masterUser.firstName?.trim(),
      lastName: v.masterUser.lastName?.trim(),
      email: v.masterUser.email?.trim().toLowerCase(),
      phone: v.masterUser.phone?.trim(),
      gender: v.masterUser.gender,
      password: v.masterUser.password
    };

    this.isSubmitting = true;
    const headers = this.auth.getAuthHeaders();

    // Try creating the organisation first. If its slug already exists,
    // resolve that existing organisation through the lookup endpoint.
    this.http.post<unknown>(
      this.buildApiUrl(this.createOrganisationEndpoint),
      organisationPayload,
      { headers }
    ).pipe(
      catchError(error => {
        const message = this.extractErrorMessage(error);
        const duplicateSlug = error?.status === 409
          && /organisation slug already exists/i.test(message);

        if (!duplicateSlug) {
          return throwError(() => error);
        }

        const lookupUrl = `${this.buildApiUrl(this.getOrganisationBySlugEndpoint)}/${encodeURIComponent(slug)}`;
        return this.http.get<unknown>(lookupUrl, { headers });
      }),
      switchMap(organisationResponse => {
        const orgId = this.extractOrganisationId(organisationResponse);

        if (orgId === null) {
          return throwError(() => new Error(
            'The organisation was created or found, but its ID was missing from the API response. The master account was not created.'
          ));
        }

        const createUserUrl = `${this.buildApiUrl(this.createUserEndpoint)}?orgId=${encodeURIComponent(orgId)}`;
        return this.http.post<{ success?: boolean; message?: string; data?: unknown }>(
          createUserUrl,
          masterUserPayload,
          { headers }
        );
      }),
      catchError(error => {
        this.submitError = this.extractErrorMessage(error);
        this.submitSuccess = '';
        return throwError(() => error);
      }),
      finalize(() => this.isSubmitting = false)
    ).subscribe({
      next: userResponse => {
        if (userResponse?.success === false) {
          this.submitError = userResponse.message
            || 'The organisation was resolved, but master-account creation failed.';
          return;
        }
        this.submitSuccess = userResponse?.message
          || 'Master account created successfully.';
      },
      error: () => {
        // Error text is assigned in catchError above.
      }
    });
  }

  private extractOrganisationId(response: unknown): string | null {
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
      const id = candidate?.id
        ?? candidate?.orgId
        ?? candidate?.org_id
        ?? candidate?.organisationId
        ?? candidate?.organizationId;

      if (id !== undefined && id !== null && String(id).trim() !== '') {
        return String(id);
      }
    }
    return null;
  }

  private extractErrorMessage(error: any): string {
    const body = error?.error;

    // Spring APIs commonly return { message: "..." }, but may also return a plain string
    // or validation details depending on the exception handler.
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
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (Array.isArray(candidate) && candidate.length) {
        const messages = candidate.map(item => {
          if (typeof item === 'string') return item;
          if (item?.defaultMessage) return item.defaultMessage;
          if (item?.message) return item.message;
          if (item?.field && item?.error) return `${item.field}: ${item.error}`;
          return '';
        }).filter(Boolean);
        if (messages.length) return messages.join(' ');
      }
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const messages = Object.entries(candidate).map(([field, value]) => {
          if (typeof value === 'string') return `${field}: ${value}`;
          if (Array.isArray(value)) return `${field}: ${value.join(', ')}`;
          return '';
        }).filter(Boolean);
        if (messages.length) return messages.join(' ');
      }
    }

    if (error?.status === 0) {
      return 'Could not reach the server. Check that the backend is running and try again.';
    }
    if (error?.status) {
      return `Request failed (HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ''}).`;
    }
    return 'Registration failed. Please try again.';
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value, confirm = control.get('confirmPassword')?.value;
    if (!password || !confirm) return null;
    return password === confirm ? null : { passwordMismatch: true };
  }
}
