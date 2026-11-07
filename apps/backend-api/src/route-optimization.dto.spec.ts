import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CoordinatePointDto,
  RouteOptimizationRequestDto,
} from './app.controller';

describe('RouteOptimizationRequestDto', () => {
  it('accepts valid nested coordinates', async () => {
    const dto = plainToInstance(RouteOptimizationRequestDto, {
      origin: { lat: 3.139, lng: 101.686 },
      waypoints: [{ lat: 3.099, lng: 101.64, label: 'KLIA' }],
    });

    expect(dto.origin).toBeInstanceOf(CoordinatePointDto);
    expect(dto.waypoints[0]).toBeInstanceOf(CoordinatePointDto);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects out-of-range coordinates and excessive waypoint lists', async () => {
    const dto = plainToInstance(RouteOptimizationRequestDto, {
      origin: { lat: 91, lng: 181 },
      waypoints: Array.from({ length: 26 }, () => ({ lat: 3, lng: 101 })),
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['origin', 'waypoints']),
    );
    expect(errors.find((error) => error.property === 'origin')?.children).toHaveLength(2);
  });

  it('rejects a missing origin', async () => {
    const dto = plainToInstance(RouteOptimizationRequestDto, {
      waypoints: [{ lat: 3, lng: 101 }],
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('origin');
  });
});
