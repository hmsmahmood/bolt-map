import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionPlan } from './subscription-plan.entity';
import { User } from './user.entity';

export type SubscriptionStatus =
  'pending' | 'active' | 'grace_period' | 'canceled' | 'expired' | 'revoked';

@Entity({ name: 'user_subscriptions' })
@Check(
  "\"status\" IN ('pending', 'active', 'grace_period', 'canceled', 'expired', 'revoked')",
)
@Check(
  '"current_period_start" IS NULL OR "current_period_end" IS NULL OR "current_period_end" >= "current_period_start"',
)
@Index('idx_user_subscriptions_user_updated', () => ({
  userId: 1,
  updatedAt: -1,
}))
@Index('idx_user_subscriptions_status_period', ['status', 'currentPeriodEnd'])
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'plan_key', type: 'text' })
  planKey: string;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_key', referencedColumnName: 'planKey' })
  plan: SubscriptionPlan;

  @Column({ type: 'text' })
  status: SubscriptionStatus;

  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
