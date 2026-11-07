import { EntityManager } from 'typeorm';
import { CommunityIncidentService } from './community-incident.service';

describe('CommunityIncidentService', () => {
  let service: CommunityIncidentService;
  let dataSource: {
    query: jest.Mock;
    manager: { query: jest.Mock };
    transaction: jest.Mock;
  };
  let transactionManager: { query: jest.Mock };

  const reportRow = {
    id: 'report-id',
    reporterId: 'user-id',
    type: 'road_hazard',
    lat: '3.139',
    lng: '101.686',
    createdAt: '2026-11-04T10:00:00.000Z',
    expiresAt: '2026-11-04T12:00:00.000Z',
    confirmations: '3',
    clears: '0',
  };

  beforeEach(() => {
    transactionManager = { query: jest.fn() };
    dataSource = {
      query: jest.fn(),
      manager: { query: jest.fn() },
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(transactionManager as unknown as EntityManager),
      ),
    };
    service = new CommunityIncidentService(dataSource as never);
  });

  it('lists only records returned by the active-radius database query and labels provenance', async () => {
    dataSource.query.mockResolvedValue([reportRow]);

    await expect(
      service.listNearby({ lat: 3.139, lng: 101.686 }, 3000, 'user-id'),
    ).resolves.toEqual([
      {
        id: 'report-id',
        type: 'road_hazard',
        lat: 3.139,
        lng: 101.686,
        createdAt: reportRow.createdAt,
        expiresAt: reportRow.expiresAt,
        confirmations: 3,
        clears: 0,
        confidence: 'community_confirmed',
        source: 'community_report',
        isMine: true,
      },
    ]);
    expect(dataSource.query.mock.calls[0][0]).toContain(
      "report.status = 'active'",
    );
    expect(dataSource.query.mock.calls[0][0]).toContain(
      'report.expires_at > NOW()',
    );
  });

  it('creates a short-lived report and records the reporter confirmation atomically', async () => {
    transactionManager.query.mockResolvedValueOnce([]);
    transactionManager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'report-id' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reportRow]);

    await expect(
      service.create('user-id', 'road_hazard', { lat: 3.139, lng: 101.686 }),
    ).resolves.toMatchObject({
      duplicate: false,
      incident: { id: 'report-id', source: 'community_report' },
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(
      transactionManager.query.mock.calls.filter(([sql]) =>
        String(sql).includes('pg_advisory_xact_lock'),
      ),
    ).toHaveLength(1);
    expect(transactionManager.query.mock.calls[0][0]).toContain(
      'pg_advisory_xact_lock',
    );
    expect(transactionManager.query.mock.calls[1][0]).toContain('ST_DWithin');
    expect(transactionManager.query.mock.calls[1][1]).toEqual([
      'road_hazard',
      101.686,
      3.139,
    ]);
    expect(
      transactionManager.query.mock.calls.some(([sql]) =>
        String(sql).includes("VALUES ($1, $2, 'confirm')"),
      ),
    ).toBe(true);
    expect(transactionManager.query.mock.calls[4][0]).toContain(
      'INSERT INTO community_incident_audit_events',
    );
    expect(transactionManager.query.mock.calls[4][1]).toEqual([
      'user-id',
      'report.create',
      'report-id',
      'created',
      null,
    ]);
    expect(
      JSON.stringify(transactionManager.query.mock.calls[4]),
    ).not.toContain('3.139');
  });

  it('merges a nearby duplicate and does not create another report branch', async () => {
    transactionManager.query.mockResolvedValueOnce([]);
    transactionManager.query
      .mockResolvedValueOnce([{ id: 'existing-id' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reportRow]);

    await expect(
      service.create('another-user', 'road_hazard', {
        lat: 3.139,
        lng: 101.686,
      }),
    ).resolves.toMatchObject({
      duplicate: true,
      incident: { id: 'report-id' },
    });
    expect(
      transactionManager.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO community_incident_reports'),
      ),
    ).toBe(false);
    expect(
      transactionManager.query.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('INSERT INTO community_incident_audit_events') &&
          (params as unknown[])[3] === 'merged',
      ),
    ).toBe(true);
  });

  it('keeps a user vote immutable and labels totals as community-sourced', async () => {
    transactionManager.query
      .mockResolvedValueOnce([{ id: 'report-id', voteRecorded: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...reportRow, confirmations: '2', clears: '3' },
      ]);

    await expect(
      service.vote('user-id', 'report-id', 'clear'),
    ).resolves.toMatchObject({
      confidence: 'community_disputed',
      source: 'community_report',
    });
    expect(transactionManager.query.mock.calls[0][0]).toContain(
      'ON CONFLICT (report_id, user_id) DO NOTHING',
    );
    expect(transactionManager.query.mock.calls[0][0]).not.toContain(
      'DO UPDATE',
    );
    expect(transactionManager.query.mock.calls[1][1]).toEqual([
      'user-id',
      'report.vote',
      'report-id',
      'recorded',
      'clear',
    ]);
  });

  it('rejects votes for missing or expired incidents', async () => {
    transactionManager.query.mockResolvedValueOnce([]);

    await expect(
      service.vote('user-id', 'report-id', 'confirm'),
    ).rejects.toThrow('Active community incident not found.');
    expect(transactionManager.query).toHaveBeenCalledTimes(1);
  });

  it('audits owned and denied deletes without weakening owner checks', async () => {
    transactionManager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await expect(
      service.deleteOwned('another-user', 'report-id'),
    ).rejects.toThrow('Community incident report not found.');
    expect(transactionManager.query.mock.calls[1][1]).toEqual([
      'another-user',
      'report.delete',
      'report-id',
      'not_owned_or_missing',
      null,
    ]);

    transactionManager.query
      .mockResolvedValueOnce([{ id: 'report-id' }])
      .mockResolvedValueOnce([]);
    await expect(
      service.deleteOwned('user-id', 'report-id'),
    ).resolves.toBeUndefined();
    expect(transactionManager.query.mock.calls[2][0]).toContain(
      'WHERE id = $1 AND reporter_id = $2',
    );
    expect(transactionManager.query.mock.calls[3][1]).toEqual([
      'user-id',
      'report.delete',
      'report-id',
      'deleted',
      null,
    ]);
  });

  it('purges reports after the retention window', async () => {
    await service.purgeExpiredReports();
    expect(dataSource.query.mock.calls[0][0]).toContain(
      "SET status = 'expired'",
    );
    expect(dataSource.query.mock.calls[1][0]).toContain("INTERVAL '7 days'");
  });
});
