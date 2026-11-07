import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'subscription_plans' })
@Check('"plan_key" ~ \'^[a-z][a-z0-9_-]{0,63}$\'')
@Check('jsonb_typeof("display_name") = \'object\'')
@Check('jsonb_typeof("description") = \'object\'')
export class SubscriptionPlan {
  @PrimaryColumn({ name: 'plan_key', type: 'text' })
  planKey: string;

  @Column({ name: 'display_name', type: 'jsonb', default: () => "'{}'::jsonb" })
  displayName: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  description: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
