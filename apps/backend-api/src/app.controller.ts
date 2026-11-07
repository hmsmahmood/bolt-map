import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import {
  ArrayMaxSize,
  IsDefined,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { AuthGuard } from './auth/auth.guard';
import { Roles } from './auth/roles.decorator';
import { RolesGuard } from './auth/roles.guard';
import { AuthRateLimitService } from './auth/auth-rate-limit.service';
import { UserRole } from './entities/user.entity';
import { AppService } from './app.service';
import { NavigationService } from './optimization/navigation.service';

type AuthenticatedRequest = Pick<Request, 'ip'> & { user?: { id?: string } };

export class RefreshTokenRequestDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsNotEmpty()
  refreshToken: string;
}

export class LogoutRequestDto extends RefreshTokenRequestDto {}

export class CoordinatePointDto {
  @ApiProperty({ example: 3.139 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 101.686 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiProperty({ example: 'Cyberjaya Hub', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class RouteOptimizationRequestDto {
  @ApiProperty({
    type: CoordinatePointDto,
    example: { lat: 3.139, lng: 101.686 },
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => CoordinatePointDto)
  origin: CoordinatePointDto;

  @ApiProperty({
    type: [CoordinatePointDto],
    example: [
      { lat: 3.099, lng: 101.64, label: 'KLIA' },
      { lat: 3.157, lng: 101.72, label: 'Petaling Jaya' },
    ],
  })
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => CoordinatePointDto)
  waypoints: CoordinatePointDto[];
}

export class NavigationRouteRequestDto {
  @ApiProperty({ type: CoordinatePointDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CoordinatePointDto)
  origin: CoordinatePointDto;

  @ApiProperty({ type: CoordinatePointDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CoordinatePointDto)
  destination: CoordinatePointDto;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vehicleProfileId: string;
}

@Controller('api')
@ApiTags('SMARTROUTE AI')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly navigation: NavigationService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Check platform health and uptime for the API' })
  @ApiResponse({ status: HttpStatus.OK, description: 'API is healthy' })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('dashboard/summary')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FLEET_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Return the dashboard summary with live fleet and route metrics',
  })
  getDashboardSummary() {
    return this.appService.getDashboardSummary();
  }

  @Get('dashboard/routes')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FLEET_MANAGER, UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'List active navigation and delivery routes' })
  getRoutes() {
    return this.appService.getRoutes();
  }

  @Get('dashboard/incidents')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List community and road safety incidents' })
  getIncidents() {
    return this.appService.getIncidents();
  }

  @Get('dashboard/fleet')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FLEET_MANAGER, UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'List current fleet devices and driver states' })
  getFleet() {
    return this.appService.getFleet();
  }

  @Get('navigation/overview')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(
    UserRole.FLEET_MANAGER,
    UserRole.ADMIN,
    UserRole.DISPATCHER,
    UserRole.DRIVER,
  )
  @ApiOperation({
    summary: 'Return route optimisation and navigation health insights',
  })
  getNavigationOverview() {
    return this.appService.getNavigationOverview();
  }

  @Post('navigation/plan')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(
    UserRole.FLEET_MANAGER,
    UserRole.ADMIN,
    UserRole.DISPATCHER,
    UserRole.DRIVER,
  )
  @ApiOperation({
    summary:
      'Plan an ordered delivery route with optional road-network distances and geometry',
  })
  @ApiBody({ type: RouteOptimizationRequestDto })
  async planRoute(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RouteOptimizationRequestDto,
  ) {
    await this.consumeNavigationRateLimit(request, 'navigation:plan');
    return this.appService.buildOptimizedRoute(dto);
  }

  @Post('navigation/route')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(
    UserRole.FLEET_MANAGER,
    UserRole.ADMIN,
    UserRole.DISPATCHER,
    UserRole.DRIVER,
    UserRole.RIDER,
  )
  @ApiOperation({
    summary:
      'Calculate a private, vehicle-profile-aware route with self-hosted Valhalla',
  })
  @ApiBody({ type: NavigationRouteRequestDto })
  async planNavigationRoute(
    @Req() request: AuthenticatedRequest,
    @Body() dto: NavigationRouteRequestDto,
  ): Promise<unknown> {
    const userId = await this.consumeNavigationRateLimit(
      request,
      'navigation:route',
    );
    return this.navigation.plan(userId, dto);
  }

  @Get('flood/intelligence')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FLEET_MANAGER, UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({
    summary: 'Return flood intelligence and drainage risk signals',
  })
  getFloodIntelligence() {
    return this.appService.getFloodIntelligence();
  }

  @Get('safety/signals')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FLEET_MANAGER, UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({
    summary: 'Return road safety risk scores for active corridors',
  })
  getRoadSafetySignals() {
    return this.appService.getRoadSafetySignals();
  }

  @Get('admin/overview')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.FLEET_MANAGER)
  @ApiOperation({
    summary: 'Return compliance, uptime and operational admin metrics',
  })
  getAdminOverview() {
    return this.appService.getAdminOverview();
  }

  private async consumeNavigationRateLimit(
    request: AuthenticatedRequest,
    scope: string,
  ): Promise<string> {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    if (!request.ip) {
      throw new ServiceUnavailableException(
        'Route planning is unavailable without client network context.',
      );
    }

    await this.rateLimit.consume(
      this.rateLimit.key(`${scope}:user`, userId),
      30,
      60,
    );
    await this.rateLimit.consume(
      this.rateLimit.key(`${scope}:ip`, request.ip),
      120,
      60,
    );
    return userId;
  }
}
