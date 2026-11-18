import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular';
import { timeout } from 'rxjs';
import { PublicPetProfile as PetProfile, SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-public-pet-profile',
  standalone: true,
  templateUrl: './public-pet-profile.component.html',
  styleUrl: './public-pet-profile.component.scss',
  imports: [IonButton, IonContent, IonSpinner],
})
export class PublicPetProfileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  pet?: PetProfile;
  isLoading = true;
  error = '';

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('qr_token')?.trim()
      ?? this.route.snapshot.paramMap.get('token')?.trim();
    if (!token) {
      this.error = 'El enlace no incluye un código válido.';
      this.isLoading = false;
      return;
    }
    this.supabase.getPublicPetByQrToken(token).pipe(
      timeout({ first: 12000 }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (pet) => {
        this.pet = pet ?? undefined;
        if (!pet) {
          this.error = 'No encontramos una mascota registrada con este código.';
        }
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
      error: (error: unknown) => {
        this.error = error instanceof Error ? error.message : 'No se pudo consultar el perfil público.';
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
    });
  }

  get telephoneLink(): string | null {
    const phone = this.pet?.contact_phone?.trim();
    return phone ? `tel:${phone.replace(/[^\d+*#,;]/g, '')}` : null;
  }

  get ageLabel(): string {
    const birthDate = this.pet?.birth_date;
    if (!birthDate) {
      return 'Edad no especificada';
    }
    const birth = new Date(`${birthDate}T00:00:00`);
    if (Number.isNaN(birth.getTime()) || birth.getTime() > Date.now()) {
      return 'Edad no especificada';
    }
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
    ) {
      years--;
    }
    return years === 1 ? '1 año' : `${years} años`;
  }
}
