import { Injectable } from '@angular/core';
import { toDataURL } from 'qrcode';

export interface PetRegistrationQr {
  payload: string;
  imageDataUrl: string;
  fileName: string;
}

@Injectable({ providedIn: 'root' })
export class PetQrGeneratorService {
  async generate(name: string, breed: string, birthDate: string): Promise<PetRegistrationQr> {
    const trimmedName = name.trim();
    const trimmedBreed = breed.trim();
    if (!trimmedName || !trimmedBreed) {
      throw new Error('El nombre y la raza son obligatorios.');
    }

    const token = this.createToken();
    const payload = `pawssync://register?${new URLSearchParams({
      name: trimmedName,
      breed: trimmedBreed,
      ...(birthDate ? { birth_date: birthDate } : {}),
      token,
    }).toString()}`;
    const imageDataUrl = await toDataURL(payload, {
      errorCorrectionLevel: 'H',
      margin: 3,
      width: 500,
    });

    return {
      payload,
      imageDataUrl,
      fileName: `${this.fileName(trimmedName)}-pawssync-qr.png`,
    };
  }

  private createToken(): string {
    if (!globalThis.crypto?.getRandomValues) {
      throw new Error('Este navegador no permite generar códigos seguros. Abre la página con HTTPS.');
    }

    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return `QR_${uuid.replaceAll('-', '').toUpperCase()}`;
  }

  private fileName(name: string): string {
    const normalized = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return normalized || 'mascota';
  }
}
