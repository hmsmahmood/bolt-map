import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { VehicleType } from '../entities/vehicle-profile.entity';
import {
  VehicleProfileInput,
  VehicleProfileService,
  VehicleProfileUpdate,
} from './vehicle-profile.service';

export class VehicleProfileRequestDto implements VehicleProfileInput {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/\S/)
  name: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/\S/)
  make: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/\S/)
  model: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  modelYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  registrationNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxHeightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3000)
  maxLengthCm?: number;
}

export class VehicleProfileUpdateRequestDto implements VehicleProfileUpdate {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/\S/)
  make?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/\S/)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  modelYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  registrationNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxHeightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3000)
  maxLengthCm?: number;
}

@Controller('api/v1/vehicle-profiles')
@UseGuards(AuthGuard)
@ApiTags('Vehicle profiles')
export class VehicleProfileController {
  constructor(private readonly vehicles: VehicleProfileService) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user’s vehicle profiles' })
  list(@Req() request: Request & { user?: { id?: string } }) {
    return this.vehicles.list(this.userId(request));
  }

  @Post()
  @ApiOperation({ summary: 'Create a vehicle profile for the authenticated user' })
  create(
    @Body() dto: VehicleProfileRequestDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    return this.vehicles.create(this.userId(request), dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one of the authenticated user’s vehicle profiles' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VehicleProfileUpdateRequestDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    return this.vehicles.update(this.userId(request), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of the authenticated user’s vehicle profiles' })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request & { user?: { id?: string } },
  ): Promise<void> {
    await this.vehicles.remove(this.userId(request), id);
  }

  private userId(request: Request & { user?: { id?: string } }): string {
    if (!request.user?.id) {
      throw new UnauthorizedException('Authenticated user context is missing.');
    }
    return request.user.id;
  }
}
