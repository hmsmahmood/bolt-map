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
import { firstValueFrom } from "rxjs";
import { environment } from "../../../environments/environment";
import { ApiService } from "../../core/api/api.service";
import {
  COMMUNITY_INCIDENT_TYPES,
  CommunityIncident,
  CommunityIncidentType,
  CommunityIncidentVote,
} from "../../core/api/community-incident.model";
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
  private trafficOverlayInitialized = false;
  private locationMarkerAdded = false;
  private destinationMarkerAdded = false;
  private vehicleProfilesLoaded = false;
  private locationWatchId: string | null = null;
  private mapClickHandle: PluginListenerHandle | null = null;
  private appStateHandle: PluginListenerHandle | null = null;
  private destroyed = false;
  private lastPosition: Position | null = null;
  private pendingLocationRender: {
    position: Position;
    bearing: number;
  } | null = null;
  private locationRenderRunning = false;
  private routeCumulativeMeters: number[] = [];
  private readonly routeProgressSegmentIndex = signal(0);
  private readonly communityMarkerIds = new Set<string>();
  private lastAnnouncedManeuverKey: string | null = null;
  private offRouteFixCount = 0;
  private lastAutomaticRerouteAt = 0;
  private resumeLocationOnForeground = false;
  private appIsActive = true;

  constructor(readonly i18n: TranslationService) {}

  ngAfterViewInit(): void {
    void this.initializeMap();
    void this.registerAppStateListener();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
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

    if (this.mapClickHandle) {
      void this.mapClickHandle.remove().catch(() => {
        console.error("Could not remove the map click listener.");
      });
      this.mapClickHandle = null;
    }

    if (this.appStateHandle) {
      void this.appStateHandle.remove().catch(() => {
        console.error("Could not remove the app state listener.");
      });
      this.appStateHandle = null;
    }

    if (this.mapCreated) {
      void this.mapEngine.destroyMap(MAP_ID).catch(() => {
        console.error("Could not release the map view.");
      });
    }
  }

  async initializeMap(): Promise<void> {
    const tileServerUrl = this.tileServerUrl.trim().replace(/\/+$/, "");
    if (!tileServerUrl) {
      this.mapState.set("unconfigured");
      return;
    }

    if (this.mapCreated) {
      await this.destroyMap();
    }

    this.mapState.set("loading");
    document.body.classList.add("map-route-active");
    this.mapCreated = true;

    try {
      await this.mapEngine.createMap({
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
      if (!this.destroyed) {
        await this.initializeTrafficOverlay();
        this.mapClickHandle = await this.mapEngine.addMapClickListener(
          (event) => this.handleMapClick(event),
        );
        this.mapState.set("ready");
      }
    } catch {
      await this.destroyMap();
      this.mapState.set("error");
    }

    if (this.destroyed && this.mapCreated) {
      await this.destroyMap();
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
          if (this.navigationActive()) {
            this.navigationPaused.set(true);
          }
          return;
        }
      }

      const position = await this.mapEngine.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });
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
        await this.mapEngine.clearWatch(watchId);
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
    try {
      const styleChange = this.mapEngine.setStyle(
        MAP_ID,
        JSON.stringify(createMapStyle(this.tileServerUrl, night)),
      );
      this.nightMode.set(night);
      this.locationMarkerAdded = false;
      this.destinationMarkerAdded = false;
      this.trafficOverlayInitialized = false;
      this.communityMarkerIds.clear();
      if (this.mapEngine.isNativePlatform()) {
        void styleChange
          .then(() => this.restoreMapOverlays())
          .catch(() => this.handleStyleChangeFailure(night));
      } else {
        void this.restoreMapOverlays().catch(() => {
          this.handleStyleChangeFailure(night);
        });
        void styleChange.catch(() => this.handleStyleChangeFailure(night));
      }
    } catch {
      this.handleStyleChangeFailure(night);
    }
  }

  async changeZoom(amount: number): Promise<void> {
    if (this.mapState() !== "ready") {
      return;
    }

    try {
      const camera = await this.mapEngine.getCamera(MAP_ID);
      await this.mapEngine.setCamera({
        mapId: MAP_ID,
        zoom: Math.min(14, Math.max(3, camera.camera.zoom + amount)),
        animate: true,
      });
    } catch {
      this.mapState.set("error");
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

    this.communityReportsLoading.set(true);
    this.communityReportMessage.set(null);
    try {
      const { latitude, longitude } = this.lastPosition.coords;
      const reports = await firstValueFrom(
        this.api.getNearbyCommunityIncidents(latitude, longitude),
      );
      if (!this.destroyed) {
        this.communityReports.set(reports);
        await this.renderCommunityMarkers();
        if (reports.length === 0) {
          this.communityReportMessage.set("mapCommunityNone");
        }
      }
    } catch {
      if (!this.destroyed) {
        this.communityReportMessage.set("mapCommunityLoadFailed");
      }
    } finally {
      if (!this.destroyed) {
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
        }),
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
        this.api.voteOnCommunityIncident(report.id, vote),
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
      await firstValueFrom(this.api.deleteCommunityIncident(report.id));
      if (!this.destroyed) {
        this.communityReports.update((reports) =>
          reports.filter((current) => current.id !== report.id),
        );
        await this.renderCommunityMarkers();
        this.communityReportMessage.set("mapCommunityDeleted");
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
    if (!this.lastPosition) {
      return;
    }

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
      this.locationState.set("error");
      this.locationError.set("mapLocationFailed");
    }
  }

  closeRoutePlanner(): void {
    this.routePlanning.set(false);
    this.routeError.set(null);
  }

  selectVehicleProfile(value: unknown): void {
    this.selectedVehicleProfileId.set(typeof value === "string" ? value : "");
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
        }),
      );
      if (!this.destroyed) {
        await this.setActiveRoute(route);
      }
    } catch {
      if (!this.destroyed) {
        this.routeError.set("mapRouteFailed");
      }
    } finally {
      if (!this.destroyed) {
        this.routeLoading.set(false);
      }
    }
  }

  async clearRoute(): Promise<void> {
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
    this.routeDestination.set(null);
    this.routeError.set(null);
    try {
      await this.mapEngine.removeAllPolylines({ mapId: MAP_ID });
      if (this.destinationMarkerAdded) {
        await this.mapEngine.removeMarkerById({
          mapId: MAP_ID,
          markerId: DESTINATION_MARKER_ID,
        });
        this.destinationMarkerAdded = false;
      }
    } catch {
      this.routeError.set("mapRouteRenderFailed");
    }
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

  async reroute(): Promise<void> {
    const destination = this.routeDestination();
    const position = this.lastPosition;
    const vehicleProfileId = this.selectedVehicleProfileId();
    if (!destination || !position || this.locationState() !== "active") {
      this.routeError.set("mapRouteNeedsLocation");
      return;
    }
    if (this.routeLoading()) {
      return;
    }

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
        }),
      );
      if (!this.destroyed) {
        await this.setActiveRoute(route);
        this.navigationActive.set(true);
        this.navigationArrived.set(false);
        this.navigationOffRoute.set(false);
        this.followingLocation.set(true);
        this.lastAnnouncedManeuverKey = null;
        this.updateVoiceGuidance();
      }
    } catch {
      if (!this.destroyed) {
        this.routeError.set("mapRouteFailed");
      }
    } finally {
      if (!this.destroyed) {
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
    this.updateNavigationProgress(position);
    this.updateVoiceGuidance();
    this.pendingLocationRender = { position, bearing };
    void this.flushLocationRender();
  }

  private async flushLocationRender(): Promise<void> {
    if (this.locationRenderRunning || this.destroyed || !this.appIsActive) {
      return;
    }

    this.locationRenderRunning = true;
    try {
      while (
        !this.destroyed &&
        this.appIsActive &&
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
        }

        if (
          this.appIsActive &&
          !this.destroyed &&
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
        }

        if (
          this.appIsActive &&
          !this.destroyed &&
          !this.pendingLocationRender
        ) {
          this.locationState.set("active");
          this.locationError.set(null);
          this.navigationPaused.set(false);
          this.updateVoiceGuidance();
        }
      }
    } catch {
      this.pendingLocationRender = null;
      this.handleLocationFailure();
    } finally {
      this.locationRenderRunning = false;
      if (this.pendingLocationRender && this.appIsActive && !this.destroyed) {
        void this.flushLocationRender();
      }
    }
  }

  private async setActiveRoute(route: NavigationRoute): Promise<void> {
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
    if (this.navigationActive() && this.lastPosition) {
      this.updateNavigationProgress(this.lastPosition);
    }
    await this.renderRoute(route);
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
    if (!this.navigationActive()) {
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
      const newlyArrived = !this.navigationArrived();
      this.navigationArrived.set(true);
      this.navigationOffRoute.set(false);
      this.routeProgressMeters.set(
        this.routeCumulativeMeters[this.routeCumulativeMeters.length - 1] ?? 0,
      );
      if (newlyArrived) {
        this.resumeLocationOnForeground = false;
        void this.clearLocationWatch();
      }
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
      this.offRouteFixCount < OFF_ROUTE_FIXES_BEFORE_REROUTE ||
      this.routeLoading() ||
      Date.now() - this.lastAutomaticRerouteAt < AUTO_REROUTE_COOLDOWN_MS
    ) {
      return;
    }

    this.lastAutomaticRerouteAt = Date.now();
    this.offRouteFixCount = 0;
    void this.reroute();
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
      this.locationState.set("idle");
      void this.startLocation();
    }
  }

  private handleLocationFailure(): void {
    this.locationState.set("error");
    this.locationError.set("mapLocationFailed");
    if (this.navigationActive()) {
      this.navigationPaused.set(true);
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
    this.api.getVehicleProfiles().subscribe({
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
    this.followingLocation.set(false);
    this.routeDestination.set(destination);
    this.navigationRoute.set(null);
    this.routeError.set(null);
    void this.mapEngine
      .removeAllPolylines({ mapId: MAP_ID })
      .then(async () => {
        if (this.destinationMarkerAdded) {
          await this.mapEngine.updateMarker({
            mapId: MAP_ID,
            markerId: DESTINATION_MARKER_ID,
            coordinates: {
              latitude: destination.lat,
              longitude: destination.lng,
            },
          });
        } else {
          await this.mapEngine.addMarker({
            mapId: MAP_ID,
            marker: {
              id: DESTINATION_MARKER_ID,
              coordinates: {
                latitude: destination.lat,
                longitude: destination.lng,
              },
              iconUrl: DESTINATION_MARKER_ICON,
              iconAnchor: MarkerIconAnchor.Bottom,
              iconSize: { width: 30, height: 38 },
            },
          });
          this.destinationMarkerAdded = true;
        }
      })
      .catch(() => this.routeError.set("mapRouteRenderFailed"));
  }

  private async renderRoute(route: NavigationRoute): Promise<void> {
    const coordinates = route.geometry.coordinates.map(
      ([longitude, latitude]) => ({
        latitude,
        longitude,
      }),
    );
    if (coordinates.length < 2) {
      this.routeError.set("mapRouteRenderFailed");
      return;
    }

    try {
      await this.mapEngine.removeAllPolylines({ mapId: MAP_ID });
      await this.mapEngine.addPolyline({
        mapId: MAP_ID,
        polyline: {
          id: ROUTE_LINE_ID,
          coordinates,
          color: "#2879df",
          width: 7,
        },
      });
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
      this.routeError.set("mapRouteRenderFailed");
    }
  }

  private async restoreMapOverlays(): Promise<void> {
    this.locationMarkerAdded = false;
    this.destinationMarkerAdded = false;
    this.trafficOverlayInitialized = false;
    await this.initializeTrafficOverlay();
    await this.restoreLocationMarker();
    const destination = this.routeDestination();
    if (destination) {
      await this.mapEngine.addMarker({
        mapId: MAP_ID,
        marker: {
          id: DESTINATION_MARKER_ID,
          coordinates: {
            latitude: destination.lat,
            longitude: destination.lng,
          },
          iconUrl: DESTINATION_MARKER_ICON,
          iconAnchor: MarkerIconAnchor.Bottom,
          iconSize: { width: 30, height: 38 },
        },
      });
      this.destinationMarkerAdded = true;
    }
    const route = this.navigationRoute();
    if (route) {
      await this.renderRoute(route);
    }
    await this.renderCommunityMarkers();
  }

  private async destroyMap(): Promise<void> {
    if (!this.mapCreated) {
      return;
    }

    this.mapCreated = false;
    this.trafficOverlayInitialized = false;
    this.locationMarkerAdded = false;
    this.destinationMarkerAdded = false;
    this.communityMarkerIds.clear();
    if (this.mapClickHandle) {
      try {
        await this.mapClickHandle.remove();
      } catch {
        console.error("Could not remove the map click listener.");
      }
      this.mapClickHandle = null;
    }
    try {
      await this.mapEngine.destroyMap(MAP_ID);
    } catch {
      console.error("Could not release the map view.");
    }
  }

  private async initializeTrafficOverlay(): Promise<void> {
    if (this.trafficOverlayInitialized) {
      return;
    }

    let sourceAdded = false;
    try {
      await this.mapEngine.addGeoJsonSource(createEmptyTrafficSource(MAP_ID));
      sourceAdded = true;
      await this.mapEngine.addLayer(createTrafficFlowLayer(MAP_ID));
      this.trafficOverlayInitialized = true;
    } catch {
      console.error(
        "Could not initialize the optional provider traffic layer.",
      );
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

  private async restoreLocationMarker(): Promise<void> {
    if (this.lastPosition) {
      await this.updateLocation(this.lastPosition);
    }
  }

  private async renderCommunityMarkers(): Promise<void> {
    for (const markerId of this.communityMarkerIds) {
      await this.mapEngine.removeMarkerById({ mapId: MAP_ID, markerId });
    }
    this.communityMarkerIds.clear();

    for (const report of this.communityReports()) {
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
  }

  private handleStyleChangeFailure(night: boolean): void {
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

function closestRouteProgress(
  point: [number, number],
  coordinates: Array<[number, number]>,
  cumulativeMeters: number[],
  minimumSegment: number,
): {
  segmentIndex: number;
  progressMeters: number;
  distanceMeters: number;
} | null {
  let closest: {
    segmentIndex: number;
    progressMeters: number;
    distanceMeters: number;
  } | null = null;
  const latitudeRadians = (point[1] * Math.PI) / 180;
  const longitudeScale = Math.cos(latitudeRadians);
  const pointX = point[0] * longitudeScale;
  const pointY = point[1];

  for (
    let segmentIndex = Math.max(0, minimumSegment);
    segmentIndex < coordinates.length - 1;
    segmentIndex += 1
  ) {
    const start = coordinates[segmentIndex];
    const end = coordinates[segmentIndex + 1];
    const startX = start[0] * longitudeScale;
    const endX = end[0] * longitudeScale;
    const segmentX = endX - startX;
    const segmentY = end[1] - start[1];
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    const fraction =
      segmentLengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((pointX - startX) * segmentX + (pointY - start[1]) * segmentY) /
                segmentLengthSquared,
            ),
          );
    const projected: [number, number] = [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ];
    const distanceMeters = distanceBetweenCoordinates(point, projected);
    if (!closest || distanceMeters < closest.distanceMeters) {
      closest = {
        segmentIndex,
        progressMeters:
          cumulativeMeters[segmentIndex] +
          (cumulativeMeters[segmentIndex + 1] -
            cumulativeMeters[segmentIndex]) *
            fraction,
        distanceMeters,
      };
    }
  }
  return closest;
}

function distanceBetweenCoordinates(
  first: [number, number],
  second: [number, number],
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDifference = ((second[1] - first[1]) * Math.PI) / 180;
  const longitudeDifference = ((second[0] - first[0]) * Math.PI) / 180;
  const firstLatitude = (first[1] * Math.PI) / 180;
  const secondLatitude = (second[1] * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
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
