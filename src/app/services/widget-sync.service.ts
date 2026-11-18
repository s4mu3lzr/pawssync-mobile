import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export interface PawsSyncWidgetData {
  weather: {
    city: string;
    temperature: number | null;
    icon: string;
    advice: string;
  };
  appointment: string;
  walk: string;
}

@Injectable({ providedIn: 'root' })
export class WidgetSyncService {
  async sync(data: PawsSyncWidgetData): Promise<void> {
    await Preferences.set({
      key: 'pawssync_widget_data',
      value: JSON.stringify(data),
    });
  }
}
