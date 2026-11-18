import { AsyncPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, NgZone, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { IonButton, IonCard, IonCardContent, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { notificationsOutline } from 'ionicons/icons';
import { BehaviorSubject, catchError, finalize, forkJoin, map, of, throwIfEmpty, timeout } from 'rxjs';
import { PetRecord, SupabaseService, UpcomingPetAppointment, WalkHistoryRecord } from '../services/supabase.service';
import { WidgetSyncService } from '../services/widget-sync.service';

interface HomePet {
  id: string;
  name: string;
  breed: string;
  age: string;
  photoUrl: string | null;
  weight: string;
  emoji: string;
  color: 'mint' | 'blue';
  walk: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  imports: [AsyncPipe, DecimalPipe, RouterLink, IonButton, IonCard, IonCardContent, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar],
})
export class HomeComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly widgetSync = inject(WidgetSyncService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  readonly pets$ = new BehaviorSubject<HomePet[]>([]);
  loadError = '';
  isLoading = true;
  weatherLoading = true;
  weatherMessage = 'Consultando el clima de tu zona…';
  weatherTemperature?: number;
  weatherIcon = '⛅';
  weatherWarning = false;
  weatherCity = '';
  weatherError = '';
  private widgetAppointment = 'Sin citas próximas';
  private widgetWalk = 'Sin paseos registrados';
  private hasEntered = false;

  constructor() {
    addIcons({ notificationsOutline });
  }

  ngOnInit(): void {
    this.loadPets();
    void this.loadWeather();
  }

  ionViewWillEnter(): void {
    if (this.hasEntered) {
      this.loadPets();
    }
    this.hasEntered = true;
  }

  private loadPets(): void {
    this.isLoading = true;
    this.supabase.getPets().pipe(
      timeout({ first: 15000 }),
      throwIfEmpty(() => new Error('Supabase no devolvió una respuesta al consultar las mascotas.')),
      map((pets) => pets.map((pet, index) => this.toHomePet(pet, index))),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.isLoading = false;
      }),
    ).subscribe({
      next: (pets) => {
        this.pets$.next(pets);
        this.loadError = '';
        this.isLoading = false;
        this.loadUpcomingAppointments();
        this.loadLatestWalk(pets);
        this.syncWidgetData();
        this.changeDetector.detectChanges();
      },
      error: (error: unknown) => {
        this.loadError = error instanceof Error
          ? `No se pudieron cargar las mascotas: ${error.message}`
          : 'No se pudieron cargar las mascotas desde Supabase.';
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
    });
  }

  private toHomePet(pet: PetRecord, index: number): HomePet {
    return {
      id: pet.id,
      name: pet.name,
      breed: pet.breed ?? 'Raza no especificada',
      age: this.calculateAge(pet.birth_date),
      photoUrl: pet.photo_url,
      weight: '—',
      emoji: '🐶',
      color: index % 2 === 0 ? 'mint' : 'blue',
      walk: 'Sin paseo programado',
    };
  }

  private calculateAge(birthDate: string | null): string {
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

  private async loadWeather(): Promise<void> {
    this.weatherLoading = true;
    this.weatherError = '';
    try {
      if (Capacitor.isNativePlatform()) {
        let permission = await this.ngZone.run(() => Geolocation.checkPermissions());
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          permission = await this.ngZone.run(() => Geolocation.requestPermissions());
        }
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          throw new Error('Permite el acceso a la ubicación para consultar el clima local.');
        }
      }

      const position = await this.ngZone.run(() =>
        Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 12000 }),
      );
      const { latitude, longitude } = position.coords;
      this.ngZone.run(() => {
        this.weatherCity = 'Ubicación actual';
        this.changeDetector.detectChanges();
      });
      const weatherResponse = await this.fetchWeather(latitude, longitude);
      let locationName = '';
      try {
        locationName = await this.fetchCityName(latitude, longitude);
      } catch (error: unknown) {
        console.error('No se pudo obtener el nombre de la ciudad.', error);
        this.weatherError = 'No se pudo identificar la ciudad actual.';
      }
      if (!weatherResponse.ok) {
        throw new Error(`Open-Meteo respondió con estado ${weatherResponse.status}.`);
      }
      const data = await weatherResponse.json() as {
        current_weather?: { temperature?: number; weathercode?: number };
      };
      const current = data.current_weather;
      if (
        typeof current?.temperature !== 'number' ||
        typeof current.weathercode !== 'number'
      ) {
        throw new Error('La respuesta del clima no contiene datos actuales válidos.');
      }
      const temperature = current.temperature;
      const weatherCode = current.weathercode;
      this.ngZone.run(() => {
        this.weatherCity = locationName || 'Ubicación actual';
        this.weatherTemperature = temperature;
        this.weatherIcon = this.weatherSymbol(weatherCode);
        this.weatherWarning = temperature > 28 || this.isRainCode(weatherCode);
        this.weatherMessage = this.walkAdvice(temperature, weatherCode);
        this.weatherLoading = false;
        this.syncWidgetData();
        this.changeDetector.detectChanges();
      });
    } catch (error: unknown) {
      this.ngZone.run(() => {
        this.weatherError = error instanceof Error ? error.message : 'No se pudo consultar el clima.';
        this.weatherMessage = 'No hay datos del clima disponibles.';
        this.weatherLoading = false;
        this.syncWidgetData();
        this.changeDetector.detectChanges();
      });
    }
  }

  private loadUpcomingAppointments(): void {
    this.supabase.getNextAppointmentForCurrentUser().pipe(
      timeout({ first: 15000 }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (appointment) => {
        this.widgetAppointment = this.formatWidgetAppointment(appointment ?? undefined);
        this.syncWidgetData();
      },
      error: (error: unknown) => {
        console.error('No se pudieron cargar las citas para el widget de PawsSync.', error);
        this.widgetAppointment = 'Citas no disponibles';
        this.syncWidgetData();
      },
    });
  }

  private loadLatestWalk(pets: HomePet[]): void {
    if (pets.length === 0) {
      this.widgetWalk = 'Sin paseos registrados';
      this.syncWidgetData();
      return;
    }

    forkJoin(pets.map((pet) =>
      this.supabase.getPetWalkHistory(pet.id).pipe(
        catchError((error: unknown) => {
          console.error(`No se pudo cargar el historial de paseos de ${pet.name}.`, error);
          return of([] as WalkHistoryRecord[]);
        }),
      ),
    )).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((histories) => {
      const latestWalk = histories
        .flat()
        .filter((walk) => Number.isFinite(Date.parse(walk.start_time)))
        .sort((first, second) => Date.parse(second.start_time) - Date.parse(first.start_time))[0];
      this.widgetWalk = this.formatWidgetWalk(latestWalk);
      this.syncWidgetData();
    });
  }

  private formatWidgetAppointment(appointment?: UpcomingPetAppointment): string {
    if (!appointment) {
      return 'Sin citas próximas';
    }

    const date = new Date(appointment.appointment_date);
    if (Number.isNaN(date.getTime())) {
      return 'Cita próxima';
    }
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const sameDay = (first: Date, second: Date): boolean =>
      first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate();
    const dayLabel = sameDay(date, today)
      ? 'Hoy'
      : sameDay(date, tomorrow)
        ? 'Mañana'
        : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(date);
    const timeLabel = new Intl.DateTimeFormat('es-MX', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
    const reason = appointment.title || appointment.description || 'Cita médica';
    return `🩺 ${appointment.pet_name}: ${reason} • ${dayLabel} ${timeLabel}`;
  }

  private formatWidgetWalk(walk?: WalkHistoryRecord): string {
    if (!walk) {
      return 'Sin paseos registrados';
    }
    if (typeof walk.distance_meters !== 'number' || !Number.isFinite(walk.distance_meters)) {
      return 'Último paseo registrado';
    }
    const distance = walk.distance_meters >= 1000
      ? `${(walk.distance_meters / 1000).toFixed(1)} km`
      : `${Math.round(walk.distance_meters)} m`;
    return `Último paseo · ${distance}`;
  }

  private syncWidgetData(): void {
    const advice = this.weatherTemperature === undefined
      ? 'Clima no disponible'
      : this.widgetWeatherAdvice(this.weatherTemperature, this.weatherMessage);
    void this.widgetSync.sync({
      weather: {
        city: this.weatherCity || 'Tu zona',
        temperature: this.weatherTemperature ?? null,
        icon: this.weatherIcon,
        advice,
      },
      appointment: this.widgetAppointment,
      walk: this.widgetWalk,
    }).catch((error: unknown) => {
      console.error('No se pudieron sincronizar los datos del widget de PawsSync.', error);
    });
  }

  private widgetWeatherAdvice(temperature: number, message: string): string {
    if (message.includes('lloviendo')) {
      return 'Lluvia; mejor pasear después';
    }
    if (temperature > 28) {
      return 'Calor peligroso para sus patitas';
    }
    if (temperature <= 5) {
      return 'Frío; mejor un paseo corto';
    }
    return 'Pavimento seguro para pasear';
  }

  private async fetchWeather(latitude: number, longitude: number): Promise<Response> {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current_weather: 'true',
      }).toString();
      return fetch(url);
  }

  private async fetchCityName(latitude: number, longitude: number): Promise<string> {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: 'es',
    }).toString();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`La geocodificación inversa respondió con estado ${response.status}.`);
    }
    const data = await response.json() as {
      locality?: string;
      city?: string;
      principalSubdivision?: string;
    };
    const locality = data.locality?.trim() || data.city?.trim();
    if (!locality) {
      throw new Error('No se pudo identificar la ciudad o localidad actual.');
    }
    return data.principalSubdivision
      ? `${locality}, ${data.principalSubdivision}`
      : locality;
  }

  evaluateWalkWeatherAdvice(tempC: number, weatherCode: number): string {
    if (Number.isNaN(tempC) || Number.isNaN(weatherCode)) {
      throw new Error('Error: Datos meteorológicos inválidos (NaN).');
    }
    if (this.isRainCode(weatherCode)) {
      return '¡Está lloviendo! No salgas ahora; mejor quédense en casa para evitar que se enferme o se ensucie.';
    }
    if (tempC > 28) {
      return '¡Hace mucho calor! No salgas ahora; el pavimento caliente puede lastimar las patitas de tu perro.';
    }
    if (tempC <= 5) {
      return '¡Hace frío extremo! Abriga a tu mascota y realiza un paseo corto para proteger su salud.';
    }
    return '¡El clima está perfecto! 🐕🌳 Es un gran momento para salir a pasear.';
  }

  private walkAdvice(temperature: number, weatherCode: number): string {
    return this.evaluateWalkWeatherAdvice(temperature, weatherCode);
  }

  private isRainCode(code: number): boolean {
    return (
      [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code) ||
      [95, 96, 99].includes(code)
    );
  }

  private weatherSymbol(code: number): string {
    if ([95, 96, 99].includes(code)) {
      return '⛈️';
    }
    if (this.isRainCode(code)) {
      return '🌧️';
    }
    if ([0, 1].includes(code)) {
      return '☀️';
    }
    if ([2, 3, 45, 48].includes(code)) {
      return '⛅';
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return '❄️';
    }
    return '🌤️';
  }
}
