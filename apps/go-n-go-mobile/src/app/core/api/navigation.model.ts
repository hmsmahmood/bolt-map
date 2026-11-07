import { VehicleType } from './vehicle-profile.model';

export interface NavigationCoordinate {
  lat: number;
  lng: number;
}

export interface NavigationRouteRequest {
  origin: NavigationCoordinate;
  destination: NavigationCoordinate;
  vehicleProfileId: string;
}

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
