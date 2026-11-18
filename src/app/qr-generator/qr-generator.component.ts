import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonItem, IonLabel } from '@ionic/angular';
import { PetQrGeneratorService, PetRegistrationQr } from './pet-qr-generator.service';

@Component({
  selector: 'app-qr-generator',
  standalone: true,
  templateUrl: './qr-generator.component.html',
  styleUrl: './qr-generator.component.scss',
  imports: [FormsModule, RouterLink, IonButton, IonContent, IonInput, IonItem, IonLabel],
})
export class QrGeneratorComponent {
  private readonly qrGenerator = inject(PetQrGeneratorService);

  name = '';
  breed = '';
  birthDate = '';
  isGenerating = false;
  errorMessage = '';
  generatedQr?: PetRegistrationQr;

  readonly maxDate = this.todayAsLocalDate();

  async generate(): Promise<void> {
    const name = this.name.trim();
    const breed = this.breed.trim();
    if (!name || !breed) {
      this.errorMessage = 'Escribe el nombre y la raza de la mascota.';
      return;
    }
    if (name.length > 80 || breed.length > 80) {
      this.errorMessage = 'El nombre y la raza no pueden superar 80 caracteres.';
      return;
    }
    if (this.birthDate && !this.isValidBirthDate(this.birthDate)) {
      this.errorMessage = 'Selecciona una fecha de nacimiento válida, que no sea futura.';
      return;
    }

    this.isGenerating = true;
    this.errorMessage = '';
    this.generatedQr = undefined;
    try {
      this.generatedQr = await this.qrGenerator.generate(name, breed, this.birthDate);
    } catch (error: unknown) {
      this.errorMessage = error instanceof Error
        ? error.message
        : 'No se pudo generar el código QR. Inténtalo nuevamente.';
    } finally {
      this.isGenerating = false;
    }
  }

  clearQr(): void {
    this.generatedQr = undefined;
    this.errorMessage = '';
  }

  private isValidBirthDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const parsedDate = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsedDate.getTime())
      && parsedDate.toISOString().slice(0, 10) === value
      && value <= this.maxDate;
  }

  private todayAsLocalDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
