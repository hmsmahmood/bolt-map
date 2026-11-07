import type {
  AddGeoJsonSourceOptions,
  AddLayerOptions,
} from "@capawesome/capacitor-maplibre";
import { LayerType } from "@capawesome/capacitor-maplibre";

export const TRAFFIC_SOURCE_ID = "gng-provider-traffic";
export const TRAFFIC_LAYER_ID = "gng-provider-traffic-flow";

export function createEmptyTrafficSource(
  mapId: string,
): AddGeoJsonSourceOptions {
  return {
    mapId,
    sourceId: TRAFFIC_SOURCE_ID,
    data: {
      type: "FeatureCollection",
      features: [],
    },
  };
}

export function createTrafficFlowLayer(mapId: string): AddLayerOptions {
  return {
    mapId,
    layerId: TRAFFIC_LAYER_ID,
    sourceId: TRAFFIC_SOURCE_ID,
    type: LayerType.Line,
    belowLayerId: "street-labels",
    filter: [
      "in",
      ["get", "traffic_class"],
      ["literal", ["free_flow", "moderate", "heavy", "severe"]],
    ],
    paint: {
      lineColor: [
        "match",
        ["get", "traffic_class"],
        "free_flow",
        "#26864f",
        "moderate",
        "#e3a321",
        "heavy",
        "#cf3c35",
        "severe",
        "#781d28",
        "#00000000",
      ],
      lineWidth: ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 5],
      lineOpacity: 0.85,
    },
  };
}
