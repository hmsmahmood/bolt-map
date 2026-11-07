import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { environment } from "../../../environments/environment";
import { ApiService } from "./api.service";

describe("ApiService", () => {
  let service: ApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it("requests the existing backend health endpoint", () => {
    const health = {
      status: "ok",
      service: "SMARTROUTE AI",
      environment: "development",
      timestamp: "2026-11-03T00:00:00.000Z",
    };

    service.getHealth().subscribe((result) => {
      expect(result).toEqual(health);
    });

    const request = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/health`,
    );
    expect(request.request.method).toBe("GET");
    request.flush(health);
  });

  it("uses the owner-scoped vehicle profile CRUD endpoints", () => {
    const profile = {
      id: "vehicle-1",
      userId: "user-1",
      name: "Daily car",
      vehicleType: "car" as const,
      make: "Perodua",
      model: "Myvi",
      modelYear: 2024,
      registrationNumber: null,
      maxWeightKg: null,
      maxHeightCm: null,
      maxLengthCm: null,
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
    };

    service.getVehicleProfiles().subscribe((result) => {
      expect(result).toEqual([profile]);
    });
    const listRequest = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/v1/vehicle-profiles`,
    );
    expect(listRequest.request.method).toBe("GET");
    listRequest.flush([profile]);

    service
      .createVehicleProfile({
        name: "Daily car",
        vehicleType: "car",
        make: "Perodua",
        model: "Myvi",
      })
      .subscribe();
    const createRequest = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/v1/vehicle-profiles`,
    );
    expect(createRequest.request.method).toBe("POST");
    createRequest.flush(profile);

    service
      .updateVehicleProfile("vehicle/1", { name: "Family car" })
      .subscribe();
    const updateRequest = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/v1/vehicle-profiles/vehicle%2F1`,
    );
    expect(updateRequest.request.method).toBe("PATCH");
    updateRequest.flush({ ...profile, name: "Family car" });

    service.deleteVehicleProfile("vehicle/1").subscribe();
    const deleteRequest = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/v1/vehicle-profiles/vehicle%2F1`,
    );
    expect(deleteRequest.request.method).toBe("DELETE");
    deleteRequest.flush(null);
  });

  it("sends explicit route endpoints and the selected vehicle profile to SMARTROUTE", () => {
    const requestBody = {
      origin: { lat: 3.139, lng: 101.6869 },
      destination: { lat: 3.157, lng: 101.72 },
      vehicleProfileId: "23b5f0d7-9548-4893-9c52-316ab7a38eb9",
    };
    const route = {
      provider: "Valhalla" as const,
      vehicleType: "car" as const,
      distanceKm: 5.2,
      durationSeconds: 390,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [101.6869, 3.139],
          [101.72, 3.157],
        ] as Array<[number, number]>,
      },
      maneuvers: [],
      liveTraffic: false as const,
    };

    service.calculateNavigationRoute(requestBody).subscribe((result) => {
      expect(result).toEqual(route);
    });

    const request = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/navigation/route`,
    );
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual(requestBody);
    request.flush(route);
  });

  it("lists, reports, and votes on explicitly requested community incidents", () => {
    const report = {
      id: "report-1",
      type: "road_hazard" as const,
      lat: 3.139,
      lng: 101.686,
      createdAt: "2026-11-04T10:00:00.000Z",
      expiresAt: "2026-11-04T12:00:00.000Z",
      confirmations: 1,
      clears: 0,
      confidence: "unconfirmed" as const,
      source: "community_report" as const,
      isMine: true,
    };

    service
      .getNearbyCommunityIncidents(3.139, 101.686)
      .subscribe((result) => expect(result).toEqual([report]));
    const listRequest = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/community/incidents/nearby`,
    );
    expect(listRequest.request.method).toBe("POST");
    expect(listRequest.request.body).toEqual({
      lat: 3.139,
      lng: 101.686,
      radiusMeters: 3000,
    });
    listRequest.flush([report]);

    service
      .createCommunityIncident({
        type: "road_hazard",
        lat: 3.139,
        lng: 101.686,
      })
      .subscribe((result) => expect(result.incident).toEqual(report));
    const createRequest = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/community/incidents`,
    );
    expect(createRequest.request.method).toBe("POST");
    expect(createRequest.request.body).toEqual({
      type: "road_hazard",
      lat: 3.139,
      lng: 101.686,
    });
    createRequest.flush({ incident: report, duplicate: false });

    service.voteOnCommunityIncident("report-1", "confirm").subscribe();
    const voteRequest = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/community/incidents/report-1/votes`,
    );
    expect(voteRequest.request.method).toBe("POST");
    expect(voteRequest.request.body).toEqual({ vote: "confirm" });
    voteRequest.flush(report);

    service.deleteCommunityIncident("report-1").subscribe();
    const deleteRequest = httpTestingController.expectOne(
      `${environment.apiBaseUrl}/community/incidents/report-1`,
    );
    expect(deleteRequest.request.method).toBe("DELETE");
    deleteRequest.flush(null);
  });
});
