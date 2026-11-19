import type { Position, WatchPositionCallback } from "@capacitor/geolocation";
import type { AppState } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import type { MapClickEvent } from "@capawesome/capacitor-maplibre";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { finalize, of, Subject, throwError } from "rxjs";
import { ApiService } from "../../core/api/api.service";
import { CommunityIncident } from "../../core/api/community-incident.model";
import { NavigationRoute } from "../../core/api/navigation.model";
import { VehicleProfile } from "../../core/api/vehicle-profile.model";
import { TranslationService } from "../../core/i18n/translation.service";
import { MapEngineService } from "./map-engine.service";
import { MapPage } from "./map.page";
import { VoiceGuidanceService } from "./voice-guidance.service";

describe("MapPage", () => {
  let fixture: ComponentFixture<MapPage>;
  let mapEngine: jasmine.SpyObj<MapEngineService>;
  let api: jasmine.SpyObj<ApiService>;
  let voiceGuidance: jasmine.SpyObj<VoiceGuidanceService>;
  let locationCallback!: WatchPositionCallback;
  let appStateCallback!: (state: AppState) => void;
  let mapClickCallback!: (event: MapClickEvent) => void;
  const position: Position = {
    timestamp: Date.now(),
    coords: {
      latitude: 3.139,
      longitude: 101.6869,
      accuracy: 10,
      altitudeAccuracy: null,
      altitude: null,
      speed: 0,
      heading: 90,
      magneticHeading: 90,
      trueHeading: 90,
      headingAccuracy: 2,
      course: 90,
    },
  };
  const routeAlertProfile: VehicleProfile = {
    id: "route-alert-vehicle",
    userId: "user-1",
    name: "Daily car",
    vehicleType: "car",
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
  const routeAlertRoute: NavigationRoute = {
    provider: "Valhalla",
    vehicleType: "car",
    distanceKm: 5.2,
    durationSeconds: 390,
    geometry: {
      type: "LineString",
      coordinates: [
        [101.6869, 3.139],
        [101.703, 3.148],
        [101.72, 3.157],
      ],
    },
    maneuvers: [],
    liveTraffic: false,
  };

  function makeRouteAlertReport(
    id: string,
    lng: number,
    lat: number,
  ): CommunityIncident {
    return {
      id,
      type: "accident",
      lat,
      lng,
      createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      confirmations: 1,
      clears: 0,
      confidence: "unconfirmed",
      source: "community_report",
      isMine: false,
    };
  }

  async function startRouteNavigation(
    route: NavigationRoute = routeAlertRoute,
  ): Promise<void> {
    api.getVehicleProfiles.and.returnValue(of([routeAlertProfile]));
    api.calculateNavigationRoute.and.returnValue(of(route));
    await fixture.componentInstance.startLocation();
    fixture.componentInstance.openRoutePlanner();
    await fixture.whenStable();
    mapClickCallback({
      mapId: "gng-driving-map",
      coordinates: { latitude: 3.157, longitude: 101.72 },
      point: { x: 10, y: 20 },
    });
    await fixture.componentInstance.calculateRoute();
    fixture.componentInstance.startNavigation();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    mapEngine = jasmine.createSpyObj<MapEngineService>("MapEngineService", [
      "isNativePlatform",
      "createMap",
      "destroyMap",
      "setStyle",
      "addGeoJsonSource",
      "updateGeoJsonSourceById",
      "addLayer",
      "removeLayerById",
      "removeGeoJsonSourceById",
      "getCamera",
      "setCamera",
      "addMarker",
      "updateMarker",
      "addPolyline",
      "removeAllPolylines",
      "removeMarkerById",
      "fitBounds",
      "addMapClickListener",
      "checkLocationPermissions",
      "requestLocationPermissions",
      "getCurrentPosition",
      "watchPosition",
      "clearWatch",
      "addAppStateListener",
    ]);
    mapEngine.isNativePlatform.and.returnValue(false);
    mapEngine.createMap.and.resolveTo();
    mapEngine.addGeoJsonSource.and.resolveTo();
    mapEngine.updateGeoJsonSourceById.and.resolveTo();
    mapEngine.addLayer.and.resolveTo();
    mapEngine.removeLayerById.and.resolveTo();
    mapEngine.removeGeoJsonSourceById.and.resolveTo();
    mapEngine.destroyMap.and.resolveTo();
    mapEngine.addMarker.and.resolveTo();
    mapEngine.updateMarker.and.resolveTo();
    mapEngine.addPolyline.and.resolveTo();
    mapEngine.removeAllPolylines.and.resolveTo();
    mapEngine.removeMarkerById.and.resolveTo();
    mapEngine.fitBounds.and.resolveTo();
    mapEngine.addMapClickListener.and.callFake(async (listener) => {
      mapClickCallback = listener;
      return { remove: async () => undefined } as PluginListenerHandle;
    });
    mapEngine.setCamera.and.resolveTo();
    mapEngine.getCamera.and.resolveTo({
      camera: {
        bearing: 0,
        center: { latitude: 3.139, longitude: 101.6869 },
        pitch: 0,
        zoom: 12,
      },
    });
    mapEngine.setStyle.and.resolveTo();
    mapEngine.checkLocationPermissions.and.resolveTo({
      location: "granted",
      coarseLocation: "granted",
    });
    mapEngine.requestLocationPermissions.and.resolveTo({
      location: "granted",
      coarseLocation: "granted",
    });
    mapEngine.getCurrentPosition.and.resolveTo(position);
    mapEngine.watchPosition.and.callFake(async (_options, callback) => {
      locationCallback = callback;
      return "watch-1";
    });
    mapEngine.clearWatch.and.resolveTo();
    mapEngine.addAppStateListener.and.callFake(async (listener) => {
      appStateCallback = listener;
      return { remove: async () => undefined } as PluginListenerHandle;
    });
    api = jasmine.createSpyObj<ApiService>("ApiService", [
      "getVehicleProfiles",
      "calculateNavigationRoute",
      "getNearbyCommunityIncidents",
      "createCommunityIncident",
      "voteOnCommunityIncident",
      "deleteCommunityIncident",
    ]);
    api.getNearbyCommunityIncidents.and.returnValue(of([]));
    voiceGuidance = jasmine.createSpyObj<VoiceGuidanceService>(
      "VoiceGuidanceService",
      ["speak", "stop"],
    );
    voiceGuidance.speak.and.resolveTo();
    voiceGuidance.stop.and.resolveTo();

    TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MapEngineService, useValue: mapEngine },
        { provide: ApiService, useValue: api },
        { provide: VoiceGuidanceService, useValue: voiceGuidance },
        {
          provide: TranslationService,
          useValue: { text: (key: string) => key, locale: () => "en" },
        },
      ],
    });
    fixture = TestBed.createComponent(MapPage);
    const initializeMapSpy = spyOn(
      fixture.componentInstance,
      "initializeMap",
    ).and.callThrough();
    fixture.detectChanges();
    await initializeMapSpy.calls.mostRecent().returnValue;
    await mapEngine.addAppStateListener.calls.mostRecent().returnValue;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.autoDetectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it("creates a lazy map centered on Kuala Lumpur and reports a ready state", () => {
    expect(mapEngine.createMap).toHaveBeenCalled();
    expect(fixture.componentInstance.mapState()).toBe("ready");
    expect(fixture.componentInstance.mapStatus()).toBe("mapLocationReady");
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("mapPrivacyNote");
  });

  it("initializes an empty provider traffic overlay without changing route or community sources", () => {
    expect(mapEngine.addGeoJsonSource).toHaveBeenCalledWith(
      jasmine.objectContaining({
        sourceId: "gng-provider-traffic",
        data: jasmine.objectContaining({
          type: "FeatureCollection",
          features: [],
        }),
      }),
    );
    expect(mapEngine.addLayer).toHaveBeenCalledWith(
      jasmine.objectContaining({
        layerId: "gng-provider-traffic-flow",
        sourceId: "gng-provider-traffic",
        belowLayerId: "street-labels",
      }),
    );
    expect(api.calculateNavigationRoute).not.toHaveBeenCalled();
    expect(api.getNearbyCommunityIncidents).not.toHaveBeenCalled();
  });

  it("requests location on demand, follows GPS and updates the vehicle marker", async () => {
    await fixture.componentInstance.startLocation();

    expect(mapEngine.getCurrentPosition).toHaveBeenCalled();
    expect(mapEngine.addMarker).toHaveBeenCalled();
    expect(mapEngine.setCamera).toHaveBeenCalledWith(
      jasmine.objectContaining({
        center: { latitude: 3.139, longitude: 101.6869 },
        bearing: 90,
        pitch: 40,
      }),
    );
    expect(fixture.componentInstance.locationState()).toBe("active");

    locationCallback(
      { ...position, coords: { ...position.coords, longitude: 101.7 } },
      undefined,
    );
    await fixture.whenStable();
    expect(mapEngine.updateMarker).toHaveBeenCalled();
  });

  it("coalesces slow GPS map renders and displays the newest location", async () => {
    await fixture.componentInstance.startLocation();
    let finishFirstRender!: () => void;
    mapEngine.updateMarker.and.returnValue(
      new Promise<void>((resolve) => {
        finishFirstRender = resolve;
      }),
    );

    const firstPosition: Position = {
      ...position,
      coords: { ...position.coords, longitude: 101.7 },
    };
    const latestPosition: Position = {
      ...position,
      coords: { ...position.coords, longitude: 101.71 },
    };
    locationCallback(firstPosition, undefined);
    locationCallback(latestPosition, undefined);

    expect(mapEngine.updateMarker).toHaveBeenCalledTimes(1);
    finishFirstRender();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(mapEngine.updateMarker).toHaveBeenCalledTimes(2);
    expect(
      mapEngine.updateMarker.calls.mostRecent().args[0].coordinates,
    ).toEqual({
      latitude: latestPosition.coords.latitude,
      longitude: latestPosition.coords.longitude,
    });
    expect(mapEngine.setCamera.calls.mostRecent().args[0].center).toEqual({
      latitude: latestPosition.coords.latitude,
      longitude: latestPosition.coords.longitude,
    });
  });

  it("loads nearby community reports only after the user opens the report panel", async () => {
    const report = {
      id: "report-1",
      type: "road_hazard" as const,
      lat: 3.14,
      lng: 101.687,
      createdAt: "2026-11-04T10:00:00.000Z",
      expiresAt: "2026-11-04T12:00:00.000Z",
      confirmations: 1,
      clears: 0,
      confidence: "unconfirmed" as const,
      source: "community_report" as const,
      isMine: false,
    };
    api.getNearbyCommunityIncidents.and.returnValue(of([report]));

    await fixture.componentInstance.startLocation();
    await fixture.componentInstance.toggleCommunityReports();

    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledWith(
      position.coords.latitude,
      position.coords.longitude,
    );
    expect(fixture.componentInstance.communityReports()).toEqual([report]);
    expect(mapEngine.addMarker).toHaveBeenCalledWith(
      jasmine.objectContaining({
        marker: jasmine.objectContaining({
          id: "gng-community-report-1",
          coordinates: { latitude: 3.14, longitude: 101.687 },
        }),
      }),
    );
  });

  it("keeps reports on a network failure and removes expired reports after a successful refresh", async () => {
    const report = {
      id: "report-expiring",
      type: "road_hazard" as const,
      lat: 3.14,
      lng: 101.687,
      createdAt: "2026-11-04T10:00:00.000Z",
      expiresAt: "2026-11-04T12:00:00.000Z",
      confirmations: 1,
      clears: 0,
      confidence: "unconfirmed" as const,
      source: "community_report" as const,
      isMine: false,
    };
    api.getNearbyCommunityIncidents.and.returnValues(
      of([report]),
      throwError(() => new Error("Network interrupted")),
      of([]),
    );

    await fixture.componentInstance.startLocation();
    await fixture.componentInstance.toggleCommunityReports();
    await fixture.componentInstance.loadCommunityReports();

    expect(fixture.componentInstance.communityReports()).toEqual([report]);
    expect(fixture.componentInstance.communityReportMessage()).toBe(
      "mapCommunityLoadFailed",
    );

    await fixture.componentInstance.loadCommunityReports();

    expect(fixture.componentInstance.communityReports()).toEqual([]);
    expect(mapEngine.removeMarkerById).toHaveBeenCalledWith({
      mapId: "gng-driving-map",
      markerId: "gng-community-report-expiring",
    });
    expect(fixture.componentInstance.communityReportMessage()).toBe(
      "mapCommunityNone",
    );
  });

  it("submits a report only from the user's explicit action and refreshes nearby reports", async () => {
    const report = {
      id: "report-2",
      type: "accident" as const,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      createdAt: "2026-11-04T10:00:00.000Z",
      expiresAt: "2026-11-04T12:00:00.000Z",
      confirmations: 1,
      clears: 0,
      confidence: "unconfirmed" as const,
      source: "community_report" as const,
      isMine: true,
    };
    api.createCommunityIncident.and.returnValue(
      of({ incident: report, duplicate: false }),
    );
    api.getNearbyCommunityIncidents.and.returnValue(of([report]));

    await fixture.componentInstance.startLocation();
    await fixture.componentInstance.submitCommunityReport();

    expect(api.createCommunityIncident).toHaveBeenCalledWith({
      type: "road_hazard",
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });
    expect(fixture.componentInstance.communityReportMessage()).toBe(
      "mapCommunityReportSent",
    );
    expect(fixture.componentInstance.communityReports()).toEqual([report]);
  });

  it("updates community vote totals and lets a user delete only their own report", async () => {
    const report = {
      id: "owned-report",
      type: "breakdown" as const,
      lat: 3.139,
      lng: 101.6869,
      createdAt: "2026-11-04T10:00:00.000Z",
      expiresAt: "2026-11-04T12:00:00.000Z",
      confirmations: 1,
      clears: 0,
      confidence: "unconfirmed" as const,
      source: "community_report" as const,
      isMine: true,
    };
    const voted = { ...report, confirmations: 2 };
    fixture.componentInstance.communityReports.set([report]);
    api.voteOnCommunityIncident.and.returnValue(of(voted));
    api.deleteCommunityIncident.and.returnValue(of(undefined));

    await fixture.componentInstance.voteOnCommunityReport(report, "confirm");
    expect(fixture.componentInstance.communityReports()).toEqual([voted]);

    await fixture.componentInstance.deleteCommunityReport({
      ...report,
      isMine: false,
    });
    expect(api.deleteCommunityIncident).not.toHaveBeenCalled();

    await fixture.componentInstance.deleteCommunityReport(report);
    expect(api.deleteCommunityIncident).toHaveBeenCalledWith("owned-report");
    expect(fixture.componentInstance.communityReports()).toEqual([]);
    expect(fixture.componentInstance.communityReportMessage()).toBe(
      "mapCommunityDeleted",
    );
  });

  it("uses GPS movement to orient the vehicle when the device heading is unavailable", async () => {
    await fixture.componentInstance.startLocation();

    locationCallback(
      {
        ...position,
        coords: {
          ...position.coords,
          latitude: 3.14,
          heading: null,
          trueHeading: null,
          course: null,
        },
      },
      undefined,
    );
    await fixture.whenStable();

    expect(mapEngine.updateMarker).toHaveBeenCalledWith(
      jasmine.objectContaining({ rotation: jasmine.any(Number) }),
    );
    expect(mapEngine.setCamera.calls.mostRecent().args[0].bearing).toBeCloseTo(
      0,
    );
  });

  it("pauses foreground navigation on backgrounding and recovers after GPS resumes", async () => {
    await fixture.componentInstance.startLocation();
    fixture.componentInstance.navigationActive.set(true);

    appStateCallback({ isActive: false });

    expect(fixture.componentInstance.navigationPaused()).toBeTrue();
    expect(mapEngine.clearWatch).toHaveBeenCalledWith("watch-1");
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelector(".navigation-guidance")?.textContent,
    ).toContain("mapNavigationPaused");

    appStateCallback({ isActive: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(mapEngine.getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(mapEngine.watchPosition).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.navigationPaused()).toBeFalse();

    locationCallback(null, new Error("GPS temporarily unavailable"));
    expect(fixture.componentInstance.navigationPaused()).toBeTrue();
    expect(fixture.componentInstance.locationState()).toBe("error");
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelector(".location-error")?.textContent,
    ).toContain("mapLocationFailed");

    await fixture.componentInstance.startLocation();
    await fixture.whenStable();
    expect(mapEngine.watchPosition).toHaveBeenCalledTimes(3);
    expect(fixture.componentInstance.navigationPaused()).toBeFalse();
    expect(fixture.componentInstance.locationState()).toBe("active");
  });

  it("shows a clear denied state and does not start GPS when permission is refused", async () => {
    mapEngine.isNativePlatform.and.returnValue(true);
    mapEngine.checkLocationPermissions.and.resolveTo({
      location: "prompt",
      coarseLocation: "prompt",
    });
    mapEngine.requestLocationPermissions.and.resolveTo({
      location: "denied",
      coarseLocation: "denied",
    });

    await fixture.componentInstance.startLocation();

    expect(fixture.componentInstance.locationState()).toBe("denied");
    expect(fixture.componentInstance.locationError()).toBe("mapLocationDenied");
    expect(mapEngine.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("switches map themes without waiting for the web renderer style-load event", () => {
    fixture.componentInstance.toggleNightMode();

    expect(mapEngine.setStyle).toHaveBeenCalled();
    expect(fixture.componentInstance.nightMode()).toBeTrue();
  });

  it("sends location only after explicit route calculation and draws the returned route", async () => {
    const profile: VehicleProfile = {
      id: "vehicle-1",
      userId: "user-1",
      name: "Daily car",
      vehicleType: "car",
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
    const route: NavigationRoute = {
      provider: "Valhalla",
      vehicleType: "car",
      distanceKm: 5.2,
      durationSeconds: 390,
      geometry: {
        type: "LineString",
        coordinates: [
          [101.6869, 3.139],
          [101.703, 3.148],
          [101.72, 3.157],
        ],
      },
      maneuvers: [
        {
          instruction: "Continue on Jalan Damansara.",
          distanceKm: 2,
          durationSeconds: 180,
          type: 3,
          beginShapeIndex: 0,
          endShapeIndex: 1,
          streetNames: ["Jalan Damansara"],
        },
        {
          instruction: "Turn right.",
          distanceKm: 3.2,
          durationSeconds: 210,
          type: 10,
          beginShapeIndex: 1,
          endShapeIndex: 2,
          streetNames: ["Jalan Tun Razak"],
        },
      ],
      liveTraffic: false,
    };
    api.getVehicleProfiles.and.returnValue(of([profile]));
    api.calculateNavigationRoute.and.returnValue(of(route));

    await fixture.componentInstance.startLocation();
    fixture.componentInstance.openRoutePlanner();
    expect(api.getVehicleProfiles).toHaveBeenCalled();
    expect(api.calculateNavigationRoute).not.toHaveBeenCalled();

    mapClickCallback({
      mapId: "gng-driving-map",
      coordinates: { latitude: 3.157, longitude: 101.72 },
      point: { x: 10, y: 20 },
    });
    expect(api.calculateNavigationRoute).not.toHaveBeenCalled();

    await fixture.componentInstance.calculateRoute();
    await fixture.whenStable();

    expect(api.calculateNavigationRoute).toHaveBeenCalledWith({
      origin: { lat: 3.139, lng: 101.6869 },
      destination: { lat: 3.157, lng: 101.72 },
      vehicleProfileId: "vehicle-1",
    });
    expect(mapEngine.addPolyline).toHaveBeenCalledWith(
      jasmine.objectContaining({
        polyline: jasmine.objectContaining({
          color: "#2879df",
          coordinates: [
            { latitude: 3.139, longitude: 101.6869 },
            { latitude: 3.148, longitude: 101.703 },
            { latitude: 3.157, longitude: 101.72 },
          ],
        }),
      }),
    );
    expect(mapEngine.fitBounds).toHaveBeenCalled();
  });

  it("shows relevant community reports ahead during navigation and removes alerts when navigation stops", async () => {
    const profile: VehicleProfile = {
      id: "vehicle-1",
      userId: "user-1",
      name: "Daily car",
      vehicleType: "car",
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
    const route: NavigationRoute = {
      provider: "Valhalla",
      vehicleType: "car",
      distanceKm: 5.2,
      durationSeconds: 390,
      geometry: {
        type: "LineString",
        coordinates: [
          [101.6869, 3.139],
          [101.703, 3.148],
          [101.72, 3.157],
        ],
      },
      maneuvers: [],
      liveTraffic: false,
    };
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const report = (id: string, lng: number, lat: number) => ({
      id,
      type: "accident" as const,
      lat,
      lng,
      createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      expiresAt,
      confirmations: 1,
      clears: 0,
      confidence: "unconfirmed" as const,
      source: "community_report" as const,
      isMine: false,
    });
    api.getVehicleProfiles.and.returnValue(of([profile]));
    api.calculateNavigationRoute.and.returnValue(of(route));
    api.getNearbyCommunityIncidents.and.returnValue(
      of([
        report("ahead", 101.711, 3.1522),
        report("behind", 101.695, 3.1435),
        report("off-route", 101.711, 3.1552),
      ]),
    );

    await fixture.componentInstance.startLocation();
    fixture.componentInstance.openRoutePlanner();
    mapClickCallback({
      mapId: "gng-driving-map",
      coordinates: { latitude: 3.157, longitude: 101.72 },
      point: { x: 10, y: 20 },
    });
    await fixture.componentInstance.calculateRoute();
    locationCallback(
      {
        ...position,
        coords: { ...position.coords, latitude: 3.148, longitude: 101.703 },
      },
      undefined,
    );
    await fixture.whenStable();
    fixture.componentInstance.startNavigation();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledWith(
      3.148,
      101.703,
      5000,
    );
    expect(
      fixture.componentInstance.routeCommunityAlerts().map(({ id }) => id),
    ).toEqual(["ahead"]);
    expect(fixture.nativeElement.textContent).toContain(
      "mapRouteAlertCommunity",
    );
    expect(fixture.nativeElement.textContent).toContain("mapCommunityAccident");
    expect(mapEngine.addMarker).toHaveBeenCalledWith(
      jasmine.objectContaining({
        marker: jasmine.objectContaining({ id: "gng-community-ahead" }),
      }),
    );

    locationCallback(
      {
        ...position,
        coords: { ...position.coords, latitude: 3.1544, longitude: 101.715 },
      },
      undefined,
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.routeCommunityAlerts()).toEqual([]);
    expect(mapEngine.removeMarkerById).toHaveBeenCalledWith({
      mapId: "gng-driving-map",
      markerId: "gng-community-ahead",
    });

    await fixture.componentInstance.stopNavigation();
    await fixture.whenStable();
    expect(fixture.componentInstance.routeCommunityAlerts()).toEqual([]);
  });

  it("throttles route-alert requests to one per 45 seconds", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").and.returnValue(now);
    api.getNearbyCommunityIncidents.and.returnValue(of([]));

    await startRouteNavigation();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(1);

    clock.and.returnValue(now + 44_999);
    locationCallback(
      { ...position, timestamp: position.timestamp + 3_000 },
      undefined,
    );
    await fixture.whenStable();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(1);

    clock.and.returnValue(now + 45_000);
    locationCallback(
      { ...position, timestamp: position.timestamp + 6_000 },
      undefined,
    );
    await fixture.whenStable();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(2);
  });

  it("does not let reroute refreshes bypass the 45-second request limit", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").and.returnValue(now);
    api.getNearbyCommunityIncidents.and.returnValue(of([]));

    await startRouteNavigation();
    api.calculateNavigationRoute.and.returnValue(
      of({ ...routeAlertRoute, distanceKm: 6 }),
    );
    await fixture.componentInstance.reroute();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(1);

    clock.and.returnValue(now + 44_999);
    locationCallback(
      { ...position, timestamp: position.timestamp + 3_000 },
      undefined,
    );
    await fixture.whenStable();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(1);

    clock.and.returnValue(now + 45_000);
    locationCallback(
      { ...position, timestamp: position.timestamp + 6_000 },
      undefined,
    );
    await fixture.whenStable();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(2);
  });

  it("does not start a duplicate route-alert request while one is in flight", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").and.returnValue(now);
    const request = new Subject<CommunityIncident[]>();
    api.getNearbyCommunityIncidents.and.returnValue(request);

    await startRouteNavigation();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(1);

    clock.and.returnValue(now + 45_001);
    locationCallback(
      { ...position, timestamp: position.timestamp + 3_000 },
      undefined,
    );
    await fixture.whenStable();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(1);

    request.next([]);
    request.complete();
    await fixture.whenStable();
  });

  it("keeps a still-fresh alert after a refresh failure and expires it afterward", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").and.returnValue(now);
    const firstRequest = new Subject<CommunityIncident[]>();
    const alert = makeRouteAlertReport("fresh-after-failure", 101.703, 3.148);
    spyOn(console, "warn");
    api.getNearbyCommunityIncidents.and.returnValues(
      firstRequest,
      throwError(() => new Error("Nearby reports unavailable")),
      of([]),
    );

    await startRouteNavigation();
    clock.and.returnValue(now + 1_000);
    firstRequest.next([alert]);
    firstRequest.complete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    expect(fixture.componentInstance.routeCommunityAlerts()).toEqual([
      jasmine.objectContaining({ id: alert.id }),
    ]);

    clock.and.returnValue(now + 45_000);
    locationCallback(
      { ...position, timestamp: position.timestamp + 3_000 },
      undefined,
    );
    await fixture.whenStable();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(2);
    expect(
      fixture.componentInstance.routeCommunityAlerts().map(({ id }) => id),
    ).toEqual([alert.id]);

    clock.and.returnValue(now + 46_000);
    locationCallback(
      { ...position, timestamp: position.timestamp + 6_000 },
      undefined,
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.routeCommunityAlerts()).toEqual([]);
    expect(
      fixture.nativeElement.querySelector(".route-community-alert"),
    ).toBeNull();
  });

  it("ignores an old route response and refreshes for a replacement route", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").and.returnValue(now);
    const firstRequest = new Subject<CommunityIncident[]>();
    const routeB: NavigationRoute = {
      ...routeAlertRoute,
      geometry: {
        type: "LineString",
        coordinates: [
          [101.6869, 3.139],
          [101.7, 3.16],
          [101.72, 3.157],
        ],
      },
    };
    const reportForRouteB = makeRouteAlertReport(
      "replacement-route-report",
      101.7,
      3.16,
    );
    api.getNearbyCommunityIncidents.and.returnValues(
      firstRequest,
      of([reportForRouteB]),
    );

    await startRouteNavigation();
    api.calculateNavigationRoute.and.returnValue(of(routeB));
    await fixture.componentInstance.reroute();
    expect(fixture.componentInstance.navigationRoute()).toEqual(routeB);
    clock.and.returnValue(now + 45_000);
    firstRequest.next([
      makeRouteAlertReport("old-route-report", 101.703, 3.148),
    ]);
    firstRequest.complete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(2);
    expect(
      fixture.componentInstance.routeCommunityAlerts().map(({ id }) => id),
    ).toEqual([reportForRouteB.id]);
  });

  it("times out a stalled request so a replacement route can refresh without accepting old results", async () => {
    const now = Date.now();
    let currentTime = now;
    spyOn(Date, "now").and.callFake(() => currentTime);
    const stalledRequest = new Subject<CommunityIncident[]>();
    let requestCancelled = false;
    const routeB: NavigationRoute = {
      ...routeAlertRoute,
      geometry: {
        type: "LineString",
        coordinates: [
          [101.6869, 3.139],
          [101.7, 3.16],
          [101.72, 3.157],
        ],
      },
    };
    const reportForRouteB = makeRouteAlertReport(
      "timed-out-route-report",
      101.7,
      3.16,
    );
    api.getNearbyCommunityIncidents.and.returnValue(of([]));

    await startRouteNavigation();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(1);

    api.getNearbyCommunityIncidents.and.returnValue(
      stalledRequest.pipe(finalize(() => (requestCancelled = true))),
    );
    const clock = jasmine.clock();
    clock.install();
    try {
      currentTime = now + 45_000;
      locationCallback(
        { ...position, timestamp: position.timestamp + 3_000 },
        undefined,
      );
      expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(2);

      api.calculateNavigationRoute.and.returnValue(of(routeB));
      await fixture.componentInstance.reroute();
      expect(fixture.componentInstance.navigationRoute()).toEqual(routeB);
      expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(2);

      clock.tick(15_000);
      expect(requestCancelled).toBeTrue();
      expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(2);

      clock.uninstall();
      currentTime = now + 60_000;
      await fixture.whenStable();
      api.getNearbyCommunityIncidents.and.returnValue(of([reportForRouteB]));
      currentTime = now + 90_000;
      locationCallback(
        { ...position, timestamp: position.timestamp + 6_000 },
        undefined,
      );
      await fixture.whenStable();
      fixture.detectChanges();
      expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(3);
      expect(
        fixture.componentInstance.routeCommunityAlerts().map(({ id }) => id),
      ).toEqual([reportForRouteB.id]);

      stalledRequest.next([
        makeRouteAlertReport("late-old-route-report", 101.703, 3.148),
      ]);
      stalledRequest.complete();
      await fixture.whenStable();
      expect(
        fixture.componentInstance.routeCommunityAlerts().map(({ id }) => id),
      ).toEqual([reportForRouteB.id]);
    } finally {
      clock.uninstall();
      fixture.destroy();
    }
  });

  it("hides fresh route alerts and their route markers after a GPS failure", async () => {
    const alert = makeRouteAlertReport("gps-paused-report", 101.703, 3.148);
    api.getNearbyCommunityIncidents.and.returnValue(of([alert]));

    await startRouteNavigation();
    expect(
      fixture.nativeElement.querySelector(".route-community-alert"),
    ).not.toBeNull();

    locationCallback(null, new Error("GPS temporarily unavailable"));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.navigationPaused()).toBeTrue();
    expect(fixture.componentInstance.routeCommunityAlerts()).toEqual([
      jasmine.objectContaining({ id: alert.id }),
    ]);
    expect(
      fixture.nativeElement.querySelector(".route-community-alert"),
    ).toBeNull();
    expect(mapEngine.removeMarkerById).toHaveBeenCalledWith({
      mapId: "gng-driving-map",
      markerId: "gng-community-gps-paused-report",
    });
  });

  it("hides route alerts in the background and restores only fresh data on resume", async () => {
    const alert = makeRouteAlertReport("background-report", 101.703, 3.148);
    api.getNearbyCommunityIncidents.and.returnValue(of([alert]));

    await startRouteNavigation();
    expect(
      fixture.nativeElement.querySelector(".route-community-alert"),
    ).not.toBeNull();

    appStateCallback({ isActive: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.navigationPaused()).toBeTrue();
    expect(
      fixture.nativeElement.querySelector(".route-community-alert"),
    ).toBeNull();
    expect(fixture.componentInstance.routeCommunityAlerts()).toEqual([
      jasmine.objectContaining({ id: alert.id }),
    ]);

    appStateCallback({ isActive: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.navigationPaused()).toBeFalse();
    expect(
      fixture.nativeElement.querySelector(".route-community-alert"),
    ).not.toBeNull();
    expect(api.getNearbyCommunityIncidents).toHaveBeenCalledTimes(1);
  });

  it("clears route alerts when the driver arrives", async () => {
    api.getNearbyCommunityIncidents.and.returnValue(
      of([makeRouteAlertReport("arrival-report", 101.703, 3.148)]),
    );
    await startRouteNavigation();
    expect(fixture.componentInstance.routeCommunityAlerts().length).toBe(1);

    locationCallback(
      {
        ...position,
        coords: { ...position.coords, latitude: 3.157, longitude: 101.72 },
      },
      undefined,
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.navigationArrived()).toBeTrue();
    expect(fixture.componentInstance.routeCommunityAlerts()).toEqual([]);
    expect(
      fixture.nativeElement.querySelector(".route-community-alert"),
    ).toBeNull();
  });

  it("shows a route error when the routing API is unavailable", async () => {
    api.getVehicleProfiles.and.returnValue(
      of([
        {
          id: "vehicle-1",
          userId: "user-1",
          name: "Daily car",
          vehicleType: "car",
          make: "Perodua",
          model: "Myvi",
          modelYear: 2024,
          registrationNumber: null,
          maxWeightKg: null,
          maxHeightCm: null,
          maxLengthCm: null,
          createdAt: "2026-11-04T00:00:00.000Z",
          updatedAt: "2026-11-04T00:00:00.000Z",
        },
      ]),
    );
    api.calculateNavigationRoute.and.returnValue(
      throwError(() => new Error("Backend unavailable")),
    );

    await fixture.componentInstance.startLocation();
    fixture.componentInstance.openRoutePlanner();
    await fixture.whenStable();
    mapClickCallback({
      mapId: "gng-driving-map",
      coordinates: { latitude: 3.157, longitude: 101.72 },
      point: { x: 10, y: 20 },
    });

    await fixture.componentInstance.calculateRoute();

    expect(fixture.componentInstance.routeError()).toBe("mapRouteFailed");
    expect(fixture.componentInstance.navigationRoute()).toBeNull();
    expect(mapEngine.addPolyline).not.toHaveBeenCalled();
  });

  it("reroutes automatically after consecutive accurate off-route fixes", async () => {
    const profile: VehicleProfile = {
      id: "vehicle-1",
      userId: "user-1",
      name: "Daily car",
      vehicleType: "car",
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
    const route: NavigationRoute = {
      provider: "Valhalla",
      vehicleType: "car",
      distanceKm: 5.2,
      durationSeconds: 390,
      geometry: {
        type: "LineString",
        coordinates: [
          [101.6869, 3.139],
          [101.703, 3.148],
          [101.72, 3.157],
        ],
      },
      maneuvers: [],
      liveTraffic: false,
    };
    const rerouted: NavigationRoute = {
      ...route,
      geometry: {
        type: "LineString",
        coordinates: [
          [101.69, 3.145],
          [101.705, 3.15],
          [101.72, 3.157],
        ],
      },
    };
    api.getVehicleProfiles.and.returnValue(of([profile]));
    api.calculateNavigationRoute.and.returnValues(of(route), of(rerouted));

    await fixture.componentInstance.startLocation();
    fixture.componentInstance.openRoutePlanner();
    mapClickCallback({
      mapId: "gng-driving-map",
      coordinates: { latitude: 3.157, longitude: 101.72 },
      point: { x: 10, y: 20 },
    });
    await fixture.componentInstance.calculateRoute();
    fixture.componentInstance.startNavigation();

    const offRoutePosition: Position = {
      ...position,
      coords: {
        ...position.coords,
        latitude: 3.145,
        longitude: 101.69,
        accuracy: 5,
      },
    };
    locationCallback(
      {
        ...offRoutePosition,
        coords: { ...offRoutePosition.coords, accuracy: 150 },
      },
      undefined,
    );
    await fixture.whenStable();
    expect(api.calculateNavigationRoute).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.navigationOffRoute()).toBeFalse();

    locationCallback(offRoutePosition, undefined);
    await fixture.whenStable();
    expect(api.calculateNavigationRoute).toHaveBeenCalledTimes(1);

    locationCallback(
      { ...offRoutePosition, timestamp: Date.now() + 1 },
      undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(api.calculateNavigationRoute).toHaveBeenCalledTimes(2);
    expect(api.calculateNavigationRoute).toHaveBeenCalledWith({
      origin: { lat: 3.145, lng: 101.69 },
      destination: { lat: 3.157, lng: 101.72 },
      vehicleProfileId: "vehicle-1",
    });
    expect(fixture.componentInstance.navigationRoute()).toEqual(rerouted);
    expect(fixture.componentInstance.navigationOffRoute()).toBeFalse();

    api.calculateNavigationRoute.and.returnValue(
      throwError(() => new Error("Network unavailable")),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.routeLoading()).toBeFalse();
    await fixture.componentInstance.reroute();

    expect(fixture.componentInstance.navigationRoute()).toEqual(rerouted);
    expect(fixture.componentInstance.routeError()).toBe("mapRouteFailed");
  });

  it("advances maneuvers locally, reports arrival, and stops without another location upload", async () => {
    const profile: VehicleProfile = {
      id: "vehicle-1",
      userId: "user-1",
      name: "Daily car",
      vehicleType: "car",
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
    const route: NavigationRoute = {
      provider: "Valhalla",
      vehicleType: "car",
      distanceKm: 5.2,
      durationSeconds: 390,
      geometry: {
        type: "LineString",
        coordinates: [
          [101.6869, 3.139],
          [101.703, 3.148],
          [101.72, 3.157],
        ],
      },
      maneuvers: [
        {
          instruction: "Continue on Jalan Damansara.",
          distanceKm: 2,
          durationSeconds: 180,
          type: 3,
          beginShapeIndex: 0,
          endShapeIndex: 1,
          streetNames: ["Jalan Damansara"],
        },
        {
          instruction: "Turn right.",
          distanceKm: 3.2,
          durationSeconds: 210,
          type: 10,
          beginShapeIndex: 1,
          endShapeIndex: 2,
          streetNames: ["Jalan Tun Razak"],
        },
      ],
      liveTraffic: false,
    };
    api.getVehicleProfiles.and.returnValue(of([profile]));
    api.calculateNavigationRoute.and.returnValue(of(route));

    await fixture.componentInstance.startLocation();
    fixture.componentInstance.openRoutePlanner();
    mapClickCallback({
      mapId: "gng-driving-map",
      coordinates: { latitude: 3.157, longitude: 101.72 },
      point: { x: 10, y: 20 },
    });
    await fixture.componentInstance.calculateRoute();
    fixture.componentInstance.startNavigation();
    await fixture.whenStable();

    expect(fixture.componentInstance.navigationActive()).toBeTrue();
    expect(fixture.componentInstance.nextManeuver()?.instruction).toBe(
      "Continue on Jalan Damansara.",
    );
    expect(fixture.componentInstance.currentRoadName()).toBe("Jalan Damansara");
    expect(fixture.componentInstance.estimatedArrival()).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(".navigation-guidance")?.textContent,
    ).toContain("Continue on Jalan Damansara.");
    fixture.componentInstance.toggleVoiceGuidance();
    expect(voiceGuidance.speak).toHaveBeenCalledWith(
      "Continue on Jalan Damansara.",
      "en",
    );
    let finishSlowMarkerUpdate!: () => void;
    mapEngine.updateMarker.and.returnValue(
      new Promise<void>((resolve) => {
        finishSlowMarkerUpdate = resolve;
      }),
    );

    locationCallback(
      {
        ...position,
        coords: {
          ...position.coords,
          latitude: 3.153,
          longitude: 101.711,
          accuracy: 10,
          speed: 10,
        },
      },
      undefined,
    );
    const progressAfterFirstFix =
      fixture.componentInstance.routeProgressMeters();
    expect(progressAfterFirstFix).toBeGreaterThan(0);

    locationCallback(
      {
        ...position,
        coords: {
          ...position.coords,
          latitude: 3.154,
          longitude: 101.714,
          accuracy: 10,
          speed: 10,
        },
      },
      undefined,
    );
    expect(fixture.componentInstance.routeProgressMeters()).toBeGreaterThan(
      progressAfterFirstFix,
    );

    finishSlowMarkerUpdate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(fixture.componentInstance.nextManeuver()?.instruction).toBe(
      "Turn right.",
    );
    expect(fixture.componentInstance.currentRoadName()).toBe("Jalan Tun Razak");
    expect(
      fixture.nativeElement.querySelector(".navigation-guidance")?.textContent,
    ).toContain("Turn right.");
    expect(voiceGuidance.speak).toHaveBeenCalledWith("Turn right.", "en");
    expect(voiceGuidance.speak).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.remainingDistanceKm()).toBeLessThan(5.2);
    expect(fixture.componentInstance.currentSpeedKph()).toBe(36);

    locationCallback(
      {
        ...position,
        coords: {
          ...position.coords,
          latitude: 3.157,
          longitude: 101.72,
          accuracy: 10,
        },
      },
      undefined,
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.navigationArrived()).toBeTrue();
    expect(voiceGuidance.speak).toHaveBeenCalledWith("mapVoiceArrive", "en");

    await fixture.componentInstance.stopNavigation();
    expect(fixture.componentInstance.navigationActive()).toBeFalse();
    expect(fixture.componentInstance.navigationRoute()).toBeNull();
    expect(api.calculateNavigationRoute).toHaveBeenCalledTimes(1);
    expect(voiceGuidance.stop).toHaveBeenCalled();
  });

  it("clears the GPS watch and releases the native map when leaving the route", async () => {
    await fixture.componentInstance.startLocation();
    fixture.destroy();
    await Promise.resolve();

    expect(mapEngine.clearWatch).toHaveBeenCalledWith("watch-1");
    expect(mapEngine.destroyMap).toHaveBeenCalledWith("gng-driving-map");
  });
});
