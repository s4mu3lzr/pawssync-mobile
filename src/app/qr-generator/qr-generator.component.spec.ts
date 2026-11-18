import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PetQrGeneratorService } from './pet-qr-generator.service';
import { QrGeneratorComponent } from './qr-generator.component';

describe('QrGeneratorComponent', () => {
  let fixture: ComponentFixture<QrGeneratorComponent>;
  const generate = vi.fn();

  beforeEach(async () => {
    generate.mockReset();
    generate.mockResolvedValue({
      payload: 'pawssync://register?name=Luna&breed=Mestiza&token=QR_TOKEN',
      imageDataUrl: 'data:image/png;base64,qr-image',
      fileName: 'luna-pawssync-qr.png',
    });

    await TestBed.configureTestingModule({
      imports: [QrGeneratorComponent],
      providers: [provideRouter([]),
        {
          provide: PetQrGeneratorService,
          useValue: { generate },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QrGeneratorComponent);
    fixture.detectChanges();
  });

  it('generates and displays a downloadable registration QR', async () => {
    const component = fixture.componentInstance;
    component.name = 'Luna';
    component.breed = 'Mestiza';
    component.birthDate = '';
    await component.generate();
    fixture.detectChanges();

    expect(generate).toHaveBeenCalledWith('Luna', 'Mestiza', '');
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src'))
      .toBe('data:image/png;base64,qr-image');
    expect(fixture.nativeElement.querySelector('.download-button')?.getAttribute('download'))
      .toBe('luna-pawssync-qr.png');
  });

  it('does not generate when required fields are missing', async () => {
    await fixture.componentInstance.generate();
    fixture.detectChanges();

    expect(generate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.errorMessage).toContain('nombre y la raza');
  });

  it('rejects a future birth date before generating the QR', async () => {
    const component = fixture.componentInstance;
    component.name = 'Luna';
    component.breed = 'Mestiza';
    component.birthDate = '2999-01-01';
    await component.generate();

    expect(generate).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('fecha de nacimiento válida');
  });
});
