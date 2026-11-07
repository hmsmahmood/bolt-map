import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AuthRateLimitService } from './auth/auth-rate-limit.service';
import { AppService } from './app.service';
import { OperationalDataService } from './operations/operational-data.service';
import { NavigationService } from './optimization/navigation.service';
import { RouteOptimizationService } from './optimization/route-optimization.service';

describe('AppController', () => {
  let appController: AppController;
  let routeOptimization: { buildOptimizedRoute: jest.Mock };
  let navigationService: { plan: jest.Mock };
  let rateLimit: { key: jest.Mock; consume: jest.Mock };

  beforeEach(async () => {
    routeOptimization = {
      buildOptimizedRoute: jest.fn().mockResolvedValue({
        origin: { lat: 3.139, lng: 101.686 },
        optimizedStops: [],
        totalDistanceKm: 0,
        segments: [],
      }),
    };
    navigationService = {
      plan: jest.fn().mockResolvedValue({
        provider: 'Valhalla',
        vehicleType: 'car',
        distanceKm: 5,
        durationSeconds: 300,
        geometry: { type: 'LineString', coordinates: [] },
        maneuvers: [],
        liveTraffic: false,
      }),
    };
    rateLimit = {
      key: jest.fn((scope: string, value: string) => `${scope}:${value}`),
      consume: jest.fn().mockResolvedValue(undefined),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: AuthRateLimitService, useValue: rateLimit },
        { provide: NavigationService, useValue: navigationService },
        {
          provide: JwtService,
          useValue: {
            sign: (payload: Record<string, unknown>) =>
              `token.${JSON.stringify(payload)}`,
            verify: (token: string) => ({
              sub: 'usr-1038',
              type: 'refresh',
              token,
            }),
          },
        },
        {
          provide: OperationalDataService,
          useValue: {
            getDashboardSummary: async ({
              routes,
              incidents,
              fleet,
              floodAlerts,
            }: any) => ({
              overview: {
                activeTrips: 148,
                liveAlerts: 12,
                safeMiles: 89.4,
                deliveryEfficiency: 96.2,
              },
              routes,
              incidents,
              fleet,
              alertFeed: ['alert'],
              floodAlerts,
              safetySignals: [],
              adminScores: {
                compliance: 98,
                coverage: 94,
                uptime: 99.7,
                response: 3.2,
              },
            }),
            getRoutes: async (routes: any[]) => routes,
            getIncidents: async (incidents: any[]) => incidents,
            getFleet: async (fleet: any[]) => fleet,
            getFloodAlerts: async (floodAlerts: any[]) => floodAlerts,
          },
        },
        {
          provide: RouteOptimizationService,
          useValue: routeOptimization,
        },
        {
          provide: 'USER_REPOSITORY',
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'usr-1038',
              email: 'ops@smartroute.ai',
              role: 'Fleet operations manager',
              fullName: 'Aisha Rahman',
            }),
          },
        },
        {
          provide: 'REFRESH_TOKEN_REPOSITORY',
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should report the platform status', () => {
    const result = appController.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('SMARTROUTE AI');
  });

  it('uses the shared route limiter before passing location data to the optimizer', async () => {
    const request = {
      ip: '127.0.0.1',
      user: { id: 'usr-1038' },
    };
    const dto = {
      origin: { lat: 3.139, lng: 101.686 },
      waypoints: [],
    };

    await appController.planRoute(request, dto);

    expect(rateLimit.key).toHaveBeenCalledWith(
      'navigation:plan:user',
      'usr-1038',
    );
    expect(rateLimit.key).toHaveBeenCalledWith(
      'navigation:plan:ip',
      '127.0.0.1',
    );
    expect(rateLimit.consume).toHaveBeenNthCalledWith(
      1,
      'navigation:plan:user:usr-1038',
      30,
      60,
    );
    expect(rateLimit.consume).toHaveBeenNthCalledWith(
      2,
      'navigation:plan:ip:127.0.0.1',
      120,
      60,
    );
    expect(routeOptimization.buildOptimizedRoute).toHaveBeenCalledWith(
      dto.origin,
      dto.waypoints,
    );
  });

  it('does not call the route provider when the shared limiter rejects a request', async () => {
    rateLimit.consume.mockRejectedValueOnce(new Error('request rate exceeded'));
    const request = {
      ip: '127.0.0.1',
      user: { id: 'usr-1038' },
    };

    await expect(
      appController.planRoute(request, {
        origin: { lat: 3.139, lng: 101.686 },
        waypoints: [],
      }),
    ).rejects.toThrow('request rate exceeded');
    expect(routeOptimization.buildOptimizedRoute).not.toHaveBeenCalled();
  });

  it('does not call the route provider when the IP-wide limiter rejects a request', async () => {
    rateLimit.consume
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('IP request rate exceeded'));
    const request = {
      ip: '127.0.0.1',
      user: { id: 'usr-1038' },
    };

    await expect(
      appController.planRoute(request, {
        origin: { lat: 3.139, lng: 101.686 },
        waypoints: [],
      }),
    ).rejects.toThrow('IP request rate exceeded');
    expect(rateLimit.consume).toHaveBeenCalledTimes(2);
    expect(routeOptimization.buildOptimizedRoute).not.toHaveBeenCalled();
  });

  it('rejects route planning without an authenticated user context', async () => {
    const request = { ip: '127.0.0.1' };

    await expect(
      appController.planRoute(request, {
        origin: { lat: 3.139, lng: 101.686 },
        waypoints: [],
      }),
    ).rejects.toThrow('Unauthorized');
    expect(rateLimit.consume).not.toHaveBeenCalled();
  });

  it('fails closed when the request has no client IP for the IP-wide limit', async () => {
    const request = { ip: undefined, user: { id: 'usr-1038' } };

    await expect(
      appController.planRoute(request, {
        origin: { lat: 3.139, lng: 101.686 },
        waypoints: [],
      }),
    ).rejects.toThrow(
      'Route planning is unavailable without client network context.',
    );
    expect(rateLimit.consume).not.toHaveBeenCalled();
  });

  it('passes authenticated route requests to vehicle-aware navigation after rate limiting', async () => {
    const request = {
      ip: '127.0.0.1',
      user: { id: 'usr-1038' },
    };
    const dto = {
      origin: { lat: 3.139, lng: 101.686 },
      destination: { lat: 3.157, lng: 101.72 },
      vehicleProfileId: '23b5f0d7-9548-4893-9c52-316ab7a38eb9',
    };

    await appController.planNavigationRoute(request, dto);

    expect(rateLimit.key).toHaveBeenCalledWith(
      'navigation:route:user',
      'usr-1038',
    );
    expect(rateLimit.key).toHaveBeenCalledWith(
      'navigation:route:ip',
      '127.0.0.1',
    );
    expect(navigationService.plan).toHaveBeenCalledWith('usr-1038', dto);
  });
});
