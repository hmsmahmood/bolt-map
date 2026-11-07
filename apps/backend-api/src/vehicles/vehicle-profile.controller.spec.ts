import { GUARDS_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { VehicleType } from '../entities/vehicle-profile.entity';
import {
  VehicleProfileController,
  VehicleProfileRequestDto,
  VehicleProfileUpdateRequestDto,
} from './vehicle-profile.controller';
import { VehicleProfileService } from './vehicle-profile.service';
import { Request } from 'express';

describe('VehicleProfileController', () => {
  const vehicles = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
    update: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new VehicleProfileController(
    vehicles as unknown as VehicleProfileService,
  );
  const request = Object.assign(Object.create(null), {
    user: { id: 'owner-1' },
  }) as Request & { user?: { id?: string } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('protects the collection and scopes operations to the authenticated user', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, VehicleProfileController)).toContain(
      AuthGuard,
    );

    await controller.list(request);
    expect(vehicles.list).toHaveBeenCalledWith('owner-1');

    await controller.create(
      Object.assign(new VehicleProfileRequestDto(), {
        name: 'Daily car',
        vehicleType: VehicleType.CAR,
        make: 'Perodua',
        model: 'Myvi',
      }),
      request,
    );
    expect(vehicles.create).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ vehicleType: VehicleType.CAR }),
    );
  });

  it('validates vehicle category and safe dimensions at the API boundary', async () => {
    const invalidCreate = Object.assign(new VehicleProfileRequestDto(), {
      name: 'Truck',
      vehicleType: 'bus',
      make: 'Isuzu',
      model: 'N-Series',
      maxWeightKg: 100001,
      maxHeightCm: 0,
    });
    const createErrors = await validate(invalidCreate);

    expect(createErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['vehicleType', 'maxWeightKg', 'maxHeightCm']),
    );

    const invalidUpdate = Object.assign(new VehicleProfileUpdateRequestDto(), {
      maxLengthCm: 3001,
    });
    const updateErrors = await validate(invalidUpdate);
    expect(updateErrors.map((error) => error.property)).toContain('maxLengthCm');
  });
});
