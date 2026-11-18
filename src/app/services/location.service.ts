import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly earthRadiusMeters = 6_371_000;

  calculateHaversineDistance(
    lat1: number | null | undefined,
    lon1: number | null | undefined,
    lat2: number | null | undefined,
    lon2: number | null | undefined,
  ): number {
    if (
      lat1 === null || lat1 === undefined ||
      lon1 === null || lon1 === undefined ||
      lat2 === null || lat2 === undefined ||
      lon2 === null || lon2 === undefined ||
      Number.isNaN(lat1) || Number.isNaN(lon1) ||
      Number.isNaN(lat2) || Number.isNaN(lon2)
    ) {
      throw new Error('Las coordenadas no pueden ser null, undefined o NaN.');
    }

    if (
      !this.isValidCoordinate(lat1, -90, 90) ||
      !this.isValidCoordinate(lat2, -90, 90) ||
      !this.isValidCoordinate(lon1, -180, 180) ||
      !this.isValidCoordinate(lon2, -180, 180)
    ) {
      throw new Error('Las coordenadas deben ser números válidos dentro de sus rangos geográficos.');
    }

    if (lat1 === lat2 && lon1 === lon2) {
      return 0;
    }

    const toRadians = (degrees: number): number => degrees * Math.PI / 180;
    const latitudeDelta = toRadians(lat2 - lat1);
    const longitudeDelta = toRadians(lon2 - lon1);
    const haversineTerm =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(longitudeDelta / 2) ** 2;
    const clampedTerm = Math.min(1, Math.max(0, haversineTerm));

    return 2 * this.earthRadiusMeters *
      Math.atan2(Math.sqrt(clampedTerm), Math.sqrt(1 - clampedTerm));
  }

  calculateDistance(
    latitude1: number | null | undefined,
    longitude1: number | null | undefined,
    latitude2: number | null | undefined,
    longitude2: number | null | undefined,
  ): number {
    return this.calculateHaversineDistance(latitude1, longitude1, latitude2, longitude2);
  }

  private isValidCoordinate(
    value: number | null | undefined,
    minimum: number,
    maximum: number,
  ): value is number {
    return typeof value === 'number' && Number.isFinite(value) &&
      value >= minimum && value <= maximum;
  }
}
