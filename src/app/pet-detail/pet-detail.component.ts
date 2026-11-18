import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, NgZone, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  AlertController,
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonDatetime,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { finalize, forkJoin, timeout } from 'rxjs';
import {
  PetAppointment,
  PetNote,
  PetRecord,
  PetProfileUpdate,
  SupabaseService,
  WalkHistoryRecord,
} from '../services/supabase.service';

@Component({
  selector: 'app-pet-detail',
  standalone: true,
  templateUrl: './pet-detail.component.html',
  styleUrl: './pet-detail.component.scss',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonDatetime,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
})
export class PetDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);

  @ViewChild('cropStage') private cropStage?: ElementRef<HTMLDivElement>;
  pet?: PetRecord;
  notes: PetNote[] = [];
  appointments: PetAppointment[] = [];
  walkHistory: WalkHistoryRecord[] = [];
  isLoading = true;
  isSavingNote = false;
  isSavingAppointment = false;
  isSavingProfile = false;
  isChangingPhoto = false;
  isCropperOpen = false;
  isAppointmentFormVisible = false;
  pendingPhotoDataUrl = '';
  cropZoom = 1;
  cropOffsetX = 0;
  cropOffsetY = 0;
  cropImageWidth = 0;
  cropImageHeight = 0;
  private cropNaturalWidth = 0;
  private cropNaturalHeight = 0;
  private cropPointer?: { id: number; x: number; y: number };
  loadError = '';
  noteText = '';
  appointmentTitle = '';
  appointmentDescription = '';
  appointmentDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  readonly minimumAppointmentDate = new Date().toISOString();
  readonly profileForm = this.formBuilder.group({
    birth_date: [''],
    address: ['', [Validators.maxLength(500)]],
    contact_phone: ['', [
      Validators.maxLength(40),
      Validators.pattern(/^(?=.*\d)\+?[0-9().\s-]+$/),
    ]],
  });

  ngOnInit(): void {
    const petId = this.route.snapshot.paramMap.get('id')
      ?? this.route.snapshot.paramMap.get('pet_id')
      ?? this.route.snapshot.queryParamMap.get('pet_id');
    if (!petId) {
      this.isLoading = false;
      this.loadError = 'No se indicó el identificador de la mascota.';
      return;
    }

    forkJoin({
      pet: this.supabase.getPetById(petId),
      notes: this.supabase.getPetNotes(petId),
      appointments: this.supabase.getUpcomingPetAppointments(petId),
      walkHistory: this.supabase.getPetWalkHistory(petId),
    }).pipe(
      timeout({ first: 15000 }),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.isLoading = false;
      }),
    ).subscribe({
      next: ({ pet, notes, appointments, walkHistory }) => {
        this.pet = pet ?? undefined;
        this.notes = notes;
        this.appointments = appointments;
        this.walkHistory = walkHistory;
        if (pet) {
          this.profileForm.patchValue({
            birth_date: pet.birth_date ?? '',
            address: pet.address ?? '',
            contact_phone: pet.contact_phone ?? '',
          });
        }
        if (!pet) {
          this.loadError = 'No encontramos esa mascota o no tienes permiso para verla.';
        }
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
      error: (error: unknown) => {
        this.loadError = error instanceof Error
          ? `No se pudieron cargar los datos: ${error.message}`
          : 'No se pudieron cargar los datos de la mascota.';
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
    });
  }

  get petAge(): string {
    if (!this.pet?.birth_date) {
      return 'No especificada';
    }
    const birth = new Date(`${this.pet.birth_date}T00:00:00`);
    if (Number.isNaN(birth.getTime()) || birth.getTime() > Date.now()) {
      return 'No especificada';
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

  async saveProfile(): Promise<void> {
    if (!this.pet || this.profileForm.invalid || this.isSavingProfile) {
      return;
    }
    const values = this.profileForm.getRawValue();
    const update: PetProfileUpdate = {
      birth_date: values.birth_date ? String(values.birth_date).slice(0, 10) : null,
      address: values.address?.trim() || null,
      contact_phone: values.contact_phone?.trim() || null,
    };
    if (update.birth_date && new Date(`${update.birth_date}T00:00:00`).getTime() > Date.now()) {
      await this.showToast('La fecha de nacimiento no puede estar en el futuro.', 'danger');
      return;
    }

    this.isSavingProfile = true;
    try {
      this.pet = await this.supabase.updatePetProfile(this.pet.id, update);
      this.profileForm.markAsPristine();
      await this.showToast('Perfil actualizado correctamente.', 'success');
    } catch (error: unknown) {
      await this.showToast(this.errorMessage(error, 'No se pudo actualizar el perfil.'), 'danger');
    } finally {
      this.isSavingProfile = false;
      this.changeDetector.markForCheck();
    }
  }

  async changePhoto(): Promise<void> {
    if (!this.pet || this.isChangingPhoto) {
      return;
    }
    this.isChangingPhoto = true;
    try {
      const photo = await this.ngZone.run(() => Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      }));
      if (!photo.base64String) {
        throw new Error('La cámara no devolvió los datos de la fotografía.');
      }
      this.pendingPhotoDataUrl = `data:image/${photo.format || 'jpeg'};base64,${photo.base64String}`;
      this.cropZoom = 1;
      this.cropOffsetX = 0;
      this.cropOffsetY = 0;
      this.isCropperOpen = true;
      this.ngZone.run(() => this.changeDetector.detectChanges());
    } catch (error: unknown) {
      if (!this.isPhotoPickerCancelled(error)) {
        await this.showPhotoError(this.photoErrorMessage(error));
      }
    } finally {
      this.ngZone.run(() => {
        this.isChangingPhoto = false;
        this.changeDetector.detectChanges();
      });
    }
  }

  onCropImageLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    this.cropNaturalWidth = image.naturalWidth;
    this.cropNaturalHeight = image.naturalHeight;
    this.updateCropImageSize();
  }

  setCropZoom(value: string): void {
    this.cropZoom = Number(value);
    this.updateCropImageSize();
  }

  onCropZoomChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.setCropZoom(target.value);
    }
  }

  get cropImageLeft(): number {
    const stageSize = this.cropStage?.nativeElement.clientWidth ?? 0;
    return (stageSize - this.cropImageWidth) / 2 + this.cropOffsetX;
  }

  get cropImageTop(): number {
    const stageSize = this.cropStage?.nativeElement.clientWidth ?? 0;
    return (stageSize - this.cropImageHeight) / 2 + this.cropOffsetY;
  }

  startCropDrag(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.cropPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  moveCropDrag(event: PointerEvent): void {
    if (!this.cropPointer || this.cropPointer.id !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - this.cropPointer.x;
    const deltaY = event.clientY - this.cropPointer.y;
    this.cropPointer.x = event.clientX;
    this.cropPointer.y = event.clientY;
    this.cropOffsetX += deltaX;
    this.cropOffsetY += deltaY;
    this.updateCropImageSize();
  }

  endCropDrag(event: PointerEvent): void {
    if (this.cropPointer?.id === event.pointerId) {
      this.cropPointer = undefined;
    }
  }

  cancelPhotoCrop(): void {
    if (this.isChangingPhoto) {
      return;
    }
    this.isCropperOpen = false;
    this.pendingPhotoDataUrl = '';
    this.cropPointer = undefined;
  }

  async saveCroppedPhoto(): Promise<void> {
    if (!this.pet || !this.isCropperOpen || this.isChangingPhoto || !this.cropStage) {
      return;
    }
    this.isChangingPhoto = true;
    try {
      const stageSize = this.cropStage.nativeElement.clientWidth;
      const imageScale = this.cropImageWidth / this.cropNaturalWidth;
      if (!stageSize || !imageScale || !this.cropNaturalWidth || !this.cropNaturalHeight) {
        throw new Error('No se pudo preparar el recorte. Intenta seleccionar la imagen de nuevo.');
      }
      const imageLeft = (stageSize - this.cropImageWidth) / 2 + this.cropOffsetX;
      const imageTop = (stageSize - this.cropImageHeight) / 2 + this.cropOffsetY;
      const sourceX = Math.max(0, -imageLeft / imageScale);
      const sourceY = Math.max(0, -imageTop / imageScale);
      const sourceSize = Math.min(stageSize / imageScale, this.cropNaturalWidth - sourceX, this.cropNaturalHeight - sourceY);
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const context = canvas.getContext('2d');
      const image = new Image();
      image.src = this.pendingPhotoDataUrl;
      await image.decode();
      if (!context || sourceSize <= 0) {
        throw new Error('No se pudo recortar la imagen seleccionada.');
      }
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
      const croppedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('No se pudo preparar el archivo de imagen recortado.'));
          }
        }, 'image/jpeg', 0.9);
      });
      this.pet = await this.supabase.uploadPetPhoto(this.pet.id, croppedBlob, 'image/jpeg');
      this.isCropperOpen = false;
      this.pendingPhotoDataUrl = '';
      this.ngZone.run(() => this.changeDetector.detectChanges());
      await this.showToast('Foto ajustada y guardada correctamente.', 'success');
    } catch (error: unknown) {
      await this.showPhotoError(this.errorMessage(error, 'No se pudo guardar la foto ajustada.'));
    } finally {
      this.ngZone.run(() => {
        this.isChangingPhoto = false;
        this.changeDetector.detectChanges();
      });
    }
  }

  private updateCropImageSize(): void {
    const stageSize = this.cropStage?.nativeElement.clientWidth ?? 0;
    if (!stageSize || !this.cropNaturalWidth || !this.cropNaturalHeight) {
      return;
    }
    const fitScale = Math.max(stageSize / this.cropNaturalWidth, stageSize / this.cropNaturalHeight);
    const scale = fitScale * this.cropZoom;
    this.cropImageWidth = this.cropNaturalWidth * scale;
    this.cropImageHeight = this.cropNaturalHeight * scale;
    const maxOffsetX = Math.max(0, (this.cropImageWidth - stageSize) / 2);
    const maxOffsetY = Math.max(0, (this.cropImageHeight - stageSize) / 2);
    this.cropOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, this.cropOffsetX));
    this.cropOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, this.cropOffsetY));
  }

  private isPhotoPickerCancelled(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return message.includes('cancel') || message.includes('canceled') || message.includes('cancelled');
  }

  private photoErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/permission|denied|not authorized/i.test(message)) {
      return 'Se requieren permisos de GPS/Cámara para utilizar esta función. Por favor actívalos en la configuración.';
    }
    return this.errorMessage(error, 'No se pudo actualizar la foto.');
  }

  private async showPhotoError(message: string): Promise<void> {
    const alert = await this.alertController.create({
      header: 'No se pudo cambiar la foto',
      message,
      buttons: ['Entendido'],
    });
    await alert.present();
  }

  async addNote(): Promise<void> {
    const text = this.noteText.trim();
    if (!this.pet || !text || this.isSavingNote) {
      return;
    }

    this.isSavingNote = true;
    try {
      const note = await this.supabase.addPetNote(this.pet.id, text);
      this.notes = [note, ...this.notes];
      this.noteText = '';
      this.changeDetector.markForCheck();
      await this.showToast('Nota agregada correctamente.', 'success');
    } catch (error: unknown) {
      this.changeDetector.markForCheck();
      await this.showToast(this.errorMessage(error, 'No se pudo guardar la nota.'), 'danger');
    } finally {
      this.isSavingNote = false;
      this.changeDetector.markForCheck();
    }
  }

  async addAppointment(): Promise<void> {
    const title = this.appointmentTitle.trim();
    if (!this.pet || !title || !this.appointmentDate || this.isSavingAppointment) {
      return;
    }

    const date = new Date(this.appointmentDate);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      await this.showToast('Selecciona una fecha futura para la cita.', 'danger');
      return;
    }

    this.isSavingAppointment = true;
    try {
      const appointment = await this.supabase.addPetAppointment({
        pet_id: this.pet.id,
        title,
        appointment_date: date.toISOString(),
        description: this.appointmentDescription.trim() || null,
      });
      this.appointments = [...this.appointments, appointment]
        .sort((first, second) =>
          new Date(first.appointment_date).getTime() - new Date(second.appointment_date).getTime(),
        );
      this.appointmentTitle = '';
      this.appointmentDescription = '';
      this.isAppointmentFormVisible = false;
      this.appointmentDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      this.changeDetector.markForCheck();
      await this.showToast('Cita agendada correctamente.', 'success');
    } catch (error: unknown) {
      this.changeDetector.markForCheck();
      await this.showToast(this.errorMessage(error, 'No se pudo agendar la cita.'), 'danger');
    } finally {
      this.isSavingAppointment = false;
      this.changeDetector.markForCheck();
    }
  }

  toggleAppointmentForm(): void {
    this.isAppointmentFormVisible = !this.isAppointmentFormVisible;
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  private async showToast(message: string, color: 'danger' | 'success'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'top',
      color,
    });
    await toast.present();
  }
}
