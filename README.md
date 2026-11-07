# SMARTROUTE AI
> GitHub repository: **bolt-map** — smart Ai Map
SMARTROUTE AI is a Malaysia-first smart mobility platform for navigation, flood intelligence, road safety, and fleet operations. This monorepo provides the working foundation for the admin dashboard, backend API, and mobile rider/driver web shells.

## Monorepo layout

- `apps/admin-web`: Angular 18 admin dashboard for fleet and operations monitoring.
- `apps/backend-api`: NestJS API exposing health, auth, dashboard, route, fleet, incident, and vehicle-profile endpoints.
- `apps/driver-mobile`: Angular 18 mobile web shell for drivers and dispatch operations.
- `apps/rider-mobile`: Angular 18 mobile web shell for rider trip tracking and safety flows.
- `apps/go-n-go-mobile`: Ionic 8 + Angular 21 + Capacitor 8 cross-platform Go 'n Go application foundation.
- `PROJECT_STATUS.md`: current implementation status, architecture decisions, and phased roadmap.
- `MALAYSIA_DATA_GOVERNANCE.md`: observed location data flows, Malaysia privacy/security review gates, and provider due diligence.
- `docker-compose.yml`: local PostgreSQL and Redis support for the production architecture.

## Local development

1. Configure a local-only PostgreSQL password and start PostgreSQL and Redis:

   ```powershell
   $env:POSTGRES_PASSWORD = 'replace-with-a-local-password'
   $escapedPassword = [uri]::EscapeDataString($env:POSTGRES_PASSWORD)
   $env:DATABASE_URL = "postgresql://smartroute:$escapedPassword@localhost:5432/smartroute"
   docker compose up -d postgres redis
   ```

   Replace the example password before use. Do not reuse it in production or
   commit it to source control.

   If PostgreSQL on your machine already uses port 5432, use a different local
   port in PowerShell and keep the backend on that same port:

   ```powershell
   $env:POSTGRES_HOST_PORT = '5433'
   $env:DATABASE_URL = "postgresql://smartroute:$escapedPassword@localhost:5433/smartroute"
   docker compose up -d postgres redis
   ```

   The database port is bound to localhost. In development, the API generates
   an ephemeral JWT secret when `JWT_SECRET` is unset, so existing sessions
   will not survive an API restart; configure a stable secret of at least 32
   bytes when that behavior is undesirable.

   Apply the database migrations to the same database, in order, before
   starting the updated backend:

   ```powershell
   psql -h localhost -p 5432 -U smartroute -d smartroute -W -v ON_ERROR_STOP=1 -f database\migrations\002_authentication_security.sql
   psql -h localhost -p 5432 -U smartroute -d smartroute -W -v ON_ERROR_STOP=1 -f database\migrations\003_vehicle_profiles.sql
   psql -h localhost -p 5432 -U smartroute -d smartroute -W -v ON_ERROR_STOP=1 -f database\migrations\004_community_incidents.sql
   psql -h localhost -p 5432 -U smartroute -d smartroute -W -v ON_ERROR_STOP=1 -f database\migrations\005_community_incident_audit.sql
   psql -h localhost -p 5432 -U smartroute -d smartroute -W -v ON_ERROR_STOP=1 -f database\migrations\006_subscription_foundation.sql
   ```

   Use the configured database port (for example `5433`) if it differs from
   the default. Existing accounts are kept verified during the authentication
   migration.

### Community incident PostgreSQL integration tests

These tests use a separate PostGIS container, database, loopback-only port
`55432`, and named volume. They do not connect to or migrate the development
database. Docker Desktop must be running. Generate a test-only password in
PowerShell and run the test harness:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$env:COMMUNITY_TEST_DB_PASSWORD = [Convert]::ToBase64String($bytes)
.\scripts\test-community-incidents-postgres.ps1
Remove-Item Env:\COMMUNITY_TEST_DB_PASSWORD
```

The harness verifies PostGIS, applies migrations 004, 005, and 006 twice, and
runs PostgreSQL-backed community-report and subscription-foundation tests.
Community create, vote, and delete audit events are written transactionally
without coordinates or credentials. A database trigger rejects updates,
deletes, and truncation; production must use an application role that does not
own the audit table, since database owners and superusers can alter these
controls. Audit retention remains a deployment policy decision. The dedicated
volume is retained between runs, so keep and reuse the same password for that
volume; generating a new password does not change the initialized database
role. `docker compose -f
docker-compose.community-test.yml stop` stops the service without deleting
the volume. Never set the integration-test URL to a development or production
database.

### Subscription foundation (no purchases enabled)

Migration 006 adds empty/configurable plan and entitlement tables, user
subscription records, minimal transaction-reference storage, and an
append-only database audit of subscription state changes. No plans, prices,
currencies, store product IDs, entitlement gates, or quotas are seeded. The
authenticated backend reads `/api/v1/subscriptions/plans`,
`/api/v1/subscriptions/me`, and `/api/v1/subscriptions/entitlements`; until
configuration is approved, plan and entitlement results remain empty or
explicitly unresolved. These endpoints do not gate navigation, routing,
vehicle-profile, or critical safety operations.

No mobile purchase flow, billing SDK, store verification, webhook, or
transaction-writing API is enabled. Transaction references do not contain raw
receipts or purchase tokens. The audit trigger records state changes but does
not yet attribute them to an authenticated actor; actor attribution and audit
retention require policy decisions. Before enabling purchases, the product
owner must approve the FREE/PRO/PRO+ feature and quota matrix, localized prices,
currency, store product mapping, cancellation/grace/refund rules, store
accounts and sandbox credentials. Apple/Google policy, consumer/tax, privacy,
data-retention, and app-store review requirements also remain to be assessed.

Configure email delivery and the public app URL before using registration,
verification, recovery, or email MFA. In PowerShell, set the values in the
backend process environment:

```powershell
$env:JWT_SECRET = (node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))")
$env:AUTH_PUBLIC_URL = 'https://your-app.example'
$env:SMTP_HOST = 'your-smtp-host'
$env:SMTP_PORT = '587'
$env:SMTP_SECURE = 'false'
$env:EMAIL_FROM = 'Go n Go <no-reply@example.com>'
$env:SMTP_USER = 'your-smtp-user'
$env:SMTP_PASSWORD = 'your-smtp-password'
$env:API_CORS_ORIGINS = 'https://your-app.example,capacitor://localhost'
$env:REDIS_URL = 'redis://localhost:6379'
```

Keep secrets in the deployment secret manager, not source control. Redis is
optional: when `REDIS_URL` is configured, auth throttling uses the shared
Redis instance; otherwise PostgreSQL provides cross-instance throttling.
A configured but unavailable Redis causes auth requests to fail closed.
When deploying behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact
number of trusted proxy hops so IP-based limits use the client address;
never trust arbitrary forwarded headers from untrusted clients.

To enable local OSRM routing, place a Malaysia `.osm.pbf` extract at
`maps/malaysia-latest.osm.pbf` and preprocess it with the OSRM backend image:

```bash
docker run --rm -t -v "$PWD/maps:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/malaysia-latest.osm.pbf
docker run --rm -t -v "$PWD/maps:/data" osrm/osrm-backend osrm-partition /data/malaysia-latest.osrm
docker run --rm -t -v "$PWD/maps:/data" osrm/osrm-backend osrm-customize /data/malaysia-latest.osrm
docker compose --profile routing up -d osrm
```

Set `OSRM_BASE_URL=http://localhost:5000` in the backend process environment to use it.
The map extract and generated OSRM files are intentionally excluded from version control.

To evaluate self-hosted Valhalla routing against the downloaded regional OSM extract, start its loopback-only development service:

```powershell
docker compose --profile routing up -d valhalla
```

The first start builds routing graph tiles and can take substantial time and disk space. Set
`VALHALLA_BASE_URL=http://localhost:8002` in the backend process environment when enabling
Valhalla-backed navigation. Generated graph data is ignored by Git. This service is for
local development only; production requires approved Malaysia-region hosting, controlled
access, bounded/redacted logs, capacity planning, and a documented DPIA/data-flow review.
In the Go 'n Go map, route preview is started explicitly: choose **Plan a route**, opt in
to **Use current location**, tap a destination on the map, select an owned vehicle profile,
then choose **Calculate route**. **Start navigation** follows foreground GPS, matches progress
to the route, updates manoeuvres and trip estimates, and detects arrival. Voice guidance is
opt-in and uses an available local system voice for English, Bahasa Malaysia, or Tamil; it
reports when a local voice is unavailable. Off-route recalculation requires two accurate
fixes and is cooldown-limited. The app pauses GPS and voice when backgrounded and reacquires
location when foregrounded. Every received fix still updates route progress and guidance;
native marker and camera rendering coalesces queued fixes to the latest position when map
operations are slow. Continuous background navigation is not implemented and no
background-location permission is requested. Address search, alternative routes, and live
traffic are not implemented. Run `npm --prefix apps/go-n-go-mobile run cap:sync` after
dependency changes to register native plugins. Physical GPS and voice acceptance still
requires Android and iOS device testing. The first graph build must finish before the service
is ready. A single Kuala Lumpur route was smoke-tested through
`auto`, `motorcycle`, and `truck` costings, and the backend adapter parsed a live `auto`
responses. Those costings returned identical metrics in that sample; this does not validate
vehicle-specific restrictions, Malaysian coverage, or the authenticated mobile workflow.

Physical-device performance acceptance procedure (not yet run):

- Use a real Android and iOS device, a dedicated test account, and a real GNSS fix. Grant
  foreground/while-in-use location only. Mount the device and have a passenger operate it;
  do not handle a phone while driving.
- Record app build, device model, OS version, battery level, and available-memory baseline.
  Start an authenticated route in an urban area and an open-sky area. Observe marker freshness,
  camera tracking, maneuver progression, route progress, GPS interruptions, and recovery for
  at least 20 minutes per environment.
- On Android, use Android Studio Profiler (CPU/memory/energy) and `adb shell dumpsys meminfo
<application-id>` before and after the run. On iOS, use Xcode Instruments Allocations,
  Leaks, and Energy Log. Capture summaries without exporting GPS coordinates, tokens, or
  account data.
- Repeat map entry/exit 20 times and check that memory returns near its post-warmup baseline,
  location updates stop after leaving the map, and there are no duplicate GPS callbacks.
  Background the app for 60 seconds; confirm foreground tracking pauses, then resumes only
  after returning to the app. No continuous background navigation is expected.
- Record observed frame/render stalls, memory, battery change, and GPS recovery time for each
  device. These are measurements to collect, not current performance claims.

The production Angular build uses zoneless change detection and omits Zone.js
from its initial payload. On the Phase 7 build, the initial bundle measured
852.82 kB against the configured 860 kB warning budget; the MapLibre runtime
remains in a lazy-loaded chunk.

The map also provides authenticated, user-triggered community incident reports for congestion,
accidents, road hazards, closures, and breakdowns. Reports are labeled as community-sourced,
not provider-verified; they expire by category, are retained for seven days after expiration,
then removed by the hourly cleanup.
Apply migrations 004 and 005 before starting the backend. Migration 005 adds
transactional, append-only create/vote/delete audit events, including denied
owner-delete attempts. Events omit coordinates and credentials. Production must
separate the database migration owner from the application role; grant the
application role INSERT only, and set an approved audit retention policy. The
feature does not provide a live traffic feed or police-location reports.

To serve the Go 'n Go MapLibre preview from the approved Malaysia-Singapore-Brunei OSM data:

```powershell
New-Item -ItemType Directory -Force maps | Out-Null
curl.exe --fail --location --output maps\malaysia-singapore-brunei-shortbread-1.0.mbtiles https://download.geofabrik.de/asia/malaysia-singapore-brunei-shortbread-1.0.mbtiles
docker compose --profile maps up -d tileserver
```

The production MBTiles package is required by the local tile service. The regional
`malaysia-singapore-brunei-latest.osm.pbf` extract is kept separately for future
routing-engine evaluation and is not imported by the map renderer. Both datasets
are ignored by Git. The development app points at `http://localhost:8080`; this
loopback-only service is for browser development, not a physical-device or
production endpoint. Before a native/release build, configure
`mapTileServerUrl` in `apps/go-n-go-mobile/src/environments/environment.production.ts`
to an HTTPS tile host and allow that hostname in `maps/tileserver-gl-config.json`.
Keep any provider secrets on the backend. The map shows OpenStreetMap/Geofabrik
attribution; OSM data does not supply live traffic, incident alerts, or routing.

2. Start the backend API:

   ```bash
   npm run backend
   ```

3. Start the admin web frontend:

   ```bash
   npm run frontend
   ```

4. Start the driver mobile web shell:

   ```bash
   npm run driver
   ```

5. Start the rider mobile web shell:

   ```bash
   npm run rider
   ```

6. Start the Go 'n Go app:

   ```bash
   npm run gonngo
   ```

   This serves the app at `http://localhost:4203` and proxies `/api` requests to
   the backend's default `http://localhost:3000` (override with
   `API_PROXY_TARGET` when using a different local port). If the backend is
   unavailable, the development proxy returns HTTP 503. The app supports
   registration, email verification, sign-in, email OTP MFA, password
   recovery/change, active-session management, and logout. Native refresh
   credentials use Keychain/Keystore-backed storage; web sessions are
   intentionally memory-only. The home screen checks the existing public
   `GET /api/health` endpoint. Authenticated users can manage personal car,
   motorcycle, and truck profiles through `/api/v1/vehicle-profiles`; routing
   based on vehicle restrictions is not implemented yet. Build the web bundle
   with `npm run build:gonngo`. After building, sync native projects with
   `npm --prefix apps/go-n-go-mobile run cap:sync`. Set
   `apiBaseUrl` in `apps/go-n-go-mobile/src/environments/environment.production.ts`
   to the deployed HTTPS API origin before making a production build; that host
   has not been selected yet. Native development builds also need a device-
   reachable API origin instead of the browser-only `/api` proxy.

7. Open:
   - `http://localhost:4200` for the admin dashboard
   - `http://localhost:4201` for the driver mobile shell
   - `http://localhost:4202` for the rider mobile shell
   - `http://localhost:4203` for Go 'n Go
   - `http://localhost:3000/docs` for Swagger

The Go 'n Go Capacitor application ID is provisional and must be confirmed
before store registration or release. Android builds require Android Studio and
an installed Android SDK; iOS builds and signing require macOS and Xcode.

## Authentication configuration

- The backend uses TypeORM and PostgreSQL; apply `database/migrations/002_authentication_security.sql` after the initial database schema. No Prisma schema exists in this project.
- Configure `DATABASE_URL`, or set `DB_USER`, `DB_PASSWORD`, and `DB_NAME` (with optional `DB_HOST`/`DB_PORT`); the backend no longer falls back to default database credentials.
- Registration requires SMTP configuration. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_FROM`, optional `SMTP_USER`/`SMTP_PASSWORD`, and `AUTH_PUBLIC_URL`; production links must use HTTPS.
- When `SMTP_SECURE=false` (for example, port 587), the backend requires STARTTLS. Use `SMTP_SECURE=true` for implicit TLS (commonly port 465).
- Use a stable `JWT_SECRET` of at least 32 bytes. Rotating it invalidates issued access tokens and OTP HMACs.
- Set production `API_CORS_ORIGINS` to the exact comma-separated web/native origins. Local web and Capacitor origins are allowed by default in development.
- `REDIS_URL` enables shared Redis-backed auth rate limiting. If unset, PostgreSQL is used; when set but unreachable, backend startup fails closed, and a Redis failure after startup returns an explicit service-unavailable error rather than bypassing limits.
- Access tokens expire in 15 minutes; refresh tokens last 7 days and are stored as hashes. Passwords use Argon2id. Email verification/reset tokens and OTPs are not stored in plain text.
- Email is the only implemented MFA method. SMS and authenticator-app MFA are future extensions. Physical-device Keychain/Keystore restart behavior still needs Android/iOS device validation.

## Production notes

- The project is intentionally structured as a foundation for the larger platform described in the product brief.
- Configure a strong, stable `JWT_SECRET` of at least 32 bytes in production. Do not rely on the ephemeral development secret or add demo credentials to the client.
- Set `API_CORS_ORIGINS` to the exact comma-separated web and native origins required by each deployment.
- Real external providers should be integrated behind proper service interfaces and environment configuration.
- Set `OSRM_BASE_URL` only to an approved, controlled OSRM service. Route planning forwards the precise origin and waypoint coordinates to that host; the adapter encodes coordinates in the downstream URL path, so proxy/APM access logs must redact route URLs. Requests are role-protected and limited to 30 per minute per user and 120 per minute per IP. The adapter is driving-only and does not provide live traffic or validated motorcycle/truck restrictions. Stop ordering uses a greedy road-duration heuristic, not a globally optimal TSP solver. If routing is unset, the API reports straight-line geodesic estimates explicitly; provider errors are returned rather than silently downgraded. Review [MALAYSIA_DATA_GOVERNANCE.md](./MALAYSIA_DATA_GOVERNANCE.md) before enabling production route processing.
- Do not use the public OSRM demo server as a production dependency; deploy or contract for a routing service with appropriate availability, usage, and data-handling guarantees.
- Apply reviewed SQL migrations to each environment before deploying backend code that depends on the new schema.
- The driver and rider shells remain lightweight web-first applications. Go 'n Go is the separate Ionic and Capacitor cross-platform app.
