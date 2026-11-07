# Malaysia Location Privacy and Data Governance

**Status:** Engineering assessment and release gates; not legal advice, a compliance certification, or government approval.

## Current implementation and data flows

| Flow                                                         | Data and recipient                                                                                                                                                                                                                                                                                                                                                        | Current handling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Retention and open items                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foreground GPS                                               | The device GPS provider supplies coordinates to the Go 'n Go map screen and MapLibre renderer.                                                                                                                                                                                                                                                                            | Location is requested only after the user taps **Use my location**. The map uses the fix to draw its marker and move the camera. It is not sent to the backend or written to local storage. The active watch and last fix are cleared when the screen is destroyed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Coordinates exist in memory while the map screen is active. No location-history database or background tracking is implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Map tiles and glyphs                                         | The device requests tiles and glyphs from `mapTileServerUrl`. Map requests contain tile coordinates and disclose the network source address and request timing to the configured host; zooming to GPS can make the requested area approximate the user's location.                                                                                                        | Development uses a loopback-only TileServer GL instance with local MBTiles and bundled fonts. It is not a production or physical-device endpoint. The production URL is blank. No MapTiler Cloud, HERE, TomTom, Mapbox, or public OSM tile service is configured in the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Production host, region, access-log contents, retention, operators, and subprocessors are unknown and must be approved before release. Self-hosting tiles in Malaysia would not by itself establish PDPA compliance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Existing route-planning API                                  | An authenticated route request sends origin and up to 25 waypoint coordinates, with optional labels, to `POST /api/navigation/plan`. It is role-restricted, validates latitude/longitude ranges, limits waypoint count, and is limited to 30 requests per minute per user and 120 per minute per IP through the existing shared Redis/PostgreSQL limiter.                 | The existing route optimizer does not persist routes. If `OSRM_BASE_URL` is configured, the backend forwards those coordinates to that endpoint; the OSRM adapter puts coordinates in the request URL path. Thus the backend and any configured routing host can observe precise route endpoints.                                                                                                                                                                                                                                                                                                                                                                                                                                                | No routing host is approved for personal location data. Keep this endpoint pointed only at a controlled, self-hosted service unless a provider's processing terms, location, transfer safeguards, security controls, and commercial license are reviewed. Redact route URLs and request bodies from proxy, application, and provider logs.                                                                                                                                                                                                                                                                                                                                                                     |
| Explicit vehicle-aware route request and foreground guidance | The map keeps GPS fixes in device memory. After the user opens route planning, opts into current location, selects a destination on the map, chooses an owned vehicle profile, and taps **Calculate route**, the app sends one origin, one destination, and the profile ID to authenticated `POST /api/navigation/route`.                                                 | The endpoint applies shared user/IP limits and resolves the profile by authenticated owner before sending coordinates and supported vehicle dimensions to the configured `VALHALLA_BASE_URL`. The loopback development graph and backend adapter returned a test Kuala Lumpur route for `auto`, `motorcycle`, and `truck`. During foreground navigation, route matching, maneuver progression, remaining distance, and arrival detection use the device GPS watch locally. Only an explicit user-requested reroute sends a new origin. No route history is persisted by this feature. The three costing modes returned identical route metrics in this single smoke test, so vehicle-specific restrictions or differentiation are not validated. | Production hosting region, operator access, request/proxy logging, backups, retention, and network-egress restrictions remain unverified. A loopback development deployment is not evidence of Malaysia data residency or production approval. Configure `VALHALLA_BASE_URL` to an approved private HTTPS service and redact route data at all observability layers before production use. Physical accuracy, voice guidance, background tracking, and native-device behavior are not verified.                                                                                                                                                                                                                |
| Explicit community incident requests                         | Authenticated `POST /api/community/incidents/nearby` sends one current map center and radius in the request body to SMARTROUTE when the user opens or explicitly refreshes the report panel. `POST /api/community/incidents` sends the current point only after the user taps **Report at my current location**. No continuous GPS fixes or trip history are transmitted. | Reports are user-generated only: congestion, accident, road hazard, road closure, and breakdown. Coordinates and reporter account ID are stored in PostGIS; reporter identity is not returned to other users. Reports expire after 30 minutes to 4 hours by type, disappear from reads immediately at expiry, and are retained until seven days after expiry before hourly cleanup deletes them. Users can delete their own reports; account deletion cascades to reports and votes. Each account's first confirm/clear vote per report is immutable. Results are marked unconfirmed, community-confirmed, or community-disputed—not provider-verified.                                                                                          | Earlier work reported applying and rerunning migration 004 against a local database, but Phase 7 could not independently reverify it. A dedicated PostGIS integration stack and runner are now configured; actual execution is blocked because Docker Desktop is unavailable and the installed local PostgreSQL has no PostGIS extension. The integration suite was skipped in this recheck. Precise report points are visible to authenticated users querying within 3 km (maximum 10 km). Application code does not emit per-report create/vote/delete audit events; only retention-cleanup failures are logged. Redact request bodies in reverse-proxy/APM logs; bound infrastructure and backup retention. |
| OSM dataset acquisition                                      | The downloaded regional OSM-derived dataset came from Geofabrik. A dataset download reveals the downloader's network address and requested file to the download host, not a user's live GPS stream.                                                                                                                                                                       | The dataset is used by local TileServer GL. Runtime map requests are served from that configured host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Preserve attribution and meet ODbL obligations for the dataset and any derived database. Review Geofabrik's current data/service terms for each new extract or hosted service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Authentication and account data                              | Authentication data continues through the existing backend and its configured services.                                                                                                                                                                                                                                                                                   | This assessment does not change authentication, vehicle-profile APIs, or their storage. No location-history feature or location-to-advertising integration was found in the map screen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Review production database, email, Redis, hosting, support, telemetry, crash-reporting, and backup locations separately; this map review did not establish their residency or retention.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Phase 2 location minimization design

The routing implementation must preserve these controls:

1. Keep raw GPS and map matching on-device wherever practical. Do not stream periodic fixes to the API. Send an origin only after an explicit route request; send a later fix only when required for a user-requested reroute or another documented function.
2. Keep route state in memory by default. Do not persist route endpoints, polylines, or travel histories unless a separate user-facing save feature has a stated purpose, notice, retention rule, access/deletion path, and DPIA review.
3. Use a self-hosted routing service on approved infrastructure as the first candidate. Restrict its network egress and access; do not make a cloud provider the fallback when the self-hosted service fails.
4. Do not log coordinates, route URLs, labels, or request bodies. Redact them at reverse proxies, application/APM tooling, crash reporting, provider dashboards, and support exports. Retain only the minimum security metadata needed for a documented purpose.
5. Apply authentication and authorization to user-specific saved routes and incident reports. Resolve vehicle profiles by authenticated owner; do not trust client-supplied ownership or vehicle capabilities.
6. Validate coordinate ranges, request size, rate limits, and allowed fields. Current coordinate bounds are global latitude/longitude bounds, not a Malaysia geofence; choose and document any supported-area policy before enforcing one.
7. Provide a deletion path for every persisted location record, including related caches and downstream copies, and define backup expiry and deletion behavior before enabling persistence. Community report deletion is implemented for the report owner; backup deletion remains a deployment responsibility.
8. Use TLS in transit, encryption at rest with managed keys, least-privilege RBAC, administrative access monitoring, tamper-resistant security audit events without precise coordinates, and a tested incident-response process.

### Proposed retention baseline

- GPS fixes: device memory only, cleared when the map screen ends; no background collection.
- Route requests and route geometry: process transiently; do not store or cache in the application database by default.
- Saved journeys: not implemented and must remain disabled until a retention period, notice, export/deletion behavior, backup expiry, and DPIA are approved.
- Infrastructure and security logs: configure route-data redaction before enabling production traffic. The hosting platform's actual log retention is not known in this repository and is a production release blocker until documented and bounded.
- Community reports: retain active incident coordinates only until their category TTL (30 minutes for congestion, 2 hours for accidents/hazards/breakdowns, 4 hours for closures); retain expired rows until seven days after expiry, then delete them in the hourly cleanup. The report owner can delete a report sooner. Account deletion cascades to reports/votes. The reporting location is precise and shared with authenticated users nearby; disclose this in the privacy notice and complete a DPIA before production.

These are engineering defaults, not a legal determination of lawful basis or statutory retention.

## Phase 7 production-readiness recheck

- The community controller enforces authentication, validated coordinates/categories, ownership checks, and user/IP rate limits. Unit tests passed, but PostgreSQL/PostGIS operations remain unverified in this recheck because the dedicated Docker service could not start.
- The database connection is configured by environment variables with TypeORM schema synchronization disabled. This application does not enforce PostgreSQL TLS itself; production `DATABASE_URL`/network configuration must require and verify TLS where the database connection crosses an untrusted network.
- The production mobile environment leaves `apiBaseUrl` and `mapTileServerUrl` blank. The README requires a deployed HTTPS API origin and approved HTTPS tile host before release; production connectivity, TLS termination, data residency, database encryption at rest, and infrastructure log retention were not verified here.
- GPS remains foreground/device-local, and native map rendering coalesces pending marker/camera updates. Automated tests cover latest-fix rendering and route progress under delayed rendering; real-device performance, battery use, memory behavior, and Android/iOS acceptance remain unmeasured.
- The traffic provider remains research-only with an empty overlay; no provider data flow was introduced.

## Malaysia legal and governance assessment

| Area                                                           | Assessment and action required                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal Data Protection Act 2010 (Act 709) and 2024 Amendment | Treat precise or linkable location and travel history as personal data. The Amendment Act has staged commencement dates (1 January, 1 April, and 1 June 2025). Counsel must map the current consolidated Act, regulations, Commissioner circulars/guidelines, controller/processor roles, notice and choice, disclosure, security, retention, data integrity, access, and any applicable sector rules to the actual product and deployment. |
| Privacy notice and DPIA                                        | Publish a clear notice that describes GPS use, tile-server disclosures, route-provider flows, purposes, recipients, retention, rights, and how to contact the organization. Complete a documented DPIA for location monitoring/navigation before production collection and revisit it when adding background tracking, saved journeys, community reporting, or provider analytics.                                                          |
| Data protection officer and breach response                    | Assess appointment criteria under the Commissioner's current DPO circular, including scale and regular/systematic monitoring. Adopt the Commissioner's current breach-notification guidance and exercise a response workflow; do not infer applicability from organization size alone.                                                                                                                                                      |
| Cross-border transfers                                         | Inventory every transfer, including map tiles, route requests, telemetry, email, crash reporting, support, backups, and subprocessors. Counsel must assess amended section 129 and the current Cross-Border Transfer Guideline, identify transfer grounds/safeguards, and verify contract and onward-transfer terms. Malaysia data residency alone does not establish compliance.                                                           |
| Cyber Security Act 2024 (Act 854)                              | The Act commenced on 26 August 2024 and establishes obligations for regulated NCII entities and other specifically covered parties. Determine with counsel and the relevant sector lead whether the company or any government/enterprise deployment is designated or otherwise in scope; do not describe the app as certified or government-ready.                                                                                          |
| Government/enterprise readiness                                | Before procurement or deployment, obtain written legal, privacy, cybersecurity, records-management, hosting, incident-response, and procurement approvals. Define tenant boundaries, data residency, key ownership, audit access, administrator monitoring, retention, deletion, backups, and incident-notification responsibilities contractually.                                                                                         |
| OSM/Geofabrik licensing                                        | Keep visible OpenStreetMap attribution and the ODbL link. Review whether a public deployment distributes or makes available a derivative database and meet applicable share-alike requirements. Keep map data licensing separate from the software, style, and hosting-service terms.                                                                                                                                                       |

No government certification, legal opinion, or PDPA compliance determination has been performed.

## Provider and hosting review

No third-party routing, geocoding, or traffic provider is integrated or approved. Public privacy statements are not a substitute for the applicable product's signed order form, data-processing terms, subprocessor list, service-region configuration, and commercial license.

| Candidate                 | Identity / jurisdiction known from public material                                                                                                                    | Data and terms to verify before use                                                                                                                                                                                                                                                                                                                                                                                                              | Malaysia capability status                                                                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MapTiler                  | MapTiler AG identifies itself as a Swiss company in its privacy policy. The project currently runs a self-hosted TileServer GL container; this is not MapTiler Cloud. | If considering MapTiler Cloud, obtain the exact API/product terms and DPA; confirm tile-request logs, IP/location inference, processing/storage regions, retention, subprocessors, security certifications, breach terms, and commercial caching/redistribution rights. For self-hosted MapTiler software, separately verify software licensing and deployment security; runtime requests need not go to MapTiler if all assets are self-hosted. | No MapTiler-hosted coverage or traffic evaluation was performed. Current local OSM tiles cover the downloaded Malaysia-Singapore-Brunei extract; this says nothing about live traffic or routing.                                                                                                                  |
| HERE                      | HERE publishes a global privacy notice; the contracting affiliate and governing law must be confirmed from the specific service order.                                | For each routing, geocoding, or traffic API, obtain written processing locations, GPS/route fields collected, retention/deletion, service-improvement use, sharing/subprocessors, DPA and transfer safeguards, security certifications, SLA, commercial and caching rights, and regional endpoint behavior.                                                                                                                                      | HERE's public traffic coverage table names Kuala Lumpur and Johor Bahru only for Malaysia. No account-based probe or corridor validation was performed; Selangor, PLUS, Penang, Perak, Negeri Sembilan, and Melaka are not individually documented in that table.                                                  |
| TomTom                    | TomTom N.V. is a Netherlands-based parent company; confirm the contracting entity and governing law for the chosen API.                                               | Review the product-specific privacy documents and order form for route/location fields, server locations, retention/deletion, onward sharing, DPA and transfer safeguards, security certifications, commercial/caching rights, and any opt-in/telemetry requirements.                                                                                                                                                                            | TomTom Orbis Traffic v2 documentation lists Malaysia for flow and incident APIs at country level, but does not establish PLUS, state/city coverage quality, or corridor completeness. No account-based probe was performed.                                                                                        |
| Self-hosted OSM + routing | Go 'n Go operates the map/routing infrastructure; hosting jurisdiction depends on the selected cloud or data center and contract.                                     | Verify host and backup regions, operators/subprocessors, access and network logs, retention, encryption/key ownership, egress restrictions, incident commitments, software/data licenses, and capacity. Self-hosting reduces provider disclosure but does not remove privacy obligations.                                                                                                                                                        | A loopback-only Valhalla development service now builds from the downloaded regional extract. The engine documents `auto`, `motorcycle`, and `truck` costings, but this does not establish that Malaysian road attributes or restrictions are complete or accurate. It does not provide geocoding or live traffic. |

MapLibre is the map renderer, not a source of map data, geocoding, routes, or live traffic. OSM is map data, not a live traffic or incident service. No live traffic, police, speed-camera, closure, toll, or authoritative speed-limit data is supplied by the current implementation.

## Phase 5 traffic research status

The Phase 5 provider comparison and source links are in [TRAFFIC_PROVIDER_RESEARCH.md](./TRAFFIC_PROVIDER_RESEARCH.md). TomTom Orbis Traffic is only the recommended first candidate for an approved credentialed evaluation; it is not selected or integrated. Public coverage documentation lists Malaysia at country level, while PLUS and corridor-level freshness/completeness remain unverified. No provider API key, subscription, traffic endpoint, traffic response cache, or user traffic-data flow is configured.

The MapLibre app now has a renderer-only proof of concept: an empty GeoJSON traffic source and separate class-colored line layer. It does not display any synthetic or provider traffic data. Its presence does not change the existing Valhalla route calculator, community incident markers, or map status ("live traffic is not connected").

If approved for evaluation, request only visible map tile coordinates or a bounded area via the SMARTROUTE backend. The provider must not receive continuous GPS, account identity, vehicle profile, or route history. Tile coordinates and timing can still reveal an approximate viewed location; treat those requests and backend/provider logs as location-inferable data. Confirm endpoint-specific cache/redistribution rights and vendor processing locations before enabling caching or production requests.

## Release gates and unresolved evidence

## Community-operation audit events

Migration `005_community_incident_audit.sql` adds append-only database audit
events for authenticated report creation (including merges), voting (including
ignored repeat votes), and deletion (including denied ownership attempts).
Each row contains the actor UUID, event type, incident UUID, outcome, optional
vote, and database timestamp. It intentionally excludes coordinates, network
addresses, credentials, and route data. Each event is committed atomically with
its corresponding operation; an audit-write failure rolls back that operation.
The actor UUID is retained even if the user account is later deleted, so it
remains personal data and must be covered by the approved retention and
deletion policy.

The database rejects update/delete/truncate attempts and revokes those
privileges from `PUBLIC`. This protects rows from ordinary application DML,
not from a table owner, migration owner, database administrator, or superuser.
Production must separate the migration/table-owner role from the application
role, grant the application role only the INSERT privilege needed to record
events, deny audit-table reads, and monitor privileged access. Audit retention
and deletion periods have not yet been approved; define them before production deployment.
Integration verification was performed only against the isolated local
PostGIS test database, not production infrastructure.

## Subscription foundation status

The Phase 8 foundation migration stores configurable plan metadata,
entitlement definitions and values, user subscription state, unique external
transaction references, and append-only state-change events. The repository
contains no seeded plan, price, currency, store product, feature gate, or quota.
The authenticated subscription read endpoints expose only the requested
account's state; they do not receive GPS, route geometry, journey history, or
vehicle locations. No billing SDK, payment processor, Apple/Google purchase
verification, store webhook, or purchase-writing endpoint is integrated.

Transaction references are limited identifiers; raw receipts and purchase
tokens are not stored. Migration `007_subscription_audit_actor_context.sql`
allows the state trigger to copy `app.actor_user_id` from transaction-local
PostgreSQL context into the append-only state event. A future writer must set
that value from a verified authenticated identity in the same database
transaction. There is no subscription write API today, so missing context
records a NULL actor; a database session setting is an application assertion,
not independent proof of identity.

User deletion cascades to subscription and transaction-reference rows, while
state events have no account foreign key and retain subject/actor UUIDs and
state history. No retention, pseudonymization, or deletion policy is approved;
no cleanup job or automatic audit deletion is configured. The account-deletion
and audit rules must be approved together before production use.

### Database role verification and required decisions

The backend accepts `DATABASE_URL` or `DB_USER`/`DB_PASSWORD` configuration,
but the repository does not provision separate production runtime and
migration roles. Production role grants and database configuration were not
available for inspection. In the isolated test container, `smartroute_test`
is a superuser/table owner with full audit-table privileges; that role verifies
trigger behavior only and is not evidence of least-privilege runtime access.

Production verification must be performed by an authorized infrastructure
operator through the actual application connection, without disclosing
credentials. Confirm that the runtime role is not a superuser, table owner, or
role with `BYPASSRLS`; separate it from the migration/schema-owner role.
Subscription read APIs need `SELECT` on the plan, entitlement-definition,
plan-entitlement, and user-subscription tables. The current community service
writes community audit events directly, so it needs `INSERT` there but no
audit-table read/update/delete/truncate access. There is no subscription write
API; if one is later approved, its state-change trigger must be tested with
the selected role and its required event insertion privilege. Audit-reader
access should be separately assigned and monitored. Owners and superusers can
change schema protections; the append-only triggers and `PUBLIC` revocations
do not replace role separation.

Run these checks while connected as the production runtime role, then inspect
the resulting grants through the approved infrastructure process:

```sql
SELECT current_user, rol.rolsuper, rol.rolbypassrls, rol.rolcreatedb,
       rol.rolcreaterole
FROM pg_roles AS rol
WHERE rol.rolname = current_user;

SELECT table_name,
       has_table_privilege(current_user, 'public.' || table_name, 'SELECT') AS can_select,
       has_table_privilege(current_user, 'public.' || table_name, 'INSERT') AS can_insert,
       has_table_privilege(current_user, 'public.' || table_name, 'UPDATE') AS can_update,
       has_table_privilege(current_user, 'public.' || table_name, 'DELETE') AS can_delete,
       has_table_privilege(current_user, 'public.' || table_name, 'TRUNCATE') AS can_truncate
FROM (VALUES ('community_incident_audit_events'),
             ('subscription_state_events')) AS audit_tables(table_name);
```

Decisions requiring owner approval: audit/transaction-reference retention
periods; whether account deletion retains, pseudonymizes, or removes subject
and actor UUIDs; treatment of legal holds; which actor categories (authenticated
user, administrator, or system) must be attributed and how; and who may read
audit records. Do not invent periods or apply deletion/pseudonymization until
these choices and applicable legal obligations are reviewed.

Before any purchase flow, assess Malaysian PDPA 2010 and Amendment 2024
requirements, cross-border disclosures to Apple/Google, store transaction
processing locations and retention, consumer-protection/tax requirements,
current app-store billing policies, and vendor contractual terms. No provider
or payment flow is selected or activated. Subscription resolution is not
called by navigation or safety handlers, so the new tables/API are not a
runtime dependency for free navigation or critical safety features.

- [ ] Obtain Malaysian counsel's written assessment of Act 709 as amended, section 129 transfers, DPO and breach-notification applicability, notice, and DPIA.
- [ ] Approve the production hosting country/region, data flows, log fields/retention, subprocessors, encryption/key management, deletion and backup behavior.
- [ ] Keep production map tile hosting disabled until the endpoint is HTTPS, reachable only as intended, data-residency and access-log retention are documented, and the notice reflects it.
- [ ] Select no external routing/geocoding/traffic API until product-specific terms, DPA, regions, retention, sharing, security evidence, license, costs, and Malaysia corridor tests are reviewed.
- [ ] Before enabling a traffic provider, verify actual coverage/freshness on Kuala Lumpur, Selangor, PLUS, Johor, Penang, Perak, Negeri Sembilan, and Melaka with authorized credentials; verify severity definitions, source timestamp behavior, costs, quotas, caching rights, outage behavior, and mobile performance.
- [ ] Resolve route-URL coordinate leakage in any access proxy/APM logs and restrict `OSRM_BASE_URL` egress to the approved self-hosted endpoint.
- [ ] Assess DPO criteria and run a location-data DPIA before systematic or background tracking.
- [ ] Define and test account/data deletion, incident response, access audit, and administrator-monitoring procedures before storing user location or travel history.
- [ ] Obtain formal government/enterprise legal, security, and procurement approval before making deployment-suitability claims.
- [ ] Verify map attribution/ODbL treatment for the actual distributed tiles and style.
- [ ] Perform Android/iOS device tests separately; browser and mocked-GPS tests do not prove native location behavior.

## References

- [Personal Data Protection Act 2010 and Amendment resources](https://www.pdp.gov.my/en/akta/)
- [Amendment commencement notice](https://www.pdp.gov.my/wp-content/uploads/2024/12/PENETAPAN-TARIKH-PERMULAAN-KUAT-KUASA.pdf)
- [JPDP privacy-notice guidance](https://www.pdp.gov.my/en/akta/guidance-on-the-preparation-of-personal-data-protection-notices/)
- [JPDP Data Protection Impact Assessment Guideline](https://www.pdp.gov.my/en/akta/data-protection-impact-assessment-guideline-dpia/)
- [JPDP Cross-Border Transfer Guideline](https://www.pdp.gov.my/en/akta/personal-data-protection-guidelines-on-cross-border-transfer-of-personal-data-cbpdt/)
- [Personal Data Protection (Amendment) Act 2024, Act A1727](https://www.pdp.gov.my/wp-content/uploads/2024/11/Act-A1727.pdf)
- [Cyber Security Act 2024, NACSA](https://www.nacsa.gov.my/act854.php)
- [MapTiler privacy policy](https://www.maptiler.com/privacy-policy/)
- [HERE privacy notice](https://legal.here.com/en/privacy)
- [HERE legal imprint](https://www.here.com/en-gb/terms/imprint-impressum)
- [TomTom privacy statement](https://www.tomtom.com/privacy/)
- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)
- [OpenStreetMap Foundation attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
- [Valhalla Route API reference](https://valhalla.github.io/valhalla/api/route/api-reference/)
- [Valhalla Docker images and local OSM build instructions](https://github.com/valhalla/valhalla/tree/master/docker)

This assessment records publicly available information and repository behavior reviewed for this milestone. Re-check current law, guidance, provider terms, and product configuration before production.
