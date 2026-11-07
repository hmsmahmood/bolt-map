import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { SubscriptionStatus } from './user-subscription.entity';

@Entity({ name: 'subscription_state_events' })
@Check(
  "\"new_status\" IN ('pending', 'active', 'grace_period', 'canceled', 'expired', 'revoked')",
)
@Index('idx_subscription_state_events_subject_created', () => ({
  subjectUserId: 1,
  createdAt: -1,
}))
@Index('idx_subscription_state_events_subscription_created', () => ({
  subscriptionId: 1,
  createdAt: -1,
}))
export class SubscriptionStateEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId: string;

  @Column({ name: 'subject_user_id', type: 'uuid' })
  subjectUserId: string;

  @Column({ name: 'previous_subject_user_id', type: 'uuid', nullable: true })
  previousSubjectUserId: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'previous_plan_key', type: 'text', nullable: true })
  previousPlanKey: string | null;

  @Column({ name: 'new_plan_key', type: 'text' })
  newPlanKey: string;

  @Column({ name: 'previous_status', type: 'text', nullable: true })
  previousStatus: SubscriptionStatus | null;

  @Column({ name: 'new_status', type: 'text' })
  newStatus: SubscriptionStatus;

  @Column({ name: 'change_source', type: 'text', default: 'database' })
  changeSource: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
