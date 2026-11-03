import { Component, OnInit, PLATFORM_ID, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { SuiteAuth } from '@greatley-poshley/suite';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements OnInit {
  private platform = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private identity = new SuiteAuth('professy');
  busy = false;
  error = '';

  ngOnInit(): void {
    if (isPlatformBrowser(this.platform)) void this.signIn();
  }

  async signIn(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.identity.signIn();
    } catch {
      this.error = 'Unable to open shared sign-in. Please try again.';
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
