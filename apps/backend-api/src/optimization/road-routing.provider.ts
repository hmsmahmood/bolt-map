import { BadGatewayException, Injectable } from '@nestjs/common';
import type { RoutePoint } from './route-optimization.service';

export interface RoadRouteLeg {
  distanceKm: number;
  durationMinutes: number;
}

export interface RoadRoute {
  provider: string;
  distanceKm: number;
  durationMinutes: number;
  geometry?: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  };
  legs: RoadRouteLeg[];
}

export interface RoadRoutingProvider {
  route(points: RoutePoint[]): Promise<RoadRoute | null>;
  travelTimes(points: RoutePoint[]): Promise<Array<Array<number | null>> | null>;
}

@Injectable()
export class OsrmRoutingProvider implements RoadRoutingProvider {
  private readonly baseUrl = process.env.OSRM_BASE_URL?.replace(/\/+$/, '');

  async travelTimes(points: RoutePoint[]): Promise<Array<Array<number | null>> | null> {
    if (!this.baseUrl) {
      return null;
    }

    const coordinates = points.map(({ lat, lng }) => `${lng},${lat}`).join(';');
    const url = `${this.baseUrl}/table/v1/driving/${coordinates}?annotations=duration`;
    const payload = await this.fetchJson(url);

    if (!this.isTableResponse(payload, points.length)) {
      throw new BadGatewayException('Road routing provider returned an invalid duration matrix');
    }

    return payload.durations;
  }

  async route(points: RoutePoint[]): Promise<RoadRoute | null> {
    if (!this.baseUrl) {
      return null;
    }

    const coordinates = points.map(({ lat, lng }) => `${lng},${lat}`).join(';');
    const url = `${this.baseUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    const payload = await this.fetchJson(url);

    if (!this.isRouteResponse(payload)) {
      throw new BadGatewayException('Road routing provider returned an invalid response');
    }

    const route = payload.routes[0];
    return {
      provider: 'OSRM',
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
      geometry: route.geometry,
      legs: route.legs.map((leg) => ({
        distanceKm: leg.distance / 1000,
        durationMinutes: leg.duration / 60,
      })),
    };
  }

  private async fetchJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new BadGatewayException('Road routing provider is unavailable', { cause: error });
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Road routing provider returned HTTP ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new BadGatewayException('Road routing provider returned invalid JSON', {
        cause: error,
      });
    }
  }

  private isTableResponse(
    payload: unknown,
    pointCount: number,
  ): payload is { code: 'Ok'; durations: Array<Array<number | null>> } {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const result = payload as { code?: unknown; durations?: unknown };
    if (
      result.code !== 'Ok' ||
      !Array.isArray(result.durations) ||
      result.durations.length !== pointCount
    ) {
      return false;
    }

    return result.durations.every(
      (row: unknown) =>
        Array.isArray(row) &&
        row.length === pointCount &&
        row.every(
          (duration: unknown) =>
            duration === null ||
            (typeof duration === 'number' &&
              Number.isFinite(duration) &&
              duration >= 0),
        ),
    );
  }

  private isRouteResponse(
    payload: unknown,
  ): payload is {
    code: 'Ok';
    routes: Array<{
      distance: number;
      duration: number;
      geometry?: { type: 'LineString'; coordinates: Array<[number, number]> };
      legs: Array<{ distance: number; duration: number }>;
    }>;
  } {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const result = payload as {
      code?: unknown;
      routes?: unknown;
    };

    if (
      result.code !== 'Ok' ||
      !Array.isArray(result.routes) ||
      result.routes.length === 0
    ) {
      return false;
    }

    const route = result.routes[0] as {
      distance?: unknown;
      duration?: unknown;
      geometry?: {
        type?: unknown;
        coordinates?: unknown;
      };
      legs?: unknown;
    };

    if (
      typeof route.distance !== 'number' ||
      !Number.isFinite(route.distance) ||
      typeof route.duration !== 'number' ||
      !Number.isFinite(route.duration) ||
      !Array.isArray(route.legs) ||
      !route.legs.every((leg: unknown) => this.isRouteLeg(leg))
    ) {
      return false;
    }

    if (
      route.geometry !== undefined &&
      (!route.geometry ||
        typeof route.geometry !== 'object' ||
        route.geometry.type !== 'LineString' ||
        !Array.isArray(route.geometry.coordinates) ||
        !route.geometry.coordinates.every(
          (coordinate: unknown) =>
            Array.isArray(coordinate) &&
            coordinate.length === 2 &&
            coordinate.every(
              (value: unknown) => typeof value === 'number' && Number.isFinite(value),
            ),
        ))
    ) {
      return false;
    }

    return true;
  }

  private isRouteLeg(
    leg: unknown,
  ): leg is { distance: number; duration: number } {
    if (!leg || typeof leg !== 'object') {
      return false;
    }

    const candidate = leg as { distance?: unknown; duration?: unknown };
    return (
      typeof candidate.distance === 'number' &&
      Number.isFinite(candidate.distance) &&
      typeof candidate.duration === 'number' &&
      Number.isFinite(candidate.duration)
    );
  }
}
