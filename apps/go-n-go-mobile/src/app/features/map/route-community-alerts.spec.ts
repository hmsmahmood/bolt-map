import {
  MAX_ROUTE_ALERT_COORDINATES,
  ROUTE_ALERT_CORRIDOR_METERS,
  selectRouteCommunityAlerts,
} from "./route-community-alerts";
import type { CommunityIncident } from "../../core/api/community-incident.model";

describe("selectRouteCommunityAlerts", () => {
  const now = Date.parse("2026-11-15T00:00:00.000Z");
  const route: Array<[number, number]> = [
    [101.6869, 3.139],
    [101.703, 3.148],
    [101.72, 3.157],
  ];
  const cumulative = [0, 2000, 4000];
  const report = (
    id: string,
    lng: number,
    type: CommunityIncident["type"] = "accident",
    expiresAt = "2026-11-15T01:00:00.000Z",
  ): CommunityIncident => ({
    id,
    type,
    lat:
      lng <= 101.703
        ? 3.139 + ((lng - 101.6869) / (101.703 - 101.6869)) * 0.009
        : 3.148 + ((lng - 101.703) / (101.72 - 101.703)) * 0.009,
    lng,
    createdAt: "2026-11-14T23:52:00.000Z",
    expiresAt,
    confirmations: 1,
    clears: 0,
    confidence: "unconfirmed",
    source: "community_report",
    isMine: false,
  });

  it("selects different categories ahead and orders them by route distance", () => {
    const alerts = selectRouteCommunityAlerts(
      [
        report("closure", 101.709, "road_closure"),
        report("accident", 101.703, "accident"),
        report("hazard", 101.705, "road_hazard"),
        report("breakdown", 101.707, "breakdown"),
        report("congestion", 101.711, "congestion"),
      ],
      route,
      cumulative,
      1000,
      0,
      now,
    );

    expect(alerts.map(({ type }) => type)).toEqual([
      "accident",
      "road_hazard",
      "breakdown",
      "road_closure",
      "congestion",
    ]);
  });

  it("ignores reports behind, expired, and outside the route corridor", () => {
    const alerts = selectRouteCommunityAlerts(
      [
        report("behind", 101.695),
        report("expired", 101.703, "accident", "2026-11-14T23:59:59.000Z"),
        { ...report("off-route", 101.703), lat: 3.151 },
      ],
      route,
      cumulative,
      1500,
      0,
      now,
    );

    expect(alerts).toEqual([]);
  });

  it("returns approximate distance ahead in metres", () => {
    const alerts = selectRouteCommunityAlerts(
      [report("ahead", 101.703)],
      route,
      cumulative,
      1000,
      0,
      now,
    );

    expect(alerts[0].distanceAheadMeters).toBeGreaterThan(900);
    expect(alerts[0].distanceAheadMeters).toBeLessThan(1100);
  });

  it("returns no alerts for invalid route coordinates or excessive route size", () => {
    expect(
      selectRouteCommunityAlerts(
        [report("ahead", 101.703)],
        [[101.6869, 3.139], [181, 3.148]],
        [0, 2000],
        0,
        0,
        now,
      ),
    ).toEqual([]);

    const excessiveRoute = Array.from(
      { length: MAX_ROUTE_ALERT_COORDINATES + 1 },
      (_, index): [number, number] => [101.6 + index / 1_000_000, 3.1],
    );
    expect(
      selectRouteCommunityAlerts(
        [report("ahead", 101.703)],
        excessiveRoute,
        excessiveRoute.map((_, index) => index),
        0,
        0,
        now,
      ),
    ).toEqual([]);
  });

  it("returns no alerts for empty reports and ignores duplicate report IDs", () => {
    expect(selectRouteCommunityAlerts([], route, cumulative, 0, 0, now)).toEqual(
      [],
    );
    const duplicate = report("same", 101.703);
    expect(
      selectRouteCommunityAlerts(
        [duplicate, { ...duplicate }],
        route,
        cumulative,
        1000,
        0,
        now,
      ).length,
    ).toBe(1);
  });

  it("caps the number of route alerts", () => {
    const reports = Array.from({ length: 25 }, (_, index) =>
      report(`report-${index}`, 101.703 + index / 10000),
    );
    expect(
      selectRouteCommunityAlerts(reports, route, cumulative, 1000, 0, now)
        .length,
    ).toBe(20);
  });

  it("uses the existing community confidence without synthesizing a score", () => {
    const alerts = selectRouteCommunityAlerts(
      [{ ...report("confirmed", 101.703), confidence: "community_confirmed" }],
      route,
      cumulative,
      1000,
      0,
      now,
    );
    expect(alerts[0].confidence).toBe("community_confirmed");
  });

  it("uses the existing incident expiry timestamp to remove reports", () => {
    expect(
      selectRouteCommunityAlerts(
        [report("expired", 101.703, "accident", "invalid")],
        route,
        cumulative,
        0,
        0,
        now,
      ),
    ).toEqual([]);
    expect(ROUTE_ALERT_CORRIDOR_METERS).toBe(100);
  });
});
