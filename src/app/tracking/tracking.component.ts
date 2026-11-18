import { ChangeDetectorRef, Component, DestroyRef, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position, WatchPositionCallback } from '@capacitor/geolocation';
import { AlertController, IonButton, IonContent, IonSelect, IonSelectOption } from '@ionic/angular';
import { interval, Subscription, throwIfEmpty, timeout } from 'rxjs';
import { LocationService } from '../services/location.service';
import { PetRecord, SupabaseService } from '../services/supabase.service';

type WalkState = 'idle' | 'running' | 'paused' | 'finished';
type RoutePoint = { latitude: number; longitude: number; timestamp: string };

@Component({
  selector: 'app-tracking',
  standalone: true,
  templateUrl: './tracking.component.html',
  styleUrl: './tracking.component.scss',
  imports: [FormsModule, IonButton, IonContent, IonSelect, IonSelectOption],
})
export class TrackingComponent implements OnInit, OnDestroy {
  private readonly alertController = inject(AlertController);
  private readonly location = inject(LocationService);
  private readonly route = inject(ActivatedRoute);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private timerSubscription?: Subscription;
  private geoWatchId?: string;
  private accumulatedMilliseconds = 0;
  private runStartedAt?: number;
  private lastAcceptedPosition?: Position;
  readonly routePoints: RoutePoint[] = [];

  pets: PetRecord[] = [];
  selectedPetIds: string[] = [];
  selectionError = '';
  loadError = '';
  gpsError = '';
  isLoading = true;
  isSaving = false;
  durationSeconds = 0;
  distanceMeters = 0;
  startTime?: string;
  state: WalkState = 'idle';

  ngOnInit(): void {
    const routePetId = this.route.snapshot.queryParamMap.get('pet_id')
      ?? this.route.snapshot.paramMap.get('pet_id');
    this.supabase.getPets().pipe(
      timeout({ first: 15000 }),
      throwIfEmpty(() => new Error('Supabase no devolvió una respuesta al consultar las mascotas.')),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (pets) => {
        this.pets = pets;
        this.selectedPetIds = routePetId && pets.some((pet) => pet.id === routePetId)
          ? [routePetId]
          : [];
        this.loadError = '';
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
      error: (error: unknown) => {
        this.pets = [];
        this.loadError = error instanceof Error
          ? `No se pudieron cargar las mascotas: ${error.message}`
          : 'No se pudieron cargar las mascotas desde Supabase.';
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.stopTimer();
    void this.stopLocationWatch().catch((error: unknown) => {
      console.error('No se pudo detener el seguimiento de ubicación al salir del paseo.', error);
    });
  }

  get formattedTime(): string {
    const hours = Math.floor(this.durationSeconds / 3600);
    const minutes = Math.floor((this.durationSeconds % 3600) / 60);
    const seconds = this.durationSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  get selectedPets(): PetRecord[] {
    return this.pets.filter((pet) => this.selectedPetIds.includes(pet.id));
  }

  get formattedDistance(): string {
    return this.distanceMeters >= 1000
      ? `${(this.distanceMeters / 1000).toFixed(2)} km`
      : `${Math.round(this.distanceMeters)} m`;
  }

  async startWalk(): Promise<void> {
    if (this.isSaving || !['idle', 'finished'].includes(this.state)) {
      return;
    }
    if (!this.selectedPetIds.length) {
      this.selectionError = 'Selecciona al menos una mascota para iniciar el paseo.';
      return;
    }

    this.selectionError = '';
    this.gpsError = '';
    try {
      if (Capacitor.isNativePlatform()) {
        let permission = await this.ngZone.run(() => Geolocation.checkPermissions());
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          permission = await this.ngZone.run(() => Geolocation.requestPermissions());
        }
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          throw new Error('Se requieren permisos de GPS/Cámara para utilizar esta función. Por favor actívalos en la configuración.');
        }
      }

      this.durationSeconds = 0;
      this.distanceMeters = 0;
      this.accumulatedMilliseconds = 0;
      this.routePoints.splice(0);
      this.lastAcceptedPosition = undefined;
      this.startTime = new Date().toISOString();
      this.state = 'running';
      await this.startLocationWatch();
      this.startTimer();
    } catch (error: unknown) {
      this.state = 'idle';
      this.gpsError = this.isPermissionError(error)
        ? 'Se requieren permisos de GPS/Cámara para utilizar esta función. Por favor actívalos en la configuración.'
        : error instanceof Error ? error.message : 'No se pudo iniciar el GPS.';
      await this.showAlert('No se pudo iniciar el paseo', this.gpsError);
    } finally {
      this.changeDetector.detectChanges();
    }
  }

  async pauseWalk(): Promise<void> {
    if (this.state !== 'running') {
      return;
    }
    this.accumulateElapsedTime();
    this.stopTimer();
    try {
      await this.stopLocationWatch();
    } catch (error: unknown) {
      this.state = 'paused';
      this.gpsError = error instanceof Error ? error.message : 'No se pudo detener el GPS.';
      this.changeDetector.detectChanges();
      await this.showAlert('Error al detener el GPS', this.gpsError);
      return;
    }
    this.state = 'paused';
    this.changeDetector.detectChanges();
  }

  async resumeWalk(): Promise<void> {
    if (this.state !== 'paused') {
      return;
    }
    try {
      this.lastAcceptedPosition = undefined;
      await this.startLocationWatch();
      this.state = 'running';
      this.startTimer();
    } catch (error: unknown) {
      this.gpsError = error instanceof Error ? error.message : 'No se pudo reanudar el GPS.';
      await this.showAlert('No se pudo reanudar el paseo', this.gpsError);
    }
    this.changeDetector.detectChanges();
  }

  async finishWalk(): Promise<void> {
    if (!this.selectedPetIds.length || !this.startTime || !['running', 'paused'].includes(this.state) || this.isSaving) {
      return;
    }

    this.accumulateElapsedTime();
    this.stopTimer();
    try {
      await this.stopLocationWatch();
    } catch (error: unknown) {
      this.state = 'paused';
      this.gpsError = error instanceof Error ? error.message : 'No se pudo detener el GPS.';
      this.changeDetector.detectChanges();
      await this.showAlert('Error al detener el GPS', this.gpsError);
      return;
    }
    this.state = 'finished';
    this.isSaving = true;
    this.changeDetector.detectChanges();

    try {
      await this.supabase.saveWalk({
        pet_ids: [...this.selectedPetIds],
        start_time: this.startTime,
        end_time: new Date().toISOString(),
        duration_seconds: this.durationSeconds,
        distance_meters: Math.round(this.distanceMeters),
        route: [...this.routePoints],
      });
      await this.showAlert(
        '¡Paseo guardado!',
        `El paseo se guardó correctamente. Duración: ${this.formattedTime}. Distancia: ${this.formattedDistance}.`,
      );
    } catch (error: unknown) {
      this.state = 'paused';
      const message = error instanceof Error ? error.message : 'Error desconocido al guardar el paseo.';
      await this.showAlert('No se pudo guardar el paseo', message);
    } finally {
      this.isSaving = false;
      this.changeDetector.detectChanges();
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.runStartedAt = Date.now();
    this.timerSubscription = interval(250).subscribe(() => {
      this.updateElapsedTime();
      this.changeDetector.detectChanges();
    });
  }

  private stopTimer(): void {
    this.timerSubscription?.unsubscribe();
    this.timerSubscription = undefined;
    this.runStartedAt = undefined;
  }

  private updateElapsedTime(): void {
    if (this.runStartedAt !== undefined) {
      this.durationSeconds = Math.floor((this.accumulatedMilliseconds + Date.now() - this.runStartedAt) / 1000);
    }
  }

  private accumulateElapsedTime(): void {
    if (this.runStartedAt !== undefined) {
      this.accumulatedMilliseconds += Date.now() - this.runStartedAt;
      this.durationSeconds = Math.floor(this.accumulatedMilliseconds / 1000);
    }
  }

  private async startLocationWatch(): Promise<void> {
    if (this.geoWatchId) {
      return;
    }
    const callback: WatchPositionCallback = (position, error) => {
      this.ngZone.run(() => {
        if (error) {
          this.gpsError = `Error de GPS: ${error.message}`;
          this.changeDetector.detectChanges();
          return;
        }
        if (position) {
          this.acceptPosition(position);
        }
      });
    };
    this.geoWatchId = await this.ngZone.run(() => Geolocation.watchPosition(
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
      callback,
    ));
  }

  private async stopLocationWatch(): Promise<void> {
    const watchId = this.geoWatchId;
    this.geoWatchId = undefined;
    if (watchId) {
      await Geolocation.clearWatch({ id: watchId });
    }
  }

  private acceptPosition(position: Position): void {
    const { latitude, longitude, accuracy } = position.coords;
    if (accuracy > 40) {
      return;
    }
    if (this.lastAcceptedPosition) {
      const elapsedSeconds = Math.max(
        (position.timestamp - this.lastAcceptedPosition.timestamp) / 1000,
        1,
      );
      const segmentMeters = this.location.calculateDistance(
        this.lastAcceptedPosition.coords.latitude,
        this.lastAcceptedPosition.coords.longitude,
        latitude,
        longitude,
      );
      if (segmentMeters / elapsedSeconds > 15) {
        return;
      }
      this.distanceMeters += segmentMeters;
    }
    this.lastAcceptedPosition = position;
    this.routePoints.push({
      latitude,
      longitude,
      timestamp: new Date(position.timestamp).toISOString(),
    });
    this.changeDetector.detectChanges();
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({ header, message, buttons: ['Entendido'] });
    await alert.present();
  }

  private isPermissionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : '';
    return /permission|denied|not authorized/i.test(message);
  }
}
