import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonSpinner, ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  imports: [
    ReactiveFormsModule, RouterLink, IonButton, IonContent, IonInput, IonItem, IonLabel, IonSpinner,
  ],
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toastController = inject(ToastController);

  readonly isConfigured = this.auth.isConfigured;
  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });
  isLoading = false;
  showPassword = false;

  get configurationMessage(): string {
    return this.isConfigured
      ? ''
      : 'Configura una URL de Supabase y una clave publishable/anon. No uses claves secretas en la app.';
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.isLoading || !this.isConfigured) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email.trim(), password);
      await this.router.navigateByUrl(this.safeReturnUrl());
    } catch (error: unknown) {
      await this.showToast(this.authError(error), 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/tabs/home';
  }

  private authError(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'No se pudo iniciar sesión. Comprueba tu conexión e inténtalo de nuevo.';
    }
    if (error.message.includes('Invalid login credentials')) {
      return 'Credenciales incorrectas. Verifica el correo y la contraseña.';
    }
    if (error.message.includes('Email not confirmed')) {
      return 'Confirma tu correo desde el enlace que te enviamos antes de iniciar sesión.';
    }
    if (error.message.includes('fetch') || error.message.includes('Network')) {
      return 'No se pudo conectar con Supabase. Revisa tu conexión a Internet.';
    }
    return error.message;
  }

  private async showToast(message: string, color: 'danger' | 'success'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3500,
      position: 'top',
      color,
    });
    await toast.present();
  }
}
