import { Inject, Injectable } from '@nestjs/common';
import { VehicleProfileService } from '../vehicles/vehicle-profile.service';
import type { CoordinatePointDto } from '../app.controller';
import {
  NavigationRoute,
  ValhallaRoutingProvider,
} from './valhalla-routing.provider';

export interface NavigationRouteRequest {
  origin: CoordinatePointDto;
  destination: CoordinatePointDto;
  vehicleProfileId: string;
}

@Injectable()
export class NavigationService {
  constructor(
    @Inject(VehicleProfileService)
    private readonly vehicleProfiles: Pick<
      VehicleProfileService,
      'getOwnedProfile'
    >,
    @Inject(ValhallaRoutingProvider)
    private readonly routingProvider: Pick<ValhallaRoutingProvider, 'route'>,
  ) {}

  async plan(
    userId: string,
    request: NavigationRouteRequest,
  ): Promise<NavigationRoute> {
    const vehicle = await this.vehicleProfiles.getOwnedProfile(
      userId,
      request.vehicleProfileId,
    );
    return this.routingProvider.route(
      request.origin,
      request.destination,
      vehicle,
    );
  }
}
