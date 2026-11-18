import { Preferences } from '@capacitor/preferences';
import { WidgetSyncService } from './widget-sync.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn().mockResolvedValue(undefined) },
}));

describe('WidgetSyncService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the widget payload in Capacitor Preferences', async () => {
    const setSpy = vi.mocked(Preferences.set);
    setSpy.mockClear();
    const payload = {
      weather: {
        city: 'Querétaro',
        temperature: 22,
        icon: '☀️',
        advice: 'Pavimento seguro para pasear',
      },
      appointment: '🩺 Morita: Vacuna Anual • Mañana 10:00 AM',
      walk: 'Último paseo · 1.2 km',
    };

    await new WidgetSyncService().sync(payload);

    expect(setSpy).toHaveBeenCalledWith({
      key: 'pawssync_widget_data',
      value: JSON.stringify(payload),
    });
  });
});
