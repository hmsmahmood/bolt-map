import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.removeExpiredRecords().catch((error: unknown) => {
        this.logger.error('Expired authentication data cleanup failed.', error);
      });
    }, 60 * 60 * 1000);
    this.timer.unref();
    void this.removeExpiredRecords().catch((error: unknown) => {
      this.logger.error('Expired authentication data cleanup failed.', error);
    });
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async removeExpiredRecords(): Promise<void> {
    await Promise.all([
      this.dataSource.query(
        `DELETE FROM email_verification_tokens
         WHERE expires_at < NOW() - INTERVAL '7 days'`,
      ),
      this.dataSource.query(
        'DELETE FROM password_reset_tokens WHERE expires_at < NOW()',
      ),
      this.dataSource.query(
        `DELETE FROM otp_verifications
         WHERE expires_at < NOW() - INTERVAL '1 day'`,
      ),
      this.dataSource.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()'),
      this.dataSource.query(
        `DELETE FROM auth_rate_limits
         WHERE updated_at < NOW() - INTERVAL '7 days'`,
      ),
    ]);
  }
}
