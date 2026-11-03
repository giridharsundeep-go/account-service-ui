import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpHeaders } from '@angular/common/http';


@Injectable({ providedIn: 'root' })
export class AuthService {

  private platformId = inject(PLATFORM_ID);
  readonly sessionRevision = signal(0);

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
    const changed = localStorage.getItem('token') !== data.token;

    let expiry=Date.now()+15*60*1000;
    try { const claims=JSON.parse(atob(data.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));expiry=Number(claims.exp)*1000; } catch {}

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('expiry', expiry.toString());
    if (changed) this.sessionRevision.update(value => value + 1);
  }

  logout() {
    if (!this.isBrowser()) return;

    for (const key of ['token','user','currentUser','expiry']) localStorage.removeItem(key);
    sessionStorage.removeItem('user');
    this.sessionRevision.update(value => value + 1);
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.isBrowser() ? localStorage.getItem('token') : null;

    return new HttpHeaders({
      Authorization: `Bearer ${token ?? ''}`
    });
  }

  getCurrentUser(): any | null {
    if (!this.isBrowser()) return null;
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  updateCurrentUser(user:any):void{if(this.isBrowser()&&user?.id)localStorage.setItem('user',JSON.stringify(user));}

  isAdmin(): boolean {
    const user=this.getCurrentUser();if(user?.orgRole)return user.orgRole==='SUPER_USER';
    try {return JSON.parse(atob((localStorage.getItem('token')||'').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).orgRole==='SUPER_USER';}catch{return false;}
  }

  getCurrentUserId(): number | null {
    if (!this.isBrowser()) return null;

    const candidates = [
      localStorage.getItem('user'),
      localStorage.getItem('currentUser'),
      sessionStorage.getItem('user')
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      let parsed: any = candidate;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        // Older sessions may store the numeric ID as an unquoted string.
      }

      const rawId = typeof parsed === 'object' && parsed !== null
        ? parsed.id ?? parsed.userId ?? parsed.user_id ?? parsed.userAccountId ?? parsed.user_account_id
        : parsed;
      const id = Number(rawId);
      if (Number.isSafeInteger(id) && id > 0) return id;
    }

    return null;
  }

}
