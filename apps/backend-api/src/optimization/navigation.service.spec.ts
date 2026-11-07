import { NotFoundException } from '@nestjs/common';
import { VehicleType } from '../entities/vehicle-profile.entity';
import { VehicleProfileService } from '../vehicles/vehicle-profile.service';
import { NavigationService } from './navigation.service';
import { ValhallaRoutingProvider } from './valhalla-routing.provider';

describe('NavigationService', () => {
  const vehicleProfile = {
    id: 'vehicle-1',
    userId: 'owner-1',
    vehicleType: VehicleType.CAR,
    maxHeightCm: null,
    maxLengthCm: null,
    maxWeightKg: null,
  };
  let vehicleProfiles: jest.Mocked<
    Pick<VehicleProfileService, 'getOwnedProfile'>
  >;
  let routingProvider: jest.Mocked<Pick<ValhallaRoutingProvider, 'route'>>;
  let service: NavigationService;

  beforeEach(() => {
    vehicleProfiles = {
      getOwnedProfile: jest.fn().mockResolvedValue(vehicleProfile),
    };
    routingProvider = {
      route: jest.fn().mockResolvedValue({
        provider: 'Valhalla',
        vehicleType: VehicleType.CAR,
        distanceKm: 4.2,
        durationSeconds: 360,
        geometry: { type: 'LineString', coordinates: [] },
        maneuvers: [],
        liveTraffic: false,
      }),
    };
    service = new NavigationService(vehicleProfiles, routingProvider);
  });

  it('uses the requesting user’s owned vehicle profile for route costing', async () => {
    const request = {
      origin: { lat: 3.139, lng: 101.6869 },
      destination: { lat: 3.157, lng: 101.72 },
      vehicleProfileId: 'vehicle-1',
    };

    await service.plan('owner-1', request);

    expect(vehicleProfiles.getOwnedProfile).toHaveBeenCalledWith(
      'owner-1',
      'vehicle-1',
    );
    expect(routingProvider.route).toHaveBeenCalledWith(
      request.origin,
      request.destination,
      vehicleProfile,
    );
  });

  it('never sends a route request for a profile the user does not own', async () => {
    vehicleProfiles.getOwnedProfile.mockRejectedValueOnce(
      new NotFoundException(),
    );

    await expect(
      service.plan('owner-2', {
        origin: { lat: 3.139, lng: 101.6869 },
        destination: { lat: 3.157, lng: 101.72 },
        vehicleProfileId: 'vehicle-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(routingProvider.route).not.toHaveBeenCalled();
  });
});
