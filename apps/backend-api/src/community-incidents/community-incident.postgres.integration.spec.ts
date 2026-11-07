import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { CommunityIncidentService } from './community-incident.service';

const databaseUrl = process.env.COMMUNITY_INCIDENT_TEST_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;

postgresDescribe('CommunityIncidentService PostgreSQL integration', () => {
  let dataSource: DataSource;
  let service: CommunityIncidentService;
  const userIds = [randomUUID(), randomUUID(), randomUUID()];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
    });
    await dataSource.initialize();
    service = new CommunityIncidentService(dataSource);
    await Promise.all(
      userIds.map((id) =>
        dataSource.query(
          `INSERT INTO users (id, email, password_hash, full_name, role)
           VALUES ($1, $2, 'integration-test-hash', 'Integration Test', 'rider')`,
          [id, `community-${id}@example.invalid`],
        ),
      ),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        userIds,
      ]);
      await dataSource.destroy();
    }
  });

  function coordinate(): { lat: number; lng: number } {
    return {
      lat: 3 + Math.random(),
      lng: 101 + Math.random(),
    };
  }

  it('merges same-category reports only within 75 metres and returns nearby reports', async () => {
    const center = coordinate();
    const original = await service.create(userIds[0], 'accident', center);
    const nearby = await service.create(userIds[1], 'accident', {
      lat: center.lat,
      lng: center.lng + 0.0004,
    });
    const separate = await service.create(userIds[2], 'accident', {
      lat: center.lat,
      lng: center.lng + 0.001,
    });

    expect(original.duplicate).toBe(false);
    expect(nearby.duplicate).toBe(true);
    expect(nearby.incident.id).toBe(original.incident.id);
    expect(separate.duplicate).toBe(false);
    expect(separate.incident.id).not.toBe(original.incident.id);

    const reports = await service.listNearby(center, 75, userIds[0]);
    expect(reports.map(({ id }) => id)).toContain(original.incident.id);
    expect(reports.map(({ id }) => id)).not.toContain(separate.incident.id);
  });

  it('allows one immutable vote per user and enforces owner-only deletion', async () => {
    const center = coordinate();
    const { incident } = await service.create(
      userIds[0],
      'road_hazard',
      center,
    );
    expect(incident.isMine).toBe(true);

    await service.vote(userIds[1], incident.id, 'clear');
    const repeatedVote = await service.vote(userIds[1], incident.id, 'confirm');
    expect(repeatedVote.isMine).toBe(false);
    expect(repeatedVote.confirmations).toBe(1);
    expect(repeatedVote.clears).toBe(1);

    const owners = await dataSource.query(
      'SELECT reporter_id FROM community_incident_reports WHERE id = $1',
      [incident.id],
    );
    expect(owners[0].reporter_id).toBe(userIds[0]);
    expect(userIds[1]).not.toBe(owners[0].reporter_id);
    await expect(service.deleteOwned(userIds[1], incident.id)).rejects.toThrow(
      'Community incident report not found.',
    );
    await expect(
      dataSource.query(
        'SELECT id FROM community_incident_reports WHERE id = $1',
        [incident.id],
      ),
    ).resolves.toHaveLength(1);

    await service.deleteOwned(userIds[0], incident.id);
    await expect(
      dataSource.query(
        'SELECT id FROM community_incident_reports WHERE id = $1',
        [incident.id],
      ),
    ).resolves.toHaveLength(0);
  });

  it('records append-only audit events for report create, vote, and delete operations', async () => {
    const center = coordinate();
    const { incident } = await service.create(userIds[0], 'congestion', center);
    await service.vote(userIds[1], incident.id, 'clear');
    await service.vote(userIds[1], incident.id, 'confirm');
    await expect(service.deleteOwned(userIds[1], incident.id)).rejects.toThrow(
      'Community incident report not found.',
    );
    await service.deleteOwned(userIds[0], incident.id);

    const events = (await dataSource.query(
      `SELECT actor_user_id, event_type, incident_id, outcome, vote, created_at
       FROM community_incident_audit_events
       WHERE incident_id = $1
       ORDER BY created_at, id`,
      [incident.id],
    )) as Array<{
      actor_user_id: string;
      event_type: string;
      incident_id: string;
      outcome: string;
      vote: string | null;
      created_at: Date | string;
    }>;
    expect(
      events.map((event) => ({
        actor_user_id: event.actor_user_id,
        event_type: event.event_type,
        incident_id: event.incident_id,
        outcome: event.outcome,
        vote: event.vote,
        hasTimestamp:
          event.created_at instanceof Date ||
          typeof event.created_at === 'string',
      })),
    ).toEqual([
      {
        actor_user_id: userIds[0],
        event_type: 'report.create',
        incident_id: incident.id,
        outcome: 'created',
        vote: null,
        hasTimestamp: true,
      },
      {
        actor_user_id: userIds[1],
        event_type: 'report.vote',
        incident_id: incident.id,
        outcome: 'recorded',
        vote: 'clear',
        hasTimestamp: true,
      },
      {
        actor_user_id: userIds[1],
        event_type: 'report.vote',
        incident_id: incident.id,
        outcome: 'already_voted',
        vote: 'confirm',
        hasTimestamp: true,
      },
      {
        actor_user_id: userIds[1],
        event_type: 'report.delete',
        incident_id: incident.id,
        outcome: 'not_owned_or_missing',
        vote: null,
        hasTimestamp: true,
      },
      {
        actor_user_id: userIds[0],
        event_type: 'report.delete',
        incident_id: incident.id,
        outcome: 'deleted',
        vote: null,
        hasTimestamp: true,
      },
    ]);

    await expect(
      dataSource.query(
        `UPDATE community_incident_audit_events
         SET outcome = 'created'
         WHERE incident_id = $1`,
        [incident.id],
      ),
    ).rejects.toThrow('append-only');
    await expect(
      dataSource.query(
        'DELETE FROM community_incident_audit_events WHERE incident_id = $1',
        [incident.id],
      ),
    ).rejects.toThrow('append-only');

    const auditColumns = (await dataSource.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'community_incident_audit_events'`,
    )) as Array<{ column_name: string }>;
    expect(auditColumns.map(({ column_name }) => column_name)).not.toContain(
      'location',
    );
  });

  it('serializes concurrent nearby submissions into a single incident', async () => {
    const center = coordinate();
    const submissions = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        service.create(userIds[index % userIds.length], 'road_closure', {
          lat: center.lat,
          lng: center.lng,
        }),
      ),
    );

    expect(submissions.filter(({ duplicate }) => !duplicate)).toHaveLength(1);
    expect(new Set(submissions.map(({ incident }) => incident.id)).size).toBe(
      1,
    );
    const rows = await dataSource.query(
      `SELECT COUNT(*)::integer AS count
       FROM community_incident_reports
       WHERE report_type = 'road_closure'
         AND ST_DWithin(
           location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           75
         )`,
      [center.lng, center.lat],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('hides expired reports immediately and retains them only through the seven-day window', async () => {
    const center = coordinate();
    const { incident } = await service.create(userIds[0], 'breakdown', center);
    await dataSource.query(
      `UPDATE community_incident_reports
       SET created_at = NOW() - INTERVAL '10 days',
           expires_at = NOW() - INTERVAL '6 days 23 hours'
       WHERE id = $1`,
      [incident.id],
    );

    await expect(service.listNearby(center, 75, userIds[0])).resolves.toEqual(
      [],
    );
    await service.purgeExpiredReports();
    const retained = await dataSource.query(
      'SELECT status FROM community_incident_reports WHERE id = $1',
      [incident.id],
    );
    expect(retained[0].status).toBe('expired');

    await dataSource.query(
      `UPDATE community_incident_reports
       SET expires_at = NOW() - INTERVAL '7 days 1 second'
       WHERE id = $1`,
      [incident.id],
    );
    await service.purgeExpiredReports();
    await expect(
      dataSource.query(
        'SELECT id FROM community_incident_reports WHERE id = $1',
        [incident.id],
      ),
    ).resolves.toHaveLength(0);
  });
});
