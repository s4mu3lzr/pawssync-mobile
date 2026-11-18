import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { timeout } from 'rxjs';
import { SupabaseService, UpcomingPetAppointment } from '../services/supabase.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
  imports: [
    DatePipe,
    RouterLink,
    IonButton,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class NotificationsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  appointments: UpcomingPetAppointment[] = [];
  isLoading = true;
  loadError = '';
  private hasLoaded = false;

  ngOnInit(): void {
    this.loadAppointments();
  }

  ionViewWillEnter(): void {
    if (this.hasLoaded) {
      this.loadAppointments();
    }
  }

  isTodayOrTomorrow(dateValue: string): boolean {
    const appointmentDate = new Date(dateValue);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const sameDay = (first: Date, second: Date): boolean =>
      first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate();
    return sameDay(appointmentDate, today) || sameDay(appointmentDate, tomorrow);
  }

  private loadAppointments(): void {
    this.hasLoaded = true;
    this.isLoading = true;
    this.loadError = '';
    this.supabase.getUpcomingAppointmentsForCurrentUser().pipe(
      timeout({ first: 15000 }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (appointments) => {
        this.appointments = appointments;
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
      error: (error: unknown) => {
        this.loadError = error instanceof Error
          ? `No se pudieron cargar las citas: ${error.message}`
          : 'No se pudieron cargar las citas próximas.';
        this.isLoading = false;
        this.changeDetector.detectChanges();
      },
    });
  }
}
