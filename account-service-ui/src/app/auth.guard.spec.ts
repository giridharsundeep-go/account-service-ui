import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  it('allows server rendering without requiring a browser session', () => {
    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: AuthService, useValue: { isLoggedIn: () => false } },
        { provide: Router, useValue: { createUrlTree: vi.fn() } },
      ],
    });

    expect(TestBed.inject(AuthGuard).canActivate()).toBe(true);
    TestBed.resetTestingModule();
  });

  it('sends an unauthenticated browser session to login', () => {
    const loginTree = {} as UrlTree;
    const createUrlTree = vi.fn(() => loginTree);
    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { isLoggedIn: () => false } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });

    expect(TestBed.inject(AuthGuard).canActivate()).toBe(loginTree);
    expect(createUrlTree).toHaveBeenCalledWith(['/login']);
    TestBed.resetTestingModule();
  });

  it('allows a logged-in browser session', () => {
    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { isLoggedIn: () => true } },
        { provide: Router, useValue: { createUrlTree: vi.fn() } },
      ],
    });

    expect(TestBed.inject(AuthGuard).canActivate()).toBe(true);
    TestBed.resetTestingModule();
  });
});
