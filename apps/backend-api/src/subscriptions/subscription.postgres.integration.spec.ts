import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { SubscriptionEntitlementDefinition } from '../entities/subscription-entitlement-definition.entity';
import { SubscriptionPlanEntitlement } from '../entities/subscription-plan-entitlement.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SubscriptionStateEvent } from '../entities/subscription-state-event.entity';
import { SubscriptionTransactionReference } from '../entities/subscription-transaction-reference.entity';
import { User } from '../entities/user.entity';
import { UserSubscription } from '../entities/user-subscription.entity';
import { SubscriptionService } from './subscription.service';

const databaseUrl = process.env.COMMUNITY_INCIDENT_TEST_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;

postgresDescribe('Subscription foundation PostgreSQL integration', () => {
  let dataSource: DataSource;
  let service: SubscriptionService;
  const userIds = [randomUUID(), randomUUID()];
  const runKey = randomUUID().replace(/-/g, '').slice(0, 12);
  const planKey = `pro_${runKey}`;
  const entitlementKey = `feature_${runKey}`;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [
        User,
        SubscriptionPlan,
        SubscriptionEntitlementDefinition,
        SubscriptionPlanEntitlement,
        UserSubscription,
        SubscriptionTransactionReference,
        SubscriptionStateEvent,
      ],
      synchronize: false,
    });
    await dataSource.initialize();
    service = new SubscriptionService(dataSource);
    await Promise.all(
      userIds.map((id) =>
        dataSource.query(
          `INSERT INTO users (id, email, password_hash, full_name, role)
           VALUES ($1, $2, 'integration-test-hash', 'Integration Test', 'rider')`,
          [id, `subscription-${id}@example.invalid`],
        ),
      ),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        userIds,
      ]);
      await dataSource.query(
        'DELETE FROM subscription_plan_entitlements WHERE plan_key = $1',
        [planKey],
      );
      await dataSource.query(
        'DELETE FROM subscription_entitlement_definitions WHERE entitlement_key = $1',
        [entitlementKey],
      );
      await dataSource.query(
        'DELETE FROM subscription_plans WHERE plan_key = $1',
        [planKey],
      );
      await dataSource.destroy();
    }
  });

  it('stores no seeded plan values and resolves only the requesting user’s configured entitlements', async () => {
    await dataSource.query(
      `INSERT INTO subscription_plans (plan_key, display_name, description, is_active)
       VALUES ($1, $2, '{}'::jsonb, TRUE)`,
      [planKey, JSON.stringify({ en: 'Integration plan' })],
    );
    await dataSource.query(
      `INSERT INTO subscription_entitlement_definitions
         (entitlement_key, value_type)
       VALUES ($1, 'boolean')`,
      [entitlementKey],
    );
    await dataSource.query(
      `INSERT INTO subscription_plan_entitlements
         (plan_key, entitlement_key, is_enabled, quota_limit, value)
       VALUES ($1, $2, TRUE, NULL, 'true'::jsonb)`,
      [planKey, entitlementKey],
    );
    await dataSource.query(
      `INSERT INTO user_subscriptions (user_id, plan_key, status)
       VALUES ($1, $2, 'active')`,
      [userIds[0], planKey],
    );
    const actorlessEvents = (await dataSource.query(
      `SELECT actor_user_id
       FROM subscription_state_events
       WHERE subject_user_id = $1`,
      [userIds[0]],
    )) as Array<{ actor_user_id: string | null }>;
    expect(actorlessEvents).toEqual([{ actor_user_id: null }]);

    await expect(
      service.resolveEntitlements(userIds[0]),
    ).resolves.toMatchObject({
      resolution: 'resolved',
      subscription: { planKey, status: 'active' },
      entitlements: [
        {
          key: entitlementKey,
          valueType: 'boolean',
          enabled: true,
          quotaLimit: null,
          value: true,
        },
      ],
    });
    await expect(service.resolveEntitlements(userIds[1])).resolves.toEqual({
      resolution: 'no_active_subscription',
      subscription: null,
      entitlements: [],
    });
    await expect(service.getCurrentSubscription(userIds[1])).resolves.toEqual({
      subscription: null,
    });

    const planColumns = (await dataSource.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'subscription_plans'`,
    )) as Array<{ column_name: string }>;
    expect(planColumns.map(({ column_name }) => column_name)).not.toContain(
      'price',
    );
    const transactionColumns = (await dataSource.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'subscription_transaction_references'`,
    )) as Array<{ column_name: string }>;
    expect(
      transactionColumns.map(({ column_name }) => column_name),
    ).not.toContain('receipt');
    expect(
      transactionColumns.map(({ column_name }) => column_name),
    ).not.toContain('purchase_token');
  });

  it('audits subscription state changes and keeps transaction references unique', async () => {
    const inserted = (await dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.actor_user_id', $1, TRUE)`, [
        userIds[0],
      ]);
      return manager.query(
        `INSERT INTO user_subscriptions (user_id, plan_key, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [userIds[0], planKey],
      );
    })) as Array<{ id: string }>;
    const subscriptionId = inserted[0].id;

    await dataSource.query(
      `INSERT INTO subscription_transaction_references
         (subscription_id, provider, transaction_reference)
       VALUES ($1, 'test', $2)`,
      [subscriptionId, `transaction-${runKey}`],
    );
    await expect(
      dataSource.query(
        `INSERT INTO subscription_transaction_references
           (subscription_id, provider, transaction_reference)
         VALUES ($1, 'test', $2)`,
        [subscriptionId, `transaction-${runKey}`],
      ),
    ).rejects.toThrow();

    await dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.actor_user_id', $1, TRUE)`, [
        userIds[0],
      ]);
      await manager.query(
        `UPDATE user_subscriptions
         SET status = 'expired'
         WHERE id = $1`,
        [subscriptionId],
      );
    });
    const events = (await dataSource.query(
      `SELECT subject_user_id, actor_user_id, previous_status, new_status, change_source
       FROM subscription_state_events
       WHERE subscription_id = $1
       ORDER BY created_at, id`,
      [subscriptionId],
    )) as Array<{
      subject_user_id: string;
      actor_user_id: string | null;
      previous_status: string | null;
      new_status: string;
      change_source: string;
    }>;
    expect(events).toEqual([
      {
        subject_user_id: userIds[0],
        actor_user_id: userIds[0],
        previous_status: null,
        new_status: 'active',
        change_source: 'database',
      },
      {
        subject_user_id: userIds[0],
        actor_user_id: userIds[0],
        previous_status: 'active',
        new_status: 'expired',
        change_source: 'database',
      },
    ]);

    await expect(
      dataSource.query(
        `UPDATE subscription_state_events
         SET new_status = 'active'
         WHERE subscription_id = $1`,
        [subscriptionId],
      ),
    ).rejects.toThrow('append-only');
    await expect(
      dataSource.query(
        'DELETE FROM subscription_state_events WHERE subscription_id = $1',
        [subscriptionId],
      ),
    ).rejects.toThrow('append-only');
  });

  it('does not resolve entitlements when more than one active subscription exists', async () => {
    await dataSource.query(
      `INSERT INTO user_subscriptions (user_id, plan_key, status)
       VALUES ($1, $2, 'active'), ($1, $2, 'active')`,
      [userIds[0], planKey],
    );

    await expect(service.resolveEntitlements(userIds[0])).resolves.toEqual({
      resolution: 'ambiguous_active_subscriptions',
      subscription: null,
      entitlements: [],
    });
  });
});
