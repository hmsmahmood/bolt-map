import { DataSource } from 'typeorm';
import {
  AuthRateLimitException,
  AuthRateLimitService,
} from './auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  const dataSource = { query: jest.fn() };
  let service: AuthRateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REDIS_URL;
    service = new AuthRateLimitService(dataSource as unknown as DataSource);
  });

  it('returns 429 with the remaining fixed-window delay', async () => {
    const windowStartedAt = new Date(Date.now() - 10_000);
    const lockedUntil = new Date(Date.now() + 50_000);
    dataSource.query.mockResolvedValueOnce([{
      attempt_count: 6,
      locked_until: lockedUntil,
      window_started_at: windowStartedAt,
    }]);

    await expect(service.consume('scope-hash', 5, 60)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: expect.any(Number),
    });
    expect(dataSource.query.mock.calls[0][0]).toContain(
      'auth_rate_limits.window_started_at + ($3 * INTERVAL',
    );
  });

  it('does not extend or increment a login lockout while it is active', async () => {
    dataSource.query.mockResolvedValueOnce([{
      locked_until: new Date(Date.now() + 30_000),
    }]);

    await expect(service.consumeLoginAttempt('login-hash')).rejects.toBeInstanceOf(
      AuthRateLimitException,
    );
    const query = dataSource.query.mock.calls[0][0] as string;
    expect(query).toContain(
      'WHEN auth_rate_limits.locked_until > NOW() THEN auth_rate_limits.attempt_count',
    );
    expect(query).toContain(
      'WHEN auth_rate_limits.locked_until > NOW() THEN auth_rate_limits.locked_until',
    );
  });

  it('clears attempt state after successful authentication', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await service.clear('login-hash');

    expect(dataSource.query).toHaveBeenCalledWith(
      'DELETE FROM auth_rate_limits WHERE scope_hash = $1',
      ['login-hash'],
    );
  });

  it('uses shared Redis counters when a Redis client is configured', async () => {
    const redis = { eval: jest.fn().mockResolvedValue([6, 40]) };
    Object.defineProperty(service, 'redis', { value: redis });

    await expect(service.consume('scope-hash', 5, 60)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 40,
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      { keys: ['auth-rate:window:scope-hash'], arguments: ['5', '60'] },
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
