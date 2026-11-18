import { Injectable } from '@angular/core';
import { AuthChangeEvent, createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { from, map, Observable, of, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

export type PetRecord = {
  id: string;
  name: string;
  breed: string | null;
  birth_date: string | null;
  photo_url: string | null;
  address: string | null;
  contact_phone: string | null;
  qr_token?: string;
  is_linked: boolean;
  created_at: string;
}

export type WalkInsert = {
  start_time: string;
  end_time: string;
  duration_seconds: number;
  distance_meters: number;
  route: Array<{ latitude: number; longitude: number; timestamp: string }>;
  pet_ids: string[];
}

export type WalkHistoryRecord = {
  id: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  route: unknown;
}

export type PetNote = {
  id: string;
  pet_id: string;
  note_text: string;
  created_at: string;
}

export type PetAppointment = {
  id: string;
  pet_id: string;
  title: string;
  appointment_date: string;
  description: string | null;
  created_at: string;
}

export type UpcomingPetAppointment = PetAppointment & {
  pet_name: string;
}

export type PetNoteInsert = Pick<PetNote, 'pet_id' | 'note_text'>;
export type PetAppointmentInsert = Pick<PetAppointment, 'pet_id' | 'title' | 'appointment_date'> &
  Pick<PetAppointment, 'description'>;

type PetLinkResult = {
  id: string;
  name: string;
  breed: string | null;
  birth_date: string | null;
  photo_url: string | null;
  address: string | null;
  contact_phone: string | null;
  is_linked: boolean;
}

export type NewPetQrData = {
  name: string;
  breed: string;
  birth_date: string | null;
  address: string | null;
  contact_phone: string | null;
  qr_token: string;
}

interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string | null; created_at: string };
        Insert: { id: string; full_name?: string | null; created_at?: string };
        Update: { full_name?: string | null };
        Relationships: [];
      };
      pets: {
        Row: Omit<PetRecord, 'qr_token'> & { owner_id: string | null; qr_token: string; age?: number | null };
        Insert: {
          id?: string;
          owner_id?: string | null;
          name: string;
          breed?: string | null;
          age?: number | null;
          birth_date?: string | null;
          photo_url?: string | null;
          address?: string | null;
          contact_phone?: string | null;
          qr_token: string;
          is_linked?: boolean;
          created_at?: string;
        };
        Update: {
          owner_id?: string | null;
          name?: string;
          breed?: string | null;
          age?: number | null;
          birth_date?: string | null;
          photo_url?: string | null;
          address?: string | null;
          contact_phone?: string | null;
          qr_token?: string;
          is_linked?: boolean;
        };
        Relationships: [];
      };
      walks: {
        Row: {
          id: string;
          pet_id: string | null;
          start_time: string;
          end_time: string | null;
          duration_seconds: number | null;
          distance_meters: number | null;
          route: unknown;
          created_at: string;
        };
        Insert: Omit<WalkInsert, 'pet_ids'> & { pet_id?: string | null; id?: string; created_at?: string };
        Update: Partial<Omit<WalkInsert, 'pet_ids'>> & { pet_id?: string | null };
        Relationships: [];
      };
      walk_pets: {
        Row: { walk_id: string; pet_id: string; created_at: string };
        Insert: { walk_id: string; pet_id: string; created_at?: string };
        Update: Partial<{ walk_id: string; pet_id: string }>;
        Relationships: [];
      };
      pet_notes: {
        Row: PetNote;
        Insert: PetNoteInsert & { id?: string; created_at?: string };
        Update: Partial<PetNoteInsert>;
        Relationships: [];
      };
      pet_appointments: {
        Row: PetAppointment;
        Insert: PetAppointmentInsert & { id?: string; created_at?: string };
        Update: Partial<PetAppointmentInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      link_pet_by_qr: {
        Args: { p_qr_token: string };
        Returns: PetLinkResult[];
      };
      register_pet_from_qr: {
        Args: {
          p_name: string;
          p_breed: string;
          p_birth_date: string | null;
          p_address: string | null;
          p_contact_phone: string | null;
          p_qr_token: string;
        };
        Returns: PetLinkResult[];
      };
      save_walk_with_pets: {
        Args: {
          p_start_time: string;
          p_end_time: string;
          p_duration_seconds: number;
          p_distance_meters: number;
          p_route: unknown;
          p_pet_ids: string[];
        };
        Returns: string;
      };
      get_pet_walk_history: {
        Args: { p_pet_id: string };
        Returns: WalkHistoryRecord[];
      };
      get_public_pet_by_qr_token: {
        Args: { p_qr_token: string };
        Returns: PublicPetProfile[];
      };
      update_pet_profile: {
        Args: {
          p_pet_id: string;
          p_birth_date: string | null;
          p_address: string | null;
          p_contact_phone: string | null;
        };
        Returns: PetRecord[];
      };
      update_pet_photo: {
        Args: { p_pet_id: string; p_photo_url: string };
        Returns: PetRecord[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type PublicPetProfile = Pick<
  PetRecord,
  'name' | 'birth_date' | 'photo_url' | 'address' | 'contact_phone'
>;
export type PetProfileUpdate = Pick<PetRecord, 'birth_date' | 'address' | 'contact_phone'>;

const PET_COLUMNS = 'id, name, breed, birth_date, photo_url, address, contact_phone, is_linked, created_at';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private clientInstance?: SupabaseClient<Database>;

  get isConfigured(): boolean {
    const key = environment.SUPABASE_KEY;
    const isBrowserSafeKey = key.startsWith('sb_publishable_') || this.isLegacyAnonKey(key);
    return Boolean(
      environment.SUPABASE_URL.startsWith('https://') &&
      environment.SUPABASE_URL.endsWith('.supabase.co') &&
      isBrowserSafeKey,
    );
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }

  async signUp(email: string, password: string, fullName: string): Promise<Session> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) {
      throw error;
    }
    if (!data.session) {
      throw new Error(
        'Supabase creó la cuenta, pero no devolvió una sesión. Verifica que la confirmación por correo esté desactivada.',
      );
    }
    return data.session;
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      throw error;
    }
    return data.session;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      throw error;
    }
  }

  async getCurrentUser(): Promise<{ id: string; email: string | undefined; fullName: string | undefined }> {
    const { data, error } = await this.client.auth.getUser();
    if (error) {
      throw error;
    }
    if (!data.user) {
      throw new Error('No hay una sesión activa.');
    }
    const fullName = data.user.user_metadata['full_name'];
    return {
      id: data.user.id,
      email: data.user.email,
      fullName: typeof fullName === 'string' ? fullName : undefined,
    };
  }

  async changePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) {
      throw error;
    }
  }

  authStateChanges(): Observable<{ event: AuthChangeEvent; session: Session | null }> {
    return new Observable((subscriber) => {
      const { data } = this.client.auth.onAuthStateChange((event, session) => {
        subscriber.next({ event, session });
      });
      return () => data.subscription.unsubscribe();
    });
  }

  getPets(): Observable<PetRecord[]> {
    return from(this.authenticatedUserId()).pipe(
      switchMap((ownerId) =>
        from(
          this.client
            .from('pets')
            .select(PET_COLUMNS)
            .eq('owner_id', ownerId)
            .eq('is_linked', true)
            .order('created_at', { ascending: true }),
        ),
      ),
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data ?? [];
      }),
    );
  }

  getPetById(id: string): Observable<PetRecord | null> {
    return from(this.authenticatedUserId()).pipe(
      switchMap((ownerId) =>
        from(
          this.client
            .from('pets')
            .select(PET_COLUMNS)
            .eq('owner_id', ownerId)
            .eq('id', id)
            .maybeSingle(),
        ),
      ),
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data;
      }),
    );
  }

  linkPetByQr(qrToken: string): Observable<PetLinkResult> {
    return from(this.client.rpc('link_pet_by_qr', { p_qr_token: qrToken })).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        const pet = data?.[0];
        if (!pet) {
          throw new Error('La base de datos no devolvió la mascota vinculada.');
        }
        return pet;
      }),
    );
  }

  async linkPetByQrToken(rawQrData: string | null | undefined): Promise<{
    status: 200;
    message: string;
    pet: { id: string; name: string; qr_token: string; owner_id: string; is_linked: boolean };
  }> {
    const cleanToken = (rawQrData ?? '').trim().replace(/^https?:\/\/[^/]+\/pet\//i, '');

    if (!cleanToken || cleanToken.length < 6) {
      throw new Error('400 Bad Request: El token QR está vacío o es demasiado corto.');
    }

    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (sessionError || !currentUserId) {
      throw new Error('401 Unauthorized: Usuario sin sesión activa.');
    }

    const { data: existingPet, error: fetchError } = await this.client
      .from('pets')
      .select('id, name, qr_token, owner_id, is_linked')
      .eq('qr_token', cleanToken)
      .maybeSingle();

    if (fetchError || !existingPet) {
      throw new Error('404 Not Found: El token QR no existe en la tabla pets.');
    }

    if (existingPet.owner_id !== null && existingPet.owner_id !== currentUserId) {
      throw new Error('409 Conflict: La mascota ya tiene otro owner_id asignado.');
    }

    const { data: updatedPet, error: updateError } = await this.client
      .from('pets')
      .update({ owner_id: currentUserId, is_linked: true })
      .eq('id', existingPet.id)
      .select('id, name, qr_token, owner_id, is_linked')
      .single();

    if (updateError || !updatedPet) {
      throw new Error('500 Internal Server Error: No se pudo actualizar la vinculación de la mascota.');
    }

    return {
      status: 200,
      message: 'Mascota vinculada exitosamente.',
      pet: {
        id: updatedPet.id,
        name: updatedPet.name,
        qr_token: updatedPet.qr_token,
        owner_id: updatedPet.owner_id ?? currentUserId,
        is_linked: updatedPet.is_linked,
      },
    };
  }

  registerPetFromQr(pet: NewPetQrData): Observable<PetLinkResult> {
    return from(this.client.rpc('register_pet_from_qr', {
      p_name: pet.name,
      p_breed: pet.breed,
      p_birth_date: pet.birth_date,
      p_address: pet.address,
      p_contact_phone: pet.contact_phone,
      p_qr_token: pet.qr_token,
    })).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        const registeredPet = data?.[0];
        if (!registeredPet) {
          throw new Error('Supabase no devolvió la mascota registrada.');
        }
        return registeredPet;
      }),
    );
  }

  async saveWalk(walkData: WalkInsert): Promise<void> {
    const { pet_ids: petIds, ...walk } = walkData;
    const { error } = await this.client.rpc('save_walk_with_pets', {
      p_start_time: walk.start_time,
      p_end_time: walk.end_time,
      p_duration_seconds: walk.duration_seconds,
      p_distance_meters: walk.distance_meters,
      p_route: walk.route,
      p_pet_ids: petIds,
    });
    if (error) {
      throw error;
    }
  }

  async updatePetProfile(petId: string, update: PetProfileUpdate): Promise<PetRecord> {
    const { data, error } = await this.client.rpc('update_pet_profile', {
      p_pet_id: petId,
      p_birth_date: update.birth_date,
      p_address: update.address,
      p_contact_phone: update.contact_phone,
    });
    if (error) {
      throw error;
    }
    const pet = data[0];
    if (!pet) {
      throw new Error('No se pudo actualizar el perfil de la mascota.');
    }
    return pet;
  }

  async uploadPetPhoto(petId: string, file: Blob, contentType: string): Promise<PetRecord> {
    const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const filePath = `${petId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await this.client.storage
      .from('pet_photos')
      .upload(filePath, file, { contentType, upsert: false });
    if (uploadError) {
      throw new Error(`Storage rechazó la subida de la imagen: ${uploadError.message}`);
    }
    const { data } = this.client.storage.from('pet_photos').getPublicUrl(filePath);
    try {
      return await this.updatePetPhoto(petId, data.publicUrl);
    } catch (error: unknown) {
      const { error: cleanupError } = await this.client.storage.from('pet_photos').remove([filePath]);
      if (cleanupError) {
        console.error('No se pudo limpiar la foto subida tras fallar la actualización del perfil.', cleanupError);
      }
      const reason = error instanceof Error ? error.message : 'Error desconocido';
      throw new Error(`La imagen se subió, pero no se pudo actualizar pets.photo_url: ${reason}`);
    }
  }

  getPetWalkHistory(petId: string): Observable<WalkHistoryRecord[]> {
    return from(this.client.rpc('get_pet_walk_history', { p_pet_id: petId })).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data ?? [];
      }),
    );
  }

  getPublicPetByQrToken(token: string): Observable<PublicPetProfile | null> {
    return from(this.client.rpc('get_public_pet_by_qr_token', { p_qr_token: token })).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data[0] ?? null;
      }),
    );
  }

  private async updatePetPhoto(petId: string, photoUrl: string): Promise<PetRecord> {
    const { data, error } = await this.client.rpc('update_pet_photo', {
      p_pet_id: petId,
      p_photo_url: photoUrl,
    });
    if (error) {
      throw error;
    }
    const pet = data[0];
    if (!pet) {
      throw new Error('No se pudo guardar la foto en el perfil de la mascota.');
    }
    return pet;
  }

  getPetNotes(petId: string): Observable<PetNote[]> {
    return from(
      this.client
        .from('pet_notes')
        .select('id, pet_id, note_text, created_at')
        .eq('pet_id', petId)
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data ?? [];
      }),
    );
  }

  async addPetNote(petId: string, noteText: string): Promise<PetNote> {
    const { data, error } = await this.client
      .from('pet_notes')
      .insert({ pet_id: petId, note_text: noteText.trim() })
      .select('id, pet_id, note_text, created_at')
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

  getUpcomingPetAppointments(petId: string): Observable<PetAppointment[]> {
    return from(
      this.client
        .from('pet_appointments')
        .select('id, pet_id, title, appointment_date, description, created_at')
        .eq('pet_id', petId)
        .gte('appointment_date', new Date().toISOString())
        .order('appointment_date', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data ?? [];
      }),
    );
  }

  getUpcomingAppointmentsForCurrentUser(): Observable<UpcomingPetAppointment[]> {
    const now = new Date();
    const endOfWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return from(this.authenticatedUserId()).pipe(
      switchMap((ownerId) =>
        from(
          this.client
            .from('pets')
            .select('id, name')
            .eq('owner_id', ownerId),
        ),
      ),
      switchMap(({ data: pets, error }) => {
        if (error) {
          throw error;
        }
        if (!pets?.length) {
          return of([]);
        }
        const petNames = new Map(pets.map((pet) => [pet.id, pet.name]));
        return from(
          this.client
            .from('pet_appointments')
            .select('id, pet_id, title, appointment_date, description, created_at')
            .in('pet_id', pets.map((pet) => pet.id))
            .gte('appointment_date', now.toISOString())
            .lte('appointment_date', endOfWindow.toISOString())
            .order('appointment_date', { ascending: true }),
        ).pipe(
          map(({ data, error: appointmentError }) => {
            if (appointmentError) {
              throw appointmentError;
            }
            return (data ?? []).map((appointment) => ({
              ...appointment,
              pet_name: petNames.get(appointment.pet_id) ?? 'Mascota',
            }));
          }),
        );
      }),
    );
  }

  getNextAppointmentForCurrentUser(): Observable<UpcomingPetAppointment | null> {
    const now = new Date();
    return from(this.authenticatedUserId()).pipe(
      switchMap((ownerId) =>
        from(
          this.client
            .from('pets')
            .select('id, name')
            .eq('owner_id', ownerId),
        ),
      ),
      switchMap(({ data: pets, error }) => {
        if (error) {
          throw error;
        }
        if (!pets?.length) {
          return of(null);
        }
        const petNames = new Map(pets.map((pet) => [pet.id, pet.name]));
        return from(
          this.client
            .from('pet_appointments')
            .select('id, pet_id, title, appointment_date, description, created_at')
            .in('pet_id', pets.map((pet) => pet.id))
            .gte('appointment_date', now.toISOString())
            .order('appointment_date', { ascending: true })
            .limit(1),
        ).pipe(
          map(({ data, error: appointmentError }) => {
            if (appointmentError) {
              throw appointmentError;
            }
            const appointment = data?.[0];
            return appointment
              ? { ...appointment, pet_name: petNames.get(appointment.pet_id) ?? 'Mascota' }
              : null;
          }),
        );
      }),
    );
  }

  async addPetAppointment(
    appointment: PetAppointmentInsert,
  ): Promise<PetAppointment> {
    const { data, error } = await this.client
      .from('pet_appointments')
      .insert(appointment)
      .select('id, pet_id, title, appointment_date, description, created_at')
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

  private async authenticatedUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error) {
      throw error;
    }
    if (!data.user) {
      throw new Error('La sesión expiró. Inicia sesión nuevamente.');
    }
    return data.user.id;
  }

  private get client(): SupabaseClient<Database> {
    if (!this.isConfigured) {
      throw new Error(
        'Supabase no está configurado. Define SUPABASE_URL y SUPABASE_KEY en src/environments.',
      );
    }

    this.clientInstance ??= createClient<Database>(
      environment.SUPABASE_URL,
      environment.SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    );
    return this.clientInstance;
  }

  private isLegacyAnonKey(key: string): boolean {
    if (!key.startsWith('eyJ')) {
      return false;
    }
    try {
      const encodedPayload = key.split('.')[1];
      const payload = JSON.parse(atob(encodedPayload)) as { role?: unknown };
      return payload.role === 'anon';
    } catch {
      return false;
    }
  }
}
