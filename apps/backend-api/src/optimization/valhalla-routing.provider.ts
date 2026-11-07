import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  VehicleProfile,
  VehicleType,
} from '../entities/vehicle-profile.entity';
import type { RoutePoint } from './route-optimization.service';

export interface NavigationManeuver {
  instruction: string;
  distanceKm: number;
  durationSeconds: number;
  verbalInstruction?: string;
  succinctInstruction?: string;
  type: number;
  beginShapeIndex: number;
  endShapeIndex: number;
  streetNames: string[];
}

export interface NavigationRoute {
  provider: 'Valhalla';
  vehicleType: VehicleType;
  distanceKm: number;
  durationSeconds: number;
  geometry: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  };
  maneuvers: NavigationManeuver[];
  liveTraffic: false;
}

interface ValhallaRequest {
  locations: Array<{ lat: number; lon: number; type: 'break' }>;
  costing: 'auto' | 'motorcycle' | 'truck';
  units: 'kilometers';
  costing_options?: {
    truck: {
      height?: number;
      length?: number;
      weight?: number;
    };
  };
}

@Injectable()
export class ValhallaRoutingProvider {
  private readonly baseUrl = process.env.VALHALLA_BASE_URL?.trim().replace(
    /\/+$/,
    '',
  );

  async route(
    origin: RoutePoint,
    destination: RoutePoint,
    vehicle: Pick<
      VehicleProfile,
      'vehicleType' | 'maxHeightCm' | 'maxLengthCm' | 'maxWeightKg'
    >,
  ): Promise<NavigationRoute> {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(
        'Self-hosted route planning is not configured.',
      );
    }

    const endpoint = this.routeEndpoint();
    const requestBody = this.buildRequest(origin, destination, vehicle);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        'Self-hosted route planning is unavailable.',
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Self-hosted route planning returned HTTP ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new BadGatewayException(
        'Self-hosted route planning returned invalid JSON.',
        { cause: error },
      );
    }

    return this.parseResponse(payload, vehicle.vehicleType);
  }

  private routeEndpoint(): string {
    try {
      const endpoint = new URL(`${this.baseUrl}/route`);
      if (
        (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        (process.env.NODE_ENV === 'production' &&
          endpoint.protocol !== 'https:')
      ) {
        throw new ServiceUnavailableException(
          'Self-hosted route planning has an insecure configuration.',
        );
      }
      return endpoint.toString();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Self-hosted route planning has an invalid configuration.',
        { cause: error },
      );
    }
  }

  private buildRequest(
    origin: RoutePoint,
    destination: RoutePoint,
    vehicle: Pick<
      VehicleProfile,
      'vehicleType' | 'maxHeightCm' | 'maxLengthCm' | 'maxWeightKg'
    >,
  ): ValhallaRequest {
    const costing: ValhallaRequest['costing'] =
      vehicle.vehicleType === VehicleType.CAR ? 'auto' : vehicle.vehicleType;
    const request: ValhallaRequest = {
      locations: [
        { lat: origin.lat, lon: origin.lng, type: 'break' },
        { lat: destination.lat, lon: destination.lng, type: 'break' },
      ],
      costing,
      units: 'kilometers',
    };

    if (vehicle.vehicleType === VehicleType.TRUCK) {
      const truck: NonNullable<ValhallaRequest['costing_options']>['truck'] =
        {};
      if (vehicle.maxHeightCm) {
        truck.height = vehicle.maxHeightCm / 100;
      }
      if (vehicle.maxLengthCm) {
        truck.length = vehicle.maxLengthCm / 100;
      }
      if (vehicle.maxWeightKg) {
        truck.weight = vehicle.maxWeightKg / 1000;
      }
      if (Object.keys(truck).length > 0) {
        request.costing_options = { truck };
      }
    }

    return request;
  }

  private parseResponse(
    payload: unknown,
    vehicleType: VehicleType,
  ): NavigationRoute {
    const root = asRecord(payload);
    const trip = asRecord(root?.trip);
    const summary = asRecord(trip?.summary);
    const rawLegs = trip?.legs;
    if (
      !summary ||
      !isNonNegativeNumber(summary.length) ||
      !isNonNegativeNumber(summary.time) ||
      !Array.isArray(rawLegs) ||
      rawLegs.length === 0 ||
      rawLegs.length > 25
    ) {
      throw new BadGatewayException(
        'Self-hosted route planning returned an invalid route.',
      );
    }

    const coordinates: Array<[number, number]> = [];
    const maneuvers: NavigationManeuver[] = [];
    for (const rawLeg of rawLegs) {
      const leg = asRecord(rawLeg);
      if (typeof leg?.shape !== 'string' || leg.shape.length > 1_000_000) {
        throw new BadGatewayException(
          'Self-hosted route planning returned invalid geometry.',
        );
      }

      const legCoordinates = decodePolyline6(leg.shape);
      if (legCoordinates.length < 2) {
        throw new BadGatewayException(
          'Self-hosted route planning returned invalid geometry.',
        );
      }
      coordinates.push(...legCoordinates.slice(coordinates.length > 0 ? 1 : 0));
      const shapeIndexOffset = coordinates.length - legCoordinates.length;

      if (!Array.isArray(leg.maneuvers) || leg.maneuvers.length > 5_000) {
        throw new BadGatewayException(
          'Self-hosted route planning returned invalid guidance.',
        );
      }
      for (const rawManeuver of leg.maneuvers) {
        const maneuver = asRecord(rawManeuver);
        if (
          typeof maneuver?.instruction !== 'string' ||
          !isNonNegativeNumber(maneuver.length) ||
          !isNonNegativeNumber(maneuver.time) ||
          !isInteger(maneuver.type) ||
          !isShapeIndex(maneuver.begin_shape_index, legCoordinates.length) ||
          !isShapeIndex(maneuver.end_shape_index, legCoordinates.length) ||
          maneuver.end_shape_index < maneuver.begin_shape_index ||
          !isStringArray(maneuver.street_names ?? [])
        ) {
          throw new BadGatewayException(
            'Self-hosted route planning returned invalid guidance.',
          );
        }
        maneuvers.push({
          instruction: maneuver.instruction,
          distanceKm: maneuver.length,
          durationSeconds: maneuver.time,
          type: maneuver.type,
          beginShapeIndex: shapeIndexOffset + maneuver.begin_shape_index,
          endShapeIndex: shapeIndexOffset + maneuver.end_shape_index,
          streetNames: isStringArray(maneuver.street_names)
            ? maneuver.street_names
            : [],
          ...(typeof maneuver.verbal_pre_transition_instruction === 'string'
            ? { verbalInstruction: maneuver.verbal_pre_transition_instruction }
            : {}),
          ...(typeof maneuver.verbal_succinct_transition_instruction ===
          'string'
            ? {
                succinctInstruction:
                  maneuver.verbal_succinct_transition_instruction,
              }
            : {}),
        });
      }
    }

    return {
      provider: 'Valhalla',
      vehicleType,
      distanceKm: summary.length,
      durationSeconds: summary.time,
      geometry: { type: 'LineString', coordinates },
      maneuvers,
      liveTraffic: false,
    };
  }
}

export function decodePolyline6(encoded: string): Array<[number, number]> {
  if (encoded.length > 1_000_000) {
    throw new BadGatewayException(
      'Self-hosted route planning returned invalid geometry.',
    );
  }

  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const latitudeDelta = decodeValue(
      encoded,
      () => index,
      (next) => {
        index = next;
      },
    );
    const longitudeDelta = decodeValue(
      encoded,
      () => index,
      (next) => {
        index = next;
      },
    );
    latitude += latitudeDelta;
    longitude += longitudeDelta;
    const lat = latitude / 1_000_000;
    const lng = longitude / 1_000_000;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadGatewayException(
        'Self-hosted route planning returned invalid geometry.',
      );
    }
    coordinates.push([lng, lat]);
  }

  return coordinates;
}

function decodeValue(
  encoded: string,
  getIndex: () => number,
  setIndex: (index: number) => void,
): number {
  let result = 0;
  let shift = 0;
  let chunk: number;

  do {
    const index = getIndex();
    if (index >= encoded.length || shift > 30) {
      throw new BadGatewayException(
        'Self-hosted route planning returned invalid geometry.',
      );
    }
    chunk = encoded.charCodeAt(index) - 63;
    if (chunk < 0 || chunk > 63) {
      throw new BadGatewayException(
        'Self-hosted route planning returned invalid geometry.',
      );
    }
    setIndex(index + 1);
    result |= (chunk & 0x1f) << shift;
    shift += 5;
  } while (chunk >= 0x20);

  return (result & 1) === 1 ? ~(result >> 1) : result >> 1;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isShapeIndex(
  value: unknown,
  coordinateCount: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < coordinateCount
  );
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === 'string')
  );
}
