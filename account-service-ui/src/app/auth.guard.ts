import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {

  private platformId = inject(PLATFORM_ID);

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  canActivate(): boolean | UrlTree {

    // ✅ On server → allow navigation (IMPORTANT)
    if (!isPlatformBrowser(this.platformId)) {
      return true;
    }

    // ✅ On browser → real check
    if (this.auth.isLoggedIn()) {
      return true;
    }

    return this.router.createUrlTree(['/login']);
  }
}