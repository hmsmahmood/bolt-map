import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { SubscriptionEntitlementDefinition } from './subscription-entitlement-definition.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity({ name: 'subscription_plan_entitlements' })
@Check('"quota_limit" IS NULL OR "quota_limit" >= 0')
export class SubscriptionPlanEntitlement {
  @PrimaryColumn({ name: 'plan_key', type: 'text' })
  planKey: string;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_key', referencedColumnName: 'planKey' })
  plan: SubscriptionPlan;

  @PrimaryColumn({ name: 'entitlement_key', type: 'text' })
  entitlementKey: string;

  @ManyToOne(() => SubscriptionEntitlementDefinition, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'entitlement_key',
    referencedColumnName: 'entitlementKey',
  })
  definition: SubscriptionEntitlementDefinition;

  @Column({ name: 'is_enabled', type: 'boolean' })
  isEnabled: boolean;

  @Column({ name: 'quota_limit', type: 'bigint', nullable: true })
  quotaLimit: string | null;

  @Column({ type: 'jsonb', default: () => "'null'::jsonb" })
  value: unknown;
}
