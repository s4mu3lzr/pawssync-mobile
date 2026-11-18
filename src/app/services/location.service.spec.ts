import { TestBed } from '@angular/core/testing';
import { LocationService } from './location.service';

describe('LocationService', () => {
  let service: LocationService;

  beforeEach(() => {
    service = TestBed.inject(LocationService);
  });

  it('should calculate correct distance for valid coordinates', () => {
    const distance = service.calculateDistance(0, 0, 0, 1);

    expect(distance).toBeCloseTo(111_195, 0);
  });

  it('should return 0 when coordinates are identical', () => {
    expect(service.calculateDistance(19.4326, -99.1332, 19.4326, -99.1332)).toBe(0);
  });

  it('should throw an error for missing or invalid coordinates', () => {
    expect(() => service.calculateDistance(null, 0, 0, 0)).toThrowError();
    expect(() => service.calculateDistance(91, 0, 0, 0)).toThrowError();
  });
});
