import { Component, NgZone, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner';
import { AlertController, IonButton, IonContent } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { NewPetQrData, SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  templateUrl: './qr-scanner.component.html',
  styleUrl: './qr-scanner.component.scss',
  imports: [IonButton, IonContent],
})
export class QrScannerComponent {
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly ngZone = inject(NgZone);

  isScanning = false;
  statusMessage = 'Apunta la cámara al código QR del collar';

  async startScan(): Promise<void> {
    if (this.isScanning) {
      return;
    }
    this.isScanning = true;
    this.statusMessage = 'Solicitando permiso para usar la cámara…';
    try {
      const hasPermission = await this.ngZone.run(() => this.ensureCameraPermission());
      if (!hasPermission) {
        const permissionMessage = 'Se requieren permisos de GPS/Cámara para utilizar esta función. Por favor actívalos en la configuración.';
        this.statusMessage = permissionMessage;
        await this.showAlert(
          'Permiso de cámara necesario',
          permissionMessage,
        );
        return;
      }

      this.statusMessage = 'Centra el código QR del collar en el visor';
      const scan = await this.ngZone.run(() => CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
        scanInstructions: 'Centra el código QR del collar dentro del visor',
      }));
      if (!scan.ScanResult.trim()) {
        this.statusMessage = 'Escaneo cancelado. Puedes volver a intentarlo.';
        return;
      }
      await this.ngZone.run(() => this.linkPetFromQr(scan.ScanResult));
    } catch (error: unknown) {
      await this.ngZone.run(async () => {
        console.error('Error Supabase:', error);
        this.statusMessage = 'No se pudo completar el escaneo.';
        await this.showAlert('No se pudo vincular la mascota', this.isPermissionError(error)
          ? 'Se requieren permisos de GPS/Cámara para utilizar esta función. Por favor actívalos en la configuración.'
          : this.errorMessage(error));
      });
    } finally {
      this.ngZone.run(() => {
        this.isScanning = false;
      });
    }
  }

  private async ensureCameraPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }
    let permission = await Camera.checkPermissions();
    if (permission.camera !== 'granted') {
      permission = await Camera.requestPermissions({ permissions: ['camera'] });
    }
    return permission.camera === 'granted';
  }

  private async linkPetFromQr(payload: string): Promise<void> {
    this.statusMessage = 'Código detectado. Validando con PawsSync…';
    const newPetData = this.parseNewPetQr(payload);
    if (newPetData) {
      await this.confirmAndRegisterPet(newPetData);
      return;
    }
    const token = this.extractQrToken(payload);
    const pet = await firstValueFrom(this.supabase.linkPetByQr(token));
    const alert = await this.alertController.create({
      header: '¡Mascota vinculada!',
      message: `${pet.name} quedó vinculada correctamente.`,
      buttons: [{ text: 'Ver perfil', role: 'confirm' }],
      backdropDismiss: false,
    });
    await alert.present();
    await alert.onDidDismiss();
    await this.router.navigateByUrl(`/pets/${encodeURIComponent(pet.id)}`);
  }

  private async confirmAndRegisterPet(petData: NewPetQrData): Promise<void> {
    const confirmation = await this.alertController.create({
      header: 'Registrar mascota',
      message: `Se creará ${petData.name}, ${petData.breed}${petData.birth_date ? `, nacida el ${petData.birth_date}` : ''}, y se vinculará a tu cuenta. Se precargarán la dirección y el teléfono incluidos en el QR; la foto quedará vacía para que la agregues después. No se guardará nada hasta que confirmes.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Crear y vincular', role: 'confirm' },
      ],
      backdropDismiss: false,
    });
    await confirmation.present();
    if ((await confirmation.onDidDismiss()).role !== 'confirm') {
      this.statusMessage = 'Registro cancelado. No se guardaron cambios.';
      return;
    }

    this.statusMessage = 'Creando la mascota en Supabase…';
    const pet = await firstValueFrom(this.supabase.registerPetFromQr(petData));
    const alert = await this.alertController.create({
      header: '¡Mascota creada!',
      message: `${pet.name} se guardó en la base de datos y quedó vinculada a tu cuenta.`,
      buttons: [{ text: 'Ver perfil', role: 'confirm' }],
      backdropDismiss: false,
    });
    await alert.present();
    await alert.onDidDismiss();
    await this.router.navigateByUrl(`/pets/${encodeURIComponent(pet.id)}`);
  }

  private extractQrToken(payload: string): string {
    if (payload.startsWith('pawssync://register?')) {
      throw new Error('El QR de registro no contiene datos válidos.');
    }
    let url: URL;
    try {
      url = new URL(payload.trim());
    } catch {
      throw new Error('El QR debe contener el enlace público de una mascota.');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('El formato del QR no es válido. Escanea el enlace https://…/pet/TOKEN.');
    }
    const pathParts = url.pathname.split('/').filter(Boolean);
    const petSegmentIndex = pathParts.lastIndexOf('pet');
    const token = petSegmentIndex >= 0 ? pathParts[petSegmentIndex + 1]?.trim() : '';
    if (!token || pathParts.length !== petSegmentIndex + 2) {
      throw new Error('El enlace QR no contiene un token válido de mascota.');
    }
    return decodeURIComponent(token);
  }

  private parseNewPetQr(payload: string): NewPetQrData | null {
    let url: URL;
    try {
      url = new URL(payload.trim());
    } catch {
      return null;
    }
    if (url.protocol !== 'pawssync:' || url.hostname !== 'register') {
      return null;
    }

    const name = url.searchParams.get('name')?.trim() ?? '';
    const breed = url.searchParams.get('breed')?.trim() ?? '';
    const birthDate = url.searchParams.get('birth_date')?.trim() ?? '';
    const address = url.searchParams.get('address')?.trim() ?? '';
    const contactPhone = url.searchParams.get('contact_phone')?.trim() ?? '';
    const qrToken = url.searchParams.get('token')?.trim() ?? '';
    if (!name || !breed || !qrToken || (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate))) {
      throw new Error('El QR de registro debe incluir nombre, raza y token; la fecha de nacimiento es opcional.');
    }
    if (birthDate) {
      const parsedBirthDate = new Date(`${birthDate}T00:00:00`);
      if (
        Number.isNaN(parsedBirthDate.getTime()) ||
        parsedBirthDate.toISOString().slice(0, 10) !== birthDate ||
        parsedBirthDate.getTime() > Date.now()
      ) {
        throw new Error('La fecha de nacimiento del QR no es válida.');
      }
    }
    return {
      name,
      breed,
      birth_date: birthDate || null,
      address: address || null,
      contact_phone: contactPhone || null,
      qr_token: qrToken,
    };
  }

  private errorMessage(error: unknown): string {
    const message = this.supabaseErrorMessage(error);
    if (message.includes('Could not find the function') || message.includes('schema cache')) {
      return 'Supabase aún no tiene registrada la función register_pet_from_qr. Ejecuta supabase/feature-upgrade.sql en el SQL Editor y vuelve a escanear el QR.';
    }
    if (message.includes('Este token QR ya fue utilizado')) {
      return 'Este QR ya fue usado para crear una mascota. No se realizaron cambios.';
    }
    if (message.includes('registrar una mascota')) {
      return 'Inicia sesión de nuevo para autorizar la creación de la mascota.';
    }
    if (message.includes('vinculada a otra cuenta')) {
      return 'Esta mascota ya está vinculada a una cuenta. Si crees que es un error, contacta con soporte.';
    }
    if (message.includes('QR no registrado')) {
      return 'Este token no existe en la tabla pets de Supabase. Registra la mascota con ese qr_token e inténtalo de nuevo.';
    }
    if (message.includes('QR inválido') || message.includes('no corresponde')) {
      return 'Este token QR no corresponde a una mascota registrada. Verifica que el token exista en Supabase.';
    }
    if (message.includes('iniciar sesión')) {
      return 'Tu sesión no está activa. Inicia sesión e inténtalo nuevamente.';
    }
    if (message.includes('fetch') || message.includes('Network')) {
      return 'No se pudo conectar con Supabase. Comprueba tu conexión e inténtalo otra vez.';
    }
    return message ? `Error al vincular: ${message}` : 'Ocurrió un error inesperado al escanear el código.';
  }

  private supabaseErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = error.message;
      return typeof message === 'string' ? message : '';
    }
    return '';
  }

  private isPermissionError(error: unknown): boolean {
    return /permission|denied|not authorized/i.test(this.supabaseErrorMessage(error));
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({ header, message, buttons: ['Entendido'] });
    await alert.present();
  }
}
