import type { CommunityIncident } from "../../core/api/community-incident.model";

export interface RouteCommunityAlert extends CommunityIncident {
  distanceAheadMeters: number;
}

export interface RouteProgress {
  segmentIndex: number;
  progressMeters: number;
  distanceMeters: number;
}

export const MAX_ROUTE_ALERT_COORDINATES = 20_000;
export const ROUTE_ALERT_CORRIDOR_METERS = 100;
export const ROUTE_ALERT_MAX_DISTANCE_METERS = 5_000;
const MIN_ROUTE_ALERT_AHEAD_METERS = 20;
const MAX_ROUTE_ALERTS = 20;

export function selectRouteCommunityAlerts(
  reports: CommunityIncident[],
  coordinates: Array<[number, number]>,
  cumulativeMeters: number[],
  currentProgressMeters: number,
  minimumSegment: number,
  now = Date.now(),
): RouteCommunityAlert[] {
  if (
    coordinates.length < 2 ||
    coordinates.length > MAX_ROUTE_ALERT_COORDINATES ||
    cumulativeMeters.length !== coordinates.length ||
    !Number.isFinite(currentProgressMeters) ||
    currentProgressMeters < 0 ||
    !Number.isInteger(minimumSegment) ||
    minimumSegment < 0 ||
    minimumSegment >= coordinates.length - 1 ||
    !coordinates.every(isValidCoordinate) ||
    !cumulativeMeters.every(Number.isFinite)
  ) {
    return [];
  }

  const endSegment = segmentAtDistance(
    cumulativeMeters,
    currentProgressMeters + ROUTE_ALERT_MAX_DISTANCE_METERS,
    minimumSegment,
  );
  const seen = new Set<string>();
  const alerts: RouteCommunityAlert[] = [];

  for (const report of reports) {
    const expiresAt = Date.parse(report.expiresAt);
    if (
      seen.has(report.id) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      !isValidCoordinate([report.lng, report.lat])
    ) {
      continue;
    }

    const closest = closestRouteProgress(
      [report.lng, report.lat],
      coordinates,
      cumulativeMeters,
      minimumSegment,
      endSegment,
    );
    if (!closest) {
      continue;
    }

    const distanceAheadMeters = closest.progressMeters - currentProgressMeters;
    if (
      closest.distanceMeters > ROUTE_ALERT_CORRIDOR_METERS ||
      distanceAheadMeters <= MIN_ROUTE_ALERT_AHEAD_METERS ||
      distanceAheadMeters > ROUTE_ALERT_MAX_DISTANCE_METERS
    ) {
      continue;
    }

    seen.add(report.id);
    alerts.push({ ...report, distanceAheadMeters });
  }

  return alerts
    .sort((first, second) => first.distanceAheadMeters - second.distanceAheadMeters)
    .slice(0, MAX_ROUTE_ALERTS);
}

export function closestRouteProgress(
  point: [number, number],
  coordinates: Array<[number, number]>,
  cumulativeMeters: number[],
  minimumSegment: number,
  maximumSegment = coordinates.length - 2,
): RouteProgress | null {
  let closest: RouteProgress | null = null;
  const latitudeRadians = (point[1] * Math.PI) / 180;
  const longitudeScale = Math.cos(latitudeRadians);
  const pointX = point[0] * longitudeScale;
  const pointY = point[1];

  for (
    let segmentIndex = Math.max(0, minimumSegment);
    segmentIndex <= Math.min(maximumSegment, coordinates.length - 2);
    segmentIndex += 1
  ) {
    const start = coordinates[segmentIndex];
    const end = coordinates[segmentIndex + 1];
    const startX = start[0] * longitudeScale;
    const endX = end[0] * longitudeScale;
    const segmentX = endX - startX;
    const segmentY = end[1] - start[1];
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    const fraction =
      segmentLengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((pointX - startX) * segmentX + (pointY - start[1]) * segmentY) /
                segmentLengthSquared,
            ),
          );
    const projected: [number, number] = [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ];
    const distanceMeters = distanceBetweenCoordinates(point, projected);
    if (!closest || distanceMeters < closest.distanceMeters) {
      closest = {
        segmentIndex,
        progressMeters:
          cumulativeMeters[segmentIndex] +
          (cumulativeMeters[segmentIndex + 1] -
            cumulativeMeters[segmentIndex]) *
            fraction,
        distanceMeters,
      };
    }
  }
  return closest;
}

export function distanceBetweenCoordinates(
  first: [number, number],
  second: [number, number],
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDifference = ((second[1] - first[1]) * Math.PI) / 180;
  const longitudeDifference = ((second[0] - first[0]) * Math.PI) / 180;
  const firstLatitude = (first[1] * Math.PI) / 180;
  const secondLatitude = (second[1] * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function isValidCoordinate(coordinate: [number, number]): boolean {
  return (
    Array.isArray(coordinate) &&
    coordinate.length === 2 &&
    Number.isFinite(coordinate[0]) &&
    coordinate[0] >= -180 &&
    coordinate[0] <= 180 &&
    Number.isFinite(coordinate[1]) &&
    coordinate[1] >= -90 &&
    coordinate[1] <= 90
  );
}

function segmentAtDistance(
  cumulativeMeters: number[],
  targetMeters: number,
  minimumSegment: number,
): number {
  let segmentIndex = minimumSegment;
  while (
    segmentIndex < cumulativeMeters.length - 2 &&
    cumulativeMeters[segmentIndex + 1] < targetMeters
  ) {
    segmentIndex += 1;
  }
  return segmentIndex;
}
