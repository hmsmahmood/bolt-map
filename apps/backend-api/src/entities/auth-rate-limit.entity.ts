import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'auth_rate_limits' })
export class AuthRateLimit {
  @PrimaryColumn({ name: 'scope_hash', type: 'text' })
  scopeHash: string;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ name: 'window_started_at', type: 'timestamptz' })
  windowStartedAt: Date;

  @Column({ name: 'lockout_level', type: 'integer', default: 0 })
  lockoutLevel: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil?: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
