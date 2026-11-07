import { Injectable } from "@angular/core";
import { App } from "@capacitor/app";
import type { AppState } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type {
  CallbackID,
  PositionOptions,
  WatchPositionCallback,
} from "@capacitor/geolocation";
import { MapLibre } from "@capawesome/capacitor-maplibre";
import { setWorkerUrl } from "maplibre-gl";
import type {
  AddGeoJsonSourceOptions,
  AddLayerOptions,
  AddPolylineOptions,
  AddMarkerOptions,
  CreateMapOptions,
  FitBoundsOptions,
  GetCameraResult,
  MapClickEvent,
  RemoveAllPolylinesOptions,
  RemoveGeoJsonSourceByIdOptions,
  RemoveLayerByIdOptions,
  RemoveMarkerByIdOptions,
  SetCameraOptions,
  UpdateMarkerByIdOptions,
  UpdateGeoJsonSourceByIdOptions,
} from "@capawesome/capacitor-maplibre";

@Injectable({ providedIn: "root" })
export class MapEngineService {
  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  createMap(options: CreateMapOptions): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      setWorkerUrl(
        new URL("assets/maplibre-gl-worker.mjs", document.baseURI).href,
      );
    }
    return MapLibre.createMap(options);
  }

  destroyMap(mapId: string): Promise<void> {
    return MapLibre.destroyMap({ mapId });
  }

  setStyle(mapId: string, json: string): Promise<void> {
    return MapLibre.setStyle({ mapId, json });
  }

  addGeoJsonSource(options: AddGeoJsonSourceOptions): Promise<void> {
    return MapLibre.addGeoJsonSource(options);
  }

  updateGeoJsonSourceById(
    options: UpdateGeoJsonSourceByIdOptions,
  ): Promise<void> {
    return MapLibre.updateGeoJsonSourceById(options);
  }

  addLayer(options: AddLayerOptions): Promise<void> {
    return MapLibre.addLayer(options);
  }

  removeLayerById(options: RemoveLayerByIdOptions): Promise<void> {
    return MapLibre.removeLayerById(options);
  }

  removeGeoJsonSourceById(
    options: RemoveGeoJsonSourceByIdOptions,
  ): Promise<void> {
    return MapLibre.removeGeoJsonSourceById(options);
  }

  getCamera(mapId: string): Promise<GetCameraResult> {
    return MapLibre.getCamera({ mapId });
  }

  setCamera(options: SetCameraOptions): Promise<void> {
    return MapLibre.setCamera(options);
  }

  addMarker(options: AddMarkerOptions): Promise<void> {
    return MapLibre.addMarker(options);
  }

  updateMarker(options: UpdateMarkerByIdOptions): Promise<void> {
    return MapLibre.updateMarkerById(options);
  }

  addPolyline(options: AddPolylineOptions): Promise<void> {
    return MapLibre.addPolyline(options);
  }

  removeAllPolylines(options: RemoveAllPolylinesOptions): Promise<void> {
    return MapLibre.removeAllPolylines(options);
  }

  removeMarkerById(options: RemoveMarkerByIdOptions): Promise<void> {
    return MapLibre.removeMarkerById(options);
  }

  fitBounds(options: FitBoundsOptions): Promise<void> {
    return MapLibre.fitBounds(options);
  }

  addMapClickListener(
    listener: (event: MapClickEvent) => void,
  ): Promise<PluginListenerHandle> {
    return MapLibre.addListener("mapClick", listener);
  }

  checkLocationPermissions() {
    return Geolocation.checkPermissions();
  }

  requestLocationPermissions() {
    return Geolocation.requestPermissions({ permissions: ["location"] });
  }

  getCurrentPosition(options?: PositionOptions) {
    return Geolocation.getCurrentPosition(options);
  }

  watchPosition(
    options: PositionOptions,
    callback: WatchPositionCallback,
  ): Promise<CallbackID> {
    return Geolocation.watchPosition(options, callback);
  }

  clearWatch(id: CallbackID): Promise<void> {
    return Geolocation.clearWatch({ id });
  }

  addAppStateListener(
    listener: (state: AppState) => void,
  ): Promise<PluginListenerHandle> {
    return App.addListener("appStateChange", listener);
  }
}
