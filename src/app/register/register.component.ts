import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonSpinner,
  ToastController,
} from '@ionic/angular';
import { AuthService } from '../auth/auth.service';

const notWhitespaceOnly: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim().length > 0
    ? null
    : { whitespaceOnly: true };

const requiresSpecialCharacter: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && /[^\p{L}\p{N}\s]/u.test(control.value)
    ? null
    : { specialCharacter: true };

@Component({
  selector: 'app-register',
  standalone: true,
  templateUrl: './register.component.html',
  styleUrl: '../login/login.component.scss',
  imports: [
    ReactiveFormsModule, RouterLink, IonButton, IonContent, IonInput, IonItem, IonLabel, IonSpinner,
  ],
})
export class RegisterComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly isConfigured = this.auth.isConfigured;
  readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, notWhitespaceOnly, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [
      Validators.required,
      notWhitespaceOnly,
      Validators.minLength(8),
      requiresSpecialCharacter,
    ]],
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
      const { fullName, email, password } = this.form.getRawValue();
      await this.auth.signUp(email.trim(), password, fullName.trim());
      await this.showToast('Cuenta creada correctamente.', 'success');
      await this.router.navigate(['/tabs/home']);
    } catch (error: unknown) {
      console.error('Error crudo de Supabase:', error);
      await this.showRegistrationError(this.rawErrorMessage(error));
    } finally {
      this.isLoading = false;
    }
  }

  private rawErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const { message } = error;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    return 'Ocurrió un error desconocido al crear la cuenta.';
  }

  private async showToast(message: string, color: 'danger' | 'success'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 4000,
      position: 'top',
      color,
    });
    await toast.present();
  }

  private async showRegistrationError(message: string): Promise<void> {
    const alert = await this.alertController.create({
      header: 'No se pudo crear la cuenta',
      message,
      buttons: ['Entendido'],
    });
    await alert.present();
  }
}
