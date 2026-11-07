import { BadGatewayException } from '@nestjs/common';
import { OsrmRoutingProvider } from './road-routing.provider';

describe('OsrmRoutingProvider', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.OSRM_BASE_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.OSRM_BASE_URL;
    } else {
      process.env.OSRM_BASE_URL = originalBaseUrl;
    }
    jest.restoreAllMocks();
  });

  it('requests a road route and converts OSRM measurements to kilometers and minutes', async () => {
    process.env.OSRM_BASE_URL = 'https://routing.example.test/';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            distance: 12500,
            duration: 900,
            geometry: {
              type: 'LineString',
              coordinates: [
                [101.6, 3.1],
                [101.7, 3.2],
              ],
            },
            legs: [
              { distance: 12500, duration: 900 },
            ],
          },
        ],
      }),
    });
    global.fetch = fetchMock;
    const provider = new OsrmRoutingProvider();

    const result = await provider.route([
      { lat: 3.1, lng: 101.6 },
      { lat: 3.2, lng: 101.7 },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://routing.example.test/route/v1/driving/101.6,3.1;101.7,3.2?overview=full&geometries=geojson&steps=false',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toMatchObject({
      provider: 'OSRM',
      distanceKm: 12.5,
      durationMinutes: 15,
      legs: [{ distanceKm: 12.5, durationMinutes: 15 }],
    });
  });

  it('requests a duration matrix for driving-time stop ordering', async () => {
    process.env.OSRM_BASE_URL = 'https://routing.example.test/';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'Ok',
        durations: [
          [0, 120],
          [90, 0],
        ],
      }),
    });
    global.fetch = fetchMock;
    const provider = new OsrmRoutingProvider();

    await expect(
      provider.travelTimes([
        { lat: 3.1, lng: 101.6 },
        { lat: 3.2, lng: 101.7 },
      ]),
    ).resolves.toEqual([
      [0, 120],
      [90, 0],
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://routing.example.test/table/v1/driving/101.6,3.1;101.7,3.2?annotations=duration',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns null when no provider URL is configured', async () => {
    delete process.env.OSRM_BASE_URL;
    const provider = new OsrmRoutingProvider();

    await expect(provider.route([{ lat: 3.1, lng: 101.6 }])).resolves.toBeNull();
  });

  it('reports malformed provider responses as gateway errors', async () => {
    process.env.OSRM_BASE_URL = 'https://routing.example.test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 'NoRoute', routes: [] }),
    });

    const provider = new OsrmRoutingProvider();

    await expect(
      provider.route([
        { lat: 3.1, lng: 101.6 },
        { lat: 3.2, lng: 101.7 },
      ]),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
