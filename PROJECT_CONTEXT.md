# GO 'N GO — PROJECT CONTEXT

**Powered by SMARTROUTE AI**  
**Purpose:** Persistent project context for GitHub Copilot and other coding agents.

> Keep this file in the repository root as `PROJECT_CONTEXT.md`. At the start of a task, instruct the agent:  
> **“Read `PROJECT_CONTEXT.md` and the relevant source files before making changes. Follow its constraints. Do only the task I specify.”**

---

## 1. Product identity

- **Mobile app:** Go 'n Go
- **Platform:** Android and iOS
- **Product/backend platform:** SMARTROUTE AI
- **Primary market:** Malaysia
- **Potential future markets:** Singapore, Thailand, Indonesia, Brunei, Vietnam and the Philippines
- **Product goal:** Build a reliable, Waze-quality navigation experience with independent infrastructure, Malaysian road intelligence, strong security and a path to Southeast Asian expansion.
- **Tagline:** Navigate Smarter. Drive Safer. Move Further.

The goal is ambitious, but do not claim that Go 'n Go already beats Waze or Google Maps. Measure actual coverage, routing quality, traffic freshness, reliability and user experience.

## 2. Non-negotiable engineering principles

1. **Inspect before editing.** Read the existing implementation, package scripts, tests and relevant documentation first.
2. **Preserve working functionality.** Avoid broad rewrites and unrelated refactoring.
3. **No fabricated functionality.** Never create fake traffic, GPS, routing, incident, coverage, pricing or test data and present it as real.
4. **Separate systems.** Keep map rendering, routing, provider traffic, community reports and GPS processing independently testable.
5. **Security first.** Enforce authentication, authorization, ownership, validation, rate limits, safe secrets handling and auditability.
6. **Malaysia-first governance.** Assess PDPA 2010 and its 2024 amendments, applicable Cyber Security Act 2024 obligations, data residency, vendor processing, backups, key control, retention and deletion. Do not claim legal compliance without a documented assessment by qualified advisers.
7. **Production evidence matters.** A successful compile or mocked unit test is not proof of live service, database, provider or physical-device operation.
8. **Keep changes small.** Implement only the approved scope and avoid unnecessary dependencies.
9. **Do not expose secrets.** Never commit API keys, passwords, tokens, certificates or production connection strings.
10. **Do not proceed to the next phase without approval** when the task explicitly asks the agent to stop for review.

## 3. Current intended technology direction

Confirm actual versions and implementation from the repository before changing anything.

- **Mobile:** Ionic + Angular + Capacitor
- **Map rendering:** MapLibre
- **Backend API:** NestJS
- **Database:** PostgreSQL + PostGIS
- **Caching / supporting services:** Redis
- **Routing engine:** Valhalla (separate from map rendering and traffic)
- **AI services:** Python/FastAPI where justified
- **Offline capability:** SQLite / device storage where appropriate
- **Testing:** Jest and existing mobile/backend test tooling; Playwright where configured
- **Deployment:** Existing Docker / hosting configuration; do not assume Docker or Kubernetes is available.

The repository has previously used TypeORM in the NestJS backend. Do not assume Prisma. Inspect the current code and migrations.

## 4. Architecture boundaries

Keep these responsibilities separate:

| Component                | Responsibility                                  | Important boundary                                                  |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| MapLibre                 | Display map, layers, markers and camera         | Does not itself provide routing or live traffic                     |
| Valhalla                 | Route calculation and route instructions        | Must not be confused with map tiles or traffic feed                 |
| GPS engine               | Receive and process device location fixes       | Navigation logic must not silently discard genuine fixes            |
| Map rendering scheduler  | Apply marker/camera updates efficiently         | May coalesce stale visual updates, not navigation calculations      |
| Traffic provider adapter | Retrieve licensed provider traffic data         | No traffic is live until a real provider is configured and verified |
| Community reporting      | User-submitted road incidents and votes         | Separate from provider traffic and routing                          |
| PostgreSQL/PostGIS       | Persist application and spatial data            | Verify against a real test database                                 |
| Redis                    | Caching, throttling and queues where configured | Do not silently assume Redis is reachable                           |

Do not combine these components into one tightly coupled service.

## 5. Malaysia-first data and compliance requirements

Treat these as requirements to assess and implement where applicable:

- Identify where personal data, precise location, telemetry, reports, logs, backups and object storage are physically processed and stored.
- Do not enable overseas replication or processing without an approved legal, security and business review.
- Document every external provider, its data flows, retention, subprocessors, hosting regions, caching and redistribution terms.
- Use TLS for network communication and secure secret/key management.
- Apply least-privilege database and service accounts.
- Define retention, deletion, access logging, incident response and backup restoration procedures.
- Minimize collection of precise location and restrict access to it.
- Do not describe the product as “Malaysia compliant” merely because its main database is hosted in Malaysia.

## 6. Current project status — last reported

**Important:** This is a snapshot of agent reports, not a guarantee that the current working tree still matches it. Re-check files and run tests before relying on it.

### Phase 4 — Community reporting

Reported implementation includes authenticated report operations, input validation, ownership controls, immutable voting, rate limits and a PostGIS migration with spatial/expiry indexes and constraints.

Latest Phase 7.1 verification (2026-11-06):

- The isolated PostGIS 16 / PostgreSQL 16 container started on loopback port 55432.
- Migrations 004 and 005 each applied twice successfully.
- PostgreSQL integration tests: **5 passed**, covering spatial radius/reads, voting/ownership, audit events and immutability, concurrency, and expiry/retention.
- Community service unit tests: **7 passed**.
- The test database was isolated from local PostgreSQL and development/production databases.

Status: **PASS — isolated PostgreSQL integration behavior verified; production database roles, retention, and deployment controls remain unverified.**

### Phase 5 — Traffic research and renderer proof of concept

Reported implementation:

- MapLibre traffic-overlay source and styling compile and have passing tests.
- The source starts empty and styles only explicit traffic classes.
- No traffic data is fetched or fabricated.
- Valhalla routing and community reports remain separate.
- No provider was activated or purchased.

Provider research:

- TomTom Orbis Traffic was identified as a candidate for credentialed evaluation, not a selected production provider.
- Public documentation was reported to list Malaysia for traffic flow and incidents, but corridor-level quality on Kuala Lumpur roads, PLUS highways and specific roads remains unverified.
- HERE documentation was reported to identify Kuala Lumpur and Johor Bahru; other corridors remain unverified.
- Mapbox Malaysia coverage was not verified in the reviewed material; vehicle-use licensing requires review.
- Google traffic availability was reported for Malaysia, but its terms were considered unsuitable for displaying traffic on this app's MapLibre map.
- No provider-specific price was verified.
- Illustrative traffic-tile request assumptions were 60,000 / 600,000 / 6,000,000 monthly requests for 100 / 1,000 / 10,000 users. These are assumptions, not forecasts or vendor quotes.

Status: **PARTIAL — research and renderer POC only; live traffic is not operational.**

### Phase 6 — GPS rendering improvement

Reported implementation:

- Map marker and camera updates run serially.
- Queued map updates coalesce to the newest position when map operations are slow.
- Route progress and guidance continue to process each genuine GPS fix.
- Backgrounding clears pending map work.
- Existing foreground-only location behavior remains unchanged.

Latest reported validation:

- Mobile tests: **55 passed**.
- Mobile production build passed.
- Formatting passed.
- Historical pre-optimization bundle: **894.02 kB**, which was **34.02 kB above** the configured 860 kB warning budget. This is superseded by the Phase 7.1 production build result below.
- Real-device smoothness, battery use, low-memory behavior and Android/iOS performance have not been measured.

Status: **PARTIAL — targeted code-level optimization tested; no full performance sign-off.**

### Phase 7.1 — Community audit and zoneless verification

Verified implementation:

- Migration 005 adds append-only audit events for authenticated report create/merge, vote/repeat vote, and delete/denied delete operations.
- Events are transactionally coupled to operations and exclude precise coordinates, credentials, and network addresses.
- PostgreSQL triggers reject update, delete, and truncate operations; `PUBLIC` is denied update/delete/truncate privileges.
- Map-page tests explicitly use Angular zoneless change detection and assert rendered GPS/navigation/lifecycle UI updates from mocked native-plugin callbacks.

Latest direct database evidence:

- Docker engine **29.1.2** was available.
- Isolated PostGIS reported **PostGIS 3.5.2 on PostgreSQL 16**.
- Migrations 004 and 005 each reran twice without failure.
- PostgreSQL integration tests: **5 passed**; community service unit tests: **7 passed**.
- Complete backend suite: **17 suites / 86 tests passed** with the PostgreSQL integration URL configured.
- Complete mobile suite: **55 tests passed**; focused map-page zoneless suite: **17 tests passed**.
- Backend production build passed. Mobile production build passed with **852.82 kB** initial payload, below the 860 kB warning budget.
- Prettier passed for the changed TypeScript, Markdown, and Compose files after formatting.

Limitations:

- Production role separation is not configured or tested; a database owner/superuser can alter audit protections.
- Audit retention is a deployment policy decision and remains unresolved.
- Native callback tests are mocks, not Android/iOS device tests.
- Angular's test runner still loads Zone.js for its Jasmine testing environment and emits the zoneless compatibility warning; the production mobile build excludes Zone.js.

### Phase 8 — Subscription foundation (development)

Approved scope: provider-neutral data model and authenticated backend read APIs only.

- Migration 006 adds configurable plans, entitlement definitions/mappings, user subscription records, unique transaction references, and trigger-generated append-only state events. No commercial values or entitlement rules are seeded.
- Authenticated reads expose plan catalog, current-user subscription, and resolved entitlements. Missing, inactive, or ambiguous state resolves explicitly; no FREE plan is inferred and no feature restriction is enforced.
- Navigation, routing, vehicle profiles, community reporting, and critical safety handlers do not depend on subscription tables or APIs. No mobile billing SDK, store verification, purchase endpoint, webhook, or payment provider is integrated.
- Test coverage includes migration idempotency, actual isolated PostgreSQL persistence, user isolation, entitlement resolution, uniqueness, state-event generation/immutability, and authenticated controller guards.
- Migration 007 lets a subscription-state write record the optional transaction-local PostgreSQL setting `app.actor_user_id`. A future authenticated writer must set it from the verified request identity in the same transaction. There is no subscription write API today; absent context produces a NULL actor, and the database setting is an application assertion rather than independent proof of identity.

Outstanding owner decisions: plan catalog/display content; FREE/PRO/PRO+ feature and quota matrix; localized prices/currency/store product IDs; cancellation, grace, refund and account-linking behavior; audit/transaction retention and deletion; whether account deletion retains, pseudonymizes, or removes audit subject/actor identifiers; required actor categories for human/admin/system changes; production database role separation and audit-read access; store accounts, app identifiers and sandbox credentials; approved Apple/Google data-flow, policy, consumer/tax, legal and security reviews.

Status: **PARTIAL — backend foundation only. Purchasable plans, enforcement, real payment/store integration, production database controls, and formal compliance are not implemented or approved.**

Phase 8.1 verification: migration 007 adds optional transaction-local actor context for subscription state events; absent context remains NULL. The isolated test role is a superuser, so it does not verify least-privilege runtime grants. Production roles were unavailable and unchanged. Subscription/transaction deletion cascades and surviving append-only event identifiers are documented in `MALAYSIA_DATA_GOVERNANCE.md`; retention and account-deletion choices require owner approval.

### Overall readiness

Do not describe Phases 4–8 as production-ready. Phase 7.1 verified the community implementation against an isolated PostGIS database, but production database controls, retention, physical-device behavior and legal/security approvals remain outstanding. Phase 8 currently adds only a no-purchase subscription foundation.

## 7. Standard task workflow for coding agents

For every task:

1. Read this file and the relevant source files.
2. Inspect Git status and identify pre-existing user changes. Do not overwrite or discard them.
3. Inspect the relevant package scripts and existing tests.
4. Summarize the intended minimal change before editing if the task is broad or risky.
5. Implement only the requested scope.
6. Add or update focused tests for changed behavior.
7. Run the relevant tests, formatter, lint and build commands that are available.
8. Report commands and actual results. Distinguish skipped tests from passed tests.
9. Review the diff for unrelated changes, secrets, debug code and accidental generated files.
10. Update this file's status only when evidence supports the change.
11. Stop and request approval if the task says to stop, or if a material architecture, licensing, privacy, security or cost decision is required.

## 8. Required status vocabulary

Use these labels consistently:

- **PASS:** Directly verified with stated evidence.
- **PARTIAL:** Implemented or tested only in part; limitations remain.
- **BLOCKED:** Could not verify because a required service, credential, device or environment was unavailable.
- **FAIL:** A verification was run and failed.
- **NOT TESTED:** No verification was attempted.

Never convert BLOCKED, SKIPPED or NOT TESTED into PASS.

## 9. Required final report format

At the end of each task, provide:

### Summary

What changed and why.

### Files changed

List every changed file and its purpose.

### Verification

For each command, provide:

- Exact command (or clearly identify a manual check).
- Actual result.
- Number of tests passed/failed/skipped where available.

### Limitations

List anything not verified, including unavailable databases, provider credentials, external services or physical devices.

### Risks and decisions

Call out security, privacy, licensing, data residency, cost or architecture decisions needing owner approval.

### Git review

State whether unrelated changes or secrets were detected. Do not claim a clean working tree unless checked.

### Next step

Recommend one logical next task. Do not start it unless authorized.

## 10. Reusable Copilot task prompt

Copy this prompt and replace the task:

> Read `PROJECT_CONTEXT.md` and inspect the relevant code before editing.  
> **Task:** [DESCRIBE ONE TASK]  
> Work only within this scope. Preserve existing behavior and user changes. Do not invent data or claim unverified capabilities. Add focused tests. Run the relevant tests, formatter and build. Report exact commands, results, changed files and limitations using the status vocabulary in `PROJECT_CONTEXT.md`. If a required service or credential is unavailable, mark the verification BLOCKED rather than pretending it passed. Do not begin another phase or unrelated work. Stop after the report and wait for approval.

## 11. How to maintain this file

After an approved phase:

- Update the “Current project status” section with verified facts.
- Record the date and commit/hash if available.
- Keep old limitations until new evidence proves they are resolved.
- Do not paste huge logs here; link to a concise phase report in the repository.
- Keep secrets, personal data and production credentials out of this file.
