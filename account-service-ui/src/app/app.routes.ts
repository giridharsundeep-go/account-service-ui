import { Routes } from '@angular/router';

import { UserHome } from './user-home/user-home';
import { AuthGuard } from './auth.guard';

export const routes: Routes = [

  // =========================================================
  // LOGIN
  // =========================================================

  {
    path: 'login',
    loadComponent: () =>
      import('./login/login').then(m => m.Login)
  },

  // =========================================================
  // CREATE ACCOUNT
  // =========================================================

  {
    path: 'create-account',
    loadComponent: () =>
      import('./create-account/create-account').then(m => m.CreateAccount)
  },

  // =========================================================
  // ORGANISATION
  // =========================================================

  {
    path: 'org/:id',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./organisation/organisation').then(m => m.Organisation)
  },

  // =========================================================
  // VIEWER
  //
  // IMPORTANT:
  // This must be a TOP-LEVEL route.
  //
  // /viewer/epic/2
  // /viewer/story/10
  // /viewer/task/20
  // /viewer/issue/30
  // =========================================================

  {
    path: 'viewer/:type/:id',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./viewer/viewer').then(m => m.Viewer)
  },

  // =========================================================
  // USER HOME
  // =========================================================

  {
    path: 'user-home',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./user-home/user-home').then(m => m.UserHome)
  },

  // =========================================================
  // DEFAULT
  // =========================================================

  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },

  // =========================================================
  // FALLBACK
  // =========================================================

  {
    path: '**',
    redirectTo: 'login'
  }

];