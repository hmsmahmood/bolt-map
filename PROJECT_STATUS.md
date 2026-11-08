# Go 'n Go — Project Status

**Product:** Go 'n Go, powered by SMARTROUTE AI  
**Status:** Authentication, vehicle profiles, navigation Phases 1–3, community-reporting Phase 4, and the Phase 8 subscription foundation are implemented and automated-tested. Production database controls, store setup, and native-device verification remain pending.
**Scope:** Go 'n Go supports route preview, foreground guidance, and authenticated community-submitted road reports. Provider-fed live traffic, police-location reports, and production mobility data integrations are not implemented.

## Phase 0 summary

The repository began as a SMARTROUTE AI web/API foundation rather than the specified Go 'n Go mobile product. It contains an Angular admin dashboard, separate Angular driver and rider web shells, and a NestJS API. Those existing driver/rider shells remain non-Ionic web apps; Go 'n Go now has its own Ionic/Capacitor application and native scaffolds.

The architecture below introduces one new cross-platform Go 'n Go application while retaining the existing web apps and backend. The Phase 2 authentication additions are identified below; other proposed mobile API routes remain contracts to implement in later phases, not endpoints that exist today.

## Repository baseline

| Area                | Verified today                                                                                                                | Phase 0 finding                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace           | npm workspaces for `apps/*`; `libs/` is empty                                                                                 | No shared API-contract library exists yet.                                                                                                                       |
| Admin               | `apps/admin-web`, Angular 18; locked Angular Core is 18.2.14                                                                  | Retain as the web administration surface.                                                                                                                        |
| Driver and rider    | `apps/driver-mobile` and `apps/rider-mobile`, Angular 18 shells                                                               | These are separate web experiences, not a unified cross-platform Go 'n Go app. Do not repurpose them as car/motorcycle/truck apps.                               |
| Ionic and Capacitor | Go 'n Go uses Ionic 8.8.19 and Capacitor 8.6.0 with Angular Core 21.2.26                                                      | The installed Node 22 runtime satisfies Capacitor 8's Node >=22 requirement.                                                                                     |
| Native projects     | Capacitor Android and iOS project scaffolds exist under `apps/go-n-go-mobile/`                                                | Android SDK is not installed/configured in this environment; iOS compilation and signing require macOS/Xcode.                                                    |
| Backend             | NestJS 11 API in `apps/backend-api`; Swagger at `/docs`                                                                       | REST API exists but is not yet a complete mobility product API.                                                                                                  |
| Data                | PostgreSQL/PostGIS schema and TypeORM entities for users, refresh tokens, fleet vehicles, routes, incidents, and flood alerts | No personal vehicle profiles, subscriptions, entitlement records, or AI usage records are defined.                                                               |
| Infrastructure      | Compose defines PostgreSQL/PostGIS 16-3.5, Redis 7, and optional OSRM                                                         | OSRM requires a local Malaysia map extract and is not enabled by default.                                                                                        |
| Routing             | `OsrmRoutingProvider` calls OSRM driving route/table endpoints; route steps are disabled                                      | This supports road distance/duration/geometry for a driving profile, not verified motorcycle/truck restrictions, traffic, turn instructions, or offline routing. |
| AI and real-time    | No AI provider/service or WebSocket gateway was found in the backend source                                                   | AI recommendations, live updates, and AI tool authorization are not implemented.                                                                                 |
| Test/build setup    | Backend Jest tests and Angular build/test scripts exist                                                                       | Feature acceptance must include tests and native-device validation in later phases.                                                                              |

## Phase 1 implementation

Created `apps/go-n-go-mobile/` as the single Go 'n Go application without changing or repurposing the existing admin, driver, or rider applications.

- Ionic 8 + Angular 18 standalone application, lazy home route, responsive light/dark theme, and accessible status/error states.
- Localization framework and initial English, Bahasa Malaysia, and Tamil strings; locale selection persists in local storage.
- Typed `ApiService` health check for the existing public `GET /api/health` endpoint. Development serves on port 4203 and proxies `/api` to the backend on port 3000.
- Production API base is deliberately unconfigured because no production API host has been selected. Native/emulator builds need a device-reachable HTTPS API origin; the browser dev proxy is not suitable for a native WebView.
- Capacitor 8.6.0 config and Android/iOS native project scaffolds have been generated. `com.smartroute.gonngo` is provisional and must be confirmed before store registration.
- Root build/start scripts, README instructions, and ignore rules for generated build output and signing credentials were added.
- Verified: production web build succeeds; 3 Angular unit tests pass; both Capacitor platform scaffolds and `cap sync` complete. A browser smoke check renders the app and surfaces the backend-unavailable state as designed.
- At the end of Phase 1, the initial production bundle measured 767.54 kB raw (about 171 kB estimated transfer). The initial-chunk warning budget was 850 kB with a 1 MB error ceiling; re-evaluate after feature work and keep later feature bundles lazy-loaded.
- Not verified: Android Gradle build/device run (Android SDK unavailable), iOS build/signing/device run (requires macOS/Xcode), and live API success (backend/database were not running during the browser check).
- At Phase 1 install, npm reported a NestJS/Swagger peer mismatch; Phase 2 corrected backend versions to Swagger 7 and TypeORM 0.3. The latest install reported 62 audit findings (8 low, 45 moderate, 9 high); no automatic audit fixes were applied.

## Phase 2 authentication implementation

- The existing NestJS/TypeORM/PostgreSQL architecture was retained; no Prisma schema exists. SQL migration `database/migrations/002_authentication_security.sql` adds the account, verification, recovery, OTP/MFA, profile, security-event, session, and rate-limit schema. Existing accounts are kept verified for compatibility.
- Registration validates required fields, Malaysian/international phone formats, password strength, confirmation, and terms acceptance; it creates Argon2id password hashes and sends single-use email-verification links. Unverified users cannot use protected features.
- Login uses short-lived access JWTs, persisted hashed refresh tokens, transactional refresh rotation, reuse detection, session revocation, and password-change/reset invalidation. Login attempts are limited to five per account/IP in 15 minutes, with progressive lockouts. Auth throttling uses Redis when `REDIS_URL` is set and PostgreSQL otherwise; both backends share state across instances.
- Email OTP MFA supports login and enabling/disabling email MFA, with 5-minute expiry, single-use codes, attempt limits, request rate limiting, and resend cooldowns. Password recovery uses hashed single-use expiring tokens and returns a generic unknown-account response.
- Nest validation, Helmet, production CORS requirements, authentication/role guards, and periodic expiration cleanup are wired. SMTP, `AUTH_PUBLIC_URL`, a stable production `JWT_SECRET`, production CORS origins, and the database migration must be configured before production use.
- The mobile app has localized registration, verification/resend, OTP, recovery/reset, password change, account security/session management, and logout screens. Native refresh credentials use Keychain/Keystore-backed storage; web sessions remain memory-only.
- Final authentication cleanup makes duplicate-registration responses generic and serializes refresh-token rotation with a transaction row lock; web tests use a platform-specific no-op adapter rather than invoking the native storage plugin lifecycle.
- Verified: backend production build; all 7 backend Jest suites / 35 tests; Go 'n Go production build; all 19 mobile unit tests; and the migration applied and rerun successfully on the disposable PostgreSQL database.
- The separate admin, driver, and rider Angular test targets could not run because their `tsconfig.spec.json` files match no spec inputs (`TS18003`); those unrelated apps were not modified.
- API smoke check: health returned 200; invalid registration was rejected with 400; five invalid logins returned 401 and the sixth returned 429 with `Retry-After: 900`; three password-reset requests returned the same generic 202 response and the fourth returned 429 with `Retry-After: 3600`. CORS and Helmet security headers were present. PostgreSQL-backed rate limiting was exercised against the running API.
- The production web bundle is 874.59 kB raw (188.94 kB estimated transfer); its warning budget was adjusted to 860 kB and the build completes without warnings. TypeORM SQL logging is disabled to avoid logging credential-bearing parameters.
- Installed `nodemailer`, `@types/nodemailer`, `helmet`, and `redis`; at that phase, backend Swagger and TypeORM versions were aligned with NestJS 10. The dependency install then reported 62 audit findings (8 low, 45 moderate, 9 high); no automatic audit fixes were applied.
- Not verified: end-to-end email delivery (SMTP credentials are not configured), live Redis operation (port 6379 was unavailable; PostgreSQL fallback was exercised and the Redis branch is unit-tested with a mock), and physical Android/iOS builds or Keychain/Keystore restart behavior. SMS/authenticator-app MFA and vehicle-aware navigation remain future work.

## Phase 3 vehicle profiles

- Added a user-owned `vehicle_profiles` model and idempotent SQL migration `database/migrations/003_vehicle_profiles.sql`. Profiles support cars, motorcycles, and trucks, with optional model year, registration number, and metric weight/height/length constraints.
- Added authenticated owner-scoped CRUD under `/api/v1/vehicle-profiles`. Every list, update, and delete is scoped to the authenticated user; server validation and database checks constrain categories, lengths, and dimensions.
- Added a localized, lazy-loaded Go 'n Go vehicle profile screen with create, list, update, confirmed delete, and optional capability fields. These profiles are not yet wired into route planning.
- Verified: backend production build and all 12 Jest suites / 53 tests; Go 'n Go production build and all 26 mobile tests; `npm audit --omit=dev` reports zero vulnerabilities. Migration 003 was applied and rerun successfully against the local disposable PostgreSQL database on port 5433, and its columns/index were confirmed.
- The mobile production build still warns that the 892.14 kB initial bundle exceeds its 860 kB warning budget by 32.14 kB. Vehicle profiles are route-lazy-loaded (13.22 kB chunk); reducing the existing initial bundle remains follow-up work. Physical Android/iOS device verification was not performed.

### Current backend endpoints

The controller currently exposes unversioned routes under `/api`:

| Existing route                                                                                        | Current purpose and constraints                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                                                                     | Health/status response.                                                                                                                                                               |
| `POST /api/auth/register`                                                                             | Creates an unverified rider account and sends a verification email.                                                                                                                   |
| `POST /api/auth/verify-email`, `POST /api/auth/verify-email/resend`                                   | Verify a single-use token or resend a link without disclosing account existence.                                                                                                      |
| `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`                             | Password login, refresh rotation, and refresh-session revocation. Login may require email OTP.                                                                                        |
| `POST /api/auth/mfa/verify`, `POST /api/auth/mfa/resend`                                              | Verify/resend email OTP for login or MFA configuration.                                                                                                                               |
| `POST /api/auth/password/forgot`, `POST /api/auth/password/reset`, `POST /api/auth/password/change`   | Recovery and password changes; reset/change revoke sessions.                                                                                                                          |
| `GET /api/auth/mfa/status`, `POST /api/auth/mfa/enable/request`, `POST /api/auth/mfa/disable/request` | Manage email OTP MFA for the authenticated account.                                                                                                                                   |
| `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`, `POST /api/auth/logout-all`                | List/revoke sessions without returning token material.                                                                                                                                |
| `GET /api/dashboard/summary`                                                                          | Fleet/operations dashboard; role-restricted.                                                                                                                                          |
| `GET /api/dashboard/routes`                                                                           | Operations routes; role-restricted.                                                                                                                                                   |
| `GET /api/dashboard/incidents`                                                                        | Incident list; authenticated.                                                                                                                                                         |
| `GET /api/dashboard/fleet`                                                                            | Fleet list; role-restricted.                                                                                                                                                          |
| `GET /api/navigation/overview`                                                                        | Operations navigation summary; role-restricted.                                                                                                                                       |
| `POST /api/navigation/plan`                                                                           | Accepts `{ origin: { lat, lng }, waypoints: [{ lat, lng, label? }] }`; no vehicle profile or restriction input. Uses a greedy stop-ordering heuristic, not a globally optimal solver. |
| `GET /api/v1/vehicle-profiles`                                                                        | List vehicle profiles belonging to the authenticated user.                                                                                                                            |
| `POST /api/v1/vehicle-profiles`                                                                       | Create an authenticated user’s car, motorcycle, or truck profile.                                                                                                                     |
| `PATCH /api/v1/vehicle-profiles/:id`, `DELETE /api/v1/vehicle-profiles/:id`                           | Update or delete a profile only when it belongs to the authenticated user.                                                                                                            |
| `GET /api/flood/intelligence`                                                                         | Operations flood summary; role-restricted.                                                                                                                                            |
| `GET /api/safety/signals`                                                                             | Operations safety signals; role-restricted.                                                                                                                                           |
| `GET /api/admin/overview`                                                                             | Administrative metrics; role-restricted.                                                                                                                                              |

Swagger documents the current API. Operations endpoints still contain in-memory demonstration data; those responses must not be presented as live or used as production navigation/safety data. Preserve existing routes for web clients while developing a versioned mobile contract.

## Proposed Go 'n Go architecture

Create one app at `apps/go-n-go-mobile/` using Ionic + Angular + Capacitor. Keep app UI, domain logic, platform access, and API access separated:

- `core/`: typed API client, authentication/session lifecycle, secure credential storage, permissions, location, connectivity, notifications, and subscription entitlement access.
- `features/`: onboarding, navigation, vehicle profiles, search, traffic/safety/flood, community reports, offline, calculators, subscriptions, and settings. Add features incrementally as their dependencies and contracts are ready.
- `shared/`: reusable map, route, alert, vehicle, loading, empty/error, and offline UI; shared domain types and localization.
- `theme/` and `assets/`: accessible, driver-focused design tokens, icons, and localized resources.
- `android/` and `ios/`: generated and maintained by Capacitor; platform credentials remain outside source control.

Use Angular standalone components and existing Angular conventions. Prefer Angular Signals for local/simple state; introduce NgRx only if measured state complexity justifies it. Use MapLibre behind a map adapter so the UI does not depend on a specific routing provider. Keep all route geometry and restriction decisions on trusted deterministic services; AI may explain verified results but may not create routes or safety facts.

Do not install Ionic, Capacitor, mapping, SQLite, billing, or native plugins until Phase 1 verifies compatible supported versions and selects plugins for the required platform behavior. On Windows, Android development is possible; iOS build/sign/release validation requires macOS and Apple tooling.

## API integration contract (proposed)

### Compatibility and common rules

1. Keep current `/api/*` routes available for existing dashboards. Add mobile features under `/api/v1/*`; publish the OpenAPI contract and generate or share typed client models rather than duplicating untyped request shapes.
2. Require HTTPS outside local development. Use short-lived access credentials and refresh-token rotation in secure platform storage. Never put secrets or long-lived tokens in app bundles, ordinary browser storage, logs, or analytics.
3. Use ISO-8601 UTC timestamps, UUID identifiers, explicit units (`meters`, `seconds`, `km/h`), and stable enums. Coordinates are WGS84 (`lat`, `lng`). Return provider/data provenance and capability limitations with route/safety results.
4. Validate requests on the server. Use a consistent error envelope (`code`, safe `message`, optional field errors, `requestId`); clients must handle `401`, `403`, `409`, `422`, `429`, and retryable `5xx` without hiding errors.
5. Authenticate user-owned resources and check ownership on every read/write. Entitlements and safety-critical restrictions are server-authoritative. Do not silently downgrade an unsupported vehicle route to car routing.

### Proposed initial mobile endpoints

The subscription read routes below are implemented by the Phase 8 foundation and require the existing authentication guard. Other proposed contracts remain design-only until explicitly implemented and documented in OpenAPI.

| Proposed route                                                                                                   | Contract purpose                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` | Consumer-account lifecycle and revocable session rotation; retain the current operator login contract until a migration is planned.                                                                                                                                                |
| `GET /api/v1/me`                                                                                                 | Authenticated consumer profile, locale, privacy preferences, and server capabilities.                                                                                                                                                                                              |
| `GET/POST/PATCH/DELETE /api/v1/me/vehicles[/{vehicleId}]`                                                        | User-owned vehicle profiles; validate category-specific fields and retain audit history for safety-relevant changes.                                                                                                                                                               |
| `POST /api/v1/navigation/routes`                                                                                 | Request origin, destination, optional waypoints, vehicle ID, and preferences; response includes selected vehicle class, supported restrictions, route alternatives, distance/duration, instructions only when supplied by the routing provider, provenance, and explicit warnings. |
| `GET /api/v1/safety/alerts` and `GET /api/v1/flood/alerts`                                                       | Query by bounded map area/time window and vehicle context; return source, observation time, confidence/status, and expiry. Never expose a reporting user's precise location.                                                                                                       |
| `POST /api/v1/community/reports`                                                                                 | Authenticated, schema-validated incident/flood/hazard submission; accept only the minimum location precision and use a separate authorized media-upload flow.                                                                                                                      |
| `GET /api/v1/subscriptions/plans`, `GET /api/v1/subscriptions/me`, `GET /api/v1/subscriptions/entitlements`      | **Implemented in Phase 8:** authenticated plan, current-user subscription, and entitlement reads. No plans or entitlement configuration are seeded; reads do not impose restrictions.                                                                                              |
| `POST /api/v1/subscriptions/verify-purchase` and store webhook routes                                            | **Not implemented:** future Apple/Google transaction verification and signed, idempotent store notifications. Never trust a client-supplied plan/status.                                                                                                                           |

Add WebSockets only when event contracts, authorization, reconnect behavior, privacy, and load requirements are defined. Version and authorize any GPS-ingestion or live-location API separately; it is not present today.

## Vehicle profiles and routing capability

Use one account and one shared vehicle-profile model with a required `category` (`car`, `motorcycle`, `truck`) and a unique active selection per navigation session. The user may own multiple profiles. A route request refers to a server-owned profile ID; the server resolves its validated attributes and returns the actual routing profile/capabilities used.

- **Car:** passenger body style and route preferences such as toll/highway/flood avoidance. Optional vehicle details should be collected only when needed by a supported feature.
- **Motorcycle:** type/class and applicable verified access restrictions; do not infer motorcycle access from car access.
- **Truck:** commercial class plus dimensions, gross/axle weights, axle count, trailer configuration, and regulated goods attributes only where supported and legally needed.
- **Restriction data:** represent source, jurisdiction, vehicle attribute, restriction type/value, validity period, and confidence. Validate route compatibility before presenting a route. Unknown or incomplete clearance data must produce a visible limitation, never a guarantee.
- **Provider capability registry:** each provider/profile combination declares supported vehicle types, restrictions, instructions, traffic, geography, offline support, and data timestamps. Reject or clearly mark unsupported requests; never silently use car routing for a motorcycle or truck.

Current OSRM integration is `driving` only and returns road distance, duration, and optional GeoJSON geometry; it does not request steps. Current route planning can fall back to explicitly labeled geodesic estimates when no provider is configured, so that fallback is unsuitable for turn-by-turn navigation and must remain clearly non-navigation data.

Before selecting production routing, benchmark Malaysia coverage and validate vehicle-specific profiles/restrictions, instructions, traffic, offline options, commercial terms, service levels, provider data freshness, and Southeast Asia coverage. Candidate evaluation may include self-hosted OSRM, GraphHopper, and other commercial providers; no truck/motorcycle provider is selected or verified by this assessment.

## Subscriptions and entitlements

Phase 8 adds empty/configurable plan and entitlement tables, user subscription records, unique transaction references, a trigger-generated append-only state history, and authenticated plan/current-user/entitlement read APIs. No FREE/PRO/PRO+ plans, prices, currencies, store product IDs, feature gates, or quotas are seeded. Ambiguous or absent state returns no effective entitlements; no entitlement guard or quota enforcement is connected to navigation, routing, vehicle profiles, or critical safety operations. No purchase verification API, webhook, billing SDK, or payment provider is integrated.

Before implementation of any purchasable plan, approve plan/catalog/display values, the feature and quota matrix, localized prices/currency, store product mapping, cancellation/grace/refund and account-linking behavior, audit/transaction retention, store accounts/sandbox credentials, and current platform/privacy/legal requirements. The state audit currently records the subject account and before/after state but does not attribute a verified human actor; audit retention and deletion policy remain undecided.

## AI, location privacy, and security boundaries

### AI threat model

Treat user text, uploaded reports/images, map labels, provider content, retrieved documents, and tool outputs as untrusted input. Prompt injection must not change system policy, reveal secrets, bypass authorization/entitlements, or invoke arbitrary actions.

- Keep model credentials on the backend; use allowlisted, typed tools with server-side authorization and parameter validation.
- Do not allow AI to create route geometry, fabricate turns, assert unverified road restrictions, or override deterministic routing/safety results.
- Treat retrieved content as data, not instructions. Bound input/output sizes, tool calls, timeouts, and per-plan usage; apply rate limits and abuse monitoring.
- Validate structured model output before display/action. Require explicit user confirmation for consequential actions; redact sensitive location/account data from prompts and logs.
- Record minimal security/audit metadata without retaining full prompts or precise location by default. Define retention and deletion before launching AI features.

There is no AI service/provider in the current backend, so this is a threat model and implementation requirement, not evidence of a deployed AI feature.

### GPS and privacy

Request foreground location only when needed. Explain and separately authorize background location before navigation use; support revocation and graceful denial. Validate coordinate ranges, accuracy, timestamp, speed/heading plausibility, and navigation-session ownership without treating spoof detection as proof of identity.

Transmit only over TLS to authenticated, authorized endpoints. Minimize precision, collection frequency, and retention; encrypt sensitive local/cache data where platform support permits. Never put precise location in public reports, analytics, crash logs, or AI prompts unless necessary, disclosed, and explicitly authorized. Define a deletion/retention policy and user controls before collecting production location history. Use Keychain/Android Keystore-backed storage for credentials via a maintained plugin chosen in Phase 1.

## Android/iOS and design-system plan

- Start with one Capacitor app and a single application identifier strategy; confirm final Android application ID and iOS bundle ID with product owners before native project creation.
- Keep environment URLs and public configuration environment-specific. No provider keys, billing secrets, or signing credentials in the client or repository.
- Explain permission requests in-app and request them just in time. Keep foreground/background location behavior, notification authorization, deep links, and platform-specific lifecycle behavior behind tested adapters.
- Use a high-contrast, low-distraction map-first design with large touch targets, accessible typography, light/dark themes, and restrained motion. Provide explicit loading, offline, unavailable, warning, and error states.
- Establish localization before feature growth. Initial locales: English (`en`), Bahasa Malaysia (`ms`), and Tamil (`ta`); use translation resources and locale-aware dates/numbers/currency rather than component literals.
- Evaluate Ionic components, MapLibre, and optional styling/component frameworks for the current Angular and supported Capacitor versions in Phase 1. Do not add both Tailwind and Angular Material by default; choose based on actual design needs and bundle/accessibility validation.

## Roadmap and acceptance criteria

| Phase                                | Scope                                                                                      | Exit evidence                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Repository inspection            | This status/architecture, baseline inventory, API and capability gaps, roadmap             | Existing vs proposed behavior is clearly distinguished; open provider/platform decisions are recorded.                          |
| 1 — Mobile foundation                | One Ionic/Angular/Capacitor app, environment/API foundation, themes/locales, native shells | Compatible dependency matrix, app builds for web/Android; iOS build verified on macOS; API client and smoke tests pass.         |
| 2 — Authentication and security      | Consumer auth, session rotation/revocation, secure storage, permissions                    | Auth/API tests, storage and permission behavior validated on devices; no demo credentials in production path.                   |
| 3 — Vehicle profiles                 | Shared car/motorcycle/truck model and CRUD                                                 | Validation and authorization tests; restrictions and unsupported cases are explicit.                                            |
| 4 — Maps and navigation              | Provider adapter, map/search, route preview and deterministic guidance                     | Provider-specific routing tests and Malaysia route validation; no unsupported class fallback.                                   |
| 5 — GPS and real time                | Location lifecycle, authorized live services, traffic                                      | Privacy/permission, reconnect, battery, and server authorization tests.                                                         |
| 6 — Safety and community             | Flood/hazard data, reporting, media, notifications                                         | Source/freshness, moderation, ownership, and precision/privacy tests.                                                           |
| 7 — Offline and vehicle intelligence | Maps/graphs where supported, saved places, calculators                                     | Offline behavior proven with downloaded routable data; limits disclosed.                                                        |
| 8 — Subscriptions                    | Entitlements, quotas, app-store verification                                               | Store sandbox tests, webhook signature/idempotency tests, server-side enforcement.                                              |
| 9 — AI assistant                     | Safe AI tools, explanations, budgets                                                       | Prompt-injection, tool authorization, output validation, and cost-control tests.                                                |
| 10 — Delivery/fleet workflows        | Driver assignments, stops, proof of delivery                                               | End-to-end workflow and access-control tests.                                                                                   |
| 11 — Quality/security hardening      | Accessibility, performance, privacy, security                                              | Android/iOS test matrix, vulnerability review, battery/performance and privacy evidence.                                        |
| 12 — Production readiness            | Release configuration, signing, CI/CD, store preparation                                   | Reproducible signed release builds and staging/store checklist; no claim of production readiness without device/store evidence. |

### Phase 0 open decisions and risks

1. Select and contract a routing provider only after verifying actual motorcycle/truck restrictions, turn guidance, coverage, freshness, offline behavior, price, and commercial terms. OSRM's current driving profile does not meet the full product routing requirement.
2. Plan the production migration from the operator-focused account model to consumer roles while preserving existing web-client authorization.
3. Select AI provider/model and define data-processing, retention, cost, and regional privacy requirements before sending user data to it.
4. Confirm product ownership of Android application ID, iOS bundle ID, app-store accounts, billing products, supported device/OS matrix, and release environments.
5. Confirm authoritative sources and licenses for road restrictions, flood/traffic signals, tolls, fuel, weather, and safety data; current in-memory examples are not production sources.
6. Define location retention, background tracking purpose, user deletion behavior, and incident-report precision before production GPS collection.
7. Verify Malaysia privacy/legal obligations and current Apple/Google billing and location policies with the responsible legal/product teams before release.

## Current completion

- [x] Inspected repository, workspace, backend API, database schema, routing integration, app manifests, and installed Angular version.
- [x] Identified current APIs and the boundary between existing behavior and proposed mobile contracts.
- [x] Defined a single-app architecture, vehicle profile/routing capability model, subscription architecture, AI/GPS security boundaries, and Android/iOS plan.
- [x] Recorded Phase 0 risks and implementation roadmap.
- [x] Phase 1 web foundation, typed health-check client, localization, themes, Capacitor config, and native project scaffolds implemented.
- [ ] Phase 1 platform exit validation: Android build/device testing and iOS build/device testing remain blocked by missing platform tooling.
- [x] Phase 2 registration, email verification, login/session management, throttling, email OTP MFA, recovery, account security flows, and native secure-storage integration implemented.
- [x] Phase 2 backend/mobile builds and automated tests, disposable database migration/idempotency, and live API smoke checks completed.
- [ ] Phase 2 native secure-storage validation remains pending; do not claim Android/iOS device behavior without physical testing.
- [x] Phase 3 authenticated owner-scoped vehicle-profile CRUD, validation/authorization tests, localized lazy-loaded mobile management, and migration 003 verification completed.
- [x] Navigation Phase 1 map engine: lazy MapLibre screen, local OSM tile service, opt-in GPS tracking, map controls, themes, attribution, and loading/error states.
- [x] Navigation Phase 2/3 route calculation and foreground guidance, local voice, automatic rerouting, arrival, and foreground lifecycle handling implemented and automated-tested.
- [x] Navigation Phase 4 community-reporting slice: authenticated nearby reports, user-generated map markers, votes, duplicate merging, expiry, ownership deletion, and rate limits implemented.
- [ ] Navigation Phase 4 provider traffic, verified incident sources, reporting moderation, route-aware incident handling, and production data operations remain unimplemented or unverified.
- [x] Phase 8 provider-neutral subscription schema, authenticated read APIs, and entitlement resolution scaffolding implemented without seeded commercial values or enforcement.
- [ ] Production provider, subscription/store purchase integrations, and AI integrations: not selected or implemented.

## Navigation Phase 1 — Map Engine

- Installed Capacitor 8-compatible `@capawesome/capacitor-maplibre` 0.2.3, `maplibre-gl` 6.16.x, and `@capacitor/geolocation` 8.2.4. The MapLibre screen is lazy-loaded so MapLibre GL is not included in the initial JavaScript chunk.
- Downloaded Geofabrik's Malaysia-Singapore-Brunei Shortbread MBTiles and regional OSM PBF into `maps/`; both are ignored by Git. TileServer GL 5.7.0 is a local, read-only Docker Compose profile with an explicit allowed-host list and a local canonical URL.
- Added `/map` with day/night vector styling, OSM attribution, zoom controls, localized loading and error messages, opt-in location permission, a moving GPS marker, camera following, and a clear unavailable-live-traffic label. Location is not sent to the backend or persisted.
- Added an in-map privacy notice explaining on-device GPS handling and map-tile request disclosure; the last GPS fix is cleared when leaving the map. See [MALAYSIA_DATA_GOVERNANCE.md](./MALAYSIA_DATA_GOVERNANCE.md) for observed backend route data flows, provider review requirements, and legal/security release gates.
- Android requests foreground coarse/fine location only; iOS requests when-in-use location only. No background permission or tracking service was added.
- Verified: all 33 mobile tests pass; production Angular build succeeds; browser smoke testing confirms the theme button label and map style toggle in both directions; `cap sync` registers the MapLibre and Geolocation plugins for both native projects; local tile metadata, the Kuala Lumpur vector tile, and Latin glyph endpoint return HTTP 200; production mobile dependency audit reports zero vulnerabilities.
- Build note: Angular reports an existing initial-bundle budget warning (893.27 kB vs 860 kB); MapLibre GL (1.11 MB) and the map route are lazy chunks. The production build completes successfully.
- Not verified: Android Gradle build, iOS/Xcode build, physical-device GPS or map rendering, production HTTPS tile hosting, Tamil glyph coverage, or live traffic. The development tile service binds to loopback; a device-reachable HTTPS tile host and production `mapTileServerUrl` are still required.

## Navigation Phase 2 — Initial Route Preview

- Added authenticated `POST /api/navigation/route`, shared user/IP rate limits, owner-scoped vehicle-profile resolution, and a Valhalla adapter for car (`auto`), motorcycle, and truck costing. Truck dimensions are converted to engine units only when present.
- Added an explicit mobile route-preview flow: opt into current location, tap a map destination, select an owned vehicle profile, then submit one route request. GPS is not streamed; the route response is drawn as a line and camera-fitted. Address search and saved journey history are not implemented.
- Verified: backend 14 Jest suites / 67 tests and Nest production build; mobile 35 tests and Angular production build; local Valhalla status endpoint; one Kuala Lumpur route via each of `auto`, `motorcycle`, and `truck` through the backend adapter.
- Limitation: the three costing modes returned identical metrics on the tested route. This smoke test does not validate Malaysia-wide coverage, vehicle-specific road restrictions, tolls, speed limits, truck dimensions against local data, authenticated end-to-end mobile/API behavior, production hosting/privacy controls, or Android/iOS device behavior.
- Build note: Angular still warns that the initial bundle is 893.22 kB against the 860 kB budget; map and route UI remain in lazy-loaded chunks.
- Next gates: complete provider/hosting and DPIA approval, validate route restrictions with trusted Malaysia sources and corridor fixtures, and test the guidance experience on Android/iOS before any production claim.

## Navigation Phase 3 — Foreground Turn-by-Turn Guidance

- Extended the route contract with Valhalla maneuver types, instruction strings, street names, and geometry shape indices; the backend validates and offsets those indices when joining multi-leg route geometry.
- Added foreground navigation controls with on-device GPS-to-route snapping, next-maneuver distance/progression, remaining distance and estimated time, local speed display, arrival detection, off-route warning, automatic cooldown-limited rerouting, and navigation cancellation.
- Voice guidance is opt-in and uses an available local English, Bahasa Malaysia, or Tamil system voice. Backgrounding pauses foreground GPS and speech; returning reacquires location. No background-location permission is requested.
- Verified: backend 16 Jest suites / 79 tests; mobile 49 tests; backend and mobile production builds. Android debug build passed on the available host. iOS/Xcode and physical-device GPS/voice behavior remain unverified.
- Provider/DPIA/hosting approvals and Malaysian vehicle restriction validation remain release gates. The tested Valhalla profiles returned identical route metrics on the one sample corridor.

## Navigation Phase 4 — Community incident reporting (initial slice)

- Added migration `database/migrations/004_community_incidents.sql` and authenticated `/api/community/incidents` endpoints for nearby reports, creation, voting, and owner deletion. Nearby lookup uses POST so precise map centers do not appear in request URLs. Types are congestion, accident, road hazard, road closure, and breakdown; no provider feed or police locations are represented.
- Duplicate reports of the same type within 75 m merge under PostgreSQL transaction advisory locks. Create/vote/read limits use the existing shared Redis/PostgreSQL rate limiter. Each account's first confirm/clear vote is immutable; three net confirmations produce only a **community-confirmed** label, never an authoritative verification.
- Mobile requests report data only when the user opens or explicitly refreshes the panel, or submits a report. GPS is not streamed or stored as a trip; current incident points and reporter ownership are stored. Categories expire after 30 minutes to 4 hours; expired records are retained for seven days before hourly deletion, and owners can delete sooner.
- Phase 4.1 local database verification: applied migration 004 to the existing `smartroute` database on `smartroute-phase2-postgres`, then reran it successfully. Verified both tables, 9 constraints (including foreign keys/checks), 6 indexes, PostGIS geography, and unchanged existing user/vehicle-profile counts. Temporary integration-test users and their reports were removed.
- Actual PostgreSQL service integration tests passed for 75 m same-category merging versus out-of-radius separation, nearby reads, immutable voting, owner-only deletion, 12 concurrent same-location submissions, expiry hiding, and seven-day cleanup. A real-database test exposed and fixed an owner-delete result-handling bug. Authentication, DTO validation, and rate-limit behavior are covered by controller unit tests; no authenticated HTTP/mobile-to-database end-to-end session was run.
- Verified: complete backend 17 suites / 84 tests (including the PostgreSQL integration tests); complete mobile 51 tests; backend and mobile production builds. The mobile initial bundle is 894.02 kB, exceeding its 860 kB budget by 34.02 kB. No provider traffic integration or physical-device acceptance was performed.
- Production gates: apply and verify migration 004 in each target database; review precise-location disclosure and retention with counsel, complete the location DPIA, and define backup/log retention and moderation/abuse operations. No PDPA compliance or government-readiness claim is made.

## Phase 7.1 — PostgreSQL audit and zoneless verification (2026-11-06)

- Added migration `database/migrations/005_community_incident_audit.sql`. It records authenticated report create/merge, vote/repeat-vote, and delete/denied-delete events in the same transaction as the operation. Events include actor UUID, incident UUID, type, outcome, optional vote, and database timestamp; they exclude coordinates and credentials. Database triggers reject update/delete/truncate operations.
- Docker engine 29.1.2 started the isolated PostgreSQL 16 / PostGIS 3.5.2 community test stack on loopback port 55432. Migrations 004 and 005 each applied twice. Five actual PostgreSQL integration tests passed for spatial queries, ownership/voting, audit persistence/immutability, expiry/retention, and concurrent submissions. The local PostgreSQL service and production/development databases were not used.
- Complete backend test run: 17 suites / 86 tests passed with the isolated integration database URL configured. Complete mobile test run: 55 tests passed; the focused zoneless map-page suite passed 17 tests.
- Backend and mobile production builds passed. Initial mobile bundle: 852.82 kB, below the 860 kB warning budget.
- Production audit-role separation, least-privilege INSERT-only access, audit retention, Android/iOS physical-device behavior, and legal/compliance approvals remain unresolved. No PDPA compliance, certification, or government-readiness claim is made.

## Phase 8 — Subscription foundation (2026-11-06)

- Added additive migration `database/migrations/006_subscription_foundation.sql` for configurable plan metadata, entitlement definitions/mappings, user subscription state, unique provider transaction references, and trigger-generated append-only state-change events. Migration 006 applied twice successfully in the isolated PostgreSQL 16 / PostGIS 3.5.2 test database; existing community integration tests remain passing.
- Added authenticated `GET /api/v1/subscriptions/plans`, `/me`, and `/entitlements` read endpoints using the existing `AuthGuard`. Resolution is scoped to the authenticated user and reports no active, resolved, inactive-plan, or ambiguous state explicitly. No plans or commercial values are seeded.
- Added TypeORM entity mappings for plan catalog, entitlement definitions/configuration, user subscriptions, transaction references, and append-only state events; registered all mappings with synchronization disabled. Swagger marks the subscription API as bearer-authenticated.
- No price, currency, store product ID, entitlement gate, quota, purchase endpoint, payment SDK, store verification, webhook, or payment provider is configured. No subscription restriction is connected to navigation, routing, vehicle profiles, community reporting, or critical safety operations.
- Added tests for user isolation, entitlement resolution, duplicate transaction references, state auditing/immutability, and authentication-guard metadata. The transaction-reference table stores identifiers only, not purchase receipts or tokens.
- Verification: isolated migrations 004–006 applied twice; community and subscription PostgreSQL integration suites passed (2 suites / 8 tests); complete backend suite passed (20 suites / 97 tests); complete mobile suite passed (55 tests). Backend and mobile production builds passed; mobile initial bundle is 852.82 kB against the 860 kB budget. Targeted backend ESLint and Prettier checks on supported changed files passed. PowerShell harness was executed by the successful isolated database test.
- The mobile test run still emits Angular `NG0914` warnings because Zone.js is loaded while zoneless change detection is enabled; tests pass, but removing the redundant Zone.js loading remains a separate cleanup.
- Outstanding: owner-approved product/plan content and FREE/PRO/PRO+ gate/quota matrix, localized pricing/currency and store product mapping, cancellation/grace/refund/account-linking behavior, store accounts/sandbox credentials, actor attribution, audit and transaction retention/deletion, production role separation, and current platform/legal/privacy review.
- Status: **PARTIAL — foundation only; no purchasable plan behavior or production deployment is approved or implemented.**

## Phase 8.1 — Foundation security and quality remediation (2026-11-06)

- Added migration `database/migrations/007_subscription_audit_actor_context.sql`. The state-audit trigger now records `app.actor_user_id` when a writer sets it transaction-locally; absent context remains NULL and malformed UUID context fails the write. No subscription write API exists, so the value is not yet populated from live authenticated requests. The setting is an application assertion, not independent identity proof.
- Updated the isolated database harness to mount and apply migration 007 twice. Using the existing dedicated test container's local test-only password in process memory, migrations 004–007 each applied twice; the actual PostgreSQL/PostGIS community and subscription integration suites passed (2 suites / 8 tests). No secret was written to files or output.
- Complete backend suite: 20 suites / 97 tests passed with isolated PostgreSQL integration enabled. Subscription unit/controller tests: 2 suites / 8 tests passed. Mobile suite: 55 tests passed. Backend and mobile production builds passed; mobile initial bundle remains 852.82 kB against the 860 kB budget. Targeted backend ESLint passed. Prettier passed for supported TypeScript, YAML, and Markdown files; it has no configured parser for the SQL migration or PowerShell harness, which were validated by migration execution and script execution.
- The test database role `smartroute_test` is a superuser and owns the audit tables; the role has full privileges. The isolated test therefore verifies database behavior, not least-privilege roles. Production database role configuration was unavailable and was not changed; split runtime/migration roles and production grants remain **BLOCKED** pending an authorized infrastructure inspection.
- Account deletion cascades to subscription and transaction-reference rows, while append-only state events preserve subject/actor UUIDs. No retention period, audit deletion, or pseudonymization behavior was selected or automated. The required owner decisions are listed in `MALAYSIA_DATA_GOVERNANCE.md`.
- The mobile suite still reports Angular `NG0914` because the test target loads Zone.js while app configuration enables zoneless change detection. Production build passes. Preserve zoneless production behavior; after adapting Zone-dependent tests, remove Zone.js only from test polyfills and rerun the full suite.
- No payment, pricing, product identifiers, quotas, gates, webhooks, or subscription write behavior was added. Authentication, navigation, routing, vehicle profiles, community reporting, and critical safety operations were not modified.
- Status: **PARTIAL — local verification passed; production database permissions and retention/account-deletion policy remain BLOCKED. No production security or regulatory-compliance claim is made.**
- Phase 8 PostgreSQL verification rerun (2026-11-07): a uniquely named disposable PostgreSQL 16/PostGIS 3.5 container used a temporary in-memory data directory and generated test-only credentials. Migrations 001–007 each applied twice in order. Subscription PostgreSQL tests passed (2 suites / 6 tests), covering all six entity column/index mappings, foreign keys, uniqueness/lifecycle constraints, authenticated HTTP GET endpoints, and cross-user isolation. The harness removed its container; the pre-existing persistent community-test container and running security-test container were left untouched.
- Backend regression suite after verification: 19 suites / 92 tests passed; the 3 database-dependent suites (11 tests) skipped without the integration URL, and were separately executed against the disposable database above. Backend production build passed. Existing navigation, routing, vehicle-profile, and community-report tests passed; those modules contain no subscription references.
- The disposable PostgreSQL role is privileged and does not verify production least-privilege grants. Production role separation, retention/account-deletion policy, and compliance reviews remain unresolved.
