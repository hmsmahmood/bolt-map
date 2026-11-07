import { BadGatewayException } from '@nestjs/common';
import { RoadRoutingProvider } from './road-routing.provider';
import { RouteOptimizationService } from './route-optimization.service';

describe('RouteOptimizationService', () => {
  const origin = { lat: 0, lng: 0 };
  const waypoints = [
    { lat: 1, lng: 1, label: 'Farther' },
    { lat: 0, lng: 1, label: 'Nearest' },
  ];

  it('uses the configured road provider for route distance, duration and geometry', async () => {
    const route = {
      provider: 'OSRM',
      distanceKm: 12.345,
      durationMinutes: 18.26,
      legs: [
        { distanceKm: 4.12, durationMinutes: 6 },
        { distanceKm: 3.82, durationMinutes: 5.5 },
        { distanceKm: 4.4, durationMinutes: 6.76 },
      ],
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [0, 0] as [number, number],
          [1, 1] as [number, number],
        ],
      },
    };
    const provider: RoadRoutingProvider = {
      travelTimes: jest.fn().mockResolvedValue([
        [0, 100, 50],
        [90, 0, 10],
        [45, 80, 0],
      ]),
      route: jest.fn().mockResolvedValue(route),
    };
    const service = new RouteOptimizationService(provider);

    const result = await service.buildOptimizedRoute(origin, waypoints);

    expect(provider.route).toHaveBeenCalledWith([
      origin,
      waypoints[1],
      waypoints[0],
      origin,
    ]);
    expect(result).toMatchObject({
      distanceModel: 'road',
      stopOrderModel: 'road-duration',
      totalDistanceKm: 12.35,
      durationMinutes: 18.3,
      provider: 'OSRM',
      geometry: route.geometry,
    });
    expect(result.segments.map((segment) => segment.distanceKm)).toEqual([
      4.12,
      3.82,
      4.4,
    ]);
  });

  it('labels straight-line results as estimates if no road provider is configured', async () => {
    const service = new RouteOptimizationService();

    const result = await service.buildOptimizedRoute(origin, waypoints);

    expect(result.distanceModel).toBe('geodesic-estimate');
    expect(result.stopOrderModel).toBe('geodesic-estimate');
    expect(result.provider).toBeUndefined();
    expect(result.totalDistanceKm).toBeGreaterThan(0);
  });

  it('rejects road responses whose leg count does not match the route', async () => {
    const provider: RoadRoutingProvider = {
      travelTimes: jest.fn().mockResolvedValue([
        [0, 100, 50],
        [90, 0, 10],
        [45, 80, 0],
      ]),
      route: jest.fn().mockResolvedValue({
        provider: 'OSRM',
        distanceKm: 10,
        durationMinutes: 15,
        legs: [],
      }),
    };
    const service = new RouteOptimizationService(provider);

    await expect(service.buildOptimizedRoute(origin, waypoints)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('orders stops by road duration even when straight-line distance suggests a different order', async () => {
    const provider: RoadRoutingProvider = {
      travelTimes: jest.fn().mockResolvedValue([
        [0, 100, 50],
        [90, 0, 10],
        [45, 80, 0],
      ]),
      route: jest.fn().mockResolvedValue({
        provider: 'OSRM',
        distanceKm: 15,
        durationMinutes: 20,
        legs: [
          { distanceKm: 4, durationMinutes: 6 },
          { distanceKm: 5, durationMinutes: 7 },
          { distanceKm: 6, durationMinutes: 7 },
        ],
      }),
    };
    const service = new RouteOptimizationService(provider);

    const result = await service.buildOptimizedRoute(origin, waypoints);

    expect(result.optimizedStops).toEqual([waypoints[1], waypoints[0]]);
    expect(result.stopOrderModel).toBe('road-duration');
  });

  it('rejects road matrices that cannot connect the remaining stops', async () => {
    const provider: RoadRoutingProvider = {
      travelTimes: jest.fn().mockResolvedValue([
        [0, null, null],
        [null, 0, null],
        [null, null, 0],
      ]),
      route: jest.fn(),
    };
    const service = new RouteOptimizationService(provider);

    await expect(service.buildOptimizedRoute(origin, waypoints)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(provider.route).not.toHaveBeenCalled();
  });
});
