import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private platformId = inject(PLATFORM_ID);

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  isLoggedIn(): boolean {

    // ✅ Prevent SSR crash
    if (!this.isBrowser()) {
      return false;
    }

    const token = localStorage.getItem('token');
    const expiry = localStorage.getItem('expiry');

    if (!token || !expiry) return false;

    if (new Date().getTime() > +expiry) {
      this.logout();
      return false;
    }

    return true;
  }

  setSession(data: { user: any; token: string }) {
    if (!this.isBrowser()) return;

    const expiry = new Date().getTime() + (15 * 60 * 1000);

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('expiry', expiry.toString());
  }

  logout() {
    if (!this.isBrowser()) return;

    localStorage.clear();
  }
}