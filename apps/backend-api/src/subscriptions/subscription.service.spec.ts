import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  const dataSource = { query: jest.fn() };

  beforeEach(() => {
    dataSource.query.mockReset();
    service = new SubscriptionService(dataSource as never);
  });

  it('returns no plans when no catalog is configured', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(service.listPlans()).resolves.toEqual([]);
  });

  it('does not infer a default plan when the user has no active subscription', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(service.resolveEntitlements('user-1')).resolves.toEqual({
      resolution: 'no_active_subscription',
      subscription: null,
      entitlements: [],
    });
    expect(dataSource.query.mock.calls[0][1]).toEqual(['user-1']);
    expect(dataSource.query.mock.calls[0][0]).toContain(
      'subscription.user_id = $1',
    );
  });

  it('returns configured values only for one active subscription', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'subscription-1',
          planKey: 'plan-test',
          status: 'active',
          currentPeriodStart: null,
          currentPeriodEnd: null,
          planActive: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          key: 'feature.example',
          valueType: 'boolean',
          enabled: true,
          quotaLimit: null,
          value: true,
        },
      ]);

    await expect(service.resolveEntitlements('user-1')).resolves.toEqual({
      resolution: 'resolved',
      subscription: {
        id: 'subscription-1',
        planKey: 'plan-test',
        status: 'active',
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
      entitlements: [
        {
          key: 'feature.example',
          valueType: 'boolean',
          enabled: true,
          quotaLimit: null,
          value: true,
        },
      ],
    });
    expect(dataSource.query.mock.calls[1][1]).toEqual(['plan-test']);
  });

  it('returns no effective entitlements for ambiguous or inactive plans', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 'subscription-1', planKey: 'plan-test', planActive: true },
      { id: 'subscription-2', planKey: 'plan-test', planActive: true },
    ]);

    await expect(service.resolveEntitlements('user-1')).resolves.toMatchObject({
      resolution: 'ambiguous_active_subscriptions',
      subscription: null,
      entitlements: [],
    });
    expect(dataSource.query).toHaveBeenCalledTimes(1);

    dataSource.query.mockReset();
    dataSource.query.mockResolvedValueOnce([
      {
        id: 'subscription-1',
        planKey: 'plan-test',
        status: 'active',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        planActive: false,
      },
    ]);
    await expect(service.resolveEntitlements('user-1')).resolves.toMatchObject({
      resolution: 'inactive_plan',
      entitlements: [],
    });
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('lists only active plans and keeps large quotas as exact strings', async () => {
    dataSource.query.mockResolvedValue([
      {
        planKey: 'plan-test',
        displayName: { en: 'Test' },
        description: {},
        entitlementKey: 'feature.example',
        valueType: 'integer',
        isEnabled: true,
        quotaLimit: '9007199254740993',
        value: null,
      },
    ]);

    await expect(service.listPlans()).resolves.toEqual([
      {
        planKey: 'plan-test',
        displayName: { en: 'Test' },
        description: {},
        entitlements: [
          {
            key: 'feature.example',
            valueType: 'integer',
            enabled: true,
            quotaLimit: '9007199254740993',
            value: null,
          },
        ],
      },
    ]);
    expect(dataSource.query.mock.calls[0][0]).toContain(
      'WHERE plan.is_active = TRUE',
    );
  });

  it('scopes the current-subscription query to the requested user', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'subscription-1',
        planKey: 'plan-test',
        status: 'expired',
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
    ]);

    await expect(service.getCurrentSubscription('user-1')).resolves.toEqual({
      subscription: {
        id: 'subscription-1',
        planKey: 'plan-test',
        status: 'expired',
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
    });
    expect(dataSource.query.mock.calls[0][1]).toEqual(['user-1']);
  });
});
