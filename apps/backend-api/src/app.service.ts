import { Inject, Injectable, Optional } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FleetVehicle } from './entities/fleet-vehicle.entity';
import { FloodAlert } from './entities/flood-alert.entity';
import { Incident } from './entities/incident.entity';
import { RouteEntity } from './entities/route.entity';
import { OperationalDataService } from './operations/operational-data.service';
import { RouteOptimizationService } from './optimization/route-optimization.service';

export interface RoutePlanRequestDto {
  origin: { lat: number; lng: number };
  waypoints: Array<{ lat: number; lng: number; label?: string }>;
}

@Injectable()
export class AppService {
  constructor(
    private readonly routeOptimizationService: RouteOptimizationService,
    private readonly operationalDataService: OperationalDataService,
    @Inject('FLEET_VEHICLE_REPOSITORY')
    @Optional()
    private readonly fleetVehicleRepository?: Repository<FleetVehicle>,
    @Inject('ROUTE_REPOSITORY')
    @Optional()
    private readonly routeRepository?: Repository<RouteEntity>,
    @Inject('INCIDENT_REPOSITORY')
    @Optional()
    private readonly incidentRepository?: Repository<Incident>,
    @Inject('FLOOD_ALERT_REPOSITORY')
    @Optional()
    private readonly floodAlertRepository?: Repository<FloodAlert>,
  ) {}

  private readonly routes = [
    {
      id: 'RT-1042',
      title: 'KLIA to Petaling Jaya',
      driver: 'Aiman Razak',
      status: 'On-route',
      eta: '14 min',
      progress: 74,
      priority: 'High',
    },
    {
      id: 'RT-1187',
      title: 'Sungai Besi to Cyberjaya',
      driver: 'Siti Nabila',
      status: 'Delayed',
      eta: '22 min',
      progress: 58,
      priority: 'Medium',
    },
    {
      id: 'RT-1204',
      title: 'Cheras to Klang Valley Hub',
      driver: 'Hafiz Ismail',
      status: 'Stopped',
      eta: '06 min',
      progress: 89,
      priority: 'Critical',
    },
  ];

  private readonly incidents = [
    {
      id: 'INC-223',
      type: 'Flood risk',
      severity: 'High',
      location: 'Jalan Tun Razak',
      status: 'Monitoring',
      eta: '12 min',
    },
    {
      id: 'INC-228',
      type: 'Roadworks',
      severity: 'Medium',
      location: 'MRT Jalan Ampang',
      status: 'Diversion active',
      eta: '08 min',
    },
    {
      id: 'INC-230',
      type: 'Traffic incident',
      severity: 'Low',
      location: 'Lebuhraya Damansara Puchong',
      status: 'Cleared',
      eta: '03 min',
    },
  ];

  private readonly fleet = [
    { id: 'V-301', driver: 'Nadia', status: 'Online', battery: 86, speed: 62 },
    { id: 'V-402', driver: 'Kamal', status: 'Idle', battery: 72, speed: 0 },
    { id: 'V-540', driver: 'Lee', status: 'On route', battery: 92, speed: 54 },
  ];

  private readonly floodAlerts = [
    {
      id: 'FLOOD-01',
      area: 'Jalan Perak',
      level: 'High risk',
      rainfall: '84 mm/hr',
      action: 'Deploy culvert inspection team',
    },
    {
      id: 'FLOOD-02',
      area: 'Shah Alam',
      level: 'Moderate',
      rainfall: '62 mm/hr',
      action: 'Monitor drainage pumps',
    },
  ];

  private readonly safetySignals = [
    { zone: 'Jalan Ampang', risk: 'Moderate', score: 71 },
    { zone: 'LDP', risk: 'High', score: 84 },
    { zone: 'Kota Damansara', risk: 'Low', score: 39 },
  ];

  private readonly adminScores = {
    compliance: 98,
    coverage: 94,
    uptime: 99.7,
    response: 3.2,
  };

  getHealth() {
    return {
      status: 'ok',
      service: 'SMARTROUTE AI',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    };
  }

  async getDashboardSummary() {
    return this.operationalDataService.getDashboardSummary({
      routes: this.routes,
      incidents: this.incidents,
      fleet: this.fleet,
      floodAlerts: this.floodAlerts,
    });
  }

  async getRoutes() {
    return this.operationalDataService.getRoutes(this.routes);
  }

  async getIncidents() {
    return this.operationalDataService.getIncidents(this.incidents);
  }

  async getFleet() {
    return this.operationalDataService.getFleet(this.fleet);
  }

  getNavigationOverview() {
    return {
      mode: 'Malaysia, Singapore, Thailand',
      routeQuality: 'Optimised',
      recommended: 'Avoid severe flood corridor near Jalan Perak',
      activeCorridors: 11,
      etaVariance: '-2.1 min',
    };
  }

  async getFloodIntelligence() {
    return this.operationalDataService.getFloodAlerts(this.floodAlerts);
  }

  getRoadSafetySignals() {
    return this.safetySignals;
  }

  getAdminOverview() {
    return this.adminScores;
  }

  buildOptimizedRoute(payload: RoutePlanRequestDto) {
    return this.routeOptimizationService.buildOptimizedRoute(payload.origin, payload.waypoints ?? []);
  }
}
