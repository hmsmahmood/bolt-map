import {
  Logger,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { DataSource } from 'typeorm';

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return {count, redis.call('TTL', KEYS[1])}
`;

const LOGIN_ATTEMPT_SCRIPT = `
local retry = redis.call('TTL', KEYS[2])
if retry > 0 then
  return {1, retry}
end

local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], 900)
end

if count > 5 then
  local level = redis.call('INCR', KEYS[3])
  if level == 1 then
    redis.call('EXPIRE', KEYS[3], 2592000)
  end
  local duration = math.min(900 * (2 ^ (level - 1)), 86400)
  redis.call('SET', KEYS[2], 1, 'EX', duration)
  return {1, duration}
end

return {0, 0}
`;

export class AuthRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class AuthRateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthRateLimitService.name);
  private readonly keySecret =
    process.env.JWT_SECRET?.trim() || randomBytes(32).toString('hex');
  private redis?: ReturnType<typeof createClient>;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      return;
    }

    this.redis = createClient({ url });
    this.redis.on('error', () => {
      this.logger.error('Redis authentication rate limiter connection failed.');
    });
    try {
      await this.redis.connect();
    } catch {
      throw new ServiceUnavailableException(
        'Redis authentication rate limiting is unavailable.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.isOpen) {
      await this.redis.quit();
    }
  }

  key(scope: string, value: string): string {
    return createHmac('sha256', this.keySecret)
      .update(`${scope}:${value.trim().toLowerCase()}`)
      .digest('hex');
  }

  async assertAllowed(scopeHash: string): Promise<void> {
    if (this.redis) {
      const result = await this.executeRedis(
        'local retry = redis.call("TTL", KEYS[1]); return {retry}',
        [`auth-rate:login:lock:${scopeHash}`],
      );
      if (Number(result[0]) > 0) {
        throw new AuthRateLimitException(Number(result[0]));
      }
      return;
    }

    const [result] = await this.dataSource.query(
      `SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (locked_until - NOW()))))::integer AS retry_after
       FROM auth_rate_limits
       WHERE scope_hash = $1 AND locked_until > NOW()`,
      [scopeHash],
    );

    if (result) {
      throw new AuthRateLimitException(Number(result.retry_after));
    }
  }

  async consume(
    scopeHash: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    if (this.redis) {
      const result = await this.executeRedis(
        FIXED_WINDOW_SCRIPT,
        [`auth-rate:window:${scopeHash}`],
        [String(limit), String(windowSeconds)],
      );
      if (Number(result[0]) > limit) {
        throw new AuthRateLimitException(Math.max(1, Number(result[1])));
      }
      return;
    }

    const [result] = await this.dataSource.query(
      `INSERT INTO auth_rate_limits (scope_hash, attempt_count, window_started_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (scope_hash) DO UPDATE SET
         attempt_count = CASE
           WHEN auth_rate_limits.window_started_at <= NOW() - ($3 * INTERVAL '1 second') THEN 1
           ELSE auth_rate_limits.attempt_count + 1
         END,
         window_started_at = CASE
           WHEN auth_rate_limits.window_started_at <= NOW() - ($3 * INTERVAL '1 second') THEN NOW()
           ELSE auth_rate_limits.window_started_at
         END,
         locked_until = CASE
           WHEN auth_rate_limits.window_started_at <= NOW() - ($3 * INTERVAL '1 second') THEN NULL
           WHEN auth_rate_limits.attempt_count + 1 > $2 THEN
             auth_rate_limits.window_started_at + ($3 * INTERVAL '1 second')
           ELSE auth_rate_limits.locked_until
         END,
         updated_at = NOW()
       RETURNING attempt_count, locked_until, window_started_at`,
      [scopeHash, limit, windowSeconds],
    );

    if (result.attempt_count > limit || result.locked_until > new Date()) {
      const retryAfter = result.locked_until
        ? Math.max(1, Math.ceil((new Date(result.locked_until).getTime() - Date.now()) / 1000))
        : Math.max(1, Math.ceil((new Date(result.window_started_at).getTime() + windowSeconds * 1000 - Date.now()) / 1000));
      throw new AuthRateLimitException(retryAfter);
    }
  }

  async consumeLoginAttempt(scopeHash: string): Promise<void> {
    if (this.redis) {
      const result = await this.executeRedis(LOGIN_ATTEMPT_SCRIPT, [
        `auth-rate:login:attempt:${scopeHash}`,
        `auth-rate:login:lock:${scopeHash}`,
        `auth-rate:login:level:${scopeHash}`,
      ]);
      if (Number(result[0]) === 1) {
        throw new AuthRateLimitException(Math.max(1, Number(result[1])));
      }
      return;
    }

    const [result] = await this.dataSource.query(
      `INSERT INTO auth_rate_limits (scope_hash, attempt_count, window_started_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (scope_hash) DO UPDATE SET
         attempt_count = CASE
           WHEN auth_rate_limits.locked_until > NOW() THEN auth_rate_limits.attempt_count
           WHEN auth_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes' THEN 1
           ELSE auth_rate_limits.attempt_count + 1
         END,
         window_started_at = CASE
           WHEN auth_rate_limits.locked_until > NOW() THEN auth_rate_limits.window_started_at
           WHEN auth_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes' THEN NOW()
           ELSE auth_rate_limits.window_started_at
         END,
         locked_until = CASE
           WHEN auth_rate_limits.locked_until > NOW() THEN auth_rate_limits.locked_until
           WHEN auth_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes' THEN NULL
           WHEN auth_rate_limits.attempt_count + 1 > 5 THEN
             NOW() + (LEAST(900 * (2 ^ auth_rate_limits.lockout_level)::integer, 86400) * INTERVAL '1 second')
           ELSE auth_rate_limits.locked_until
         END,
         lockout_level = CASE
           WHEN auth_rate_limits.locked_until > NOW() THEN auth_rate_limits.lockout_level
           WHEN auth_rate_limits.window_started_at > NOW() - INTERVAL '15 minutes'
             AND auth_rate_limits.attempt_count + 1 > 5
             THEN LEAST(auth_rate_limits.lockout_level + 1, 7)
           ELSE auth_rate_limits.lockout_level
         END,
         updated_at = NOW()
       RETURNING locked_until`,
      [scopeHash],
    );

    if (result.locked_until) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(result.locked_until).getTime() - Date.now()) / 1000),
      );
      throw new AuthRateLimitException(retryAfter);
    }
  }

  async clear(scopeHash: string): Promise<void> {
    if (this.redis) {
      await this.executeRedis('return redis.call("DEL", KEYS[1], KEYS[2], KEYS[3], KEYS[4])', [
        `auth-rate:window:${scopeHash}`,
        `auth-rate:login:attempt:${scopeHash}`,
        `auth-rate:login:lock:${scopeHash}`,
        `auth-rate:login:level:${scopeHash}`,
      ]);
      return;
    }

    await this.dataSource.query(
      'DELETE FROM auth_rate_limits WHERE scope_hash = $1',
      [scopeHash],
    );
  }

  private async executeRedis(
    script: string,
    keys: string[],
    arguments_: string[] = [],
  ): Promise<unknown[]> {
    try {
      const result: unknown = await this.redis!.eval(script, { keys, arguments: arguments_ });
      if (!Array.isArray(result)) {
        throw new Error('Unexpected Redis rate limiter response.');
      }
      return result;
    } catch {
      throw new ServiceUnavailableException(
        'Authentication rate limiting is temporarily unavailable.',
      );
    }
  }
}
