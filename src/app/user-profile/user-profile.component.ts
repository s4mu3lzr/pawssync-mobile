import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class UserProfileComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly passwordForm = this.formBuilder.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmation: ['', [Validators.required]],
  });
  fullName = '';
  email = '';
  loadError = '';
  isLoading = true;
  isSaving = false;

  ngOnInit(): void {
    void this.loadUser();
  }

  async updatePassword(): Promise<void> {
    if (this.passwordForm.invalid || this.isSaving) {
      return;
    }
    const { password, confirmation } = this.passwordForm.getRawValue();
    if (password !== confirmation) {
      await this.showToast('Las contraseñas no coinciden.', 'danger');
      return;
    }
    this.isSaving = true;
    try {
      await this.supabase.changePassword(password ?? '');
      this.passwordForm.reset();
      await this.showToast('Contraseña actualizada correctamente.', 'success');
    } catch (error: unknown) {
      await this.showToast(this.message(error, 'No se pudo actualizar la contraseña.'), 'danger');
    } finally {
      this.isSaving = false;
      this.changeDetector.detectChanges();
    }
  }

  async signOut(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Cerrar sesión',
      message: '¿Quieres salir de tu cuenta?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar sesión', role: 'confirm' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm') {
      return;
    }
    try {
      await this.supabase.signOut();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch (error: unknown) {
      await this.showToast(this.message(error, 'No se pudo cerrar la sesión.'), 'danger');
    }
  }

  private async loadUser(): Promise<void> {
    try {
      const user = await this.supabase.getCurrentUser();
      this.fullName = user.fullName ?? 'Usuario PawsSync';
      this.email = user.email ?? '';
    } catch (error: unknown) {
      this.loadError = this.message(error, 'No se pudo cargar el perfil.');
    } finally {
      this.isLoading = false;
      this.changeDetector.detectChanges();
    }
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  private async showToast(message: string, color: 'danger' | 'success'): Promise<void> {
    const toast = await this.toastController.create({ message, color, duration: 3000, position: 'top' });
    await toast.present();
  }
}
