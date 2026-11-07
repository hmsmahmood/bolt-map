# Go 'n Go Phase 5 — Malaysia Traffic Provider Research

**Reviewed:** 2026-11-05  
**Decision status:** Research and MapLibre rendering proof of concept only. No provider selected for production, account created, credentials obtained, paid service activated, or live traffic data requested.

## Executive summary

TomTom Orbis Traffic API is the recommended **first candidate for a credentialed evaluation**, not an approved production provider. Its current documentation lists Malaysia for both flow and incident traffic and offers vector traffic tiles that appear technically compatible with the existing MapLibre renderer. The documentation does not establish coverage quality on any particular Malaysian road, including PLUS, nor does the public pricing page establish a usable production price for the exact traffic endpoints.

Before any provider is selected, obtain written confirmation of commercial and MapLibre display rights, caching and redistribution limits, processing locations, retention, subprocessors, security terms, traffic-specific price/quota, and vehicle-use permissions. Test real data in Kuala Lumpur, Selangor, PLUS corridors, Johor, Penang, Perak, Negeri Sembilan, and Melaka using approved credentials. No provider is currently configured in the app.

## Provider comparison

| Provider                          | Documented capabilities and freshness                                                                                                                                                                                                                                                         | Malaysia evidence and limits                                                                                                                                                                                                                                                                                                                            | Licensing, privacy, and suitability                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **HERE Traffic API v7**           | Flow segments describe speed/congestion; incidents describe traffic-affecting events. HERE states flow refreshes every minute and incidents every two minutes.                                                                                                                                | HERE's coverage table lists **“Malaysia - Kuala Lumpur and Johor Bahru”** for flow and incidents. It does not separately name Selangor, PLUS, Penang, Perak, Negeri Sembilan, or Melaka. The flow cell includes a coverage qualifier (`*`); its exact implications must be confirmed. These are product coverage statements, not measured completeness. | Pricing, caching, commercial display rights, data-processing locations, and Malaysia-specific transfer terms require product/order-form review. No motorcycle/truck traffic coverage or restriction data was established.                                                                                                                        |
| **TomTom Traffic API / Orbis v2** | Real-time flow provides current/free-flow speed and quality; incident services provide jams and incidents. Orbis v2 supports vector/raster flow and incident tiles. The reviewed documentation calls it real time but does not state a guaranteed Malaysia update interval.                   | The Orbis market table lists **Malaysia** for both flow and incidents, at country level. It does not publish coverage density or PLUS/city corridor guarantees.                                                                                                                                                                                         | TomTom recommends Orbis for new integrations. Public pricing describes freemium and pay-as-you-grow plans, but the reviewed page did not establish the exact quota and billable price for the traffic endpoints planned here. Obtain traffic-specific caching, attribution, MapLibre display, commercial, DPA, residency, and vehicle-use terms. |
| **Mapbox Traffic**                | Traffic v1 includes congestion classes `low`, `moderate`, `heavy`, `severe` and closure status. The tileset reference says speed/density inputs update approximately every eight minutes. Separate Traffic Data documentation defines live speeds as observations within the last 15 minutes. | Documentation describes the service globally but does not provide a Malaysia, city, or PLUS coverage table. Local data density and freshness are unverified.                                                                                                                                                                                            | Traffic Data requires a separate license and sales contact. Mapbox's pricing page requires a Commercial Application License for vehicle use. Verify MapLibre/non-Mapbox display rights, required attribution, caching, DPA, location processing and cost before considering it.                                                                  |
| **Google Maps traffic services**  | Traffic Layer is available on supported Google Maps Platform maps; Routes API supports traffic-aware routing and traffic-aware polylines. Traffic-aware Routes requests use higher-priced SKUs than traffic-unaware requests.                                                                 | The Google coverage table marks the Malaysia Traffic Layer as available at country level; it provides no PLUS or corridor-level quality evidence.                                                                                                                                                                                                       | Google's traffic layer is tied to Google Maps Platform terms and is not an appropriate overlay for the existing MapLibre map: Google terms restrict use with non-Google maps. Do not mix it into this app or change Valhalla to Google routing under this phase. Pricing is SKU/usage dependent.                                                 |

Coverage tables do not establish that traffic is present on every road or that incident feeds are complete. No provider documents specific, verifiable PLUS Expressway coverage in the sources reviewed. The required Malaysia corridor evaluation therefore remains open.

### Provider and vehicle separation

Provider flow is road-segment traffic information, not a vehicle profile or road-restriction authority. No provider-specific evidence was established for motorcycle suitability, motorcycle traffic density, truck restrictions, Malaysian tolls, or vehicle-dimension-aware traffic. Do not infer these from generic flow data.

Valhalla remains the sole route calculator. This phase does not inject external traffic into Valhalla, alter its ETA, select alternatives, or trigger reroutes. Any future route impact would need separate compatibility, licensing, and measurable-benefit approval.

## Cost scenarios

No responsible USD estimate can be given yet: the selected traffic endpoint, its billable unit, current quota, overage price, cache rights, contract tier, and exchange/tax treatment are unknown. No subscription has been activated.

For budgeting only, the following **request-volume scenario** assumes 10 map sessions per monthly user, 20 minutes per session, three viewport snapshots per session (roughly one per eight minutes), and 20 traffic tile requests per snapshot. It assumes no shared cache hits and excludes additional panning/zooming:

| Monthly users | Scenario traffic tile requests | USD estimate                                                    |
| ------------: | -----------------------------: | --------------------------------------------------------------- |
|           100 |                         60,000 | Not estimable until traffic-specific pricing/quota is confirmed |
|         1,000 |                        600,000 | Not estimable until traffic-specific pricing/quota is confirmed |
|        10,000 |                      6,000,000 | Not estimable until traffic-specific pricing/quota is confirmed |

Formula: `users × 10 sessions × 3 snapshots × 20 tile requests`. These are scenario volumes, not forecasts or provider quotas. A commercial quote and representative measured map-session request counts are needed to calculate cost.

## Data sovereignty and governance assessment

- Any hosted traffic request leaves the approved Go 'n Go backend environment and is processed by the chosen provider. Even without sending a GPS coordinate or account identifier, requested tile coordinates and request timing reveal an approximate displayed area.
- The proposed design sends no continuous GPS, trip history, user ID, vehicle profile, or Valhalla route to the traffic provider. Only a coarse requested map area should be forwarded. Do not include location in logs, analytics, URLs visible to user-facing telemetry, or provider headers.
- Provider legal entity, actual processing/storage regions, subprocessors, retention, support access, security certifications, breach terms, and transfer safeguards were not verified. Malaysia hosting of the app/backend alone does not establish data sovereignty or PDPA compliance.
- Assess any cross-border personal-data transfer under Act 709 as amended, including section 129 and the Commissioner's 2025 Cross-Border Personal Data Transfer Guidelines. Obtain Malaysian counsel's assessment and vendor-specific transfer terms before transmitting location-inferable requests.
- Do not cache or redistribute vendor data until the exact endpoint's commercial terms expressly permit the proposed server/device cache and expiry. Respect provider freshness metadata and return source/observation time; never represent stale data as live.
- No official road authority feed is integrated. Provider incidents are third-party/provider data; community incidents remain user-generated and explicitly unverified. Neither source is an official road closure or government notice.
- Review current privacy notices and complete a location-data DPIA before production use. This document is engineering research, not a legal opinion, certification, or government approval.

## Technical proof of concept and architecture

The Go 'n Go mobile app already uses `@capawesome/capacitor-maplibre`. Its installed Android, iOS, and web plugin APIs expose runtime GeoJSON sources and styled line layers. A small MapLibre proof of concept now initializes an **empty** provider-flow source and a line layer independent from route polylines and community-report markers. The layer accepts only explicit `free_flow`, `moderate`, `heavy`, or `severe` provider classifications; it does not synthesize traffic data. Severe styling appears only for an explicitly supplied severe class.

The prototype has no provider URL, API key, backend endpoint, or traffic payload. The UI continues to state that live traffic is not connected. Thus it verifies the renderer boundary and class styling only; it is **not live-traffic integration** and does not verify provider availability, credentials, rates, freshness, caching, Kuala Lumpur, highways, or mobile network performance.

Proposed production flow, contingent on approval:

1. Mobile requests traffic for visible tile coordinates or a bounded viewport through an authenticated, rate-limited SMARTROUTE endpoint. It never sends continuous GPS.
2. A NestJS traffic module calls a provider-neutral adapter. The provider key and outbound request remain backend-only; the provider receives only the minimum area request, not the user or vehicle identity.
3. Validate provider responses and normalize to a small GeoJSON schema containing provider source, observed/fetched time, geometry, and provider-supplied traffic class. Preserve provider incidents separately from flow.
4. Cache only if provider licensing permits; apply a documented short TTL, freshness checks, response-size limits, timeouts, rate limits, and outage handling. Do not turn stale data into a current-looking overlay.
5. Mobile updates the independent MapLibre GeoJSON source. The UI labels provider traffic and its timestamp. Valhalla routes and SMARTROUTE community incidents remain separate sources; official road notices require a distinct approved feed.

The current NestJS setup has a shared rate-limit service and the mobile MapLibre plugin supports updating a GeoJSON source. A production backend adapter, provider request/response normalization, UI freshness/source label, cache, limits, and outage behavior are not implemented.

## Verification matrix

| Requirement                                                               | Result                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Provider documentation comparison                                         | Completed from public documentation; see source links below             |
| Empty overlay and severity styling                                        | Automated-tested in the mobile suite                                    |
| Actual provider availability / invalid credentials / provider rate limits | Not tested; no provider credentials                                     |
| Network outage / stale response / empty provider response                 | Not tested against a provider; no backend adapter                       |
| Kuala Lumpur / PLUS / highway coverage                                    | Not tested; official tables are not corridor-quality evidence           |
| Cache expiry                                                              | Not implemented or tested; license terms are unresolved                 |
| Mobile map performance with traffic payload                               | Not tested; POC source is empty                                         |
| Valhalla, auth, vehicle profiles, community reporting                     | No behavior changes intended; production integration is not implemented |

## Primary sources

- [HERE Traffic API — Real-Time Traffic](https://docs.here.com/traffic-api/docs/real-time-traffic-here-traffic-api-v7-concepts)
- [HERE Traffic API — Coverage](https://docs.here.com/traffic-api/docs/traffic-here-traffic-api-v7-coverage-information)
- [TomTom Traffic API — Orbis v2 introduction](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/product-information/introduction)
- [TomTom Traffic API — Orbis v2 market coverage](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/product-information/market-coverage)
- [TomTom pricing](https://docs.tomtom.com/pricing)
- [Mapbox Traffic v1 tileset](https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/)
- [Mapbox Traffic Data](https://docs.mapbox.com/data/traffic/guides/)
- [Mapbox pricing and commercial application license](https://www.mapbox.com/pricing)
- [Google Maps Platform coverage](https://developers.google.com/maps/coverage)
- [Google Routes API traffic preferences](https://developers.google.com/maps/documentation/routes/config_trade_offs)
- [Google Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms)
- [Malaysia Personal Data Protection (Amendment) Act 2024, Act A1727](https://www.pdp.gov.my/wp-content/uploads/2024/11/Act-A1727.pdf)
- [Malaysia PDPA Cross-Border Personal Data Transfer Guidelines](https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-guidelines-on-cross-border-transfer-of-personal-data-cbpdt/)
