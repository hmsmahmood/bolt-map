import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import {
  COMMUNITY_INCIDENT_TYPES,
  CommunityIncidentService,
} from './community-incident.service';

type AuthenticatedRequest = Request & { user?: { id?: string } };

export class NearbyCommunityIncidentsQueryDto {
  @ApiProperty({ example: 3.139 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 101.686 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiProperty({ required: false, default: 3000, maximum: 10000 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(10000)
  radiusMeters = 3000;
}

export class CreateCommunityIncidentDto {
  @ApiProperty({ enum: COMMUNITY_INCIDENT_TYPES })
  @IsIn(COMMUNITY_INCIDENT_TYPES)
  type: (typeof COMMUNITY_INCIDENT_TYPES)[number];

  @ApiProperty({ example: 3.139 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 101.686 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class CommunityIncidentVoteDto {
  @ApiProperty({ enum: ['confirm', 'clear'] })
  @IsIn(['confirm', 'clear'])
  vote: 'confirm' | 'clear';
}

@Controller('api/community/incidents')
@UseGuards(AuthGuard)
@ApiTags('Community incidents')
export class CommunityIncidentsController {
  constructor(
    private readonly incidents: CommunityIncidentService,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  @Post('nearby')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List nearby unexpired community-reported road incidents',
  })
  async listNearby(
    @Req() request: AuthenticatedRequest,
    @Body() query: NearbyCommunityIncidentsQueryDto,
  ) {
    const userId = this.userId(request);
    await this.rateLimit.consume(
      this.rateLimit.key('community-read', userId),
      60,
      60,
    );
    return this.incidents.listNearby(
      { lat: query.lat, lng: query.lng },
      query.radiusMeters,
      userId,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a short-lived community report at an explicitly selected location',
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCommunityIncidentDto,
  ) {
    const userId = this.userId(request);
    await this.rateLimit.consume(
      this.rateLimit.key('community-create-user', userId),
      5,
      900,
    );
    if (request.ip) {
      await this.rateLimit.consume(
        this.rateLimit.key('community-create-ip', request.ip),
        15,
        900,
      );
    }
    return this.incidents.create(userId, dto.type, {
      lat: dto.lat,
      lng: dto.lng,
    });
  }

  @Post(':id/votes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm or clear an active community incident' })
  async vote(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: CommunityIncidentVoteDto,
  ) {
    const userId = this.userId(request);
    await this.rateLimit.consume(
      this.rateLimit.key('community-vote', userId),
      30,
      3600,
    );
    return this.incidents.vote(userId, incidentId, dto.vote);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your own community incident report' })
  async deleteOwned(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) incidentId: string,
  ): Promise<void> {
    await this.incidents.deleteOwned(this.userId(request), incidentId);
  }

  private userId(request: AuthenticatedRequest): string {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user is unavailable.');
    }
    return userId;
  }
}
