import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { AppController } from './app.controller';
import { CommunityIncidentsController } from './community-incidents/community-incidents.controller';
import { CommunityIncidentService } from './community-incidents/community-incident.service';
import { AuthController } from './auth/auth.controller';
import { AuthCleanupService } from './auth/auth-cleanup.service';
import { AuthRateLimitFilter } from './auth/auth-rate-limit.filter';
import { AuthRateLimitService } from './auth/auth-rate-limit.service';
import { AuthWorkflowService } from './auth/auth-workflow.service';
import { EmailDeliveryService } from './auth/email-delivery.service';
import { AppService } from './app.service';
import { AuthGuard } from './auth/auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { FleetVehicle } from './entities/fleet-vehicle.entity';
import { FloodAlert } from './entities/flood-alert.entity';
import { Incident } from './entities/incident.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { OtpVerification } from './entities/otp-verification.entity';
import { MfaSettings } from './entities/mfa-settings.entity';
import { UserProfile } from './entities/user-profile.entity';
import { AuthRateLimit } from './entities/auth-rate-limit.entity';
import { AuthSecurityEvent } from './entities/auth-security-event.entity';
import { RouteEntity } from './entities/route.entity';
import { User } from './entities/user.entity';
import { VehicleProfile } from './entities/vehicle-profile.entity';
import { OperationalDataService } from './operations/operational-data.service';
import { NavigationService } from './optimization/navigation.service';
import { OsrmRoutingProvider } from './optimization/road-routing.provider';
import { RouteOptimizationService } from './optimization/route-optimization.service';
import { ValhallaRoutingProvider } from './optimization/valhalla-routing.provider';
import { VehicleProfileController } from './vehicles/vehicle-profile.controller';
import { VehicleProfileService } from './vehicles/vehicle-profile.service';
import { SubscriptionsController } from './subscriptions/subscriptions.controller';
import { SubscriptionService } from './subscriptions/subscription.service';

function getJwtSecret(): string {
  const configuredSecret = process.env.JWT_SECRET?.trim();

  if (!configuredSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be configured in production.');
    }

    return randomBytes(32).toString('base64url');
  }

  if (
    Buffer.byteLength(configuredSecret, 'utf8') < 32 ||
    configuredSecret === 'replace-with-a-secure-secret'
  ) {
    throw new Error(
      'JWT_SECRET must contain at least 32 bytes and must not be a placeholder.',
    );
  }

  return configuredSecret;
}

function getDatabaseConfig(): TypeOrmModuleOptions {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return { type: 'postgres', url: databaseUrl };
  }

  const { DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error(
      'Configure DATABASE_URL or DB_USER, DB_PASSWORD, and DB_NAME.',
    );
  }

  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  };
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...getDatabaseConfig(),
      schema: 'public',
      entities: [
        User,
        VehicleProfile,
        RefreshToken,
        FleetVehicle,
        RouteEntity,
        Incident,
        FloodAlert,
        EmailVerificationToken,
        PasswordResetToken,
        OtpVerification,
        MfaSettings,
        UserProfile,
        AuthRateLimit,
        AuthSecurityEvent,
      ],
      autoLoadEntities: false,
      synchronize: false,
      logging: false,
    }),
    TypeOrmModule.forFeature([
      User,
      VehicleProfile,
      RefreshToken,
      FleetVehicle,
      RouteEntity,
      Incident,
      FloodAlert,
      EmailVerificationToken,
      PasswordResetToken,
      OtpVerification,
      MfaSettings,
      UserProfile,
      AuthRateLimit,
      AuthSecurityEvent,
    ]),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [
    AppController,
    AuthController,
    VehicleProfileController,
    CommunityIncidentsController,
    SubscriptionsController,
  ],
  providers: [
    AppService,
    AuthWorkflowService,
    VehicleProfileService,
    AuthRateLimitService,
    AuthCleanupService,
    EmailDeliveryService,
    { provide: APP_FILTER, useClass: AuthRateLimitFilter },
    AuthGuard,
    RolesGuard,
    OperationalDataService,
    NavigationService,
    OsrmRoutingProvider,
    ValhallaRoutingProvider,
    RouteOptimizationService,
    CommunityIncidentService,
    SubscriptionService,
    {
      provide: 'ROAD_ROUTING_PROVIDER',
      useExisting: OsrmRoutingProvider,
    },
    {
      provide: 'USER_REPOSITORY',
      useFactory: (dataSource: DataSource) => dataSource.getRepository(User),
      inject: [DataSource],
    },
    {
      provide: 'VEHICLE_PROFILE_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(VehicleProfile),
      inject: [DataSource],
    },
    {
      provide: 'REFRESH_TOKEN_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(RefreshToken),
      inject: [DataSource],
    },
    {
      provide: 'EMAIL_VERIFICATION_TOKEN_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(EmailVerificationToken),
      inject: [DataSource],
    },
    {
      provide: 'PASSWORD_RESET_TOKEN_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(PasswordResetToken),
      inject: [DataSource],
    },
    {
      provide: 'OTP_VERIFICATION_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(OtpVerification),
      inject: [DataSource],
    },
    {
      provide: 'MFA_SETTINGS_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(MfaSettings),
      inject: [DataSource],
    },
    {
      provide: 'USER_PROFILE_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(UserProfile),
      inject: [DataSource],
    },
    {
      provide: 'AUTH_SECURITY_EVENT_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(AuthSecurityEvent),
      inject: [DataSource],
    },
    {
      provide: 'FLEET_VEHICLE_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(FleetVehicle),
      inject: [DataSource],
    },
    {
      provide: 'ROUTE_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(RouteEntity),
      inject: [DataSource],
    },
    {
      provide: 'INCIDENT_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(Incident),
      inject: [DataSource],
    },
    {
      provide: 'FLOOD_ALERT_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(FloodAlert),
      inject: [DataSource],
    },
  ],
})
export class AppModule {}
