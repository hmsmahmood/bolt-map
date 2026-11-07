import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { VehicleProfile, VehicleType } from '../entities/vehicle-profile.entity';

export interface VehicleProfileInput {
  name: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  modelYear?: number;
  registrationNumber?: string;
  maxWeightKg?: number;
  maxHeightCm?: number;
  maxLengthCm?: number;
}

export type VehicleProfileUpdate = Partial<VehicleProfileInput>;

@Injectable()
export class VehicleProfileService {
  constructor(
    @Inject('VEHICLE_PROFILE_REPOSITORY')
    private readonly profiles: Repository<VehicleProfile>,
  ) {}

  async list(userId: string): Promise<VehicleProfile[]> {
    return this.profiles.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async getOwnedProfile(userId: string, id: string): Promise<VehicleProfile> {
    const profile = await this.profiles.findOne({ where: { id, userId } });
    if (!profile) {
      throw new NotFoundException('Vehicle profile not found.');
    }
    return profile;
  }

  async create(
    userId: string,
    input: VehicleProfileInput,
  ): Promise<VehicleProfile> {
    return this.profiles.save(this.profiles.create({
      ...this.normalize(input),
      userId,
    }));
  }

  async update(
    userId: string,
    id: string,
    input: VehicleProfileUpdate,
  ): Promise<VehicleProfile> {
    const profile = await this.profiles.findOne({ where: { id, userId } });
    if (!profile) {
      throw new NotFoundException('Vehicle profile not found.');
    }

    Object.assign(profile, this.normalize(input));
    return this.profiles.save(profile);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.profiles.delete({ id, userId });
    if (result.affected !== 1) {
      throw new NotFoundException('Vehicle profile not found.');
    }
  }

  private normalize<T extends VehicleProfileInput | VehicleProfileUpdate>(
    input: T,
  ): T {
    const normalized = { ...input } as T;
    for (const key of ['name', 'make', 'model', 'registrationNumber'] as const) {
      const value = normalized[key];
      if (typeof value === 'string') {
        Object.assign(normalized, { [key]: value.trim() || null });
      }
    }
    return normalized;
  }
}
