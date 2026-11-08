import { getMetadataArgsStorage } from 'typeorm';
import { SubscriptionEntitlementDefinition } from '../entities/subscription-entitlement-definition.entity';
import { SubscriptionPlanEntitlement } from '../entities/subscription-plan-entitlement.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SubscriptionStateEvent } from '../entities/subscription-state-event.entity';
import { SubscriptionTransactionReference } from '../entities/subscription-transaction-reference.entity';
import { UserSubscription } from '../entities/user-subscription.entity';

type SubscriptionEntityConstructor =
  | typeof UserSubscription
  | typeof SubscriptionTransactionReference
  | typeof SubscriptionStateEvent;

describe('Subscription TypeORM entities', () => {
  const tableMappings = [
    [SubscriptionPlan, 'subscription_plans'],
    [SubscriptionEntitlementDefinition, 'subscription_entitlement_definitions'],
    [SubscriptionPlanEntitlement, 'subscription_plan_entitlements'],
    [UserSubscription, 'user_subscriptions'],
    [SubscriptionTransactionReference, 'subscription_transaction_references'],
    [SubscriptionStateEvent, 'subscription_state_events'],
  ] as const;

  it('maps each subscription table to its migration-defined name', () => {
    const tables = getMetadataArgsStorage().tables;

    for (const [entity, tableName] of tableMappings) {
      expect(tables.find((table) => table.target === entity)?.name).toBe(
        tableName,
      );
    }
  });

  it('maps the ownership, lifecycle, and audit columns used by the schema', () => {
    const columns = getMetadataArgsStorage().columns;
    const expectedColumns: Array<[SubscriptionEntityConstructor, string[]]> = [
      [UserSubscription, ['user_id', 'plan_key', 'status']],
      [
        SubscriptionTransactionReference,
        ['subscription_id', 'transaction_reference'],
      ],
      [
        SubscriptionStateEvent,
        ['subscription_id', 'subject_user_id', 'actor_user_id', 'new_status'],
      ],
    ];

    for (const [entity, expected] of expectedColumns) {
      const actual = columns
        .filter((column) => column.target === entity)
        .map((column) => column.options.name ?? column.propertyName);

      expect(actual).toEqual(expect.arrayContaining(expected));
    }
  });

  it('declares the lifecycle indexes and unique transaction reference', () => {
    const indices = getMetadataArgsStorage().indices;

    expect(
      indices.some(
        (index) =>
          index.target === UserSubscription &&
          index.name === 'idx_user_subscriptions_user_updated',
      ),
    ).toBe(true);
    expect(
      indices.some(
        (index) =>
          index.target === SubscriptionStateEvent &&
          index.name === 'idx_subscription_state_events_subject_created',
      ),
    ).toBe(true);
    expect(
      indices.some(
        (index) =>
          index.target === SubscriptionTransactionReference &&
          index.name ===
            'subscription_transaction_refe_provider_transaction_referenc_key' &&
          index.unique === true,
      ),
    ).toBe(true);
  });

  it('records migration index column direction in TypeORM metadata', () => {
    const indices = getMetadataArgsStorage().indices;
    const expected = [
      {
        target: UserSubscription,
        name: 'idx_user_subscriptions_user_updated',
        columns: { userId: 1, updatedAt: -1 },
      },
      {
        target: SubscriptionTransactionReference,
        name: 'idx_subscription_transactions_subscription',
        columns: { subscriptionId: 1, createdAt: -1 },
      },
      {
        target: SubscriptionStateEvent,
        name: 'idx_subscription_state_events_subject_created',
        columns: { subjectUserId: 1, createdAt: -1 },
      },
      {
        target: SubscriptionStateEvent,
        name: 'idx_subscription_state_events_subscription_created',
        columns: { subscriptionId: 1, createdAt: -1 },
      },
    ];

    for (const index of expected) {
      const metadata = indices.find(
        (candidate) =>
          candidate.target === index.target && candidate.name === index.name,
      );
      expect(metadata).toBeDefined();
      expect(typeof metadata?.columns).toBe('function');
      if (typeof metadata?.columns === 'function') {
        expect(metadata.columns()).toEqual(index.columns);
      }
    }
  });
});
