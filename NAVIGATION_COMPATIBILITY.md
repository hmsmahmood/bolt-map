# Go 'n Go Navigation Compatibility Report

**Reviewed:** 2026-11-04  
**Scope:** Initial SDK compatibility review plus Navigation Phase 1 implementation verification.

**Malaysia privacy and data-governance assessment:** See [MALAYSIA_DATA_GOVERNANCE.md](./MALAYSIA_DATA_GOVERNANCE.md) for the current location flows, PDPA and Cyber Security Act review points, provider comparison, and production release gates. No third-party routing or traffic provider is approved.

**Direction selected:** MapLibre rendering with a self-hosted OSM-derived basemap, and Valhalla evaluation for vehicle routing; live traffic remains a separate provider decision. Phase 1 includes local development tiles only; production HTTPS tile hosting remains unconfigured.

## Executive assessment

The current app can host native mapping and navigation SDKs: its Android minimum (API 24) and iOS deployment target (iOS 15) are above Mapbox's published SDK minimums. However, the existing Ionic app has no map or GPS plugin, Mapbox has no official Capacitor bridge documented for its native Navigation SDK, and the Mapbox Directions API documents only automotive, walking, and bicycle profiles—not motorcycle or truck profiles.

Therefore:

- Native Mapbox Maps and Navigation integration is technically possible through custom Android and iOS Capacitor plugins, but it is not a drop-in JavaScript integration.
- Mapbox alone does not meet the stated car/motorcycle/truck routing requirement. Do not send motorcycle or truck profiles or dimensions to a car endpoint and imply restrictions are applied.
- Mapbox's current terms require a separate development license for non-production vehicle use and a commercial license for production vehicle use. Obtain written terms and Malaysia coverage confirmation before implementation or testing against a production use case.
- A provider-neutral renderer plus a backend route engine with explicit vehicle costing is the alternative worth evaluating if all three vehicle classes are mandatory. It does not provide turnkey live traffic or an out-of-the-box Waze-style native navigation experience.

**Recommendation:** Do not commit the product to Mapbox as the sole navigation and traffic provider yet. First choose whether Phase 1 is a Mapbox-native map proof of compatibility (subject to Mapbox licensing) or a provider-neutral MapLibre map foundation. Keep geocoding, routing, traffic, and community reports behind separate interfaces either way.

## Existing repository baseline

| Area | Inspected state |
|---|---|
| Mobile dependencies | Angular `21.2.26`, Ionic `8.8.19`, Capacitor Core/Android/iOS `8.6.0`; verified from the Go 'n Go workspace package manifest and resolved workspace dependencies. |
| Android | Capacitor minimum API 24; app `minSdkVersion 24`, `compileSdkVersion 36`, `targetSdkVersion 36`; Android Gradle Plugin `8.13.0`, Gradle wrapper `8.14.3`. |
| iOS | Xcode project deployment target is iOS 15.0. The project currently sets `SWIFT_VERSION = 5.0`; the current Mapbox iOS SDK documentation requires Swift 5.9 or later. |
| Maps/GPS | Phase 1 now uses Capawesome MapLibre 0.2.3, MapLibre GL JS 6.16.x, and Capacitor Geolocation 8.2.4; the map screen is lazy-loaded. |
| Backend routing | The existing OSRM adapter calls the `driving` route/table endpoints. The route optimizer returns an estimate if no road provider is configured; it does not implement turn-by-turn guidance, traffic, geocoding, or vehicle-specific restrictions. |
| Native validation | This review environment is Windows. An iOS/Xcode build cannot be run here; Android SDK/device support and physical-device navigation have not been verified. |

Repository references: [Go 'n Go package manifest](./apps/go-n-go-mobile/package.json), [Capacitor config](./apps/go-n-go-mobile/capacitor.config.ts), [Android SDK variables](./apps/go-n-go-mobile/android/variables.gradle), [Android app Gradle file](./apps/go-n-go-mobile/android/app/build.gradle), [Android root Gradle file](./apps/go-n-go-mobile/android/build.gradle), [iOS Xcode project](./apps/go-n-go-mobile/ios/App/App.xcodeproj/project.pbxproj), [OSRM adapter](./apps/backend-api/src/optimization/road-routing.provider.ts), and [route optimizer](./apps/backend-api/src/optimization/route-optimization.service.ts).

## SDK and Capacitor compatibility

Versions below are the latest versions shown in the vendor documentation reviewed on the report date; they are **not installed or pinned in this repository**.

| Component | Published compatibility | Fit with this app | Integration note |
|---|---|---|---|
| Mapbox Maps Android | Maps SDK `11.34.2`; Android SDK/API 21+, OpenGL ES 3, Java 8+; NDK 23 by default or NDK 27 artifacts for 16 KB page support. | App minimum API 24 exceeds the SDK minimum; existing compile/target SDK are 36. | Native Android dependency and plugin bridge required for the native SDK. |
| Mapbox Maps iOS | Maps SDK `11.34.2`; iOS 14+; Xcode 16+ and Swift 5.9+ for v11. | iOS 15 target exceeds the OS minimum. The existing Swift 5.0 setting must be checked/updated as required; this needs Xcode validation. | Integrates through native iOS project/package configuration and a Capacitor plugin. |
| Mapbox Navigation Android | Navigation SDK `3.34.2`; Android SDK/API 21+, Kotlin 1.7+; Java 8 compatibility; NDK constraints as above. | OS/API minimum fits. Existing Gradle/AGP versions appear modern, but a real Gradle dependency resolution and native build are required before declaring compatibility. | The Kotlin/Java SDK must be bridged to Ionic; a JS map package does not provide this SDK. |
| Mapbox Navigation iOS | Navigation SDK `3.34.1`; iOS 14+; Swift 5.9+ and Xcode 15+ per the current guide. | iOS target fits; the repository's Swift setting and the installed Xcode/native package graph remain unverified. | Native Swift bridge required. Background guidance requires native location/audio capabilities and permission UX. |
| Capacitor | Capacitor `8.6.0`; Android API 24+ per Capacitor documentation. | The project's minimum matches Capacitor's documented minimum. | Capacitor supports custom native plugins, which is the fallback integration route for SDKs without a Capacitor wrapper. |

Official references: [Mapbox Maps Android](https://docs.mapbox.com/android/maps/guides/), [Mapbox Maps iOS](https://docs.mapbox.com/ios/maps/guides/), [Mapbox Navigation Android](https://docs.mapbox.com/android/navigation/guides/), [Mapbox Navigation iOS](https://docs.mapbox.com/ios/navigation/guides/), and [Capacitor Android support](https://capacitorjs.com/docs/android).

### Capacitor plugin finding

The reviewed Mapbox documentation provides native Android and iOS SDK installation guides, but no official Capacitor plugin or supported Capacitor integration. A browser-based Mapbox GL JS integration would render a web map in the Capacitor WebView; it would **not** expose the native Navigation SDK, background navigation service, native dead reckoning, or voice engine. A native Mapbox implementation therefore requires custom Capacitor plugins with separate Kotlin/Java and Swift work, lifecycle handling, event streaming, permissions, and native build maintenance. Community wrappers should not be treated as supported until their current release activity, iOS parity, Capacitor 8 compatibility, licensing, and device behavior are independently verified.

For the selected MapLibre direction, the Capawesome MapLibre plugin is an **unofficial** native renderer for Android/iOS with a web implementation. Its published compatibility table lists active Capacitor 8 support; the app now uses plugin `0.2.3`, with peer requirements `@capacitor/core >=8.0.0` and `maplibre-gl ^6.4.1`. Its docs advertise native camera controls, heading-follow location, and route/GeoJSON layers. The package is installed, Capacitor plugin sync succeeds for Android and iOS, and the web production build and automated tests pass. A local TileServer GL 5.7.0 serves a Geofabrik Shortbread vector extract and Noto glyphs; production hosting is not configured. Native maps render behind the WebView, so the map and its ancestor backgrounds must be transparent.

## Provider separation and capability findings

| Concern | Candidate / existing state | What it does not establish |
|---|---|---|
| Map rendering | Phase 1 uses the Capacitor MapLibre plugin with MapLibre GL JS for web rendering. | A renderer does not supply geocoding, routing, live traffic, incident truth, or turn-by-turn navigation by itself. |
| Map data | Phase 1 uses Geofabrik's Malaysia-Singapore-Brunei Shortbread vector MBTiles, served locally by TileServer GL. Raw OpenStreetMap data is available under ODbL with attribution/share-alike obligations. | Local development data is not a production tile host. OpenStreetMap is not a live traffic feed or hosted routing service. Public OSM tiles/Nominatim are not a production tile/search service. |
| Geocoding/search | Mapbox Geocoding/Search APIs are candidates; requests should be routed through a provider adapter. | Mapbox's published coverage table lists Malaysia region, postcode, place, and locality coverage, but not address, district, or neighborhood coverage. That is not proof of address autocomplete quality in any target city. Temporary geocoding results may not be cached; permanent storage has separate terms. |
| Routing | Mapbox Directions is a candidate for automotive car routing; current backend has an OSRM `driving` adapter. Valhalla is a self-hostable alternative candidate. | The current Mapbox Directions API lists only `driving`, `driving-traffic`, `walking`, and `cycling`. It does not list motorcycle or truck profiles or truck dimensions. OSRM adapter is likewise driving-only. |
| Traffic | Mapbox's driving-traffic profile and traffic tiles are candidates; a separately selected HERE/TomTom service could be evaluated. | Mapbox says traffic availability is geography-dependent; its traffic tiles are refreshed approximately every eight minutes. The reviewed public sources did not verify coverage/freshness for each Malaysian target corridor. No live feed is configured in this repository. |
| Incidents/community | Existing incident entities/endpoints are not a verified live road-incident feed. A future community-report API must distinguish user reports from provider/verified information. | OSM or a basemap does not supply reliable real-time police, camera, crash, hazard, or closure reports. |

### Malaysia coverage status

The requested corridors—Kuala Lumpur, Selangor, PLUS highways, Johor, Penang, Perak, Negeri Sembilan, and Melaka—have **not** been route-probed or field-validated with a provider account. Mapbox's country-level Geocoding/Search coverage table is not a road-restriction, toll, speed-limit, traffic-quality, or motorcycle/truck-routing guarantee. No claims are made here that:

- traffic is sufficiently fresh or dense on any named Malaysian road;
- PLUS toll plazas, charges, or payment rules are complete;
- posted speed limits or legal/physical restrictions are authoritative;
- motorcycle or heavy-vehicle access restrictions are applied;
- urban GPS accuracy, lane guidance, or junction guidance meets acceptance criteria.

Before selecting a provider, run reproducible origin/destination probes and on-device drives for the target corridors, inspect route geometry/instructions and traffic annotations, compare results against authoritative Malaysian restrictions/toll sources, and get written provider confirmation for the intended license and data use. HERE and TomTom remain candidates only; their Malaysia coverage, motorcycle/truck restrictions, traffic freshness, toll data, pricing, and terms were not verified in this repository review.

## Vehicle-profile integration

Existing profiles contain car/motorcycle/truck type and optional weight, height, and length (kg/cm); they do not include vehicle width, axle load, or hazardous-material class. Do not send unsupported dimensions to a provider and represent them as enforced. For any chosen routing provider:

1. Define a typed routing request containing the profile ID and supported provider-neutral attributes.
2. Resolve and authorize the profile on the backend; never trust a client-supplied owner or vehicle dimensions.
3. Map units and only the attributes the chosen provider actually supports.
4. Reject unsupported vehicle/profile combinations explicitly rather than silently falling back to car routing.
5. Add route fixtures for the named Malaysian corridors and test restrictions against trusted local sources before release.

Valhalla is a candidate for a self-hosted route engine because its API documents costing models and the project has motorcycle/truck cost implementations. It uses map data and configuration that still require Malaysia-specific validation; it does not provide commercial live traffic, geocoding, or a turnkey Capacitor Waze UI. MapLibre can render maps but likewise does not replace a routing/navigation backend.

## Security, licensing, and operating costs

- Mapbox public runtime tokens are extractable from mobile binaries; scope/restrict them where supported, monitor usage, and rotate them. Do not embed secret download tokens. Keep build-only credentials in a developer home credential file or CI secret store, never source control.
- The Mapbox iOS installation guide documents a secret `Downloads:Read` token for package installation in its setup flow; the current stable iOS SDK repository README describes stable releases that do not require a secret token. Confirm the requirements for the exact release and delivery method before CI setup.
- Mapbox's current Terms of Service say vehicle-related applications require a separate development license for non-production use and a separate commercial license for production use. Obtain an executed order and written permission/pricing before use. The Navigation SDK also has metered-trips and unlimited-trips pricing choices; confirm total charges for SDK sessions, MAUs, directions/search requests, traffic, and support with Mapbox rather than relying on a generic free tier.
- Keep provider secrets on the backend. Apply authenticated ownership checks for saved trips/reports, rate limits and quotas for search/routing, coordinate/range validation, TLS, and location-data minimization/redaction.
- For Mapbox basemaps/traffic, retain required attribution and telemetry opt-out behavior. For raw OSM-derived data, satisfy ODbL attribution and applicable share-alike obligations. Do not assume one provider's tiles/data can be cached or redistributed under another provider's terms.

Sources: [Mapbox Navigation pricing](https://docs.mapbox.com/android/navigation/guides/pricing/), [Mapbox Terms of Service](https://www.mapbox.com/legal/tos), [Mapbox access-token guidance](https://docs.mapbox.com/help/dive-deeper/private-access-token-android-and-ios/), [Mapbox Directions profiles](https://docs.mapbox.com/api/navigation/directions/#routing-profiles), [Mapbox Geocoding coverage](https://docs.mapbox.com/help/dive-deeper/mapbox-data/), [Mapbox Traffic Data](https://docs.mapbox.com/data/traffic/guides/), [Mapbox Traffic tileset](https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/), [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright), [Valhalla API](https://valhalla.github.io/valhalla/api/route/api-reference/), and [Capacitor MapLibre plugin documentation](https://capawesome.io/docs/sdks/capacitor/maplibre/).

## Recommended implementation gates

1. Deploy an HTTPS tile host for the downloaded regional data, allow its hostname in the TileServer GL configuration, and set the production mobile `mapTileServerUrl`. The current Compose service binds to localhost only; do not use public OSM tile servers as a production host.
2. Obtain provider confirmation/account access for Malaysia traffic and target-region routing/search; record terms, retention, caching, attribution, and price limits.
3. Evaluate Valhalla for all vehicle categories against Malaysia data and restrictions. Mapbox Directions' documented profiles alone do not satisfy motorcycle/truck routing.
4. Build and test the existing map screen on Android and iOS, including GPS permission/error handling and a moving marker. Verify native lifecycle and background/foreground transitions on real devices before claiming navigation behavior.
5. A local Valhalla route preview and a foreground, on-device-progress turn-by-turn UI are implemented. The latter is not voice or background navigation. Before production, complete native compatibility checks, validate route restrictions against trusted local sources, approve provider hosting and location-data controls, and physically test Android/iOS. Keep traffic/community reports out of the map until their sources and confidence labels are explicit.

## Not verified

No Mapbox/HERE/TomTom credentials or live provider probes were used. The MapLibre and Capacitor Geolocation plugins are installed and synchronized, but no Mapbox SDK/license was added. No live traffic or Malaysian toll/restriction data was validated, and no Android/iOS native build or physical-device test was performed. The browser app and local tile endpoints were smoke-tested; a production HTTPS tile host is still required.
