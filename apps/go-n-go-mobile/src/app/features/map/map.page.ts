import {
  AfterViewInit,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from "@angular/core";
import type { Position } from "@capacitor/geolocation";
import { MarkerIconAnchor } from "@capawesome/capacitor-maplibre";
import type { PluginListenerHandle } from "@capacitor/core";
import type { AppState } from "@capacitor/app";
import type { MapClickEvent } from "@capawesome/capacitor-maplibre";
import {
  IonButton,
  IonContent,
  IonSelect,
  IonSelectOption,
} from "@ionic/angular/standalone";
import { RouterLink } from "@angular/router";
import { firstValueFrom, Subject, takeUntil, timeout } from "rxjs";
import { environment } from "../../../environments/environment";
import { ApiService } from "../../core/api/api.service";
import {
  COMMUNITY_INCIDENT_TYPES,
  CommunityIncident,
  CommunityIncidentType,
  CommunityIncidentVote,
} from "../../core/api/community-incident.model";
import {
  closestRouteProgress,
  distanceBetweenCoordinates,
  MAX_ROUTE_ALERT_COORDINATES,
  ROUTE_ALERT_MAX_DISTANCE_METERS,
  RouteCommunityAlert,
  selectRouteCommunityAlerts,
} from "./route-community-alerts";
import type {
  NavigationManeuver,
  NavigationCoordinate,
  NavigationRoute,
} from "../../core/api/navigation.model";
import type { VehicleProfile } from "../../core/api/vehicle-profile.model";
import {
  TranslationKey,
  TranslationService,
} from "../../core/i18n/translation.service";
import { MapEngineService } from "./map-engine.service";
import { createMapStyle } from "./map-style";
import {
  createEmptyTrafficSource,
  createTrafficFlowLayer,
} from "./traffic-overlay";
import { VoiceGuidanceService } from "./voice-guidance.service";

type MapState = "loading" | "ready" | "unconfigured" | "error";
type LocationState = "idle" | "requesting" | "active" | "denied" | "error";

const MAP_ID = "gng-driving-map";
const MAP_ELEMENT_ID = "gng-map-canvas";
const LOCATION_MARKER_ID = "gng-current-location";
const DESTINATION_MARKER_ID = "gng-route-destination";
const ROUTE_LINE_ID = "gng-navigation-route";
const COMMUNITY_MARKER_PREFIX = "gng-community-";
const OFF_ROUTE_THRESHOLD_METERS = 100;
const OFF_ROUTE_FIXES_BEFORE_REROUTE = 2;
const AUTO_REROUTE_COOLDOWN_MS = 30_000;
const MAX_AUTOMATIC_REROUTE_POSITION_AGE_MS = 15_000;
const MAX_POSITION_CLOCK_SKEW_MS = 5_000;
const COMMUNITY_REPORT_LOCATION_CHANGE_METERS = 250;
const ROUTE_ALERT_REFRESH_INTERVAL_MS = 45_000;
const ROUTE_ALERT_REQUEST_TIMEOUT_MS = 15_000;
const ROUTE_ALERT_FRESHNESS_MS = ROUTE_ALERT_REFRESH_INTERVAL_MS;
const ROUTE_ALERT_SEARCH_RADIUS_METERS = ROUTE_ALERT_MAX_DISTANCE_METERS;
const LOCATION_MARKER_ICON =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">' +
      '<path d="M18 1 32 35H4Z" fill="#126c56" stroke="#fff" stroke-width="3"/>' +
      '<circle cx="18" cy="27" r="4" fill="#fff"/></svg>',
  );
const DESTINATION_MARKER_ICON =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">' +
      '<path d="M18 1a14 14 0 0 0-14 14c0 10 14 28 14 28s14-18 14-28A14 14 0 0 0 18 1Z" fill="#d94b45" stroke="#fff" stroke-width="3"/>' +
      '<circle cx="18" cy="15" r="5" fill="#fff"/></svg>',
  );
const COMMUNITY_MARKER_COLORS: Record<CommunityIncidentType, string> = {
  congestion: "#d18b16",
  accident: "#c33e37",
  road_hazard: "#ab5a12",
  road_closure: "#6d4bb3",
  breakdown: "#3d687d",
};

@Component({
  selector: "gng-map",
  standalone: true,
  imports: [IonButton, IonContent, IonSelect, IonSelectOption, RouterLink],
  templateUrl: "./map.page.html",
  styleUrl: "./map.page.scss",
})
export class MapPage implements AfterViewInit, OnDestroy {
  readonly mapState = signal<MapState>("loading");
  readonly locationState = signal<LocationState>("idle");
  readonly nightMode = signal(false);
  readonly followingLocation = signal(true);
  readonly locationError = signal<TranslationKey | null>(null);
  readonly routePlanning = signal(false);
  readonly routeProfilesLoading = signal(false);
  readonly routeProfilesError = signal<TranslationKey | null>(null);
  readonly routeLoading = signal(false);
  readonly navigationActive = signal(false);
  readonly navigationArrived = signal(false);
  readonly navigationOffRoute = signal(false);
  readonly navigationPaused = signal(false);
  readonly voiceGuidanceEnabled = signal(false);
  readonly voiceError = signal<TranslationKey | null>(null);
  readonly routeProgressMeters = signal(0);
  readonly currentSpeedKph = signal<number | null>(null);
  readonly routeProfiles = signal<VehicleProfile[]>([]);
  readonly selectedVehicleProfileId = signal("");
  readonly routeDestination = signal<NavigationCoordinate | null>(null);
  readonly navigationRoute = signal<NavigationRoute | null>(null);
  readonly routeCommunityAlerts = signal<RouteCommunityAlert[]>([]);
  readonly communityReports = signal<CommunityIncident[]>([]);
  readonly communityReportsOpen = signal(false);
  readonly communityReportsLoading = signal(false);
  readonly communityReportSending = signal(false);
  readonly communityVoteLoadingId = signal<string | null>(null);
  readonly communityReportType = signal<CommunityIncidentType>("road_hazard");
  readonly communityReportMessage = signal<TranslationKey | null>(null);
  readonly routeError = signal<TranslationKey | null>(null);
  readonly routeSummary = computed(() => {
    const route = this.navigationRoute();
    return route
      ? `${route.distanceKm.toFixed(1)} km · ${Math.round(route.durationSeconds / 60)} min`
      : null;
  });
  readonly nextManeuver = computed(() => {
    const route = this.navigationRoute();
    if (!route || this.navigationArrived()) {
      return null;
    }

    const segmentIndex = this.routeProgressSegmentIndex();
    const maneuver = route.maneuvers.find(
      (item) => item.endShapeIndex > segmentIndex,
    );
    if (!maneuver) {
      return null;
    }
    return {
      ...maneuver,
      distanceMeters: Math.max(
        0,
        (this.routeCumulativeMeters[maneuver.endShapeIndex] ?? 0) -
          this.routeProgressMeters(),
      ),
    };
  });
  readonly currentRoadName = computed(() => {
    const route = this.navigationRoute();
    if (!route) {
      return null;
    }

    const segmentIndex = this.routeProgressSegmentIndex();
    for (let index = route.maneuvers.length - 1; index >= 0; index -= 1) {
      const maneuver = route.maneuvers[index];
      if (
        maneuver.beginShapeIndex <= segmentIndex &&
        maneuver.streetNames.length > 0
      ) {
        return maneuver.streetNames[0];
      }
    }
    return null;
  });
  readonly remainingDistanceKm = computed(() => {
    const route = this.navigationRoute();
    if (!route) {
      return 0;
    }
    const totalMeters =
      this.routeCumulativeMeters[this.routeCumulativeMeters.length - 1] ?? 0;
    return Math.max(0, totalMeters - this.routeProgressMeters()) / 1000;
  });
  readonly remainingDurationMinutes = computed(() => {
    const route = this.navigationRoute();
    if (!route) {
      return 0;
    }
    const totalMeters =
      this.routeCumulativeMeters[this.routeCumulativeMeters.length - 1] ?? 0;
    const remainingFraction =
      totalMeters > 0
        ? Math.max(0, totalMeters - this.routeProgressMeters()) / totalMeters
        : 0;
    return Math.ceil((route.durationSeconds * remainingFraction) / 60);
  });
  readonly estimatedArrival = computed(() => {
    if (!this.navigationActive() || this.navigationArrived()) {
      return null;
    }
    const arrival = new Date(
      Date.now() + this.remainingDurationMinutes() * 60_000,
    );
    return arrival.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  });
  readonly mapStatus = computed(() => {
    if (this.mapState() === "loading") {
      return this.i18n.text("mapLoading");
    }
    if (this.mapState() === "unconfigured") {
      return this.i18n.text("mapUnavailable");
    }
    if (this.mapState() === "error") {
      return this.i18n.text("mapLoadFailed");
    }
    return this.locationStatus();
  });

  private readonly tileServerUrl = environment.mapTileServerUrl;
  private readonly mapEngine = inject(MapEngineService);
  private readonly api = inject(ApiService);
  private readonly voiceGuidance = inject(VoiceGuidanceService);
  private mapCreated = false;
  private readonly destroyed$ = new Subject<void>();
  private mapGeneration = 0;
  private mapCreationPromise: Promise<void> | null = null;
  private mapDestroyPromise: Promise<void> | null = null;
  private styleGeneration = 0;
  private styleChangeInProgress = false;
  private styleChangeQueue: Promise<void> = Promise.resolve();
  private routeRenderDeferredByStyle = false;
  private destinationRenderDeferredByStyle = false;
  private communityRenderDeferredByStyle = false;
  private trafficOverlayInitialized = false;
  private locationMarkerAdded = false;
  private destinationMarkerAdded = false;
  private vehicleProfilesLoaded = false;
  private locationWatchId: string | null = null;
  private mapClickHandle: PluginListenerHandle | null = null;
  private appStateHandle: PluginListenerHandle | null = null;
  private destroyed = false;
  private routeRequestGeneration = 0;
  private routeRenderGeneration = 0;
  private routeRenderQueue: Promise<void> = Promise.resolve();
  private destinationRenderGeneration = 0;
  private destinationRenderQueue: Promise<void> = Promise.resolve();
  private communityMarkerRenderGeneration = 0;
  private communityMarkerRenderQueue: Promise<void> = Promise.resolve();
  private communityReportsRequestGeneration = 0;
  private lastPosition: Position | null = null;
  private pendingLocationRender: {
    position: Position;
    bearing: number;
  } | null = null;
  private locationRenderRunning = false;
  private locationRenderTask: Promise<void> | null = null;
  private routeCumulativeMeters: number[] = [];
  private readonly routeProgressSegmentIndex = signal(0);
  private readonly communityMarkerIds = new Set<string>();
  private lastAnnouncedManeuverKey: string | null = null;
  private offRouteFixCount = 0;
  private lastAutomaticRerouteAt = 0;
  private lastRouteAlertRequestAt = 0;
  private lastRouteAlertSuccessAt: number | null = null;
  private routeAlertExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  private routeAlertRequestInFlight = false;
  private routeAlertRefreshPending = false;
  private resumeLocationOnForeground = false;
  private appIsActive = true;

  constructor(readonly i18n: TranslationService) {}

  ngAfterViewInit(): void {
    void this.initializeMap();
    void this.registerAppStateListener();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroyed$.next();
    this.destroyed$.complete();
    this.routeRequestGeneration += 1;
    this.communityReportsRequestGeneration += 1;
    this.clearRouteCommunityAlerts();
    document.body.classList.remove("map-route-active");
    this.lastPosition = null;
    this.pendingLocationRender = null;
    void this.stopVoiceGuidance();

    if (this.locationWatchId) {
      void this.mapEngine.clearWatch(this.locationWatchId).catch(() => {
        console.error("Could not stop the map location watch.");
      });
      this.locationWatchId = null;
    }

    if (this.appStateHandle) {
      void this.appStateHandle.remove().catch(() => {
        console.error("Could not remove the app state listener.");
      });
      this.appStateHandle = null;
    }

    void this.destroyMap();
  }

  async initializeMap(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    const tileServerUrl = this.tileServerUrl.trim().replace(/\/+$/, "");
    if (!tileServerUrl) {
      this.mapState.set("unconfigured");
      return;
    }

    if (
      this.mapCreated ||
      this.mapCreationPromise ||
      this.mapDestroyPromise
    ) {
      await this.destroyMap();
    }
    if (this.destroyed) {
      return;
    }

    this.mapState.set("loading");
    document.body.classList.add("map-route-active");
    this.styleChangeInProgress = false;
    this.mapCreated = true;
    const generation = ++this.mapGeneration;

    try {
      const creation = this.mapEngine.createMap({
        elementId: MAP_ELEMENT_ID,
        mapId: MAP_ID,
        center: { latitude: 3.139, longitude: 101.6869 },
        zoom: 12,
        minZoom: 3,
        maxZoom: 14,
        styleJson: JSON.stringify(
          createMapStyle(tileServerUrl, this.nightMode()),
        ),
      });
      this.mapCreationPromise = creation;
      try {
        await creation;
      } finally {
        if (this.mapCreationPromise === creation) {
          this.mapCreationPromise = null;
        }
      }
      if (!this.isMapOperationCurrent(generation)) {
        await this.destroyMap();
        return;
      }

      await this.initializeTrafficOverlay(generation);
      if (!this.isMapOperationCurrent(generation)) {
        await this.destroyMap();
        return;
      }

      const clickHandle = await this.mapEngine.addMapClickListener((event) =>
        this.handleMapClick(event),
      );
      if (!this.isMapOperationCurrent(generation)) {
        await clickHandle.remove();
        await this.destroyMap();
        return;
      }
      this.mapClickHandle = clickHandle;
      this.mapState.set("ready");
    } catch {
      const shouldReportFailure =
        !this.destroyed && generation === this.mapGeneration;
      await this.destroyMap();
      if (shouldReportFailure && !this.destroyed) {
        this.mapState.set("error");
      }
    }
  }

  async startLocation(): Promise<void> {
    if (this.mapState() !== "ready" || this.locationState() === "requesting") {
      return;
    }
    if (this.locationWatchId) {
      if (
        this.locationState() !== "error" &&
        this.locationState() !== "denied"
      ) {
        if (this.lastPosition) {
          await this.updateLocation(this.lastPosition);
        }
        return;
      }
      await this.clearLocationWatch();
    }

    this.locationState.set("requesting");
    this.locationError.set(null);

    try {
      if (this.mapEngine.isNativePlatform()) {
        let permission = await this.mapEngine.checkLocationPermissions();
        if (permission.location !== "granted") {
          permission = await this.mapEngine.requestLocationPermissions();
        }
        if (permission.location !== "granted") {
          this.locationState.set("denied");
          this.locationError.set("mapLocationDenied");
          this.pauseNavigationForLocationFailure();
          return;
        }
      }

      const position = await this.mapEngine.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });
      if (this.destroyed) {
        return;
      }
      await this.updateLocation(position);
      if (!this.appIsActive) {
        this.resumeLocationOnForeground = true;
        return;
      }

      const watchId = await this.mapEngine.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 15000,
          minimumUpdateInterval: 3000,
          interval: 3000,
        },
        (nextPosition, error) => {
          if (error) {
            this.handleLocationFailure();
          } else if (nextPosition) {
            void this.updateLocation(nextPosition);
          }
        },
      );

      if (this.destroyed || !this.appIsActive) {
        try {
          await this.mapEngine.clearWatch(watchId);
        } catch {
          console.error("Could not stop the map location watch.");
        }
        if (!this.destroyed && !this.appIsActive) {
          this.resumeLocationOnForeground = true;
        }
      } else {
        this.locationWatchId = watchId;
      }
    } catch {
      this.handleLocationFailure();
    }
  }

  toggleNightMode(): void {
    if (!this.mapCreated || this.mapState() !== "ready") {
      return;
    }

    const night = !this.nightMode();
    const mapGeneration = this.mapGeneration;
    const styleGeneration = ++this.styleGeneration;
    this.styleChangeInProgress = true;
    this.nightMode.set(night);
    this.routeRenderGeneration += 1;
    this.destinationRenderGeneration += 1;
    this.communityMarkerRenderGeneration += 1;

    const styleChange = this.styleChangeQueue
      .catch(() => undefined)
      .then(async () => {
        await Promise.all([
          this.locationRenderTask,
          this.routeRenderQueue,
          this.destinationRenderQueue,
          this.communityMarkerRenderQueue,
        ]);
        if (!this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
          return;
        }

        await this.mapEngine.setStyle(
          MAP_ID,
          JSON.stringify(createMapStyle(this.tileServerUrl, night)),
        );
        if (!this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
          return;
        }
        await this.restoreMapOverlays(mapGeneration, styleGeneration);
      })
      .catch(() => {
        if (this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
          this.handleStyleChangeFailure(night);
        }
      })
      .finally(() =>
        this.completeStyleChange(mapGeneration, styleGeneration),
      );
    this.styleChangeQueue = styleChange;
  }

  async changeZoom(amount: number): Promise<void> {
    if (this.mapState() !== "ready") {
      return;
    }

    const mapGeneration = this.mapGeneration;
    try {
      const camera = await this.mapEngine.getCamera(MAP_ID);
      if (!this.isMapOperationCurrent(mapGeneration)) {
        return;
      }
      await this.mapEngine.setCamera({
        mapId: MAP_ID,
        zoom: Math.min(14, Math.max(3, camera.camera.zoom + amount)),
        animate: true,
      });
    } catch {
      if (this.isMapOperationCurrent(mapGeneration)) {
        this.mapState.set("error");
      }
    }
  }

  selectCommunityReportType(value: unknown): void {
    if (isCommunityIncidentType(value)) {
      this.communityReportType.set(value);
    }
  }

  async toggleCommunityReports(): Promise<void> {
    const open = !this.communityReportsOpen();
    this.communityReportsOpen.set(open);
    this.communityReportMessage.set(null);
    if (open) {
      await this.loadCommunityReports();
    }
  }

  async loadCommunityReports(): Promise<void> {
    if (this.communityReportsLoading()) {
      return;
    }
    if (!this.lastPosition || this.locationState() !== "active") {
      this.communityReportMessage.set("mapCommunityNeedsLocation");
      return;
    }

    const requestPosition = this.lastPosition;
    const requestGeneration = ++this.communityReportsRequestGeneration;
    this.communityReportsLoading.set(true);
    this.communityReportMessage.set(null);
    try {
      const { latitude, longitude } = requestPosition.coords;
      const reports = await firstValueFrom(
        this.api
          .getNearbyCommunityIncidents(latitude, longitude)
          .pipe(takeUntil(this.destroyed$)),
      );
      if (
        !this.destroyed &&
        requestGeneration === this.communityReportsRequestGeneration &&
        this.isCommunityReportLocationCurrent(requestPosition)
      ) {
        this.communityReports.set(reports);
        await this.renderCommunityMarkers();
        if (
          !this.destroyed &&
          requestGeneration === this.communityReportsRequestGeneration &&
          reports.length === 0
        ) {
          this.communityReportMessage.set("mapCommunityNone");
        }
      }
    } catch {
      if (!this.destroyed) {
        this.communityReportMessage.set("mapCommunityLoadFailed");
      }
    } finally {
      if (
        !this.destroyed &&
        requestGeneration === this.communityReportsRequestGeneration
      ) {
        this.communityReportsLoading.set(false);
      }
    }
  }

  async submitCommunityReport(): Promise<void> {
    const position = this.lastPosition;
    if (
      this.communityReportSending() ||
      !position ||
      this.locationState() !== "active"
    ) {
      this.communityReportMessage.set("mapCommunityNeedsLocation");
      return;
    }

    this.communityReportSending.set(true);
    this.communityReportMessage.set(null);
    try {
      const result = await firstValueFrom(
        this.api.createCommunityIncident({
          type: this.communityReportType(),
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }).pipe(takeUntil(this.destroyed$)),
      );
      if (!this.destroyed) {
        const message = result.duplicate
          ? "mapCommunityDuplicate"
          : "mapCommunityReportSent";
        this.communityReportsOpen.set(true);
        await this.loadCommunityReports();
        if (
          !this.destroyed &&
          this.communityReportMessage() !== "mapCommunityLoadFailed"
        ) {
          this.communityReportMessage.set(message);
        }
      }
    } catch {
      if (!this.destroyed) {
        this.communityReportMessage.set("mapCommunityReportFailed");
      }
    } finally {
      if (!this.destroyed) {
        this.communityReportSending.set(false);
      }
    }
  }

  async voteOnCommunityReport(
    report: CommunityIncident,
    vote: CommunityIncidentVote,
  ): Promise<void> {
    if (this.communityVoteLoadingId()) {
      return;
    }
    this.communityVoteLoadingId.set(report.id);
    this.communityReportMessage.set(null);
    try {
      const updated = await firstValueFrom(
        this.api
          .voteOnCommunityIncident(report.id, vote)
          .pipe(takeUntil(this.destroyed$)),
      );
      if (!this.destroyed) {
        this.communityReports.update((reports) =>
          reports.map((current) =>
            current.id === updated.id ? updated : current,
          ),
        );
      }
    } catch {
      if (!this.destroyed) {
        this.communityReportMessage.set("mapCommunityVoteFailed");
      }
    } finally {
      if (!this.destroyed) {
        this.communityVoteLoadingId.set(null);
      }
    }
  }

  async deleteCommunityReport(report: CommunityIncident): Promise<void> {
    if (!report.isMine || this.communityVoteLoadingId()) {
      return;
    }
    this.communityVoteLoadingId.set(report.id);
    this.communityReportMessage.set(null);
    try {
      await firstValueFrom(
        this.api
          .deleteCommunityIncident(report.id)
          .pipe(takeUntil(this.destroyed$)),
      );
      if (!this.destroyed) {
        this.communityReports.update((reports) =>
          reports.filter((current) => current.id !== report.id),
        );
        await this.renderCommunityMarkers();
        if (!this.destroyed) {
          this.communityReportMessage.set("mapCommunityDeleted");
        }
      }
    } catch {
      if (!this.destroyed) {
        this.communityReportMessage.set("mapCommunityDeleteFailed");
      }
    } finally {
      if (!this.destroyed) {
        this.communityVoteLoadingId.set(null);
      }
    }
  }

  communityIncidentTypeKey(type: CommunityIncidentType): TranslationKey {
    const keys: Record<CommunityIncidentType, TranslationKey> = {
      congestion: "mapCommunityCongestion",
      accident: "mapCommunityAccident",
      road_hazard: "mapCommunityHazard",
      road_closure: "mapCommunityClosure",
      breakdown: "mapCommunityBreakdown",
    };
    return keys[type];
  }

  communityConfidenceKey(report: CommunityIncident): TranslationKey {
    if (report.confidence === "community_confirmed") {
      return "mapCommunityConfirmed";
    }
    if (report.confidence === "community_disputed") {
      return "mapCommunityDisputed";
    }
    return "mapCommunityUnconfirmed";
  }

  async toggleFollowingLocation(): Promise<void> {
    const follow = !this.followingLocation();
    this.followingLocation.set(follow);

    if (follow && this.lastPosition) {
      await this.updateLocation(this.lastPosition);
    } else if (follow) {
      await this.startLocation();
    }
  }

  openRoutePlanner(): void {
    this.routePlanning.set(true);
    this.followingLocation.set(false);
    this.routeError.set(null);
    this.routeProfilesError.set(null);
    if (!this.vehicleProfilesLoaded && !this.routeProfilesLoading()) {
      this.loadVehicleProfiles();
    }
  }

  async useLocationForRoute(): Promise<void> {
    this.followingLocation.set(false);
    await this.startLocation();
    if (this.destroyed || !this.lastPosition) {
      return;
    }

    const mapGeneration = this.mapGeneration;
    try {
      await this.mapEngine.setCamera({
        mapId: MAP_ID,
        center: {
          latitude: this.lastPosition.coords.latitude,
          longitude: this.lastPosition.coords.longitude,
        },
        zoom: 14,
        bearing: this.lastPosition.coords.heading ?? 0,
        pitch: 0,
        animate: true,
        animationDuration: 900,
      });
    } catch {
      if (this.isMapOperationCurrent(mapGeneration)) {
        this.locationState.set("error");
        this.locationError.set("mapLocationFailed");
      }
    }
  }

  closeRoutePlanner(): void {
    this.invalidateRouteRequest();
    this.routePlanning.set(false);
    this.routeError.set(null);
  }

  selectVehicleProfile(value: unknown): void {
    const profileId = typeof value === "string" ? value : "";
    if (profileId === this.selectedVehicleProfileId()) {
      return;
    }
    this.selectedVehicleProfileId.set(profileId);
    this.invalidateRouteForSelectionChange();
  }

  async calculateRoute(): Promise<void> {
    const destination = this.routeDestination();
    const position = this.lastPosition;
    const vehicleProfileId = this.selectedVehicleProfileId();
    if (this.routeLoading()) {
      return;
    }
    if (!position || this.locationState() !== "active") {
      this.routeError.set("mapRouteNeedsLocation");
      return;
    }
    if (!destination || !vehicleProfileId) {
      this.routeError.set("mapRouteNeedsDestination");
      return;
    }

    const requestGeneration = ++this.routeRequestGeneration;
    const requestDestination = { ...destination };
    this.routeLoading.set(true);
    this.routeError.set(null);
    try {
      const route = await firstValueFrom(
        this.api.calculateNavigationRoute({
          origin: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          destination,
          vehicleProfileId,
        }).pipe(takeUntil(this.destroyed$)),
      );
      if (
        this.destroyed ||
        !this.isCurrentRouteRequest(
          requestGeneration,
          requestDestination,
          vehicleProfileId,
        )
      ) {
        return;
      }
      if (!isValidNavigationRoute(route)) {
        this.routeError.set("mapRouteFailed");
        return;
      }
      await this.setActiveRoute(route);
    } catch {
      if (
        !this.destroyed &&
        this.isCurrentRouteRequest(
          requestGeneration,
          requestDestination,
          vehicleProfileId,
        )
      ) {
        this.routeError.set("mapRouteFailed");
      }
    } finally {
      if (
        !this.destroyed &&
        requestGeneration === this.routeRequestGeneration
      ) {
        this.routeLoading.set(false);
      }
    }
  }

  async clearRoute(): Promise<void> {
    this.invalidateRouteRequest();
    this.voiceGuidanceEnabled.set(false);
    await this.stopVoiceGuidance();
    this.navigationActive.set(false);
    this.navigationArrived.set(false);
    this.navigationOffRoute.set(false);
    this.navigationPaused.set(false);
    this.resumeLocationOnForeground = false;
    this.offRouteFixCount = 0;
    this.routeProgressMeters.set(0);
    this.routeProgressSegmentIndex.set(0);
    this.currentSpeedKph.set(null);
    this.routeCumulativeMeters = [];
    this.navigationRoute.set(null);
    this.clearRouteCommunityAlerts();
    this.routeDestination.set(null);
    this.routeError.set(null);
    const routeRenderGeneration = ++this.routeRenderGeneration;
    await this.queueRouteRender(null, routeRenderGeneration, this.mapGeneration);
    await this.queueDestinationMarker(null);
    void this.renderCommunityMarkers();
  }

  startNavigation(): void {
    if (!this.navigationRoute()) {
      return;
    }
    if (!this.lastPosition || this.locationState() !== "active") {
      this.routeError.set("mapRouteNeedsLocation");
      return;
    }
    this.navigationArrived.set(false);
    this.navigationOffRoute.set(false);
    this.navigationPaused.set(false);
    this.voiceError.set(null);
    this.lastAnnouncedManeuverKey = null;
    this.navigationActive.set(true);
    this.followingLocation.set(true);
    void this.updateLocation(this.lastPosition);
  }

  async reroute(automatic = false): Promise<void> {
    const destination = this.routeDestination();
    const position = this.lastPosition;
    const vehicleProfileId = this.selectedVehicleProfileId();
    if (
      !destination ||
      !position ||
      !vehicleProfileId ||
      this.locationState() !== "active"
    ) {
      this.routeError.set("mapRouteNeedsLocation");
      return;
    }
    if (automatic && !isFreshPosition(position, Date.now())) {
      this.handleLocationFailure();
      return;
    }
    if (this.routeLoading()) {
      return;
    }

    const requestGeneration = ++this.routeRequestGeneration;
    const requestDestination = { ...destination };
    this.routeLoading.set(true);
    this.routeError.set(null);
    try {
      const route = await firstValueFrom(
        this.api.calculateNavigationRoute({
          origin: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          destination,
          vehicleProfileId,
        }).pipe(takeUntil(this.destroyed$)),
      );
      if (
        this.destroyed ||
        !this.isCurrentRouteRequest(
          requestGeneration,
          requestDestination,
          vehicleProfileId,
        )
      ) {
        return;
      }
      if (!isValidNavigationRoute(route)) {
        this.routeError.set("mapRouteFailed");
        return;
      }
      await this.setActiveRoute(route);
      this.navigationActive.set(true);
      this.navigationArrived.set(false);
      this.navigationOffRoute.set(false);
      this.followingLocation.set(true);
      this.lastAnnouncedManeuverKey = null;
      void this.refreshRouteCommunityAlerts();
      this.updateVoiceGuidance();
    } catch {
      if (
        !this.destroyed &&
        this.isCurrentRouteRequest(
          requestGeneration,
          requestDestination,
          vehicleProfileId,
        )
      ) {
        this.routeError.set("mapRouteFailed");
      }
    } finally {
      if (
        !this.destroyed &&
        requestGeneration === this.routeRequestGeneration
      ) {
        this.routeLoading.set(false);
      }
    }
  }

  async stopNavigation(): Promise<void> {
    this.voiceGuidanceEnabled.set(false);
    this.navigationActive.set(false);
    this.navigationArrived.set(false);
    this.navigationOffRoute.set(false);
    this.followingLocation.set(false);
    this.resumeLocationOnForeground = false;
    await this.clearRoute();
  }

  private async updateLocation(position: Position): Promise<void> {
    if (this.destroyed) {
      return;
    }
    if (!this.appIsActive) {
      this.lastPosition = position;
      return;
    }
    const previousPosition = this.lastPosition;
    this.lastPosition = position;
    const bearing = this.positionBearing(position, previousPosition);
    this.currentSpeedKph.set(
      position.coords.speed !== null && position.coords.speed >= 0
        ? position.coords.speed * 3.6
        : null,
    );
    const previousRouteProgress = this.routeProgressMeters();
    this.updateNavigationProgress(position);
    this.updateRouteAlertProgress(
      previousRouteProgress,
      this.routeProgressMeters(),
    );
    this.removeExpiredRouteAlerts();
    void this.refreshRouteCommunityAlerts();
    this.updateVoiceGuidance();
    this.pendingLocationRender = { position, bearing };
    void this.flushLocationRender();
  }

  private flushLocationRender(): Promise<void> {
    if (
      this.destroyed ||
      !this.appIsActive ||
      !this.mapCreated ||
      this.styleChangeInProgress
    ) {
      return Promise.resolve();
    }
    if (this.locationRenderRunning) {
      return this.locationRenderTask ?? Promise.resolve();
    }

    this.locationRenderRunning = true;
    const mapGeneration = this.mapGeneration;
    const task = this.flushPendingLocationRenders(mapGeneration);
    this.locationRenderTask = task;
    return task;
  }

  private async flushPendingLocationRenders(
    mapGeneration: number,
  ): Promise<void> {
    try {
      while (
        this.isMapOperationCurrent(mapGeneration) &&
        this.appIsActive &&
        !this.styleChangeInProgress &&
        this.pendingLocationRender
      ) {
        const { position, bearing } = this.pendingLocationRender;
        this.pendingLocationRender = null;
        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (!this.locationMarkerAdded) {
          await this.mapEngine.addMarker({
            mapId: MAP_ID,
            marker: {
              id: LOCATION_MARKER_ID,
              coordinates,
              iconUrl: LOCATION_MARKER_ICON,
              iconAnchor: MarkerIconAnchor.Center,
              iconSize: { width: 28, height: 36 },
              rotation: bearing,
            },
          });
          if (!this.isMapOperationCurrent(mapGeneration)) {
            return;
          }
          this.locationMarkerAdded = true;
        } else {
          await this.mapEngine.updateMarker({
            mapId: MAP_ID,
            markerId: LOCATION_MARKER_ID,
            coordinates,
            rotation: bearing,
            animate: true,
            animationDuration: 1200,
          });
          if (!this.isMapOperationCurrent(mapGeneration)) {
            return;
          }
        }

        if (
          this.isMapOperationCurrent(mapGeneration) &&
          this.appIsActive &&
          !this.styleChangeInProgress &&
          !this.pendingLocationRender &&
          this.followingLocation()
        ) {
          await this.mapEngine.setCamera({
            mapId: MAP_ID,
            center: coordinates,
            zoom: 14,
            bearing,
            pitch: 40,
            animate: true,
            animationDuration: 1200,
          });
          if (!this.isMapOperationCurrent(mapGeneration)) {
            return;
          }
        }

        if (
          this.isMapOperationCurrent(mapGeneration) &&
          this.appIsActive &&
          !this.styleChangeInProgress &&
          !this.pendingLocationRender &&
          isFreshPosition(position, Date.now())
        ) {
          this.locationState.set("active");
          this.locationError.set(null);
          const wasNavigationPaused = this.navigationPaused();
          this.navigationPaused.set(false);
          this.updateVoiceGuidance();
          if (wasNavigationPaused) {
            void this.renderCommunityMarkers();
            void this.refreshRouteCommunityAlerts();
          }
        }
      }
    } catch {
      this.pendingLocationRender = null;
      if (this.isMapOperationCurrent(mapGeneration)) {
        this.handleLocationFailure();
      }
    } finally {
      this.locationRenderRunning = false;
      this.locationRenderTask = null;
      if (
        this.pendingLocationRender &&
        this.appIsActive &&
        this.isMapOperationCurrent(this.mapGeneration)
      ) {
        void this.flushLocationRender();
      }
    }
  }

  private async setActiveRoute(route: NavigationRoute): Promise<void> {
    this.clearRouteCommunityAlerts();
    this.navigationRoute.set(route);
    this.routeProgressMeters.set(0);
    this.routeProgressSegmentIndex.set(0);
    this.navigationArrived.set(false);
    this.navigationOffRoute.set(false);
    this.offRouteFixCount = 0;
    this.routeCumulativeMeters = [0];
    for (let index = 1; index < route.geometry.coordinates.length; index += 1) {
      this.routeCumulativeMeters.push(
        this.routeCumulativeMeters[index - 1] +
          distanceBetweenCoordinates(
            route.geometry.coordinates[index - 1],
            route.geometry.coordinates[index],
          ),
      );
    }
    this.followingLocation.set(false);
    void this.renderCommunityMarkers();
    if (this.navigationActive() && this.lastPosition) {
      this.updateNavigationProgress(this.lastPosition);
      void this.refreshRouteCommunityAlerts();
    }
    const renderGeneration = ++this.routeRenderGeneration;
    await this.queueRouteRender(route, renderGeneration, this.mapGeneration);
  }

  private invalidateRouteRequest(): void {
    this.routeRequestGeneration += 1;
    this.routeLoading.set(false);
  }

  private invalidateRouteForSelectionChange(): void {
    this.invalidateRouteRequest();
    this.navigationRoute.set(null);
    this.navigationActive.set(false);
    this.navigationArrived.set(false);
    this.navigationOffRoute.set(false);
    this.navigationPaused.set(false);
    this.routeProgressMeters.set(0);
    this.routeProgressSegmentIndex.set(0);
    this.currentSpeedKph.set(null);
    this.routeCumulativeMeters = [];
    this.offRouteFixCount = 0;
    this.clearRouteCommunityAlerts();
    this.routeError.set(null);
    if (this.voiceGuidanceEnabled()) {
      this.voiceGuidanceEnabled.set(false);
      void this.stopVoiceGuidance();
    }
    const renderGeneration = ++this.routeRenderGeneration;
    void this.queueRouteRender(null, renderGeneration, this.mapGeneration);
    void this.renderCommunityMarkers();
  }

  private isCurrentRouteRequest(
    generation: number,
    destination: NavigationCoordinate,
    vehicleProfileId: string,
  ): boolean {
    const currentDestination = this.routeDestination();
    return (
      !this.destroyed &&
      generation === this.routeRequestGeneration &&
      currentDestination !== null &&
      currentDestination.lat === destination.lat &&
      currentDestination.lng === destination.lng &&
      this.selectedVehicleProfileId() === vehicleProfileId
    );
  }

  formatReportAge(createdAt: string): string {
    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(createdAt)) / 60_000),
    );
    const locale = this.i18n.locale();
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (elapsedMinutes < 1) {
      return formatter.format(0, "second");
    }
    if (elapsedMinutes < 60) {
      return formatter.format(-elapsedMinutes, "minute");
    }
    return formatter.format(-Math.floor(elapsedMinutes / 60), "hour");
  }

  private async refreshRouteCommunityAlerts(): Promise<void> {
    const route = this.navigationRoute();
    const position = this.lastPosition;
    if (
      this.destroyed ||
      !this.navigationActive() ||
      this.navigationPaused() ||
      this.navigationArrived() ||
      this.navigationOffRoute() ||
      !route ||
      !position ||
      !this.appIsActive
    ) {
      return;
    }
    const now = Date.now();
    if (
      this.routeAlertRequestInFlight ||
      now - this.lastRouteAlertRequestAt < ROUTE_ALERT_REFRESH_INTERVAL_MS
    ) {
      return;
    }

    this.routeAlertRequestInFlight = true;
    this.lastRouteAlertRequestAt = now;
    try {
      const reports = await firstValueFrom(
        this.api.getNearbyCommunityIncidents(
          position.coords.latitude,
          position.coords.longitude,
          ROUTE_ALERT_SEARCH_RADIUS_METERS,
        ).pipe(
          timeout({ first: ROUTE_ALERT_REQUEST_TIMEOUT_MS }),
          takeUntil(this.destroyed$),
        ),
      );
      const routeChanged = this.navigationRoute() !== route;
      if (
        this.destroyed ||
        !this.navigationActive() ||
        this.navigationPaused() ||
        this.navigationArrived() ||
        this.navigationOffRoute() ||
        !this.appIsActive ||
        routeChanged
      ) {
        if (
          !this.destroyed &&
          !routeChanged &&
          this.navigationActive() &&
          !this.navigationArrived() &&
          !this.navigationOffRoute() &&
          (this.navigationPaused() || !this.appIsActive)
        ) {
          this.routeAlertRefreshPending = true;
        }
        return;
      }

      const alerts = selectRouteCommunityAlerts(
        reports,
        route.geometry.coordinates,
        this.routeCumulativeMeters,
        this.routeProgressMeters(),
        this.routeProgressSegmentIndex(),
      );
      this.routeCommunityAlerts.set(alerts);
      this.lastRouteAlertSuccessAt = Date.now();
      this.routeAlertRefreshPending = false;
      this.scheduleRouteAlertExpiry();
      await this.renderCommunityMarkers();
    } catch {
      if (!this.destroyed && this.navigationRoute() === route) {
        this.removeExpiredRouteAlerts();
        if (this.navigationPaused() || !this.appIsActive) {
          this.routeAlertRefreshPending = true;
        }
        console.warn("Could not refresh community route alerts.");
      }
    } finally {
      this.routeAlertRequestInFlight = false;
      const routeChanged = this.navigationRoute() !== route;
      const refreshAfterResume =
        this.routeAlertRefreshPending &&
        this.appIsActive &&
        !this.navigationPaused();
      if (
        !this.destroyed &&
        this.navigationActive() &&
        !this.navigationArrived() &&
        !this.navigationOffRoute() &&
        (routeChanged || refreshAfterResume)
      ) {
        this.routeAlertRefreshPending = false;
        void this.refreshRouteCommunityAlerts();
      }
    }
  }

  private removeExpiredRouteAlerts(): void {
    const now = Date.now();
    if (
      this.lastRouteAlertSuccessAt !== null &&
      now - this.lastRouteAlertSuccessAt >= ROUTE_ALERT_FRESHNESS_MS
    ) {
      this.clearRouteCommunityAlerts();
      void this.renderCommunityMarkers();
      return;
    }

    const currentAlerts = this.routeCommunityAlerts();
    const currentAlertsCount = currentAlerts.length;
    const activeAlerts = currentAlerts.filter(
      (alert) => Date.parse(alert.expiresAt) > now,
    );
    if (activeAlerts.length !== currentAlertsCount) {
      this.routeCommunityAlerts.set(activeAlerts);
      void this.renderCommunityMarkers();
    }
  }

  private scheduleRouteAlertExpiry(): void {
    this.clearRouteAlertExpiryTimer();
    const refreshedAt = this.lastRouteAlertSuccessAt;
    const alerts = this.routeCommunityAlerts();
    if (refreshedAt === null || alerts.length === 0) {
      return;
    }

    const reportExpiry = Math.min(
      ...alerts.map((alert) => Date.parse(alert.expiresAt)),
    );
    const expiry = Math.min(
      refreshedAt + ROUTE_ALERT_FRESHNESS_MS,
      reportExpiry,
    );
    this.routeAlertExpiryTimer = setTimeout(() => {
      this.routeAlertExpiryTimer = null;
      this.removeExpiredRouteAlerts();
      this.scheduleRouteAlertExpiry();
    }, Math.max(0, expiry - Date.now()));
  }

  private clearRouteCommunityAlerts(): void {
    this.routeCommunityAlerts.set([]);
    this.lastRouteAlertSuccessAt = null;
    this.routeAlertRefreshPending = false;
    this.clearRouteAlertExpiryTimer();
  }

  private clearRouteAlertExpiryTimer(): void {
    if (this.routeAlertExpiryTimer !== null) {
      clearTimeout(this.routeAlertExpiryTimer);
      this.routeAlertExpiryTimer = null;
    }
  }

  private updateRouteAlertProgress(
    previousProgressMeters: number,
    currentProgressMeters: number,
  ): void {
    const alerts = this.routeCommunityAlerts();
    if (alerts.length === 0) {
      return;
    }

    if (this.navigationOffRoute() || this.navigationArrived()) {
      this.clearRouteCommunityAlerts();
      void this.renderCommunityMarkers();
      return;
    }

    const progressDelta = Math.max(
      0,
      currentProgressMeters - previousProgressMeters,
    );
    if (progressDelta === 0) {
      return;
    }

    const remainingAlerts = alerts
      .map((alert) => ({
        ...alert,
        distanceAheadMeters: alert.distanceAheadMeters - progressDelta,
      }))
      .filter(
        (alert) =>
          alert.distanceAheadMeters > 20 &&
          alert.distanceAheadMeters <= ROUTE_ALERT_MAX_DISTANCE_METERS,
      );
    if (remainingAlerts.length !== alerts.length) {
      this.routeCommunityAlerts.set(remainingAlerts);
      void this.renderCommunityMarkers();
    } else {
      this.routeCommunityAlerts.set(remainingAlerts);
    }
  }

  formatDistance(meters: number): string {
    return meters < 1000
      ? `${Math.max(0, Math.round(meters))} m`
      : `${(meters / 1000).toFixed(1)} km`;
  }

  formatSpeed(speedKph: number | null): string {
    return speedKph === null ? "—" : `${Math.round(speedKph)} km/h`;
  }

  private updateNavigationProgress(position: Position): void {
    if (!this.navigationActive() || this.navigationArrived()) {
      return;
    }

    const route = this.navigationRoute();
    const destination = this.routeDestination();
    if (!route || !destination || route.geometry.coordinates.length < 2) {
      return;
    }

    const currentPoint: [number, number] = [
      position.coords.longitude,
      position.coords.latitude,
    ];
    const destinationDistance = distanceBetweenCoordinates(currentPoint, [
      destination.lng,
      destination.lat,
    ]);
    const accuracy = position.coords.accuracy;
    if (destinationDistance <= 35 && (accuracy === null || accuracy <= 50)) {
      this.navigationArrived.set(true);
      this.navigationOffRoute.set(false);
      this.clearRouteCommunityAlerts();
      void this.renderCommunityMarkers();
      this.routeProgressMeters.set(
        this.routeCumulativeMeters[this.routeCumulativeMeters.length - 1] ?? 0,
      );
      return;
    }

    const closest = closestRouteProgress(
      currentPoint,
      route.geometry.coordinates,
      this.routeCumulativeMeters,
      this.routeProgressSegmentIndex(),
    );
    if (!closest || closest.distanceMeters > OFF_ROUTE_THRESHOLD_METERS) {
      if (position.coords.accuracy === null || position.coords.accuracy > 50) {
        return;
      }

      this.offRouteFixCount += 1;
      this.navigationOffRoute.set(true);
      this.tryAutomaticReroute();
      return;
    }

    this.offRouteFixCount = 0;
    this.navigationOffRoute.set(false);
    this.routeProgressSegmentIndex.set(closest.segmentIndex);
    this.routeProgressMeters.set(
      Math.max(this.routeProgressMeters(), closest.progressMeters),
    );
  }

  private tryAutomaticReroute(): void {
    if (
      !this.navigationActive() ||
      this.navigationPaused() ||
      this.navigationArrived() ||
      !this.appIsActive ||
      this.offRouteFixCount < OFF_ROUTE_FIXES_BEFORE_REROUTE ||
      this.routeLoading() ||
      Date.now() - this.lastAutomaticRerouteAt < AUTO_REROUTE_COOLDOWN_MS
    ) {
      return;
    }
    if (!this.lastPosition || !isFreshPosition(this.lastPosition, Date.now())) {
      this.handleLocationFailure();
      return;
    }

    this.lastAutomaticRerouteAt = Date.now();
    this.offRouteFixCount = 0;
    void this.reroute(true);
  }

  toggleVoiceGuidance(): void {
    const enabled = !this.voiceGuidanceEnabled();
    this.voiceGuidanceEnabled.set(enabled);
    this.voiceError.set(null);
    this.lastAnnouncedManeuverKey = null;
    if (enabled) {
      this.updateVoiceGuidance();
    } else {
      void this.stopVoiceGuidance();
    }
  }

  private updateVoiceGuidance(): void {
    if (
      !this.navigationActive() ||
      this.navigationPaused() ||
      !this.voiceGuidanceEnabled()
    ) {
      return;
    }

    if (this.navigationArrived()) {
      if (this.lastAnnouncedManeuverKey === "arrived") {
        return;
      }
      this.lastAnnouncedManeuverKey = "arrived";
      void this.speakNavigationText(this.i18n.text("mapVoiceArrive"));
      return;
    }

    const maneuver = this.nextManeuver();
    if (!maneuver) {
      return;
    }
    const key = `${maneuver.endShapeIndex}:${maneuver.instruction}`;
    if (key === this.lastAnnouncedManeuverKey) {
      return;
    }
    this.lastAnnouncedManeuverKey = key;
    void this.speakNavigationText(this.getVoiceInstruction(maneuver));
  }

  private getVoiceInstruction(
    maneuver: NavigationManeuver & { distanceMeters: number },
  ): string {
    const locale = this.i18n.locale();
    if (locale === "en") {
      return maneuver.verbalInstruction ?? maneuver.instruction;
    }

    const action = this.i18n.text(this.getVoiceActionKey(maneuver.type));
    const road = maneuver.streetNames[0];
    const roadText = road ? ` ${this.i18n.text("mapVoiceOnRoad")} ${road}` : "";
    return `${this.i18n.text("mapVoiceIn")} ${this.formatDistance(maneuver.distanceMeters)}, ${action}${roadText}.`;
  }

  private getVoiceActionKey(type: number): TranslationKey {
    switch (type) {
      case 2:
      case 18:
      case 10:
      case 23:
        return "mapVoiceRight";
      case 3:
      case 19:
      case 15:
      case 24:
        return "mapVoiceLeft";
      case 9:
        return "mapVoiceSlightRight";
      case 11:
        return "mapVoiceSharpRight";
      case 12:
      case 13:
        return "mapVoiceUTurn";
      case 14:
        return "mapVoiceSharpLeft";
      case 16:
        return "mapVoiceSlightLeft";
      case 20:
        return "mapVoiceExitRight";
      case 21:
        return "mapVoiceExitLeft";
      case 25:
        return "mapVoiceMerge";
      case 26:
        return "mapVoiceRoundabout";
      case 27:
        return "mapVoiceRoundaboutExit";
      case 28:
      case 29:
        return "mapVoiceFollowRoute";
      default:
        return "mapVoiceFollowRoute";
    }
  }

  private async speakNavigationText(text: string): Promise<void> {
    try {
      await this.voiceGuidance.speak(text, this.i18n.locale());
      if (!this.destroyed) {
        this.voiceError.set(null);
      }
    } catch {
      if (!this.destroyed) {
        this.voiceError.set("mapVoiceUnavailable");
      }
    }
  }

  private async stopVoiceGuidance(): Promise<void> {
    this.lastAnnouncedManeuverKey = null;
    try {
      await this.voiceGuidance.stop();
    } catch {
      if (!this.destroyed) {
        this.voiceError.set("mapVoiceUnavailable");
      }
    }
  }

  private async registerAppStateListener(): Promise<void> {
    try {
      const handle = await this.mapEngine.addAppStateListener((state) =>
        this.handleAppStateChange(state),
      );
      if (this.destroyed) {
        await handle.remove();
      } else {
        this.appStateHandle = handle;
      }
    } catch {
      console.error("Could not register the app state listener.");
    }
  }

  private handleAppStateChange(state: AppState): void {
    if (this.destroyed) {
      return;
    }
    this.appIsActive = state.isActive;
    if (!state.isActive) {
      this.pendingLocationRender = null;
      const hadLocationWatch = this.locationWatchId !== null;
      const needsNavigationResume =
        this.navigationActive() && !this.navigationArrived();
      this.resumeLocationOnForeground =
        hadLocationWatch || needsNavigationResume;
      if (needsNavigationResume) {
        this.navigationPaused.set(true);
        void this.renderCommunityMarkers();
      }
      if (hadLocationWatch) {
        void this.clearLocationWatch();
      }
      if (this.voiceGuidanceEnabled()) {
        void this.stopVoiceGuidance();
      }
      return;
    }

    if (this.resumeLocationOnForeground) {
      this.resumeLocationOnForeground = false;
      this.removeExpiredRouteAlerts();
      this.locationState.set("idle");
      void this.startLocation();
    }
  }

  private handleLocationFailure(): void {
    if (this.destroyed) {
      return;
    }
    this.locationState.set("error");
    this.locationError.set("mapLocationFailed");
    this.pauseNavigationForLocationFailure();
  }

  private pauseNavigationForLocationFailure(): void {
    if (this.navigationActive()) {
      this.navigationPaused.set(true);
      void this.renderCommunityMarkers();
      if (this.voiceGuidanceEnabled()) {
        void this.stopVoiceGuidance();
      }
    }
  }

  private async clearLocationWatch(): Promise<void> {
    const watchId = this.locationWatchId;
    this.locationWatchId = null;
    if (!watchId) {
      return;
    }

    try {
      await this.mapEngine.clearWatch(watchId);
    } catch {
      console.error("Could not stop the map location watch.");
    }
  }

  private positionBearing(
    position: Position,
    previousPosition: Position | null,
  ): number {
    const measuredHeading =
      position.coords.heading ??
      position.coords.trueHeading ??
      position.coords.course;
    if (measuredHeading !== null && measuredHeading !== undefined) {
      return normalizeBearing(measuredHeading);
    }

    const route = this.navigationRoute();
    if (this.navigationActive() && route) {
      const closest = closestRouteProgress(
        [position.coords.longitude, position.coords.latitude],
        route.geometry.coordinates,
        this.routeCumulativeMeters,
        this.routeProgressSegmentIndex(),
      );
      if (closest) {
        return bearingBetweenCoordinates(
          route.geometry.coordinates[closest.segmentIndex],
          route.geometry.coordinates[closest.segmentIndex + 1],
        );
      }
    }

    if (previousPosition) {
      return bearingBetweenCoordinates(
        [previousPosition.coords.longitude, previousPosition.coords.latitude],
        [position.coords.longitude, position.coords.latitude],
      );
    }
    return 0;
  }

  private locationStatus(): string {
    const keyByState: Record<LocationState, TranslationKey> = {
      idle: "mapLocationReady",
      requesting: "mapLocationStarting",
      active: "mapLocationActive",
      denied: "mapLocationDenied",
      error: "mapLocationFailed",
    };
    const error = this.locationError();
    return this.i18n.text(error ?? keyByState[this.locationState()]);
  }

  private loadVehicleProfiles(): void {
    this.routeProfilesLoading.set(true);
    this.api.getVehicleProfiles().pipe(takeUntil(this.destroyed$)).subscribe({
      next: (profiles) => {
        if (this.destroyed) {
          return;
        }
        this.vehicleProfilesLoaded = true;
        this.routeProfilesLoading.set(false);
        this.routeProfilesError.set(null);
        this.routeProfiles.set(profiles);
        this.selectedVehicleProfileId.set(profiles[0]?.id ?? "");
      },
      error: () => {
        if (!this.destroyed) {
          this.routeProfilesLoading.set(false);
          this.routeProfilesError.set("mapRouteProfilesFailed");
        }
      },
    });
  }

  private handleMapClick(event: MapClickEvent): void {
    if (this.destroyed || event.mapId !== MAP_ID || !this.routePlanning()) {
      return;
    }

    const destination = {
      lat: event.coordinates.latitude,
      lng: event.coordinates.longitude,
    };
    if (!isValidNavigationCoordinate(destination)) {
      return;
    }
    this.invalidateRouteForSelectionChange();
    this.followingLocation.set(false);
    this.routeDestination.set(destination);
    void this.queueDestinationMarker(destination);
  }

  private queueRouteRender(
    route: NavigationRoute | null,
    generation: number,
    mapGeneration: number,
    allowDuringStyleChange = false,
  ): Promise<void> {
    if (this.styleChangeInProgress && !allowDuringStyleChange) {
      this.routeRenderDeferredByStyle = true;
      return Promise.resolve();
    }
    const operation = this.routeRenderQueue
      .catch(() => undefined)
      .then(async () => {
        if (
          !this.isMapOperationCurrent(mapGeneration) ||
          generation !== this.routeRenderGeneration
        ) {
          return;
        }

        try {
          await this.mapEngine.removeAllPolylines({ mapId: MAP_ID });
          if (
            !this.isMapOperationCurrent(mapGeneration) ||
            generation !== this.routeRenderGeneration ||
            !route
          ) {
            return;
          }
          const coordinates = route.geometry.coordinates.map(
            ([longitude, latitude]) => ({
              latitude,
              longitude,
            }),
          );
          await this.mapEngine.addPolyline({
            mapId: MAP_ID,
            polyline: {
              id: ROUTE_LINE_ID,
              coordinates,
              color: "#2879df",
              width: 7,
            },
          });
          if (
            !this.isMapOperationCurrent(mapGeneration) ||
            generation !== this.routeRenderGeneration
          ) {
            return;
          }

          const bounds = coordinates.reduce(
            (current, coordinate) => ({
              north: Math.max(current.north, coordinate.latitude),
              south: Math.min(current.south, coordinate.latitude),
              east: Math.max(current.east, coordinate.longitude),
              west: Math.min(current.west, coordinate.longitude),
            }),
            {
              north: Number.NEGATIVE_INFINITY,
              south: Number.POSITIVE_INFINITY,
              east: Number.NEGATIVE_INFINITY,
              west: Number.POSITIVE_INFINITY,
            },
          );
          await this.mapEngine.fitBounds({
            mapId: MAP_ID,
            bounds: {
              northeast: {
                latitude: bounds.north,
                longitude: bounds.east,
              },
              southwest: {
                latitude: bounds.south,
                longitude: bounds.west,
              },
            },
            padding: { top: 100, bottom: 300, left: 36, right: 36 },
            maxZoom: 14,
            animate: true,
            animationDuration: 900,
          });
        } catch {
          if (
            this.isMapOperationCurrent(mapGeneration) &&
            generation === this.routeRenderGeneration
          ) {
            this.routeError.set("mapRouteRenderFailed");
            console.error("Could not render the navigation route.");
          }
        }
      });
    this.routeRenderQueue = operation.catch(() => undefined);
    return operation;
  }

  private queueDestinationMarker(
    destination: NavigationCoordinate | null,
    allowDuringStyleChange = false,
  ): Promise<void> {
    if (this.styleChangeInProgress && !allowDuringStyleChange) {
      this.destinationRenderDeferredByStyle = true;
      return Promise.resolve();
    }
    const generation = ++this.destinationRenderGeneration;
    const mapGeneration = this.mapGeneration;
    const operation = this.destinationRenderQueue
      .catch(() => undefined)
      .then(async () => {
        if (
          !this.isMapOperationCurrent(mapGeneration) ||
          generation !== this.destinationRenderGeneration
        ) {
          return;
        }

        try {
          if (!destination) {
            if (this.destinationMarkerAdded) {
              await this.mapEngine.removeMarkerById({
                mapId: MAP_ID,
                markerId: DESTINATION_MARKER_ID,
              });
              if (!this.isMapOperationCurrent(mapGeneration)) {
                return;
              }
            }
            this.destinationMarkerAdded = false;
            return;
          }

          const coordinates = {
            latitude: destination.lat,
            longitude: destination.lng,
          };
          if (this.destinationMarkerAdded) {
            await this.mapEngine.updateMarker({
              mapId: MAP_ID,
              markerId: DESTINATION_MARKER_ID,
              coordinates,
            });
          } else {
            await this.mapEngine.addMarker({
              mapId: MAP_ID,
              marker: {
                id: DESTINATION_MARKER_ID,
                coordinates,
                iconUrl: DESTINATION_MARKER_ICON,
                iconAnchor: MarkerIconAnchor.Bottom,
                iconSize: { width: 30, height: 38 },
              },
            });
          }
          if (this.isMapOperationCurrent(mapGeneration)) {
            this.destinationMarkerAdded = true;
          }
        } catch {
          if (
            this.isMapOperationCurrent(mapGeneration) &&
            generation === this.destinationRenderGeneration
          ) {
            this.routeError.set("mapRouteRenderFailed");
            console.error("Could not render the route destination marker.");
          }
        }
      });
    this.destinationRenderQueue = operation.catch(() => undefined);
    return operation;
  }

  private renderRoute(
    route: NavigationRoute,
    generation = this.routeRenderGeneration,
    mapGeneration = this.mapGeneration,
    allowDuringStyleChange = false,
  ): Promise<void> {
    return this.queueRouteRender(
      route,
      generation,
      mapGeneration,
      allowDuringStyleChange,
    );
  }

  private async restoreMapOverlays(
    mapGeneration: number,
    styleGeneration: number,
  ): Promise<void> {
    if (!this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
      return;
    }
    this.locationMarkerAdded = false;
    this.destinationMarkerAdded = false;
    this.trafficOverlayInitialized = false;
    this.communityMarkerIds.clear();
    await this.initializeTrafficOverlay(mapGeneration);
    if (!this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
      return;
    }
    await this.restoreLocationMarker(mapGeneration, styleGeneration);
    if (!this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
      return;
    }

    const destination = this.routeDestination();
    if (
      destination &&
      this.isStyleOperationCurrent(mapGeneration, styleGeneration)
    ) {
      await this.queueDestinationMarker(destination, true);
    }
    const route = this.navigationRoute();
    if (
      route &&
      this.isStyleOperationCurrent(mapGeneration, styleGeneration)
    ) {
      const renderGeneration = ++this.routeRenderGeneration;
      await this.renderRoute(route, renderGeneration, mapGeneration, true);
    }
    if (this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
      await this.renderCommunityMarkers(true);
    }
  }

  private async restoreLocationMarker(
    mapGeneration: number,
    styleGeneration: number,
  ): Promise<void> {
    const position = this.lastPosition;
    if (
      !position ||
      !this.isStyleOperationCurrent(mapGeneration, styleGeneration)
    ) {
      return;
    }
    const bearing = this.positionBearing(position, null);
    await this.mapEngine.addMarker({
      mapId: MAP_ID,
      marker: {
        id: LOCATION_MARKER_ID,
        coordinates: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        iconUrl: LOCATION_MARKER_ICON,
        iconAnchor: MarkerIconAnchor.Center,
        iconSize: { width: 28, height: 36 },
        rotation: bearing,
      },
    });
    if (this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
      this.locationMarkerAdded = true;
    }
  }

  private isMapOperationCurrent(generation: number): boolean {
    return (
      !this.destroyed &&
      this.mapCreated &&
      generation === this.mapGeneration
    );
  }

  private isStyleOperationCurrent(
    mapGeneration: number,
    styleGeneration: number,
  ): boolean {
    return (
      this.isMapOperationCurrent(mapGeneration) &&
      styleGeneration === this.styleGeneration
    );
  }

  private completeStyleChange(
    mapGeneration: number,
    styleGeneration: number,
  ): void {
    if (styleGeneration !== this.styleGeneration) {
      return;
    }
    this.styleChangeInProgress = false;
    if (!this.isMapOperationCurrent(mapGeneration)) {
      return;
    }

    if (this.routeRenderDeferredByStyle) {
      this.routeRenderDeferredByStyle = false;
      const renderGeneration = ++this.routeRenderGeneration;
      void this.queueRouteRender(
        this.navigationRoute(),
        renderGeneration,
        mapGeneration,
      );
    }
    if (this.destinationRenderDeferredByStyle) {
      this.destinationRenderDeferredByStyle = false;
      void this.queueDestinationMarker(this.routeDestination());
    }
    if (this.communityRenderDeferredByStyle) {
      this.communityRenderDeferredByStyle = false;
      void this.renderCommunityMarkers();
    }
    if (this.pendingLocationRender && this.appIsActive) {
      void this.flushLocationRender();
    }
  }

  private async destroyMap(): Promise<void> {
    if (this.mapDestroyPromise) {
      await this.mapDestroyPromise;
      return;
    }
    if (!this.mapCreated && !this.mapCreationPromise) {
      return;
    }

    const creation = this.mapCreationPromise;
    this.mapGeneration += 1;
    this.styleGeneration += 1;
    this.mapCreated = false;
    this.styleChangeInProgress = false;
    this.routeRenderDeferredByStyle = false;
    this.destinationRenderDeferredByStyle = false;
    this.communityRenderDeferredByStyle = false;
    this.trafficOverlayInitialized = false;
    this.locationMarkerAdded = false;
    this.destinationMarkerAdded = false;
    this.routeRenderGeneration += 1;
    this.destinationRenderGeneration += 1;
    this.communityMarkerRenderGeneration += 1;
    this.pendingLocationRender = null;
    const mapClickHandle = this.mapClickHandle;
    this.mapClickHandle = null;
    const pendingStyleChange = this.styleChangeQueue;
    const pendingLocationRender = this.locationRenderTask;
    const pendingRouteRender = this.routeRenderQueue;
    const pendingDestinationRender = this.destinationRenderQueue;
    const pendingCommunityRender = this.communityMarkerRenderQueue;
    const pendingTrafficOverlay = this.trafficOverlayTask;

    const destroyTask = (async () => {
      if (mapClickHandle) {
        try {
          await mapClickHandle.remove();
        } catch {
          console.error("Could not remove the map click listener.");
        }
      }

      await Promise.all([
        creation?.catch(() => undefined),
        pendingStyleChange,
        pendingLocationRender ?? Promise.resolve(),
        pendingRouteRender,
        pendingDestinationRender,
        pendingCommunityRender,
        pendingTrafficOverlay ?? Promise.resolve(),
      ]);
      this.communityMarkerIds.clear();
      try {
        await this.mapEngine.destroyMap(MAP_ID);
      } catch {
        console.error("Could not release the map view.");
      }
    })();
    this.mapDestroyPromise = destroyTask;
    try {
      await destroyTask;
    } finally {
      if (this.mapDestroyPromise === destroyTask) {
        this.mapDestroyPromise = null;
      }
    }
  }

  private trafficOverlayTask: Promise<void> | null = null;

  private async initializeTrafficOverlay(
    mapGeneration = this.mapGeneration,
  ): Promise<void> {
    if (!this.isMapOperationCurrent(mapGeneration)) {
      return;
    }
    if (this.trafficOverlayInitialized) {
      return;
    }
    if (this.trafficOverlayTask) {
      await this.trafficOverlayTask;
      return;
    }

    const task = this.addTrafficOverlay(mapGeneration);
    this.trafficOverlayTask = task;
    try {
      await task;
    } finally {
      if (this.trafficOverlayTask === task) {
        this.trafficOverlayTask = null;
      }
    }
  }

  private async addTrafficOverlay(mapGeneration: number): Promise<void> {
    let sourceAdded = false;
    try {
      await this.mapEngine.addGeoJsonSource(createEmptyTrafficSource(MAP_ID));
      sourceAdded = true;
      if (!this.isMapOperationCurrent(mapGeneration)) {
        return;
      }
      await this.mapEngine.addLayer(createTrafficFlowLayer(MAP_ID));
      if (this.isMapOperationCurrent(mapGeneration)) {
        this.trafficOverlayInitialized = true;
      }
    } catch {
      if (this.isMapOperationCurrent(mapGeneration)) {
        console.error(
          "Could not initialize the optional provider traffic layer.",
        );
      }
      if (sourceAdded) {
        try {
          await this.mapEngine.removeLayerById({
            mapId: MAP_ID,
            layerId: "gng-provider-traffic-flow",
          });
        } catch {
          console.error("Could not clean up the provider traffic layer.");
        }
        try {
          await this.mapEngine.removeGeoJsonSourceById({
            mapId: MAP_ID,
            sourceId: "gng-provider-traffic",
          });
        } catch {
          console.error("Could not clean up the provider traffic source.");
        }
      }
    }
  }

  private renderCommunityMarkers(
    allowDuringStyleChange = false,
  ): Promise<void> {
    if (this.styleChangeInProgress && !allowDuringStyleChange) {
      this.communityRenderDeferredByStyle = true;
      return Promise.resolve();
    }
    if (!this.mapCreated || this.destroyed) {
      return Promise.resolve();
    }
    const mapGeneration = this.mapGeneration;
    const renderGeneration = ++this.communityMarkerRenderGeneration;
    const operation = this.communityMarkerRenderQueue
      .catch(() => undefined)
      .then(async () => {
        if (
          !this.isMapOperationCurrent(mapGeneration) ||
          renderGeneration !== this.communityMarkerRenderGeneration
        ) {
          return;
        }

        try {
          for (const markerId of [...this.communityMarkerIds]) {
            if (
              !this.isMapOperationCurrent(mapGeneration) ||
              renderGeneration !== this.communityMarkerRenderGeneration
            ) {
              return;
            }
            await this.mapEngine.removeMarkerById({ mapId: MAP_ID, markerId });
            this.communityMarkerIds.delete(markerId);
          }

          const reportsById = new Map(
            this.communityReports().map((report) => [report.id, report]),
          );
          if (
            this.navigationActive() &&
            !this.navigationPaused() &&
            this.appIsActive
          ) {
            for (const alert of this.routeCommunityAlerts()) {
              reportsById.set(alert.id, alert);
            }
          }
          for (const report of reportsById.values()) {
            if (
              !this.isMapOperationCurrent(mapGeneration) ||
              renderGeneration !== this.communityMarkerRenderGeneration
            ) {
              return;
            }
            const markerId = `${COMMUNITY_MARKER_PREFIX}${report.id}`;
            const color = COMMUNITY_MARKER_COLORS[report.type];
            const iconUrl =
              "data:image/svg+xml;charset=utf-8," +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${color}" stroke="#fff" stroke-width="3"/><path d="M16 8v10m0 4v1" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>`,
              );
            await this.mapEngine.addMarker({
              mapId: MAP_ID,
              marker: {
                id: markerId,
                coordinates: {
                  latitude: report.lat,
                  longitude: report.lng,
                },
                iconUrl,
                iconAnchor: MarkerIconAnchor.Center,
                iconSize: { width: 30, height: 30 },
              },
            });
            this.communityMarkerIds.add(markerId);
          }
        } catch {
          if (
            this.isMapOperationCurrent(mapGeneration) &&
            renderGeneration === this.communityMarkerRenderGeneration
          ) {
            console.error("Could not render community report markers.");
          }
        }
      });
    this.communityMarkerRenderQueue = operation.catch(() => undefined);
    return operation;
  }

  private isCommunityReportLocationCurrent(
    requestPosition: Position,
  ): boolean {
    const currentPosition = this.lastPosition;
    if (
      !currentPosition ||
      this.locationState() !== "active" ||
      !this.appIsActive
    ) {
      return false;
    }
    return (
      distanceBetweenCoordinates(
        [
          requestPosition.coords.longitude,
          requestPosition.coords.latitude,
        ],
        [currentPosition.coords.longitude, currentPosition.coords.latitude],
      ) <= COMMUNITY_REPORT_LOCATION_CHANGE_METERS
    );
  }

  private handleStyleChangeFailure(
    night: boolean,
    mapGeneration = this.mapGeneration,
    styleGeneration = this.styleGeneration,
  ): void {
    if (!this.isStyleOperationCurrent(mapGeneration, styleGeneration)) {
      return;
    }
    this.nightMode.set(!night);
    this.mapState.set("error");
  }
}

function isCommunityIncidentType(
  value: unknown,
): value is CommunityIncidentType {
  return (
    typeof value === "string" &&
    (COMMUNITY_INCIDENT_TYPES as readonly string[]).includes(value)
  );
}

function bearingBetweenCoordinates(
  first: [number, number],
  second: [number, number],
): number {
  const firstLatitude = (first[1] * Math.PI) / 180;
  const secondLatitude = (second[1] * Math.PI) / 180;
  const longitudeDifference = ((second[0] - first[0]) * Math.PI) / 180;
  const y = Math.sin(longitudeDifference) * Math.cos(secondLatitude);
  const x =
    Math.cos(firstLatitude) * Math.sin(secondLatitude) -
    Math.sin(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.cos(longitudeDifference);
  return normalizeBearing((Math.atan2(y, x) * 180) / Math.PI);
}

function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

function isValidNavigationCoordinate(
  coordinate: NavigationCoordinate,
): boolean {
  return (
    Number.isFinite(coordinate.lat) &&
    coordinate.lat >= -90 &&
    coordinate.lat <= 90 &&
    Number.isFinite(coordinate.lng) &&
    coordinate.lng >= -180 &&
    coordinate.lng <= 180
  );
}

function isValidNavigationRoute(value: unknown): value is NavigationRoute {
  if (!value || typeof value !== "object") {
    return false;
  }
  const route = value as {
    provider?: unknown;
    vehicleType?: unknown;
    distanceKm?: unknown;
    durationSeconds?: unknown;
    liveTraffic?: unknown;
    geometry?: unknown;
    maneuvers?: unknown;
  };
  if (
    route.provider !== "Valhalla" ||
    typeof route.vehicleType !== "string" ||
    !["car", "motorcycle", "truck"].includes(route.vehicleType) ||
    typeof route.distanceKm !== "number" ||
    !Number.isFinite(route.distanceKm) ||
    route.distanceKm <= 0 ||
    typeof route.durationSeconds !== "number" ||
    !Number.isFinite(route.durationSeconds) ||
    route.durationSeconds < 0 ||
    route.liveTraffic !== false
  ) {
    return false;
  }

  const geometry = route.geometry;
  if (!geometry || typeof geometry !== "object") {
    return false;
  }
  const geometryFields = geometry as {
    type?: unknown;
    coordinates?: unknown;
  };
  const coordinates = geometryFields.coordinates;
  if (
    geometryFields.type !== "LineString" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > MAX_ROUTE_ALERT_COORDINATES ||
    !coordinates.every(isValidCoordinatePair)
  ) {
    return false;
  }
  const totalDistance = coordinates.slice(1).reduce(
    (distance: number, coordinate: [number, number], index: number) =>
      distance +
      distanceBetweenCoordinates(coordinates[index], coordinate),
    0,
  );
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) {
    return false;
  }

  const maneuvers = route.maneuvers;
  if (!Array.isArray(maneuvers)) {
    return false;
  }
  return maneuvers.every((value) => {
    if (!value || typeof value !== "object") {
      return false;
    }
    const maneuver = value as {
      instruction?: unknown;
      distanceKm?: unknown;
      durationSeconds?: unknown;
      type?: unknown;
      beginShapeIndex?: unknown;
      endShapeIndex?: unknown;
      streetNames?: unknown;
      verbalInstruction?: unknown;
      succinctInstruction?: unknown;
    };
    const type = maneuver.type;
    const beginShapeIndex = maneuver.beginShapeIndex;
    const endShapeIndex = maneuver.endShapeIndex;
    const verbalInstruction = maneuver.verbalInstruction;
    const succinctInstruction = maneuver.succinctInstruction;
    const instruction = maneuver.instruction;
    const distanceKm = maneuver.distanceKm;
    const durationSeconds = maneuver.durationSeconds;
    const streetNames = maneuver.streetNames;
    return (
      typeof instruction === "string" &&
      instruction.length > 0 &&
      typeof distanceKm === "number" &&
      Number.isFinite(distanceKm) &&
      distanceKm >= 0 &&
      typeof durationSeconds === "number" &&
      Number.isFinite(durationSeconds) &&
      durationSeconds >= 0 &&
      typeof type === "number" &&
      Number.isInteger(type) &&
      typeof beginShapeIndex === "number" &&
      Number.isInteger(beginShapeIndex) &&
      typeof endShapeIndex === "number" &&
      Number.isInteger(endShapeIndex) &&
      beginShapeIndex >= 0 &&
      beginShapeIndex <= endShapeIndex &&
      endShapeIndex < coordinates.length &&
      Array.isArray(streetNames) &&
      streetNames.every((name) => typeof name === "string") &&
      (verbalInstruction === undefined ||
        typeof verbalInstruction === "string") &&
      (succinctInstruction === undefined ||
        typeof succinctInstruction === "string")
    );
  });
}

function isValidCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function isFreshPosition(position: Position, now: number): boolean {
  const age = now - position.timestamp;
  return (
    Number.isFinite(position.timestamp) &&
    age <= MAX_AUTOMATIC_REROUTE_POSITION_AGE_MS &&
    age >= -MAX_POSITION_CLOCK_SKEW_MS
  );
}
