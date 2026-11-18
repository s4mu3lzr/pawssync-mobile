import { TestBed } from '@angular/core/testing';
import { toDataURL } from 'qrcode';
import { PetQrGeneratorService } from './pet-qr-generator.service';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr-image'),
}));

describe('PetQrGeneratorService', () => {
  let service: PetQrGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PetQrGeneratorService);
    vi.mocked(toDataURL).mockClear();
    vi.mocked(toDataURL).mockResolvedValue('data:image/png;base64,qr-image');
  });

  it('creates a scanner-compatible one-time registration QR without private contact data', async () => {
    const qr = await service.generate('  Lúna  ', 'Mestiza', '2022-05-04');
    const payload = new URL(qr.payload);

    expect(payload.protocol).toBe('pawssync:');
    expect(payload.hostname).toBe('register');
    expect(payload.searchParams.get('name')).toBe('Lúna');
    expect(payload.searchParams.get('breed')).toBe('Mestiza');
    expect(payload.searchParams.get('birth_date')).toBe('2022-05-04');
    expect(payload.searchParams.get('token')).toMatch(/^QR_[0-9A-F]{32}$/);
    expect(payload.searchParams.has('address')).toBe(false);
    expect(payload.searchParams.has('contact_phone')).toBe(false);
    expect(qr.imageDataUrl).toBe('data:image/png;base64,qr-image');
    expect(qr.fileName).toBe('luna-pawssync-qr.png');
    expect(toDataURL).toHaveBeenCalledWith(qr.payload, {
      errorCorrectionLevel: 'H',
      margin: 3,
      width: 500,
    });
  });

  it('rejects missing name or breed', async () => {
    await expect(service.generate(' ', 'Mestiza', '')).rejects.toThrow('nombre y la raza');
    await expect(service.generate('Luna', '', '')).rejects.toThrow('nombre y la raza');
    expect(toDataURL).not.toHaveBeenCalled();
  });
});
