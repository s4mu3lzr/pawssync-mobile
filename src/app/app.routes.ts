import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'public/pet/:qr_token',
    loadComponent: () => import('./public-pet-profile/public-pet-profile.component').then((m) => m.PublicPetProfileComponent),
  },
  {
    path: 'pet/:token',
    loadComponent: () => import('./public-pet-profile/public-pet-profile.component').then((m) => m.PublicPetProfileComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./user-profile/user-profile.component').then((m) => m.UserProfileComponent),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () => import('./notifications/notifications.component').then((m) => m.NotificationsComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'qr-generator',
    loadComponent: () => import('./qr-generator/qr-generator.component').then((m) => m.QrGeneratorComponent),
  },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadComponent: () => import('./tabs/main-tabs.component').then((m) => m.MainTabsComponent),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'tracking',
        loadComponent: () => import('./tracking/tracking.component').then((m) => m.TrackingComponent),
      },
      {
        path: 'scanner',
        loadComponent: () => import('./qr-scanner/qr-scanner.component').then((m) => m.QrScannerComponent),
      },
      {
        path: 'advice',
        loadComponent: () => import('./pet-advice/pet-advice.component').then((m) => m.PetAdviceComponent),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  {
    path: 'pets/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pet-detail/pet-detail.component').then((m) => m.PetDetailComponent),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
