import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'subscription_entitlement_definitions' })
@Check('"entitlement_key" ~ \'^[a-z][a-z0-9_.-]{0,127}$\'')
@Check("\"value_type\" IN ('boolean', 'integer', 'number', 'string', 'object')")
@Check('jsonb_typeof("description") = \'object\'')
export class SubscriptionEntitlementDefinition {
  @PrimaryColumn({ name: 'entitlement_key', type: 'text' })
  entitlementKey: string;

  @Column({ name: 'value_type', type: 'text' })
  valueType: 'boolean' | 'integer' | 'number' | 'string' | 'object';

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  description: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
