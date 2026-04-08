import { Routes } from '@angular/router';
import { CreateAccount } from './create-account/create-account';
import { Login } from './login/login';
import { UserHome } from './user-home/user-home';
import { AuthGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login').then(m => m.Login)
  },
  {
    path: 'user-home',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./user-home/user-home').then(m => m.UserHome)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'login'
  },
  {
    path: 'organisation', 
    loadComponent: () =>
      import('./organisation/organisation').then(m => m.Organisation)
  }
];
