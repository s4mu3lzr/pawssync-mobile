import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';
import { WidgetSyncService } from '../services/widget-sync.service';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: {
            getPets: () => of([{
              id: 'pet-uuid',
              name: 'Luna',
              breed: 'Mestiza',
              birth_date: '2020-06-01',
              photo_url: null,
              address: null,
              contact_phone: null,
              is_linked: true,
              created_at: '2026-01-01T00:00:00Z',
            }]),
            getNextAppointmentForCurrentUser: () => of(null),
            getPetWalkHistory: () => of([]),
          },
        },
        {
          provide: WidgetSyncService,
          useValue: { sync: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
  });

  it('loads and displays pets returned by Supabase rather than demo pets', () => {
    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('Luna');
    expect(pageText).not.toContain('Morita');
    expect(pageText).not.toContain('Darla');
  });

  it('warns for heat above 28 degrees and rain', () => {
    const home = fixture.componentInstance;

    expect(home['walkAdvice'](29, 0)).toContain('¡Hace mucho calor!');
    expect(home['walkAdvice'](28, 0)).toContain('¡El clima está perfecto!');
    expect(home['walkAdvice'](20, 61)).toContain('¡Está lloviendo!');
  });

  it('resolves the city using the CORS-friendly reverse geocoding endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locality: 'Querétaro',
        principalSubdivision: 'Querétaro',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fixture.componentInstance['fetchCityName'](20.5888, -100.3899))
      .resolves.toBe('Querétaro, Querétaro');
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.bigdatacloud.net/data/reverse-geocode-client');
  });
});
