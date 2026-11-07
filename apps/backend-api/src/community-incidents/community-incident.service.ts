import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

export const COMMUNITY_INCIDENT_TYPES = [
  'congestion',
  'accident',
  'road_hazard',
  'road_closure',
  'breakdown',
] as const;

export type CommunityIncidentType = (typeof COMMUNITY_INCIDENT_TYPES)[number];
export type CommunityIncidentVote = 'confirm' | 'clear';

export interface CommunityIncidentCoordinate {
  lat: number;
  lng: number;
}

export interface CommunityIncident {
  id: string;
  type: CommunityIncidentType;
  lat: number;
  lng: number;
  createdAt: string;
  expiresAt: string;
  confirmations: number;
  clears: number;
  confidence: 'unconfirmed' | 'community_confirmed' | 'community_disputed';
  source: 'community_report';
  isMine: boolean;
}

const INCIDENT_TTL_MINUTES: Record<CommunityIncidentType, number> = {
  congestion: 30,
  accident: 120,
  road_hazard: 120,
  road_closure: 240,
  breakdown: 120,
};

const INCIDENT_SELECT = `
  SELECT report.id,
         report.reporter_id AS "reporterId",
         report.report_type AS type,
         ST_Y(report.location::geometry) AS lat,
         ST_X(report.location::geometry) AS lng,
         report.created_at AS "createdAt",
         report.expires_at AS "expiresAt",
         counts.confirmations,
         counts.clears
  FROM community_incident_reports report
  CROSS JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE vote = 'confirm')::integer AS confirmations,
           COUNT(*) FILTER (WHERE vote = 'clear')::integer AS clears
    FROM community_incident_votes
    WHERE report_id = report.id
  ) counts
`;

@Injectable()
export class CommunityIncidentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommunityIncidentService.name);
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    void this.runRetentionCleanup();
    this.cleanupTimer = setInterval(
      () => void this.runRetentionCleanup(),
      60 * 60 * 1000,
    );
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  async listNearby(
    center: CommunityIncidentCoordinate,
    radiusMeters: number,
    viewerUserId: string,
  ): Promise<CommunityIncident[]> {
    const rows = (await this.dataSource.query(
      `${INCIDENT_SELECT}
       WHERE report.status = 'active'
         AND report.expires_at > NOW()
         AND ST_DWithin(
           report.location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3
         )
       ORDER BY ST_Distance(
         report.location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       )
       LIMIT 100`,
      [center.lng, center.lat, radiusMeters],
    )) as IncidentRow[];

    return rows.map((row) => toPublicIncident(row, viewerUserId));
  }

  async create(
    userId: string,
    type: CommunityIncidentType,
    coordinate: CommunityIncidentCoordinate,
  ): Promise<{ incident: CommunityIncident; duplicate: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      // Serialize each type's proximity check so concurrent nearby reports merge.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        ['community-incident-create', type],
      );
      const duplicates = (await manager.query(
        `SELECT id
         FROM community_incident_reports
         WHERE report_type = $1
           AND status = 'active'
           AND expires_at > NOW()
           AND ST_DWithin(
             location,
             ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
             75
           )
         ORDER BY ST_Distance(
           location,
           ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
         )
         LIMIT 1`,
        [type, coordinate.lng, coordinate.lat],
      )) as Array<{ id: string }>;

      const existingId = duplicates[0]?.id;
      if (existingId) {
        await manager.query(
          `INSERT INTO community_incident_votes (report_id, user_id, vote)
           VALUES ($1, $2, 'confirm')
           ON CONFLICT (report_id, user_id) DO NOTHING`,
          [existingId, userId],
        );
        await this.recordAudit(manager, {
          actorUserId: userId,
          eventType: 'report.create',
          incidentId: existingId,
          outcome: 'merged',
        });
        return {
          incident: await this.getIncident(manager, existingId, userId),
          duplicate: true,
        };
      }

      const created = (await manager.query(
        `INSERT INTO community_incident_reports (
           reporter_id,
           report_type,
           location,
           expires_at
         )
         VALUES (
           $1,
           $2,
           ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
           NOW() + ($5 * INTERVAL '1 minute')
         )
         RETURNING id`,
        [
          userId,
          type,
          coordinate.lng,
          coordinate.lat,
          INCIDENT_TTL_MINUTES[type],
        ],
      )) as Array<{ id: string }>;
      const incidentId = created[0]?.id;
      if (!incidentId) {
        throw new Error('Community incident report creation returned no ID.');
      }

      await manager.query(
        `INSERT INTO community_incident_votes (report_id, user_id, vote)
         VALUES ($1, $2, 'confirm')
         ON CONFLICT (report_id, user_id) DO NOTHING`,
        [incidentId, userId],
      );
      await this.recordAudit(manager, {
        actorUserId: userId,
        eventType: 'report.create',
        incidentId,
        outcome: 'created',
      });

      return {
        incident: await this.getIncident(manager, incidentId, userId),
        duplicate: false,
      };
    });
  }

  async vote(
    userId: string,
    incidentId: string,
    vote: CommunityIncidentVote,
  ): Promise<CommunityIncident> {
    return this.dataSource.transaction(async (manager) => {
      const result = (await manager.query(
        `WITH active_report AS MATERIALIZED (
           SELECT id
           FROM community_incident_reports
           WHERE id = $1
             AND status = 'active'
             AND expires_at > NOW()
         ),
         saved_vote AS (
           INSERT INTO community_incident_votes (report_id, user_id, vote)
           SELECT id, $2, $3 FROM active_report
           ON CONFLICT (report_id, user_id) DO NOTHING
           RETURNING report_id
         )
         SELECT id, EXISTS (SELECT 1 FROM saved_vote) AS "voteRecorded"
         FROM active_report`,
        [incidentId, userId, vote],
      )) as Array<{ id: string; voteRecorded: boolean }>;
      if (!result.length) {
        throw new NotFoundException('Active community incident not found.');
      }

      await this.recordAudit(manager, {
        actorUserId: userId,
        eventType: 'report.vote',
        incidentId,
        outcome: result[0].voteRecorded ? 'recorded' : 'already_voted',
        vote,
      });
      return this.getIncident(manager, incidentId, userId);
    });
  }

  async deleteOwned(userId: string, incidentId: string): Promise<void> {
    const deleted = await this.dataSource.transaction(async (manager) => {
      const result = (await manager.query(
        `WITH deleted AS (
           DELETE FROM community_incident_reports
           WHERE id = $1 AND reporter_id = $2
           RETURNING id
         )
         SELECT id FROM deleted`,
        [incidentId, userId],
      )) as Array<{ id: string }>;
      await this.recordAudit(manager, {
        actorUserId: userId,
        eventType: 'report.delete',
        incidentId,
        outcome: result.length ? 'deleted' : 'not_owned_or_missing',
      });
      return result.length > 0;
    });
    if (!deleted) {
      throw new NotFoundException('Community incident report not found.');
    }
  }

  async purgeExpiredReports(): Promise<void> {
    await this.dataSource.query(
      `UPDATE community_incident_reports
       SET status = 'expired'
       WHERE status = 'active' AND expires_at <= NOW()`,
    );
    await this.dataSource.query(
      `DELETE FROM community_incident_reports
       WHERE expires_at <= NOW() - INTERVAL '7 days'`,
    );
  }

  private async runRetentionCleanup(): Promise<void> {
    try {
      await this.purgeExpiredReports();
    } catch (error) {
      this.logger.error(
        'Community incident retention cleanup failed.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async getIncident(
    manager: EntityManager,
    incidentId: string,
    viewerUserId: string,
  ): Promise<CommunityIncident> {
    const rows = (await manager.query(
      `${INCIDENT_SELECT}
       WHERE report.id = $1
       LIMIT 1`,
      [incidentId],
    )) as IncidentRow[];
    if (!rows[0]) {
      throw new NotFoundException('Community incident report not found.');
    }
    return toPublicIncident(rows[0], viewerUserId);
  }

  private async recordAudit(
    manager: EntityManager,
    event: {
      actorUserId: string;
      eventType: 'report.create' | 'report.vote' | 'report.delete';
      incidentId: string;
      outcome:
        | 'created'
        | 'merged'
        | 'recorded'
        | 'already_voted'
        | 'deleted'
        | 'not_owned_or_missing';
      vote?: CommunityIncidentVote;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO community_incident_audit_events (
         actor_user_id, event_type, incident_id, outcome, vote
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.actorUserId,
        event.eventType,
        event.incidentId,
        event.outcome,
        event.vote ?? null,
      ],
    );
  }
}

interface IncidentRow {
  id: string;
  reporterId: string;
  type: CommunityIncidentType;
  lat: number | string;
  lng: number | string;
  createdAt: Date | string;
  expiresAt: Date | string;
  confirmations: number | string;
  clears: number | string;
}

function toPublicIncident(
  row: IncidentRow,
  viewerUserId: string,
): CommunityIncident {
  const confirmations = Number(row.confirmations);
  const clears = Number(row.clears);
  return {
    id: row.id,
    type: row.type,
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: new Date(row.createdAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
    confirmations,
    clears,
    confidence:
      confirmations >= 3 && confirmations > clears
        ? 'community_confirmed'
        : clears >= 3 && clears > confirmations
          ? 'community_disputed'
          : 'unconfirmed',
    source: 'community_report',
    isMine: row.reporterId === viewerUserId,
  };
}
