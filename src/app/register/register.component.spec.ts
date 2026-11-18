import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  it('rejects whitespace-only names and passwords', async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { isConfigured: true },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    expect(component.form.invalid).toBe(true);

    component.form.setValue({ fullName: '   ', email: 'ana@example.com', password: '   ' });
    expect(component.form.invalid).toBe(true);
    expect(component.form.controls.fullName.hasError('whitespaceOnly')).toBe(true);
    expect(component.form.controls.password.hasError('whitespaceOnly')).toBe(true);
  });

  it('requires a valid email, an eight-character password, and a special character', async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { isConfigured: true },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    component.form.setValue({ fullName: 'Ana Ruiz', email: 'ana@example.com', password: 'Abc1234' });
    expect(component.form.controls.password.hasError('minlength')).toBe(true);
    expect(component.form.invalid).toBe(true);

    component.form.setValue({ fullName: 'Ana Ruiz', email: 'ana@example.com', password: 'Abcdef12' });
    expect(component.form.controls.password.hasError('specialCharacter')).toBe(true);
    expect(component.form.invalid).toBe(true);

    component.form.setValue({ fullName: 'Ana Ruiz', email: 'usuario.com', password: 'Abcdef1!' });
    expect(component.form.controls.email.hasError('email')).toBe(true);
    expect(component.form.invalid).toBe(true);

    component.form.setValue({ fullName: 'Ana Ruiz', email: 'ana@example.com', password: 'Abcdef1!' });
    expect(component.form.valid).toBe(true);
  });

  it('logs Supabase registration failures and displays an alert', async () => {
    const present = vi.fn().mockResolvedValue(undefined);
    const createAlert = vi.fn().mockResolvedValue({ present });
    const rawError = new Error('User already registered');
    const signUp = vi.fn().mockRejectedValue(rawError);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isConfigured: true, signUp } },
        { provide: AlertController, useValue: { create: createAlert } },
        { provide: ToastController, useValue: { create: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      fullName: 'Ana Ruiz',
      email: 'ana@example.com',
      password: 'Abcdef1!',
    });

    await component.submit();

    expect(signUp).toHaveBeenCalledWith('ana@example.com', 'Abcdef1!', 'Ana Ruiz');
    expect(logError).toHaveBeenCalledWith('Error crudo de Supabase:', rawError);
    expect(createAlert).toHaveBeenCalledWith(expect.objectContaining({
      message: rawError.message,
    }));
    expect(present).toHaveBeenCalled();
    logError.mockRestore();
  });

  it('navigates to the dashboard after Supabase returns a session', async () => {
    const signUp = vi.fn().mockResolvedValue({ access_token: 'test-session' });
    const present = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isConfigured: true, signUp } },
        { provide: ToastController, useValue: { create: vi.fn().mockResolvedValue({ present }) } },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      fullName: 'Ana Ruiz',
      email: 'ana@example.com',
      password: 'Abcdef1!',
    });

    await component.submit();

    expect(navigate).toHaveBeenCalledWith(['/tabs/home']);
  });
});
