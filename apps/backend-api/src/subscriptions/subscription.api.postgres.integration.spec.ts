import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AuthGuard } from '../auth/auth.guard';
import { RefreshToken } from '../entities/refresh-token.entity';
import { SubscriptionEntitlementDefinition } from '../entities/subscription-entitlement-definition.entity';
import { SubscriptionPlanEntitlement } from '../entities/subscription-plan-entitlement.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SubscriptionStateEvent } from '../entities/subscription-state-event.entity';
import { SubscriptionTransactionReference } from '../entities/subscription-transaction-reference.entity';
import { User } from '../entities/user.entity';
import { UserSubscription } from '../entities/user-subscription.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionService } from './subscription.service';

const databaseUrl = process.env.COMMUNITY_INCIDENT_TEST_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;
type SubscriptionEntityConstructor =
  | typeof SubscriptionPlan
  | typeof SubscriptionEntitlementDefinition
  | typeof SubscriptionPlanEntitlement
  | typeof UserSubscription
  | typeof SubscriptionTransactionReference
  | typeof SubscriptionStateEvent;
const subscriptionEntities: SubscriptionEntityConstructor[] = [
  SubscriptionPlan,
  SubscriptionEntitlementDefinition,
  SubscriptionPlanEntitlement,
  UserSubscription,
  SubscriptionTransactionReference,
  SubscriptionStateEvent,
];

postgresDescribe('Subscription API PostgreSQL integration', () => {
  const entityTargets = subscriptionEntities;
  const userIds = [randomUUID(), randomUUID()];
  const sessionIds = [randomUUID(), randomUUID()];
  const runKey = randomUUID().replace(/-/g, '').slice(0, 12);
  const planKey = `api_test_${runKey}`;
  const entitlementKey = `api_test.${runKey}`;
  const jwtSecret = randomBytes(48).toString('base64url');
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let accessTokens: string[];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModuleForSubscriptionTest(databaseUrl!),
        JwtModule.register({
          secret: jwtSecret,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [SubscriptionsController],
      providers: [
        AuthGuard,
        SubscriptionService,
        {
          provide: 'USER_REPOSITORY',
          useFactory: (source: DataSource) => source.getRepository(User),
          inject: [DataSource],
        },
        {
          provide: 'REFRESH_TOKEN_REPOSITORY',
          useFactory: (source: DataSource) =>
            source.getRepository(RefreshToken),
          inject: [DataSource],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await Promise.all(
      userIds.map((id, index) =>
        dataSource.query(
          `INSERT INTO users
             (id, email, password_hash, full_name, role, email_verified_at)
           VALUES ($1, $2, 'integration-test-hash', 'API Integration Test', 'rider', NOW())`,
          [id, `subscription-api-${index}-${runKey}@example.invalid`],
        ),
      ),
    );
    await Promise.all(
      sessionIds.map((id, index) =>
        dataSource.query(
          `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
          [id, userIds[index], randomBytes(32).toString('hex')],
        ),
      ),
    );
    accessTokens = await Promise.all(
      userIds.map((id, index) =>
        jwtService.signAsync({
          sub: id,
          sid: sessionIds[index],
          type: 'access',
          ver: 0,
        }),
      ),
    );

    await dataSource.query(
      `INSERT INTO subscription_plans
         (plan_key, display_name, description, is_active)
       VALUES ($1, $2, '{}'::jsonb, TRUE)`,
      [planKey, JSON.stringify({ en: 'API integration fixture' })],
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('matches entity columns, index metadata, PostgreSQL indexes, and constraints to the migrations', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      const actualIndexes = (await dataSource.query(
        `SELECT index_relation.relname AS "indexName",
                table_relation.relname AS "tableName",
                index_metadata.indisunique AS "isUnique",
                index_metadata.indisprimary AS "isPrimary",
                ARRAY_AGG(
                  attribute.attname ||
                  CASE
                    WHEN (index_metadata.indoption[(key.ordinality - 1)::int] & 1) = 1
                      THEN ' DESC'
                    ELSE ' ASC'
                  END
                  ORDER BY key.ordinality
                ) AS "indexedColumns"
         FROM pg_index index_metadata
         JOIN pg_class table_relation
           ON table_relation.oid = index_metadata.indrelid
         JOIN pg_namespace table_schema
           ON table_schema.oid = table_relation.relnamespace
         JOIN pg_class index_relation
           ON index_relation.oid = index_metadata.indexrelid
         CROSS JOIN LATERAL
           UNNEST(index_metadata.indkey) WITH ORDINALITY AS key(attnum, ordinality)
         JOIN pg_attribute attribute
           ON attribute.attrelid = table_relation.oid
          AND attribute.attnum = key.attnum
         WHERE table_schema.nspname = current_schema()
           AND table_relation.relname = ANY($1::text[])
           AND key.ordinality <= index_metadata.indnkeyatts
         GROUP BY index_relation.relname,
                  table_relation.relname,
                  index_metadata.indisunique,
                  index_metadata.indisprimary
         ORDER BY index_relation.relname`,
        [
          entityTargets.map(
            (target) => dataSource.getMetadata(target).tableName,
          ),
        ],
      )) as Array<{
        indexName: string;
        tableName: string;
        isUnique: boolean;
        isPrimary: boolean;
        indexedColumns: string[];
      }>;
      const expectedIndexes = [
        {
          indexName: 'subscription_plans_pkey',
          tableName: 'subscription_plans',
          isUnique: true,
          isPrimary: true,
          indexedColumns: ['plan_key ASC'],
        },
        {
          indexName: 'subscription_entitlement_definitions_pkey',
          tableName: 'subscription_entitlement_definitions',
          isUnique: true,
          isPrimary: true,
          indexedColumns: ['entitlement_key ASC'],
        },
        {
          indexName: 'subscription_plan_entitlements_pkey',
          tableName: 'subscription_plan_entitlements',
          isUnique: true,
          isPrimary: true,
          indexedColumns: ['plan_key ASC', 'entitlement_key ASC'],
        },
        {
          indexName: 'user_subscriptions_pkey',
          tableName: 'user_subscriptions',
          isUnique: true,
          isPrimary: true,
          indexedColumns: ['id ASC'],
        },
        {
          indexName: 'idx_user_subscriptions_user_updated',
          tableName: 'user_subscriptions',
          isUnique: false,
          isPrimary: false,
          indexedColumns: ['user_id ASC', 'updated_at DESC'],
        },
        {
          indexName: 'idx_user_subscriptions_status_period',
          tableName: 'user_subscriptions',
          isUnique: false,
          isPrimary: false,
          indexedColumns: ['status ASC', 'current_period_end ASC'],
        },
        {
          indexName: 'subscription_transaction_references_pkey',
          tableName: 'subscription_transaction_references',
          isUnique: true,
          isPrimary: true,
          indexedColumns: ['id ASC'],
        },
        {
          indexName:
            'subscription_transaction_refe_provider_transaction_referenc_key',
          tableName: 'subscription_transaction_references',
          isUnique: true,
          isPrimary: false,
          indexedColumns: ['provider ASC', 'transaction_reference ASC'],
        },
        {
          indexName: 'idx_subscription_transactions_subscription',
          tableName: 'subscription_transaction_references',
          isUnique: false,
          isPrimary: false,
          indexedColumns: ['subscription_id ASC', 'created_at DESC'],
        },
        {
          indexName: 'subscription_state_events_pkey',
          tableName: 'subscription_state_events',
          isUnique: true,
          isPrimary: true,
          indexedColumns: ['id ASC'],
        },
        {
          indexName: 'idx_subscription_state_events_subject_created',
          tableName: 'subscription_state_events',
          isUnique: false,
          isPrimary: false,
          indexedColumns: ['subject_user_id ASC', 'created_at DESC'],
        },
        {
          indexName: 'idx_subscription_state_events_subscription_created',
          tableName: 'subscription_state_events',
          isUnique: false,
          isPrimary: false,
          indexedColumns: ['subscription_id ASC', 'created_at DESC'],
        },
      ];

      const byIndexName = (
        left: { indexName: string },
        right: { indexName: string },
      ) =>
        left.indexName < right.indexName
          ? -1
          : left.indexName > right.indexName
            ? 1
            : 0;
      expect([...actualIndexes].sort(byIndexName)).toEqual(
        [...expectedIndexes].sort(byIndexName),
      );

      for (const target of entityTargets) {
        const metadata = dataSource.getMetadata(target);
        const table = await runner.getTable(metadata.tablePath);
        expect(table).not.toBeNull();
        expect(table!.columns.map(({ name }) => name).sort()).toEqual(
          metadata.columns.map(({ databaseName }) => databaseName).sort(),
        );
        for (const index of metadata.indices) {
          const actual = actualIndexes.find(
            (candidate) => candidate.indexName === index.name,
          );
          expect(actual).toBeDefined();
          expect(actual?.isUnique).toBe(index.isUnique);
          expect(actual?.indexedColumns).toEqual(
            index.columns.map((column) => {
              const direction =
                index.columnNamesWithOrderingMap[column.databaseName];
              return `${column.databaseName} ${direction === -1 ? 'DESC' : 'ASC'}`;
            }),
          );
        }
      }

      const foreignKeys = (await dataSource.query(
        `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE contype = 'f'
           AND conrelid IN (
             SELECT referenced_table.oid
               FROM pg_class referenced_table
               JOIN pg_namespace referenced_schema
                 ON referenced_schema.oid = referenced_table.relnamespace
               WHERE referenced_schema.nspname = current_schema()
                 AND referenced_table.relname = ANY($1::text[])
             )`,
        [
          entityTargets.map(
            (target) => dataSource.getMetadata(target).tableName,
          ),
        ],
      )) as Array<{ conname: string; definition: string }>;
      const foreignKeyDefinitions = new Map(
        foreignKeys.map(({ conname, definition }) => [conname, definition]),
      );
      const expectedForeignKeys = [
        ['subscription_plan_entitlements_plan_key_fkey', 'ON DELETE CASCADE'],
        [
          'subscription_plan_entitlements_entitlement_key_fkey',
          'ON DELETE RESTRICT',
        ],
        ['user_subscriptions_user_id_fkey', 'ON DELETE CASCADE'],
        ['user_subscriptions_plan_key_fkey', 'ON DELETE RESTRICT'],
        [
          'subscription_transaction_references_subscription_id_fkey',
          'ON DELETE CASCADE',
        ],
      ];
      expect(foreignKeyDefinitions.size).toBe(expectedForeignKeys.length);
      for (const [name, deleteAction] of expectedForeignKeys) {
        expect(foreignKeyDefinitions.get(name)).toContain(deleteAction);
      }

      const checks = (await dataSource.query(
        `SELECT table_relation.relname AS "tableName",
                constraint_metadata.conname AS "constraintName",
                pg_get_constraintdef(constraint_metadata.oid) AS definition
         FROM pg_constraint constraint_metadata
         JOIN pg_class table_relation
           ON table_relation.oid = constraint_metadata.conrelid
         JOIN pg_namespace table_schema
           ON table_schema.oid = table_relation.relnamespace
         WHERE table_schema.nspname = current_schema()
           AND table_relation.relname = ANY($1::text[])
           AND constraint_metadata.contype = 'c'
         ORDER BY table_relation.relname, constraint_metadata.conname`,
        [
          entityTargets.map(
            (target) => dataSource.getMetadata(target).tableName,
          ),
        ],
      )) as Array<{
        tableName: string;
        constraintName: string;
        definition: string;
      }>;
      const checkDefinitions = checks.map(({ definition }) =>
        definition.replaceAll('"', '').toLowerCase(),
      );
      for (const fragment of [
        'plan_key ~',
        'jsonb_typeof(display_name) =',
        'jsonb_typeof(description) =',
        'entitlement_key ~',
        'value_type = any',
        'quota_limit >= 0',
        'status = any',
        'current_period_end >= current_period_start',
        'provider = lower(btrim(provider))',
        'transaction_reference = btrim(transaction_reference)',
        'original_transaction_reference',
      ]) {
        expect(
          checkDefinitions.some((definition) => definition.includes(fragment)),
        ).toBe(true);
      }
    } finally {
      await runner.release();
    }
  });

  it('enforces subscription foreign keys, lifecycle constraints, and transaction uniqueness', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO user_subscriptions (user_id, plan_key, status)
         VALUES ($1, $2, 'active')`,
        [randomUUID(), planKey],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO user_subscriptions (user_id, plan_key, status)
         VALUES ($1, $2, 'active')`,
        [userIds[0], `missing_${runKey}`],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO subscription_plan_entitlements
           (plan_key, entitlement_key, is_enabled)
         VALUES ($1, $2, TRUE)`,
        [`missing_${runKey}`, entitlementKey],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO subscription_plan_entitlements
           (plan_key, entitlement_key, is_enabled)
         VALUES ($1, $2, TRUE)`,
        [planKey, `missing.${runKey}`],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO subscription_transaction_references
           (subscription_id, provider, transaction_reference)
         VALUES ($1, 'test', 'missing-subscription')`,
        [randomUUID()],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO user_subscriptions (user_id, plan_key, status)
         VALUES ($1, $2, 'unknown')`,
        [userIds[0], planKey],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO user_subscriptions
           (user_id, plan_key, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', NOW(), NOW() - INTERVAL '1 day')`,
        [userIds[0], planKey],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO subscription_plan_entitlements
           (plan_key, entitlement_key, is_enabled, quota_limit)
         VALUES ($1, $2, TRUE, -1)`,
        [planKey, entitlementKey],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO subscription_transaction_references
           (subscription_id, provider, transaction_reference)
         SELECT id, 'test', 'api-duplicate'
         FROM user_subscriptions
         WHERE user_id = $1`,
        [userIds[0]],
      ),
    ).resolves.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO subscription_transaction_references
           (subscription_id, provider, transaction_reference)
         SELECT id, 'test', 'api-duplicate'
         FROM user_subscriptions
         WHERE user_id = $1`,
        [userIds[0]],
      ),
    ).rejects.toThrow();
  });

  it('serves all authenticated read endpoints and isolates user subscription data', async () => {
    const server = app.getHttpServer();
    const paths = [
      '/api/v1/subscriptions/plans',
      '/api/v1/subscriptions/me',
      '/api/v1/subscriptions/entitlements',
    ];

    for (const path of paths) {
      await request(server).get(path).expect(401);
    }

    const plans = await request(server)
      .get(paths[0])
      .set('Authorization', `Bearer ${accessTokens[0]}`)
      .expect(200);
    expect(plans.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          planKey,
          entitlements: [
            expect.objectContaining({ key: entitlementKey, enabled: true }),
          ],
        }),
      ]),
    );

    const ownerSubscription = await request(server)
      .get(paths[1])
      .set('Authorization', `Bearer ${accessTokens[0]}`)
      .expect(200);
    expect(ownerSubscription.body.subscription).toMatchObject({
      planKey,
      status: 'active',
    });

    const otherSubscription = await request(server)
      .get(paths[1])
      .set('Authorization', `Bearer ${accessTokens[1]}`)
      .expect(200);
    expect(otherSubscription.body).toEqual({ subscription: null });

    const ownerEntitlements = await request(server)
      .get(paths[2])
      .set('Authorization', `Bearer ${accessTokens[0]}`)
      .expect(200);
    expect(ownerEntitlements.body).toMatchObject({
      resolution: 'resolved',
      subscription: { planKey, status: 'active' },
      entitlements: [expect.objectContaining({ key: entitlementKey })],
    });

    const otherEntitlements = await request(server)
      .get(paths[2])
      .set('Authorization', `Bearer ${accessTokens[1]}`)
      .expect(200);
    expect(otherEntitlements.body).toEqual({
      resolution: 'no_active_subscription',
      subscription: null,
      entitlements: [],
    });
  });
});

function TypeOrmModuleForSubscriptionTest(url: string) {
  return TypeOrmModule.forRoot({
    type: 'postgres',
    url,
    entities: [User, RefreshToken, ...subscriptionEntities],
    synchronize: false,
    logging: false,
  });
}
