import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private authSubscription?: Subscription;

  ngOnInit(): void {
    if (!this.auth.isConfigured) {
      return;
    }

    this.authSubscription = this.auth.authStateChanges().subscribe(({ event }) => {
      if (event === 'SIGNED_OUT' && this.isProtectedRoute(this.router.url)) {
        void this.router.navigateByUrl('/login');
      }
    });

    void this.restoreSession();
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private async restoreSession(): Promise<void> {
    try {
      const session = await this.auth.getSession();
      if (session && (this.router.url === '/' || this.router.url.startsWith('/login'))) {
        await this.router.navigateByUrl('/tabs/home');
      }
    } catch (error: unknown) {
      console.error('No se pudo restaurar la sesión de Supabase.', error);
    }
  }

  private isProtectedRoute(url: string): boolean {
    return url.startsWith('/tabs') || url.startsWith('/pets/') || url.startsWith('/profile');
  }
}
