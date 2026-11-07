import { Inject, Injectable, Optional } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FleetVehicle } from '../entities/fleet-vehicle.entity';
import { FloodAlert } from '../entities/flood-alert.entity';
import { Incident } from '../entities/incident.entity';
import { RouteEntity } from '../entities/route.entity';

export interface DashboardOperationalSeed {
  routes: Array<Record<string, unknown>>;
  incidents: Array<Record<string, unknown>>;
  fleet: Array<Record<string, unknown>>;
  floodAlerts: Array<Record<string, unknown>>;
}

@Injectable()
export class OperationalDataService {
  constructor(
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

  async getRoutes(seed: Array<Record<string, unknown>> = []): Promise<Array<Record<string, unknown>>> {
    if (this.routeRepository) {
      try {
        const records = await this.routeRepository.find({
          order: { updatedAt: 'DESC' },
          take: 10,
        });

        if (records.length > 0) {
          return records.map((route) => ({
            id: route.externalId,
            title: route.title,
            driver: route.driverName,
            status: route.status,
            eta: `${route.etaMinutes} min`,
            progress: route.progressPercent,
            priority: route.priority,
          }));
        }
      } catch {
        // fall through to the seed payload when Postgres is unavailable
      }
    }

    return seed;
  }

  async getIncidents(seed: Array<Record<string, unknown>> = []): Promise<Array<Record<string, unknown>>> {
    if (this.incidentRepository) {
      try {
        const records = await this.incidentRepository.find({
          order: { updatedAt: 'DESC' },
          take: 10,
        });

        if (records.length > 0) {
          return records.map((incident) => ({
            id: incident.externalId,
            type: incident.incidentType,
            severity: incident.severity,
            location: incident.location,
            status: incident.status,
            eta: `${incident.etaMinutes} min`,
          }));
        }
      } catch {
        // fall through to the seed payload when Postgres is unavailable
      }
    }

    return seed;
  }

  async getFleet(seed: Array<Record<string, unknown>> = []): Promise<Array<Record<string, unknown>>> {
    if (this.fleetVehicleRepository) {
      try {
        const records = await this.fleetVehicleRepository.find({
          order: { updatedAt: 'DESC' },
          take: 10,
        });

        if (records.length > 0) {
          return records.map((vehicle) => ({
            id: vehicle.vehicleCode,
            driver: vehicle.driverName,
            status: vehicle.status,
            battery: vehicle.batteryLevel,
            speed: vehicle.speedKmh,
          }));
        }
      } catch {
        // fall through to the seed payload when Postgres is unavailable
      }
    }

    return seed;
  }

  async getFloodAlerts(seed: Array<Record<string, unknown>> = []): Promise<Array<Record<string, unknown>>> {
    if (this.floodAlertRepository) {
      try {
        const records = await this.floodAlertRepository.find({
          order: { updatedAt: 'DESC' },
          take: 10,
        });

        if (records.length > 0) {
          return records.map((alert) => ({
            id: alert.externalId,
            area: alert.area,
            level: alert.severity,
            rainfall: `${alert.rainfallMmHr} mm/hr`,
            action: alert.actionPlan,
          }));
        }
      } catch {
        // fall through to the seed payload when Postgres is unavailable
      }
    }

    return seed;
  }

  async getDashboardSummary(seed: DashboardOperationalSeed): Promise<Record<string, unknown>> {
    const [routes, incidents, fleet, floodAlerts] = await Promise.all([
      this.getRoutes(seed.routes),
      this.getIncidents(seed.incidents),
      this.getFleet(seed.fleet),
      this.getFloodAlerts(seed.floodAlerts),
    ]);

    return {
      overview: {
        activeTrips: 148,
        liveAlerts: 12,
        safeMiles: 89.4,
        deliveryEfficiency: 96.2,
      },
      routes,
      incidents,
      fleet,
      alertFeed: [
        'High river-level warning near Jalan Perak',
        'Two new community reports in Klang Valley',
        'Flood mitigation team dispatched to Shah Alam corridor',
      ],
      floodAlerts,
      safetySignals: [
        { zone: 'Jalan Ampang', risk: 'Moderate', score: 71 },
        { zone: 'LDP', risk: 'High', score: 84 },
        { zone: 'Kota Damansara', risk: 'Low', score: 39 },
      ],
      adminScores: {
        compliance: 98,
        coverage: 94,
        uptime: 99.7,
        response: 3.2,
      },
    };
  }
}
