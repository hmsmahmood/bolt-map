import { BadGatewayException, Inject, Injectable, Optional } from '@nestjs/common';
import type { RoadRoute, RoadRoutingProvider } from './road-routing.provider';

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface OptimizedRouteSegment {
  from: string;
  to: string;
  distanceKm: number;
}

export interface OptimizedRouteResult {
  origin: RoutePoint;
  optimizedStops: RoutePoint[];
  totalDistanceKm: number;
  segments: OptimizedRouteSegment[];
  distanceModel: 'road' | 'geodesic-estimate';
  stopOrderModel: 'road-duration' | 'geodesic-estimate';
  durationMinutes?: number;
  provider?: string;
  geometry?: RoadRoute['geometry'];
}

@Injectable()
export class RouteOptimizationService {
  constructor(
    @Inject('ROAD_ROUTING_PROVIDER')
    @Optional()
    private readonly roadRoutingProvider?: RoadRoutingProvider,
  ) {}

  async buildOptimizedRoute(
    origin: RoutePoint,
    waypoints: RoutePoint[] = [],
  ): Promise<OptimizedRouteResult> {
    if (!origin || waypoints.length === 0) {
      return {
        origin,
        optimizedStops: [],
        totalDistanceKm: 0,
        segments: [],
        distanceModel: 'geodesic-estimate',
        stopOrderModel: 'geodesic-estimate',
      };
    }

    const roadDurations = await this.roadRoutingProvider?.travelTimes([
      origin,
      ...waypoints,
    ]);
    const ordered = roadDurations
      ? this.orderByRoadDuration(waypoints, roadDurations)
      : this.orderByGeodesicDistance(origin, waypoints);
    const estimate = this.buildGeodesicEstimate(origin, ordered);
    estimate.stopOrderModel = roadDurations ? 'road-duration' : 'geodesic-estimate';

    if (!this.roadRoutingProvider) {
      return estimate;
    }

    return this.addRoadRoute(estimate);
  }

  private buildGeodesicEstimate(
    origin: RoutePoint,
    ordered: RoutePoint[],
  ): OptimizedRouteResult {
    let current = { ...origin };
    let totalDistanceKm = 0;
    const segments: OptimizedRouteSegment[] = [];

    for (const target of ordered) {
      const distance = this.haversineKm(current, target);
      totalDistanceKm += distance;
      segments.push({
        from: `${current.lat},${current.lng}`,
        to: `${target.lat},${target.lng}`,
        distanceKm: Number(distance.toFixed(2)),
      });
      current = { ...target };
    }

    const finishDistance = this.haversineKm(current, origin);
    totalDistanceKm += finishDistance;
    segments.push({
      from: `${current.lat},${current.lng}`,
      to: `${origin.lat},${origin.lng}`,
      distanceKm: Number(finishDistance.toFixed(2)),
    });

    return {
      origin,
      optimizedStops: ordered,
      totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      segments,
      distanceModel: 'geodesic-estimate',
      stopOrderModel: 'geodesic-estimate',
    };
  }

  private orderByGeodesicDistance(
    origin: RoutePoint,
    waypoints: RoutePoint[],
  ): RoutePoint[] {
    const remaining = waypoints.map((point, index) => ({ point, index }));
    const ordered: RoutePoint[] = [];
    let current = origin;

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const distance = this.haversineKm(current, remaining[index].point);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }

      const [next] = remaining.splice(bestIndex, 1);
      ordered.push(next.point);
      current = next.point;
    }

    return ordered;
  }

  private orderByRoadDuration(
    waypoints: RoutePoint[],
    durations: Array<Array<number | null>>,
  ): RoutePoint[] {
    const remaining = waypoints.map((point, index) => ({ point, matrixIndex: index + 1 }));
    const ordered: RoutePoint[] = [];
    let currentMatrixIndex = 0;

    while (remaining.length > 0) {
      let bestRemainingIndex = -1;
      let bestDuration = Number.POSITIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const duration = durations[currentMatrixIndex]?.[remaining[index].matrixIndex];
        if (duration !== null && duration !== undefined && duration < bestDuration) {
          bestDuration = duration;
          bestRemainingIndex = index;
        }
      }

      if (bestRemainingIndex < 0) {
        throw new BadGatewayException('Road routing provider cannot connect all route stops');
      }

      const [next] = remaining.splice(bestRemainingIndex, 1);
      ordered.push(next.point);
      currentMatrixIndex = next.matrixIndex;
    }

    return ordered;
  }

  private async addRoadRoute(
    estimate: OptimizedRouteResult,
  ): Promise<OptimizedRouteResult> {
    const roadRoute = await this.roadRoutingProvider?.route([
      estimate.origin,
      ...estimate.optimizedStops,
      estimate.origin,
    ]);

    if (!roadRoute) {
      return estimate;
    }

    if (roadRoute.legs.length !== estimate.segments.length) {
      throw new BadGatewayException('Road routing provider returned an invalid leg count');
    }

    return {
      ...estimate,
      totalDistanceKm: Number(roadRoute.distanceKm.toFixed(2)),
      segments: estimate.segments.map((segment, index) => {
        const leg = roadRoute.legs[index];
        return leg
          ? {
              ...segment,
              distanceKm: Number(leg.distanceKm.toFixed(2)),
            }
          : segment;
      }),
      distanceModel: 'road',
      durationMinutes: Number(roadRoute.durationMinutes.toFixed(1)),
      provider: roadRoute.provider,
      geometry: roadRoute.geometry,
    };
  }

  private haversineKm(a: RoutePoint, b: RoutePoint): number {
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(b.lat - a.lat);
    const dLng = this.toRadians(b.lng - a.lng);
    const lat1 = this.toRadians(a.lat);
    const lat2 = this.toRadians(b.lat);

    const hav =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }
}
