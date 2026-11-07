import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VehicleType } from '../entities/vehicle-profile.entity';
import {
  decodePolyline6,
  ValhallaRoutingProvider,
} from './valhalla-routing.provider';

describe('ValhallaRoutingProvider', () => {
  const origin = { lat: 3.139, lng: 101.6869 };
  const destination = { lat: 3.1391, lng: 101.687 };
  const originalBaseUrl = process.env.VALHALLA_BASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const geometry = [
    [101.6869, 3.139],
    [101.687, 3.1391],
  ] as Array<[number, number]>;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalBaseUrl === undefined) {
      delete process.env.VALHALLA_BASE_URL;
    } else {
      process.env.VALHALLA_BASE_URL = originalBaseUrl;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('sends a private POST request and returns normalized route guidance', async () => {
    process.env.VALHALLA_BASE_URL = 'http://127.0.0.1:8002/';
    const response = {
      trip: {
        summary: { length: 4.2, time: 360 },
        legs: [
          {
            shape: encodePolyline6(geometry),
            maneuvers: [
              {
                type: 3,
                instruction: 'Continue on Jalan Tun Razak.',
                verbal_pre_transition_instruction:
                  'Continue on Jalan Tun Razak.',
                verbal_succinct_transition_instruction: 'Continue straight.',
                length: 4.2,
                time: 360,
                begin_shape_index: 0,
                end_shape_index: 1,
                street_names: ['Jalan Tun Razak'],
              },
            ],
          },
        ],
      },
    };
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new ValhallaRoutingProvider();

    const result = await provider.route(origin, destination, {
      vehicleType: VehicleType.CAR,
      maxHeightCm: null,
      maxLengthCm: null,
      maxWeightKg: null,
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8002/route',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({
          locations: [
            { lat: origin.lat, lon: origin.lng, type: 'break' },
            { lat: destination.lat, lon: destination.lng, type: 'break' },
          ],
          costing: 'auto',
          units: 'kilometers',
        }),
      }),
    );
    expect(result).toMatchObject({
      provider: 'Valhalla',
      vehicleType: VehicleType.CAR,
      distanceKm: 4.2,
      durationSeconds: 360,
      geometry: { type: 'LineString', coordinates: geometry },
      maneuvers: [
        {
          instruction: 'Continue on Jalan Tun Razak.',
          verbalInstruction: 'Continue on Jalan Tun Razak.',
          succinctInstruction: 'Continue straight.',
          distanceKm: 4.2,
          durationSeconds: 360,
          type: 3,
          beginShapeIndex: 0,
          endShapeIndex: 1,
          streetNames: ['Jalan Tun Razak'],
        },
      ],
      liveTraffic: false,
    });
  });

  it('selects motorcycle costing and passes supported truck dimensions in engine units', async () => {
    process.env.VALHALLA_BASE_URL = 'http://127.0.0.1:8002';
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            trip: {
              summary: { length: 4.2, time: 360 },
              legs: [{ shape: encodePolyline6(geometry), maneuvers: [] }],
            },
          }),
          { status: 200 },
        ),
    );
    const provider = new ValhallaRoutingProvider();

    await provider.route(origin, destination, {
      vehicleType: VehicleType.MOTORCYCLE,
      maxHeightCm: null,
      maxLengthCm: null,
      maxWeightKg: null,
    });
    const motorcycleBody = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(motorcycleBody.costing).toBe('motorcycle');

    await provider.route(origin, destination, {
      vehicleType: VehicleType.TRUCK,
      maxHeightCm: 400,
      maxLengthCm: 1200,
      maxWeightKg: 20_000,
    });
    const truckBody = JSON.parse(fetch.mock.calls[1][1]?.body as string);
    expect(truckBody).toMatchObject({
      costing: 'truck',
      costing_options: {
        truck: { height: 4, length: 12, weight: 20 },
      },
    });
  });

  it('offsets maneuver shape indices while joining multiple route legs', async () => {
    process.env.VALHALLA_BASE_URL = 'http://127.0.0.1:8002';
    const firstLeg = [
      [101.6869, 3.139],
      [101.7, 3.14],
    ] as Array<[number, number]>;
    const secondLeg = [
      [101.7, 3.14],
      [101.72, 3.157],
    ] as Array<[number, number]>;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          trip: {
            summary: { length: 4.2, time: 360 },
            legs: [firstLeg, secondLeg].map((coordinates, index) => ({
              shape: encodePolyline6(coordinates),
              maneuvers: [
                {
                  type: index + 1,
                  instruction: `Leg ${index + 1}`,
                  length: 2.1,
                  time: 180,
                  begin_shape_index: 0,
                  end_shape_index: 1,
                },
              ],
            })),
          },
        }),
        { status: 200 },
      ),
    );
    const provider = new ValhallaRoutingProvider();

    const result = await provider.route(origin, destination, {
      vehicleType: VehicleType.CAR,
      maxHeightCm: null,
      maxLengthCm: null,
      maxWeightKg: null,
    });

    expect(result.geometry.coordinates).toEqual([
      firstLeg[0],
      firstLeg[1],
      secondLeg[1],
    ]);
    expect(
      result.maneuvers.map(({ beginShapeIndex, endShapeIndex }) => [
        beginShapeIndex,
        endShapeIndex,
      ]),
    ).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('fails closed when the self-hosted routing service is not configured', async () => {
    delete process.env.VALHALLA_BASE_URL;
    const provider = new ValhallaRoutingProvider();

    await expect(
      provider.route(origin, destination, {
        vehicleType: VehicleType.CAR,
        maxHeightCm: null,
        maxLengthCm: null,
        maxWeightKg: null,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns service unavailable when Valhalla cannot be reached', async () => {
    process.env.VALHALLA_BASE_URL = 'http://127.0.0.1:8002';
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Connection refused'));
    const provider = new ValhallaRoutingProvider();

    await expect(
      provider.route(origin, destination, {
        vehicleType: VehicleType.CAR,
        maxHeightCm: null,
        maxLengthCm: null,
        maxWeightKg: null,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects an empty route response as a bad gateway', async () => {
    process.env.VALHALLA_BASE_URL = 'http://127.0.0.1:8002';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          trip: {
            summary: { length: 0, time: 0 },
            legs: [{ shape: '', maneuvers: [] }],
          },
        }),
        { status: 200 },
      ),
    );
    const provider = new ValhallaRoutingProvider();

    await expect(
      provider.route(origin, destination, {
        vehicleType: VehicleType.CAR,
        maxHeightCm: null,
        maxLengthCm: null,
        maxWeightKg: null,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('requires HTTPS for production route requests', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VALHALLA_BASE_URL = 'http://127.0.0.1:8002';
    const fetch = jest.spyOn(globalThis, 'fetch');
    const provider = new ValhallaRoutingProvider();

    await expect(
      provider.route(origin, destination, {
        vehicleType: VehicleType.CAR,
        maxHeightCm: null,
        maxLengthCm: null,
        maxWeightKg: null,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed or out-of-range route geometry', () => {
    expect(() => decodePolyline6('_')).toThrow(BadGatewayException);
    expect(() => decodePolyline6(encodePolyline6([[181, 0]]))).toThrow(
      BadGatewayException,
    );
  });
});

function encodePolyline6(coordinates: Array<[number, number]>): string {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let encoded = '';

  for (const [longitude, latitude] of coordinates) {
    const scaledLatitude = Math.round(latitude * 1_000_000);
    const scaledLongitude = Math.round(longitude * 1_000_000);
    encoded += encodeDelta(scaledLatitude - previousLatitude);
    encoded += encodeDelta(scaledLongitude - previousLongitude);
    previousLatitude = scaledLatitude;
    previousLongitude = scaledLongitude;
  }

  return encoded;
}

function encodeDelta(delta: number): string {
  let value = delta < 0 ? ~(delta << 1) : delta << 1;
  let encoded = '';
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  return encoded + String.fromCharCode(value + 63);
}
