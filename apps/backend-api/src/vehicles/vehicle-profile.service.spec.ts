import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  VehicleProfile,
  VehicleType,
} from '../entities/vehicle-profile.entity';
import { VehicleProfileService } from './vehicle-profile.service';

describe('VehicleProfileService', () => {
  const profiles = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  let service: VehicleProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VehicleProfileService(
      profiles as unknown as Repository<VehicleProfile>,
    );
    profiles.save.mockImplementation(async (record) => ({
      ...record,
      id: record.id ?? 'profile-1',
    }));
    profiles.find.mockResolvedValue([]);
    profiles.findOne.mockResolvedValue(null);
    profiles.delete.mockResolvedValue({ affected: 1 });
  });

  it('creates profiles with the authenticated owner and normalized optional details', async () => {
    const result = await service.create('owner-1', {
      name: '  Work truck  ',
      vehicleType: VehicleType.TRUCK,
      make: ' Isuzu ',
      model: ' N-Series ',
      modelYear: 2022,
      registrationNumber: ' ',
      maxWeightKg: 7500,
      maxHeightCm: 320,
    });

    expect(result).toMatchObject({
      userId: 'owner-1',
      name: 'Work truck',
      vehicleType: VehicleType.TRUCK,
      make: 'Isuzu',
      model: 'N-Series',
      registrationNumber: null,
    });
  });

  it('lists only the requesting user’s profiles', async () => {
    await service.list('owner-1');

    expect(profiles.find).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
      order: { createdAt: 'ASC' },
    });
  });

  it('resolves a vehicle profile only for its owner', async () => {
    const ownedProfile = {
      id: 'profile-1',
      userId: 'owner-1',
      name: 'My car',
      vehicleType: VehicleType.CAR,
      make: 'Toyota',
      model: 'Yaris',
    };
    profiles.findOne.mockResolvedValueOnce(ownedProfile);

    await expect(service.getOwnedProfile('owner-1', 'profile-1')).resolves.toBe(
      ownedProfile,
    );
    expect(profiles.findOne).toHaveBeenCalledWith({
      where: { id: 'profile-1', userId: 'owner-1' },
    });

    await expect(
      service.getOwnedProfile('owner-2', 'profile-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only a profile owned by the requesting user', async () => {
    const ownedProfile = {
      id: 'profile-1',
      userId: 'owner-1',
      name: 'My car',
      vehicleType: VehicleType.CAR,
      make: 'Toyota',
      model: 'Yaris',
    };
    profiles.findOne.mockResolvedValueOnce(ownedProfile);

    await service.update('owner-1', 'profile-1', { maxHeightCm: 150 });

    expect(profiles.findOne).toHaveBeenCalledWith({
      where: { id: 'profile-1', userId: 'owner-1' },
    });
    expect(profiles.save).toHaveBeenCalledWith(
      expect.objectContaining({ ...ownedProfile, maxHeightCm: 150 }),
    );
  });

  it('does not disclose or update a profile owned by another user', async () => {
    await expect(
      service.update('owner-2', 'profile-1', { name: 'Changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(profiles.save).not.toHaveBeenCalled();
  });

  it('deletes only an owned profile and reports missing or foreign IDs as not found', async () => {
    await service.remove('owner-1', 'profile-1');
    expect(profiles.delete).toHaveBeenCalledWith({
      id: 'profile-1',
      userId: 'owner-1',
    });

    profiles.delete.mockResolvedValueOnce({ affected: 0 });
    await expect(service.remove('owner-2', 'profile-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
