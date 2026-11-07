import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SubscriptionService } from './subscription.service';
import { SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
  const subscriptions = {
    listPlans: jest.fn().mockResolvedValue([]),
    getCurrentSubscription: jest.fn().mockResolvedValue({ subscription: null }),
    resolveEntitlements: jest.fn().mockResolvedValue({
      resolution: 'no_active_subscription',
      subscription: null,
      entitlements: [],
    }),
  };
  const controller = new SubscriptionsController(
    subscriptions as unknown as SubscriptionService,
  );
  const request = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires the existing authentication guard for every endpoint', async () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SubscriptionsController),
    ).toContain(AuthGuard);

    await controller.listPlans();
    await controller.getCurrent(request);
    await controller.getEntitlements(request);

    expect(subscriptions.getCurrentSubscription).toHaveBeenCalledWith('user-1');
    expect(subscriptions.resolveEntitlements).toHaveBeenCalledWith('user-1');
  });

  it('does not resolve user-specific data without authenticated context', async () => {
    try {
      controller.getCurrent({ user: undefined } as never);
      fail('Expected missing user context to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
    }

    try {
      controller.getEntitlements({ user: undefined } as never);
      fail('Expected missing user context to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
    }
    expect(subscriptions.getCurrentSubscription).not.toHaveBeenCalled();
    expect(subscriptions.resolveEntitlements).not.toHaveBeenCalled();
  });
});
