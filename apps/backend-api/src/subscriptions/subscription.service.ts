import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type SubscriptionStatus =
  'pending' | 'active' | 'grace_period' | 'canceled' | 'expired' | 'revoked';

type EntitlementResolution =
  | 'no_active_subscription'
  | 'resolved'
  | 'ambiguous_active_subscriptions'
  | 'inactive_plan';

interface PlanRow {
  planKey: string;
  displayName: Record<string, unknown>;
  description: Record<string, unknown>;
  entitlementKey: string | null;
  valueType: string | null;
  isEnabled: boolean | null;
  quotaLimit: string | number | null;
  value: unknown;
}

interface SubscriptionRow {
  id: string;
  planKey: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | string | null;
  currentPeriodEnd: Date | string | null;
  planActive: boolean;
}

@Injectable()
export class SubscriptionService {
  constructor(private readonly dataSource: DataSource) {}

  async listPlans(): Promise<
    Array<{
      planKey: string;
      displayName: Record<string, unknown>;
      description: Record<string, unknown>;
      entitlements: Array<{
        key: string;
        valueType: string;
        enabled: boolean;
        quotaLimit: string | null;
        value: unknown;
      }>;
    }>
  > {
    const rows = (await this.dataSource.query(
      `SELECT plan.plan_key AS "planKey",
              plan.display_name AS "displayName",
              plan.description,
              definition.entitlement_key AS "entitlementKey",
              definition.value_type AS "valueType",
              configured.is_enabled AS "isEnabled",
              configured.quota_limit::text AS "quotaLimit",
              configured.value
       FROM subscription_plans plan
       LEFT JOIN subscription_plan_entitlements configured
         ON configured.plan_key = plan.plan_key
       LEFT JOIN subscription_entitlement_definitions definition
         ON definition.entitlement_key = configured.entitlement_key
       WHERE plan.is_active = TRUE
       ORDER BY plan.plan_key, definition.entitlement_key`,
    )) as PlanRow[];

    const plans = new Map<
      string,
      {
        planKey: string;
        displayName: Record<string, unknown>;
        description: Record<string, unknown>;
        entitlements: Array<{
          key: string;
          valueType: string;
          enabled: boolean;
          quotaLimit: string | null;
          value: unknown;
        }>;
      }
    >();

    for (const row of rows) {
      let plan = plans.get(row.planKey);
      if (!plan) {
        plan = {
          planKey: row.planKey,
          displayName: row.displayName,
          description: row.description,
          entitlements: [],
        };
        plans.set(row.planKey, plan);
      }
      if (row.entitlementKey !== null && row.valueType !== null) {
        plan.entitlements.push({
          key: row.entitlementKey,
          valueType: row.valueType,
          enabled: row.isEnabled === true,
          quotaLimit: row.quotaLimit === null ? null : String(row.quotaLimit),
          value: row.value,
        });
      }
    }

    return [...plans.values()];
  }

  async getCurrentSubscription(userId: string): Promise<{
    subscription: {
      id: string;
      planKey: string;
      status: SubscriptionStatus;
      currentPeriodStart: Date | string | null;
      currentPeriodEnd: Date | string | null;
    } | null;
  }> {
    const rows = (await this.dataSource.query(
      `SELECT id,
              plan_key AS "planKey",
              status,
              current_period_start AS "currentPeriodStart",
              current_period_end AS "currentPeriodEnd"
       FROM user_subscriptions
       WHERE user_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [userId],
    )) as Array<Omit<SubscriptionRow, 'planActive'>>;

    const subscription = rows[0] ?? null;
    return {
      subscription: subscription
        ? {
            id: subscription.id,
            planKey: subscription.planKey,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
    };
  }

  async resolveEntitlements(userId: string): Promise<{
    resolution: EntitlementResolution;
    subscription: {
      id: string;
      planKey: string;
      status: SubscriptionStatus;
      currentPeriodStart: Date | string | null;
      currentPeriodEnd: Date | string | null;
    } | null;
    entitlements: Array<{
      key: string;
      valueType: string;
      enabled: boolean;
      quotaLimit: string | null;
      value: unknown;
    }>;
  }> {
    const rows = (await this.dataSource.query(
      `SELECT subscription.id,
              subscription.plan_key AS "planKey",
              subscription.status,
              subscription.current_period_start AS "currentPeriodStart",
              subscription.current_period_end AS "currentPeriodEnd",
              plan.is_active AS "planActive"
       FROM user_subscriptions subscription
       JOIN subscription_plans plan
         ON plan.plan_key = subscription.plan_key
       WHERE subscription.user_id = $1
         AND subscription.status = 'active'
         AND (
           subscription.current_period_start IS NULL
           OR subscription.current_period_start <= NOW()
         )
         AND (
           subscription.current_period_end IS NULL
           OR subscription.current_period_end > NOW()
         )
       ORDER BY subscription.updated_at DESC, subscription.created_at DESC`,
      [userId],
    )) as SubscriptionRow[];

    if (rows.length === 0) {
      return {
        resolution: 'no_active_subscription',
        subscription: null,
        entitlements: [],
      };
    }
    if (rows.length > 1) {
      return {
        resolution: 'ambiguous_active_subscriptions',
        subscription: null,
        entitlements: [],
      };
    }

    const activeSubscription = rows[0];
    if (!activeSubscription.planActive) {
      return {
        resolution: 'inactive_plan',
        subscription: this.toPublicSubscription(activeSubscription),
        entitlements: [],
      };
    }

    const entitlementRows = (await this.dataSource.query(
      `SELECT definition.entitlement_key AS "key",
              definition.value_type AS "valueType",
              configured.is_enabled AS enabled,
              configured.quota_limit::text AS "quotaLimit",
              configured.value
       FROM subscription_plan_entitlements configured
       JOIN subscription_entitlement_definitions definition
         ON definition.entitlement_key = configured.entitlement_key
       WHERE configured.plan_key = $1
       ORDER BY definition.entitlement_key`,
      [activeSubscription.planKey],
    )) as Array<{
      key: string;
      valueType: string;
      enabled: boolean;
      quotaLimit: string | null;
      value: unknown;
    }>;

    return {
      resolution: 'resolved',
      subscription: this.toPublicSubscription(activeSubscription),
      entitlements: entitlementRows,
    };
  }

  private toPublicSubscription(subscription: SubscriptionRow) {
    return {
      id: subscription.id,
      planKey: subscription.planKey,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }
}
