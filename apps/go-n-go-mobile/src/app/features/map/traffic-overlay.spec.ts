import {
  createEmptyTrafficSource,
  createTrafficFlowLayer,
} from "./traffic-overlay";

describe("provider traffic overlay proof of concept", () => {
  it("starts empty and cannot display fabricated traffic", () => {
    expect(createEmptyTrafficSource("map-1")).toEqual({
      mapId: "map-1",
      sourceId: "gng-provider-traffic",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  });

  it("styles only explicit provider traffic classes and keeps road labels visible", () => {
    const layer = createTrafficFlowLayer("map-1");

    expect(layer).toEqual(
      jasmine.objectContaining({
        mapId: "map-1",
        layerId: "gng-provider-traffic-flow",
        sourceId: "gng-provider-traffic",
        type: "line",
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
      }),
    );
  });
});
