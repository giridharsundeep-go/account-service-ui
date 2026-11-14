import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../environment';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `<main class="verify-page"><section class="verify-card"><span class="verify-mark" [class.success]="state==='success'" [class.error]="state==='error'">{{state==='success'?'✓':state==='error'?'!':'…'}}</span><p class="eyebrow">GREATLEY POSHLEY · PASSPORT</p><h1>{{state==='success'?'Email verified':state==='error'?'This link is no longer valid':'Verifying your email…'}}</h1><p class="verify-message">{{message}}</p><a *ngIf="state==='success' && passwordSetupUrl" [href]="passwordSetupUrl" class="verify-button">Set your password</a><a *ngIf="state==='success' && !passwordSetupUrl" routerLink="/login" class="verify-button">Continue to sign in</a><a *ngIf="state==='error'" routerLink="/login" class="verify-button">Back to sign in</a></section></main>`,
  styles: [`:host{display:block;min-height:100dvh;background:#f8f9fa;color:#202124;font-family:Inter,Arial,sans-serif}.verify-page{display:grid;place-items:center;min-height:100dvh;padding:24px}.verify-card{width:min(460px,100%);padding:38px;border-radius:22px;background:white;box-shadow:0 14px 48px #172b4d12;text-align:center}.verify-mark{display:grid;place-items:center;width:54px;height:54px;margin:auto;border-radius:50%;background:#eef2f8;color:#687386;font-size:26px;font-weight:700}.verify-mark.success{background:#e6f4ea;color:#188038}.verify-mark.error{background:#fce8e6;color:#c5221f}.eyebrow{margin:22px 0 8px;color:#697386;font-size:11px;font-weight:700;letter-spacing:.12em}.verify-card h1{margin:0;font-size:27px;letter-spacing:-.04em}.verify-message{margin:12px 0 24px;color:#5f6368;font-size:14px;line-height:1.6}.verify-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:24px;background:#1a73e8;color:white;text-decoration:none;font-weight:650}`]
})
export class VerifyEmail implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  state: 'loading' | 'success' | 'error' = 'loading';
  message = 'Please wait while we confirm this email address.';
  passwordSetupUrl: string | null = null;

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const token = params.get('token');
      if (!token) { this.fail(); return; }
      this.http.post<any>(`${String(environment.apiBaseUrlM || '').replace(/\/$/, '')}/auth/email/verify`, { token }).subscribe({
        next: response => {
          this.state = 'success';
          this.passwordSetupUrl = response?.passwordSetupUrl || null;
          this.message = this.passwordSetupUrl
            ? 'Your email is confirmed. Set a password to finish activating your account.'
            : 'Your email address is confirmed. You can now return to Professy.';
        },
        error: () => this.fail()
      });
    });
  }

  private fail(): void {
    this.state = 'error';
    this.message = 'This verification link may have expired or already been used. Ask your administrator to send a new one.';
  }
}
