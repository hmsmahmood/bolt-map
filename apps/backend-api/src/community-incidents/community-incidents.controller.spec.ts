import { UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import {
  CommunityIncidentsController,
  CreateCommunityIncidentDto,
} from './community-incidents.controller';

describe('CommunityIncidentsController', () => {
  const userId = 'c0d98238-875d-4222-a0dc-3b4ff2e1c2a8';
  let controller: CommunityIncidentsController;
  let incidents: {
    listNearby: jest.Mock;
    create: jest.Mock;
    vote: jest.Mock;
    deleteOwned: jest.Mock;
  };
  let rateLimit: { key: jest.Mock; consume: jest.Mock };

  beforeEach(() => {
    incidents = {
      listNearby: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ incident: {}, duplicate: false }),
      vote: jest.fn().mockResolvedValue({}),
      deleteOwned: jest.fn().mockResolvedValue(undefined),
    };
    rateLimit = {
      key: jest.fn((scope: string, value: string) => `${scope}:${value}`),
      consume: jest.fn().mockResolvedValue(undefined),
    };
    controller = new CommunityIncidentsController(
      incidents as never,
      rateLimit as never,
    );
  });

  it('scopes nearby report queries to the authenticated user and throttles them', async () => {
    await controller.listNearby({ user: { id: userId } } as never, {
      lat: 3.139,
      lng: 101.686,
      radiusMeters: 3000,
    });

    expect(incidents.listNearby).toHaveBeenCalledWith(
      { lat: 3.139, lng: 101.686 },
      3000,
      userId,
    );
    expect(rateLimit.consume).toHaveBeenCalledWith(
      `community-read:${userId}`,
      60,
      60,
    );
  });

  it('applies user and IP limits before creating a report', async () => {
    await controller.create(
      { user: { id: userId }, ip: '127.0.0.1' } as never,
      { type: 'accident', lat: 3.139, lng: 101.686 },
    );

    expect(rateLimit.consume).toHaveBeenNthCalledWith(
      1,
      `community-create-user:${userId}`,
      5,
      900,
    );
    expect(rateLimit.consume).toHaveBeenNthCalledWith(
      2,
      'community-create-ip:127.0.0.1',
      15,
      900,
    );
    expect(incidents.create).toHaveBeenCalledWith(userId, 'accident', {
      lat: 3.139,
      lng: 101.686,
    });
  });

  it('does not perform report actions without an authenticated user', async () => {
    await expect(
      controller.listNearby({ user: undefined } as never, {
        lat: 3.139,
        lng: 101.686,
        radiusMeters: 3000,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(incidents.listNearby).not.toHaveBeenCalled();
  });

  it('rejects unsupported report categories and out-of-range coordinates', async () => {
    const invalid = Object.assign(new CreateCommunityIncidentDto(), {
      type: 'police',
      lat: 91,
      lng: 181,
    });

    const errors = await validate(invalid);

    expect(errors.map(({ property }) => property).sort()).toEqual([
      'lat',
      'lng',
      'type',
    ]);
  });
});
