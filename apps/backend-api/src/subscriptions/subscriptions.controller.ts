import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { SubscriptionService } from './subscription.service';

type AuthenticatedRequest = Request & { user?: { id?: string } };

@Controller('api/v1/subscriptions')
@UseGuards(AuthGuard)
@ApiTags('Subscriptions')
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get('plans')
  @ApiOperation({
    summary: 'List configured active subscription plans',
  })
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get the authenticated user’s latest subscription record',
  })
  getCurrent(@Req() request: AuthenticatedRequest) {
    return this.subscriptions.getCurrentSubscription(this.userId(request));
  }

  @Get('entitlements')
  @ApiOperation({
    summary: 'Resolve configured entitlements for the authenticated user',
  })
  getEntitlements(@Req() request: AuthenticatedRequest) {
    return this.subscriptions.resolveEntitlements(this.userId(request));
  }

  private userId(request: AuthenticatedRequest): string {
    if (!request.user?.id) {
      throw new UnauthorizedException('Authenticated user context is missing.');
    }
    return request.user.id;
  }
}
