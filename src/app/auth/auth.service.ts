import { Injectable, inject } from '@angular/core';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Observable } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  get isConfigured(): boolean {
    return this.supabase.isConfigured;
  }

  signIn(email: string, password: string): Promise<void> {
    return this.supabase.signInWithPassword(email, password);
  }

  signUp(email: string, password: string, fullName: string): Promise<Session> {
    return this.supabase.signUp(email, password, fullName);
  }

  signOut(): Promise<void> {
    return this.supabase.signOut();
  }

  getSession(): Promise<Session | null> {
    return this.supabase.getSession();
  }

  authStateChanges(): Observable<{ event: AuthChangeEvent; session: Session | null }> {
    return this.supabase.authStateChanges();
  }
}
