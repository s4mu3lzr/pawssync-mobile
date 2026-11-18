import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { HomeComponent } from './home/home.component';
import { LocationService } from './services/location.service';
import { SupabaseService } from './services/supabase.service';

/**
 * PRÁCTICA 11 — AUDITORÍA DE CAJA BLANCA (White-Box Testing)
 * Proyecto: PawsSync V3.0
 *
 * Objetivo: Evaluar cobertura de instrucciones (Statement), decisiones/ramas (Branch),
 * condiciones (Condition), valores límite (Boundary Value) y manejo de excepciones
 * sobre los 3 métodos críticos de negocio:
 *   1. calculateHaversineDistance(lat1, lon1, lat2, lon2)
 *   2. evaluateWalkWeatherAdvice(tempC, weatherCode)
 *   3. linkPetByQrToken(rawQrData)
 */
describe('Práctica 11 - Auditoría de Caja Blanca (PawsSync V3.0)', () => {
  // =========================================================================
  // 1. AUDITORÍA DE CAJA BLANCA: calculateHaversineDistance(lat1, lon1, lat2, lon2)
  // =========================================================================
  describe('1. LocationService.calculateHaversineDistance(lat1, lon1, lat2, lon2)', () => {
    let locationService: LocationService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [LocationService],
      });
      locationService = TestBed.inject(LocationService);
    });

    it('[Camino Nominal] debe calcular la distancia geodésica correcta para coordenadas válidas', () => {
      // 1 grado de longitud en el ecuador equivale aproximadamente a 111,195 metros
      const distanceEquator = locationService.calculateHaversineDistance(0, 0, 0, 1);
      expect(distanceEquator).toBeCloseTo(111_195, 0);

      // Distancia entre CDMX (Zócalo) y Querétaro (Centro) ~ 183.7 km
      const distanceCdmxToQro = locationService.calculateHaversineDistance(
        19.4326,
        -99.1332,
        20.5888,
        -100.3899,
      );
      expect(distanceCdmxToQro).toBeGreaterThan(180_000);
      expect(distanceCdmxToQro).toBeLessThan(190_000);
    });

    it('[Caso Límite] debe retornar exactamente 0 cuando las coordenadas de origen y destino son iguales', () => {
      const distance = locationService.calculateHaversineDistance(
        20.5888,
        -100.3899,
        20.5888,
        -100.3899,
      );
      expect(distance).toBe(0);
    });

    it('[Caso Límite] debe aceptar valores exactamente en las fronteras geográficas (±90 lat, ±180 lon)', () => {
      const poleToPole = locationService.calculateHaversineDistance(-90, -180, 90, 180);
      expect(poleToPole).toBeGreaterThan(20_000_000);
    });

    it('[Excepción - Null/NaN] debe lanzar un error cuando alguna coordenada es null, undefined o NaN', () => {
      expect(() => locationService.calculateHaversineDistance(null, -100, 20, -100))
        .toThrowError(/coordenadas no pueden ser null, undefined o NaN/i);
      expect(() => locationService.calculateHaversineDistance(20, null, 20, -100))
        .toThrowError(/coordenadas no pueden ser null, undefined o NaN/i);
      expect(() => locationService.calculateHaversineDistance(20, -100, undefined, -100))
        .toThrowError(/coordenadas no pueden ser null, undefined o NaN/i);
      expect(() => locationService.calculateHaversineDistance(20, -100, 20, Number.NaN))
        .toThrowError(/coordenadas no pueden ser null, undefined o NaN/i);
    });

    it('[Excepción - Fuera de Rango] debe lanzar un error cuando lat > 90, lat < -90, lon > 180 o lon < -180', () => {
      // Latitud fuera de rango (> 90 y < -90)
      expect(() => locationService.calculateHaversineDistance(90.001, 0, 0, 0))
        .toThrowError(/rangos geográficos/i);
      expect(() => locationService.calculateHaversineDistance(0, 0, -91, 0))
        .toThrowError(/rangos geográficos/i);

      // Longitud fuera de rango (> 180 y < -180)
      expect(() => locationService.calculateHaversineDistance(0, 180.5, 0, 0))
        .toThrowError(/rangos geográficos/i);
      expect(() => locationService.calculateHaversineDistance(0, 0, 0, -181))
        .toThrowError(/rangos geográficos/i);
    });
  });

  // =========================================================================
  // 2. AUDITORÍA DE CAJA BLANCA: evaluateWalkWeatherAdvice(tempC, weatherCode)
  // =========================================================================
  describe('2. HomeComponent.evaluateWalkWeatherAdvice(tempC, weatherCode)', () => {
    let homeComponent: HomeComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          provideRouter([]),
          {
            provide: SupabaseService,
            useValue: {
              getPets: () => of([]),
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      homeComponent = fixture.componentInstance;
    });

    it('[Rama Lluvia] debe advertir no salir cuando está lloviendo (weatherCode = 61)', () => {
      const advice = homeComponent.evaluateWalkWeatherAdvice(20, 61);
      expect(advice).toContain('¡Está lloviendo!');
      expect(advice).toContain('mejor quédense en casa');
    });

    it('[Rama Calor Peligroso] debe advertir riesgo para las patitas cuando tempC > 28 (tempC = 29)', () => {
      const advice = homeComponent.evaluateWalkWeatherAdvice(29, 0);
      expect(advice).toContain('¡Hace mucho calor!');
      expect(advice).toContain('pavimento caliente puede lastimar las patitas');
    });

    it('[Caso Límite Exacto] debe permitir el paseo cuando tempC es exactamente 28 °C y el cielo está despejado', () => {
      const advice = homeComponent.evaluateWalkWeatherAdvice(28, 0);
      expect(advice).toContain('¡El clima está perfecto!');
    });

    it('[Rama Frío Extremo] debe recomendar abrigar a la mascota y paseo corto cuando tempC <= 5 (tempC = 3)', () => {
      const advice = homeComponent.evaluateWalkWeatherAdvice(3, 0);
      expect(advice).toContain('¡Hace frío extremo!');
      expect(advice).toContain('Abriga a tu mascota');
    });

    it('[Rama Nominal - Clima Despejado] debe indicar clima perfecto con temperatura templada y weatherCode = 0', () => {
      const advice = homeComponent.evaluateWalkWeatherAdvice(22, 0);
      expect(advice).toBe('¡El clima está perfecto! 🐕🌳 Es un gran momento para salir a pasear.');
    });

    it('[Excepción - NaN] debe lanzar un error cuando tempC o weatherCode es NaN', () => {
      expect(() => homeComponent.evaluateWalkWeatherAdvice(Number.NaN, 0))
        .toThrowError(/Datos meteorológicos inválidos \(NaN\)/i);
      expect(() => homeComponent.evaluateWalkWeatherAdvice(22, Number.NaN))
        .toThrowError(/Datos meteorológicos inválidos \(NaN\)/i);
    });
  });

  // =========================================================================
  // 3. AUDITORÍA DE CAJA BLANCA: linkPetByQrToken(rawQrData) con Mock/Spy Supabase
  // =========================================================================
  describe('3. SupabaseService.linkPetByQrToken(rawQrData)', () => {
    let supabaseService: SupabaseService;
    let getSessionSpy: ReturnType<typeof vi.fn>;
    let fromSpy: ReturnType<typeof vi.fn>;
    let maybeSingleSpy: ReturnType<typeof vi.fn>;
    let singleSpy: ReturnType<typeof vi.fn>;
    let updateSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [SupabaseService],
      });
      supabaseService = TestBed.inject(SupabaseService);

      getSessionSpy = vi.fn();
      maybeSingleSpy = vi.fn();
      singleSpy = vi.fn();
      updateSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: singleSpy,
          }),
        }),
      });

      fromSpy = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: maybeSingleSpy,
          }),
        }),
        update: updateSpy,
      });

      // Inyectamos el Mock/Spy del cliente de Supabase para aislar la base de datos
      vi.spyOn(supabaseService as unknown as { client: unknown }, 'client', 'get').mockReturnValue({
        auth: {
          getSession: getSessionSpy,
        },
        from: fromSpy,
      });
    });

    it('[Excepción 400] debe rechazar un token QR vacío, solo espacios o demasiado corto (< 6 caracteres)', async () => {
      await expect(supabaseService.linkPetByQrToken(''))
        .rejects.toThrowError(/400 Bad Request/i);
      await expect(supabaseService.linkPetByQrToken('   '))
        .rejects.toThrowError(/400 Bad Request/i);
      await expect(supabaseService.linkPetByQrToken(null))
        .rejects.toThrowError(/400 Bad Request/i);
      await expect(supabaseService.linkPetByQrToken('QR123'))
        .rejects.toThrowError(/400 Bad Request/i);

      expect(getSessionSpy).not.toHaveBeenCalled();
    });

    it('[Excepción 401] debe lanzar error 401 cuando el usuario no tiene una sesión activa en Supabase', async () => {
      getSessionSpy.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(supabaseService.linkPetByQrToken('QR_MORITA_12345'))
        .rejects.toThrowError(/401 Unauthorized: Usuario sin sesión activa/i);

      expect(getSessionSpy).toHaveBeenCalledTimes(1);
      expect(fromSpy).not.toHaveBeenCalled();
    });

    it('[Excepción 404] debe lanzar error 404 cuando el token QR no existe en la tabla pets', async () => {
      getSessionSpy.mockResolvedValue({
        data: { session: { user: { id: 'user-owner-001' } } },
        error: null,
      });
      maybeSingleSpy.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(supabaseService.linkPetByQrToken('QR_INEXISTENTE_999'))
        .rejects.toThrowError(/404 Not Found: El token QR no existe en la tabla pets/i);

      expect(fromSpy).toHaveBeenCalledWith('pets');
      expect(maybeSingleSpy).toHaveBeenCalledTimes(1);
    });

    it('[Excepción 409] debe lanzar conflicto 409 cuando la mascota ya tiene otro owner_id asignado', async () => {
      getSessionSpy.mockResolvedValue({
        data: { session: { user: { id: 'user-actual-001' } } },
        error: null,
      });
      maybeSingleSpy.mockResolvedValue({
        data: {
          id: 'pet-uuid-001',
          name: 'Morita',
          qr_token: 'QR_MORITA_12345',
          owner_id: 'otro-owner-distinto-999',
          is_linked: true,
        },
        error: null,
      });

      await expect(supabaseService.linkPetByQrToken('QR_MORITA_12345'))
        .rejects.toThrowError(/409 Conflict: La mascota ya tiene otro owner_id asignado/i);

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('[Excepción 500] debe lanzar error 500 si falla la actualización de vinculación en Supabase', async () => {
      getSessionSpy.mockResolvedValue({
        data: { session: { user: { id: 'user-actual-001' } } },
        error: null,
      });
      maybeSingleSpy.mockResolvedValue({
        data: {
          id: 'pet-uuid-001',
          name: 'Morita',
          qr_token: 'QR_MORITA_12345',
          owner_id: null,
          is_linked: false,
        },
        error: null,
      });
      singleSpy.mockResolvedValue({
        data: null,
        error: new Error('DB update failed'),
      });

      await expect(supabaseService.linkPetByQrToken('QR_MORITA_12345'))
        .rejects.toThrowError(/500 Internal Server Error/i);
    });

    it('[Camino Nominal 200] debe vincular exitosamente la mascota cuando el token es válido y está disponible', async () => {
      getSessionSpy.mockResolvedValue({
        data: { session: { user: { id: 'user-actual-001' } } },
        error: null,
      });
      maybeSingleSpy.mockResolvedValue({
        data: {
          id: 'pet-uuid-001',
          name: 'Morita',
          qr_token: 'QR_MORITA_12345',
          owner_id: null,
          is_linked: false,
        },
        error: null,
      });
      singleSpy.mockResolvedValue({
        data: {
          id: 'pet-uuid-001',
          name: 'Morita',
          qr_token: 'QR_MORITA_12345',
          owner_id: 'user-actual-001',
          is_linked: true,
        },
        error: null,
      });

      const result = await supabaseService.linkPetByQrToken('https://pawssync.app/pet/QR_MORITA_12345');

      expect(result.status).toBe(200);
      expect(result.message).toContain('vinculada exitosamente');
      expect(result.pet).toEqual({
        id: 'pet-uuid-001',
        name: 'Morita',
        qr_token: 'QR_MORITA_12345',
        owner_id: 'user-actual-001',
        is_linked: true,
      });
      expect(updateSpy).toHaveBeenCalledWith({
        owner_id: 'user-actual-001',
        is_linked: true,
      });
    });
  });
});

