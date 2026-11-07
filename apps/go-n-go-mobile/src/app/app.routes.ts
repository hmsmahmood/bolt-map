import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.page').then((module) => module.HomePage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.page').then((module) => module.LoginPage),
  },
  {
    path: 'register',
    data: { mode: 'register' },
    loadComponent: () =>
      import('./features/auth/auth-flow.page').then((module) => module.AuthFlowPage),
  },
  {
    path: 'verify-email',
    data: { mode: 'verify-email' },
    loadComponent: () =>
      import('./features/auth/auth-flow.page').then((module) => module.AuthFlowPage),
  },
  {
    path: 'otp',
    data: { mode: 'otp' },
    loadComponent: () =>
      import('./features/auth/auth-flow.page').then((module) => module.AuthFlowPage),
  },
  {
    path: 'forgot-password',
    data: { mode: 'forgot-password' },
    loadComponent: () =>
      import('./features/auth/auth-flow.page').then((module) => module.AuthFlowPage),
  },
  {
    path: 'reset-password',
    data: { mode: 'reset-password' },
    loadComponent: () =>
      import('./features/auth/auth-flow.page').then((module) => module.AuthFlowPage),
  },
  {
    path: 'change-password',
    canActivate: [authGuard],
    data: { mode: 'change-password' },
    loadComponent: () =>
      import('./features/auth/auth-flow.page').then((module) => module.AuthFlowPage),
  },
  {
    path: 'security',
    canActivate: [authGuard],
    data: { mode: 'security' },
    loadComponent: () =>
      import('./features/auth/auth-flow.page').then((module) => module.AuthFlowPage),
  },
  {
    path: 'logout-confirm',
    canActivate: [authGuard],
    data: { mode: 'logout' },
    loadComponent: () =>
      import('./features/auth/auth-flow.page').then((module) => module.AuthFlowPage),
  },
  {
    path: 'vehicle-profiles',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/vehicles/vehicle-profiles.page').then(
        (module) => module.VehicleProfilesPage,
      ),
  },
  {
    path: 'map',
    loadComponent: () =>
      import('./features/map/map.page').then((module) => module.MapPage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
