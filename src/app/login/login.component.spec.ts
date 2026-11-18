import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: {
            isConfigured: true,
            signInWithPassword: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ToastController,
          useValue: { create: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  it('should enable submit button when form is valid', () => {
    const button: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('ion-button.login-button');

    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);

    fixture.componentInstance.form.setValue({
      email: 'person@example.com',
      password: 'secret1',
    });
    fixture.detectChanges();

    expect(button?.disabled).toBe(false);
  });

  it('should display error message when email is invalid', () => {
    fixture.componentInstance.form.controls.email.setValue('invalid-email');
    fixture.componentInstance.form.controls.email.markAsTouched();
    fixture.detectChanges();

    const error: HTMLElement | null = fixture.nativeElement.querySelector('.field-error');
    expect(error?.textContent).toContain('Ingresa un correo válido.');
  });

  it('mocks Supabase and Router for the successful login integration', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const supabase = TestBed.inject(SupabaseService);
    const signInSpy = vi.mocked(supabase.signInWithPassword);

    fixture.componentInstance.form.setValue({
      email: 'person@example.com',
      password: 'secret1',
    });
    await fixture.componentInstance.submit();

    expect(signInSpy).toHaveBeenCalledWith('person@example.com', 'secret1');
    expect(navigateSpy).toHaveBeenCalledWith('/tabs/home');
  });
});
