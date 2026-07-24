---
id: foundation
title: "Foundation: Infrastructure, Data Layer, Backend Patterns & Observability"
abstract: Self-hosted stack (PostgreSQL/PostGIS, MinIO, RabbitMQ, Redis, Celery), UUID v7 keys, Alembic migrations, thin resource/service layer, structured JSON logging, and Logfire OTel plan.
status: accepted
date: 2026-06-10
deciders: []
tags: [infrastructure, backend, observability]
---

# Foundation: Infrastructure, Data Layer, Backend Patterns & Observability

This document covers the decisions that underpin every other part of the system — the stack we run on, how data is stored and identified, how the backend is structured, and how we observe it in production. These decisions were made early and have remained stable; they are the load-bearing walls of the architecture.

---

## Owning the whole stack

The architecture is **entirely self-hosted**: PostgreSQL, Redis, RabbitMQ, MinIO, and the application containers all run on a server we control. No component is outsourced to a managed cloud service as a primary dependency. The single exception is Logfire for observability (see below), which is acceptable because observability data is telemetry, not user data, and the exporter can be re-pointed to a self-hosted collector without code changes.

The reasoning is straightforward: no per-service vendor lock-in, predictable cost (one VPS bill, not a sum of per-unit metered services), and full control over data residency — relevant for GDPR and any future maritime data licensing work.

**Escape hatches are built in from day one.** The `StorageService` abstraction means MinIO can be swapped for AWS S3 by changing environment variables. The OTel exporter means observability can be re-pointed to a self-hosted stack. Self-hosted is the default; managed is always an option.

### Update management

Application and infrastructure containers have different risk profiles and different update mechanisms:

- **Application containers** (backend, frontend, Celery worker): updated via the CI/CD pipeline only — `git push → build image → docker compose pull && up`. A human or deliberate pipeline step must be in the loop. No automation deploys application code.
- **Infrastructure containers** (Postgres, Redis, RabbitMQ, MinIO): Watchtower runs in **notify-only mode** — it detects newer images and sends a notification. The operator applies patch/minor updates in a scheduled maintenance window with a tested rollback plan. Major version upgrades are always manual. Watchtower must never be configured to auto-apply infrastructure updates in production.

### Redundancy tiers (in order of value as user base grows)

| Layer | What it does | When to implement |
|-------|-------------|-------------------|
| Process resilience | `restart: unless-stopped` on all containers | Now |
| Offsite backups | Daily `pg_dump` + MinIO bucket sync to Backblaze B2 (not same provider as server) | Before production launch |
| Warm standby | Second server kept current via replicated backups; manual failover | At first paying users |
| Postgres streaming replication | WAL replica on standby; near-zero data loss on primary failure | When downtime has measurable cost |

---

## Data layer

### PostgreSQL with PostGIS

The primary database is **PostgreSQL with the PostGIS extension**. Geospatial columns use `Geography(Point, 4326)` (WGS84 lat/lng) via GeoAlchemy2. Proximity queries use `ST_DWithin` + `ST_Distance`.

PostGIS is the industry standard for open-source geospatial. It handles the POI range queries ("find tidal stations within 5 km") without a separate spatial store. Spatial indexes (`GIST`) must be created explicitly in migrations — easy to forget.

### UUID v7 primary keys

All entities use **UUID v7** as their primary key, generated server-side by the `uuid7` Python library. UUID v7 is time-ordered (millisecond precision in the most-significant bits), giving B-tree index locality close to sequential integers while retaining the non-enumerability of UUIDs. Clients cannot guess adjacent record IDs, and the IDs are safe for future mobile-generated offline mutations (M9).

### Alembic directly — not Flask-Migrate

Migrations are run via `.venv/bin/alembic` directly. Flask-Migrate is installed (it initialises the `Migrate` object that ties Alembic to the app context) but `flask db migrate` and `flask db upgrade` are never used.

The reason: the project uses a custom `alembic/env.py` that imports models explicitly. Flask-Migrate's `flask db migrate` invokes Alembic through its own env, which does not see the custom configuration, producing silent empty migrations. Alembic direct is the only path that reliably detects schema changes.

```bash
# Correct usage
.venv/bin/alembic revision --autogenerate -m "description"
.venv/bin/alembic upgrade head
```

### Object storage — MinIO

Binary objects (user avatars, GDPR export archives) are stored in **MinIO**, a self-hosted S3-compatible object store running as a Docker container. The `StorageService` abstraction uses `boto3`; changing `endpoint_url` is all that is needed to point at AWS S3 in production.

The avatars bucket uses public-read policy (URLs are stable, cacheable, no expiry). GDPR export archives must **not** be in the public-read bucket — they require a private bucket with signed URLs or a protected download endpoint that verifies the requesting user's identity. This is not yet implemented and must be in place before production.

---

## Async stack

Three distinct async/messaging concerns exist in the system, each served by a different component:

**RabbitMQ** — durable message broker for mobile offline sync (M9). A paddler at sea may queue mutations for hours or days. RabbitMQ durability means the queue survives broker restarts; mutations are not lost if the device reconnects briefly and drops again. Also used as the Celery broker.

**Redis** — pub/sub for live position broadcasting (M8). Position data is ephemeral by design — if a message is lost, the next update supersedes it. Very low latency, no disk I/O.

**Celery** — background task queue for weather fetching, email delivery, and GDPR export generation. Brokered by RabbitMQ; uses Redis as the result backend.

Redis DB allocations are fixed to prevent cross-contamination:

| DB | Purpose |
|----|---------|
| 0 | `flask-limiter` rate limit counters |
| 1 | `Flask-Caching` application cache (OpenMeteo responses, POI queries — 6h TTL) |
| 2 | Celery result backend |
| 3 | Live-position pub/sub (M8, ADR-033) — channel `live:trip:<trip_id>`, ephemeral only |

Adding a fifth use requires a conscious allocation decision, not a default.

### SSE streaming — hybrid Flask-gevent sidecar (M8, ADR-033)

**Context.** M8's live position sharing needs a server→browser push channel. Gunicorn's sync
workers cannot serve it: each sync worker blocks for the full life of a request, so two workers
means two concurrent streams total, and `--timeout 120` kills anything longer. The worker-class
decision was deliberately deferred from M11 to M8 planning (see the 2026-07-04 site evaluation
and `plans/M11.md`); this entry is that decision.

**Transport: SSE, not WebSockets and not polling.** Position broadcast is strictly
one-directional (server→viewer; ingestion is ordinary `POST`s), lossy-by-design, and
low-frequency. `EventSource` gives auto-reconnect for free, rides plain HTTP through every proxy,
and needs no new protocol or framing library. WebSockets would buy bidirectionality nobody needs
at the cost of flask-sock + a heavier ops surface; polling wastes the battery of the one device
we care about (the paddler's phone).

**Serving: a sidecar running the existing Flask app — not gevent-everywhere, not a new async
app.** Options ranked: **hybrid Flask-gevent sidecar > gevent-everywhere > async (ASGI) sidecar**.
The chosen shape is the Celery pattern applied to HTTP: a second gunicorn instance from the
**same image and codebase**, whose only differences are `--worker-class gevent` and being routed
only the stream traffic — path-routed at the proxy (`/api/v1/live/*` stream endpoints → sidecar,
everything else → the sync backend). This gets:

- **No duplicated logic** — `JWTService`, share-token validation, trip-state checks reused
  verbatim; one app factory, one test suite, one deploy artifact.
- **No second paradigm** — still Flask/WSGI; an ASGI sidecar would mean a parallel framework
  for a handful of endpoints.
- **Monkey-patching quarantined** — the main API stays sync and unpatched; gevent's risks apply
  only to the streaming process, whose endpoints are **I/O-thin by rule**: subscribe to Redis,
  write events; no bcrypt, no heavy ORM work. The sidecar boots via a dedicated entry module
  (`wsgi_sse.py`) whose first statements are `gevent.monkey.patch_all()` and psycogreen's
  `patch_psycopg()` (the driver is C-extension `psycopg2`, which would otherwise block the event
  loop) — a structural split, not an env-guard in the shared `wsgi.py`, so patching cannot leak
  into the main service. Container role is selected by `SERVICE_ROLE=sse` in `entrypoint.sh`.
- Gunicorn `--timeout` is safe to keep on the sidecar: async workers heartbeat to the arbiter
  from the event loop independent of in-flight request duration, so long-lived streams survive
  while a genuinely wedged loop is still caught.

**Acknowledged cost** (the price of any sidecar): second-ingress work — dev/prod routing, CSP
`connect-src`, proxy buffering (`X-Accel-Buffering: no`, flush semantics). **Recorded fallback:**
if the second ingress proves annoying in the deploy target, gevent-everywhere (one patched
service) is the sanctioned retreat — same code, remove the routing split.

**Stream auth — short-lived stream ticket, with a header path reserved for native clients.**
`EventSource` cannot send an `Authorization` header, and JWTs live in httpOnly cookies on the
*Next.js* origin — a direct browser→Flask `EventSource` carries neither. Public story streams
need no auth (unlisted token in the path, same no-oracle 404 contract as the float-plan link).
Crew in-app streams (web) use a **stream ticket**: the authed main API mints a ~5-minute JWT
(existing `JWT_SECRET_KEY`, claims `{purpose: "live-stream", tripId, exp}` — the `purpose` claim
rejects replayed access tokens), passed as a query parameter and verified by the sidecar.
Proxying SSE through a Next route handler was rejected: it adds a buffering-prone streaming hop
to hide a token that expires in minutes anyway.

The ticket is a workaround for a *browser* limitation, not the general contract. The crew
stream route also accepts a normal `Authorization: Bearer` header as an alternative credential,
checked first, ticket checked second. Nothing in the web client uses this today, but React
Native (M9) has no `EventSource` constraint — it makes real HTTP requests and already stores its
access token in `expo-secure-store` (`docs/adr/mobile-offline.md`) — so it authenticates the
stream exactly like every other API call once it exists. Reserved at M8 build time rather than
retrofitted at M9 build time.

**Future rider.** Lightweight real-time trip-collaboration notifications ("member added an
item", "date changed" — cache-invalidation + presence broadcast, not Google-Docs-style merge)
ride this same Redis pub/sub → SSE mechanism and sidecar when scheduled; surfaced during M11,
recorded here so the infra decision is made once.

---

## Backend structure — thin resources, service layer

Flask does not prescribe where business logic lives. Without a convention it gravitates toward route handlers — untestable, duplicated, mixed with HTTP concerns.

**Resources** (`Resources/`) are thin HTTP adapters. Their only responsibilities: parse and validate the incoming request, call a service method with plain Python arguments, return a JSON response. No business logic, no direct database queries, no conditional domain logic. If a resource method exceeds ~15 lines it is doing too much.

**Services** (`Services/`) own all business logic. They are plain Python classes with static methods — no Flask imports, no HTTP concerns. They raise domain exceptions (`ValueError`, `PermissionError`, `NoResultFound`) that resources catch and map to HTTP status codes. Integration tests call service methods directly, bypassing HTTP.

**Schemas** (`Schemas/`) handle serialisation/deserialisation via Marshmallow. Ownership stamping (`user_id`, `inventory_id`) happens in `@post_load` — never re-derived in a resource or service method.

**Celery tasks** (`Tasks/`) follow the same principle: they call service methods, never implement logic themselves.

This is an architectural invariant enforced in code review. Flask makes it trivially easy to put a database query directly in a route handler — the path of least resistance is always the wrong one here.

### Static type checking — mypy

The backend is type-checked with **mypy**, adopted incrementally one layer at a time (Models → Schemas → Services → Resources → Tasks → Api), one commit per layer. Variable declarations should carry an explicit annotation at the assignment site (`user: User | None = ...`).

This is for **correctness, readability, and tooling — not runtime performance**. CPython ignores annotations at execution time; speed gains come from PEP 659 (specializing adaptive interpreter) and the PEP 744 JIT. Only ahead-of-time compilers (mypyc, Cython) turn types into speed, and that is a path we are deliberately not taking.

Configuration (`pyproject.toml`) is gradual-adoption: `ignore_missing_imports = true` (GeoAlchemy2, openmeteo-requests, flask-bcrypt and others ship no stubs), strictness tightened per layer as each pass lands. mypy is wired into pre-push (`lefthook`) and CI only against already-clean layers, so the gate never blocks on un-annotated code.

**Flask-SQLAlchemy `db.Model` under mypy:** mypy cannot resolve the dynamically-created `db.Model` as a base class. The fix is a `TYPE_CHECKING`-only shim in `Api/database.py` — `Base` is a real `DeclarativeBase` under type checking and `db.Model` at runtime (`Base is db.Model`). Models inherit `Base`. Switching the *runtime* base to a plain `DeclarativeBase` is wrong: it loses Flask-SQLAlchemy's automatic `__tablename__` generation and breaks every model without an explicit table name.

---

## Observability

### Structured JSON logging (baseline)

All backend log output is **structured JSON on stdout** via a custom `JsonFormatter` in `Services/Utils/logging_utils.py`. Container runtime captures stdout and forwards to any aggregator without per-destination format config.

Log events use machine-readable key names, not sentences:
```python
logger.info("trip_created", extra={"trip_id": ..., "user_id": ...})
```

A `RequestContextFilter` injects `g.request_id` (from `X-Request-ID` header or a fresh UUID) into every log record automatically. SQLAlchemy loggers default to `WARNING`; set `SQL_ECHO=true` to enable query-level `DEBUG` output locally.

This layer is vendor-agnostic: the same stdout stream feeds any aggregator. It stays in place regardless of what is added on top.

### Logfire — distributed tracing (accepted, implemented — M13)

Before this, the observability gap was the absence of distributed tracing: no span tree, no request timing, no frontend→backend correlation, no automatic Celery task tracing.

**Logfire** (by Pydantic) is the managed observability backend, built on OpenTelemetry, closing that gap. It provides automatic instrumentation for Flask, SQLAlchemy, Celery, `requests`, and Next.js's `fetch` with minimal configuration. No Collector, Tempo, or Loki to operate.

- The `JsonFormatter` **stays** — it is the vendor-agnostic log layer — and is extended
  (`RequestContextFilter`, `Services/Utils/logging_utils.py`) to emit `trace_id`/`span_id` from the
  active OTel span, so a stdout log line and a Logfire trace are pivotable. The manual
  `g.request_id` remains as a lightweight per-request identifier until OTel context propagation is
  verified fully redundant with it.
- **Per-process service naming** (`Api/observability.py` `_resolve_service_name`): the four
  backend roles M8 introduced (main app, SSE sidecar, Celery worker, Celery beat) get distinct
  `service.name` values (`kayak-backend[-sse|-worker|-beat]`) — separable in the Logfire UI, while
  a request that triggers a task still correlates into one trace via standard OTel context
  propagation. Derived from `SERVICE_ROLE` (M8, `entrypoint.sh`) plus an argv check for the two
  Celery entry points, which never set it.
- **SSE cost guardrail**: the tile proxy, health check, and the two SSE stream routes are excluded
  from Flask's per-request auto-tracing (`excluded_urls` on `instrument_flask`) — structurally
  high-volume (health check polled every 10s; a single map view bursts 30-60 tile requests) or, for
  the SSE routes, would otherwise emit one unbounded SQLAlchemy span per 15s heartbeat tick for a
  connection's entire, potentially hours-long lifetime. `LiveStreamService.stream_events`
  (M8 ADR-033's sidecar) instead wraps the whole connection in one manual `logfire.span` with
  `tick_count`/`position_events` attributes — verified live: a `curl -N` connection produces one
  connection-scoped span in the Logfire UI, not one per tick.
- **Frontend** (`frontend/instrumentation.ts`): `@vercel/otel`'s `registerOTel`, gated on
  `LOGFIRE_TOKEN` and `NEXT_RUNTIME=nodejs` (skips `proxy.ts`'s edge runtime), exports to a
  Logfire-pointed `OTLPTraceExporter`. The write token embeds its own region
  (`pylf_v<version>_<region>_...`) — resolved via the `logfire` package's `resolveBaseUrl` rather
  than a hardcoded host, so it always lands on the same `logfire-{eu,us}.pydantic.dev` the
  backend's Python SDK auto-detects for the same token, with no second region setting to drift out
  of sync. `@vercel/otel`'s `fetch` auto-instrumentation propagates the standard W3C `traceparent`
  header, so a request crossing server action → `apiFetch` → Flask → SQLAlchemy shows up as one
  connected trace — verified live end-to-end. Browser-side RUM is explicitly out of scope; no
  current need justifies the added client bundle weight.
- **Budget guardrail**: the account is on Logfire's Personal (free) plan, which hard-stops
  ingestion automatically at 10M records/month with email + in-app alerts as usage approaches the
  cap — a platform default, not something this project configures. Revisit only on a Team+ upgrade
  (paid tiers have no automatic stop; a self-service spend cap must be set explicitly instead).
- Both `LOGFIRE_TOKEN` env vars stay unset in CI (`backend-ci.yml`, `frontend-ci.yml`); since
  `setup_logfire()`/`instrumentation.ts`'s `register()` run unconditionally on every app boot, the
  entire test suite and build already exercise the no-op path on every run — a dedicated no-op
  test would be redundant with that.

If Logfire pricing ever becomes untenable, re-point the OTel exporter to a self-hosted Collector. The stdout JSON logs continue independently without code changes.

---

## E2E test environment must mirror production concurrency

**Context.** The Playwright E2E suite was intermittently flaky on the remote runner — assertions made immediately after a mutation (member removal, state transition, adding a shuttle vehicle) would fail because the UI still showed stale data when the 5s `expect` timeout elapsed. The failures clustered around the trip detail page and worsened the moment M6/M6b landed.

**Root cause — a concurrency mismatch, not a test bug.** The trip detail page (`app/(app)/trips/[id]/page.tsx`) is a Server Component that fans out **seven** backend calls per render via `Promise.allSettled` (trip, logistics, documents, shuttle, profile, items, packing — the last two added by M6/M6b). Every mutation in those flows triggers a full re-render of that component (`router.refresh()` or `revalidatePath`), re-issuing all seven calls. The CI workflow launched the backend with the **single-threaded Werkzeug dev server** (`flask run`), which serves requests strictly serially — so the "parallel" fan-out executed as the *sum* of seven latencies, not the max. M6b's two extra calls pushed that serialized wall-clock past the 5s assertion window. Production runs `gunicorn --workers 2` (`entrypoint.sh`), so this pathology never appeared outside CI.

**Decision.** The E2E backend must run under the **same concurrent server as production** — `gunicorn` with enough workers/threads (`--workers 2 --threads 4`) to serve the trip-detail fan-out without serialization. CI must never run the app under `flask run`. The dev server is for local single-user development only; any environment that exercises concurrent page loads must mirror production's WSGI server. This is paired with modest test-layer hardening (a 10s `expect` timeout, 2 CI retries, a backend warmup request in global setup) to absorb residual jitter, but those are belt-and-suspenders — the concurrency fix is the actual remedy.

**Correction (2026-06-22): gunicorn was necessary but not sufficient.** After this change merged
(PR #22), a remote e2e run on the 2-core runner still showed 4 failed + 2 flaky — the same
post-mutation "UI didn't update within 5s" pattern across edit/cancel/add/transition flows. So
serving the fan-out concurrently helped (≈3× faster, one green run) but did not make the suite
reliably green. The actual remedy is **deterministic post-mutation waits** at the test layer:
`mutateAndSettle(page, trigger)` (`e2e/fixtures/ui.ts`) wraps the click and `Promise.all`s it with
`page.waitForResponse(<POST carrying the `Next-Action` header>)` — arming the wait *before* the
click so the assertion runs against the action's revalidated RSC instead of racing the in-flight
refresh. (A first cut used `waitForLoadState("networkidle")`, but that resolves in the 500ms-quiet
window *before* React's `useTransition` even dispatches the POST, so it still raced; the
response-wait is the fix.) Applied to all 16 mutation→assert spots; `expect.timeout` is 10s with
`retries: 2`. Gunicorn stays (concurrency is still correct and faster); it is just not the whole fix.

**Validation (2026-06-24): reproduced and confirmed under the free-runner envelope.** The free
GitHub runner is effectively 1 vCPU — the real contention driver. Rather than burn remote runs, the
full CI job is reproducible locally via `act` at that envelope (`e2e/run-constrained-ci.sh` →
`--container-options "--cpus=1 --memory=4g"`). Under 1 vCPU the fixed suite is **green: 32 passed,
0 failed, 5 flaky-recovered**. Two genuine bugs surfaced and were fixed (not wait-related): a
`check()` call on a server-controlled, transition-disabled checkbox (→ `click()`), and an unwrapped
save. The residual flakiness (cancel / state transitions / logistics adds occasionally exceeding the
10s window on a single core) is absorbed by `retries: 2` and accepted; the durable fix is the
trip-detail tab → route-segment refactor noted below, not more waits.

**Final decision (2026-06-25): E2E is officially demoted to a LOCAL-ONLY gate.** The post-mutation
fixes are sound — the same `act` repro that was green at 1 vCPU shows the failures are now pure
*runner variance*: the free GitHub runner's wall-time for the identical suite swung from ~5 min to
**13.5 min**, and under that 3× slowdown two flaky-class specs (`02` edit, `03` cancel) simply
exhaust `retries: 2` while everything else flakes. A check whose red/green is governed by the
runner's mood, not the diff, is not a useful required gate. So `e2e-ci.yml` drops its `push` /
`pull_request` triggers (now `workflow_dispatch`-only — it never runs on the PR path) and the suite
becomes an internal pre-commit/pre-merge gate run locally via `e2e/run-constrained-ci.sh` (act runs
this exact workflow). We **keep and extend** the suite; we just stop letting an unreliable remote
runner block merges on it. The durable cure that would let it return as a remote gate is the
trip-detail tab → route-segment refactor (lighter per-tab loads → insensitive to runner speed);
the aggregate-endpoint idea is parked in favour of that. Tracked in `plans/e2e-hardening.md` and
the `trip-detail-tabs-direction` memory.

**Revalidation breadth is deliberate and stays full.** A tempting "fix" was to narrow revalidation — cache the per-tab fetches and only re-fetch the crew list after a member leaves. This is **wrong for correctness**: member-removal cascades across nearly every tab (the member's `RequirementContribution`s vanish so covered requirements flip back to *needed*; requirements they *proposed* cascade away entirely; their private packing list goes; they may have been a shuttle driver/passenger or the shore contact). A narrow revalidation would render state unfaithful to the database. The full re-fetch after high-impact mutations is required; the answer is to make it *fast* (concurrent backend), not *narrow*. A genuine performance improvement — collapsing the seven round-trips into one aggregate `GET /api/trip/:id/detail` endpoint that benefits real users too — is tracked separately as a deliberate design task, not a CI patch.

---

## API versioning — URL-path `/api/v1`

**Context.** All routes shipped unversioned (`/api/<resource>`) through M6b. With M9 mobile
(offline-first, deployed *independently* of the backend) and the PWA-offline tier on the roadmap,
the canonical trigger for versioning is imminent: an old client in the field hitting a newer
backend. There are currently zero external consumers and the only clients (web frontend, future
mobile) live in this monorepo, so introducing a version scheme now is free of any flag-day
migration — the first mobile release is simply born versioned.

**Decision (2026-06-26).** Adopt **URL-path versioning** — every route moves to `/api/v1/<resource>`.
Chosen over header negotiation (`Accept: application/vnd.kayak.v1+json`) because path versioning is
trivial to route and debug, survives in share links and offline cache keys, and needs no content
negotiation. A future breaking surface ships as a parallel `/api/v2` blueprint set run alongside
`v1`, not an in-place rewrite — so `v1`'s literal paths are stable and never edited again.

**Implementation.**
- **Backend.** Each blueprint's `url_prefix` (or `X_ENDPOINT` constant) carries `/api/v1`; the three
  blueprints that hardcoded full route paths (auth, place, tidal-diamond) carry it inline. No new
  indirection forced through the literal-path blueprints — full constant centralisation isn't
  achievable (3 literal-path blueprints + ~155 test path literals) and has low payoff given v2 is a
  parallel set, not a flip.
- **Frontend.** Versioning lives in **one place** — `apiFetch`/`apiGetPublic`/`apiUpload` in
  `lib/api/client.ts` rewrite the leading `/api` of every caller path to `API_PREFIX` (`lib/api/config.ts`,
  `/api/${API_VERSION}`). The ~35 action files and their tests keep passing unversioned `/api/...`
  paths untouched. The 11 raw `fetch` sites that bypass the client (auth server actions, public
  float-plan page, export/download route handlers) build `${API_URL}${API_PREFIX}/...` directly.

**Hard-cut, no alias.** Since the only clients are in-repo and deploy with the backend, `/api` is not
kept as an unversioned alias — frontend and backend tests moved to `/api/v1` in the same change.

---

## Production hardening scoped as a dedicated milestone (M11)

**Context.** The 2026-07-04 site evaluation (`docs/reviews/2026-07-04-site-evaluation.md`)
found the core architecture sound but identified a consistent theme: the weakest surfaces are
the *edges* — the unthrottled/unrotated refresh endpoint, the total absence of HTTP security
headers, CI gates that don't actually gate (non-blocking lint, no production build, no
migration run, no dependency audits), and deployment plumbing that lags the code (per-worker
startup seeding, fail-open `DATABASE_URL`, no health endpoint, per-upload bucket-policy writes,
proxy-blind rate limiting). Individually small; collectively they are the gap between "works in
compose" and "deployable".

**Decision (2026-07-04).** Crystallize the evaluation's remediation into a single milestone,
**M11 — Production hardening** (`plans/M11.md`), to be tackled as soon as needed — at the latest
before any staging/production deployment, and pullable forward section by section (the
CI-honesty section is worth doing immediately). Scope decisions locked:

- **Refresh tokens gain rotation + reuse detection** built on the existing `token_version`
  mechanism (rotate on every use; a reused token revokes the family). No server-side token
  store is introduced — revocation stays version-based, consistent with ADR-001's stateless JWT
  design.
- **Security headers live in Next.js** (`next.config.ts` `headers()`), not Flask — the browser
  only ever talks to Next; Flask responses never reach it directly.
- **CI must be honest**: blocking lint, `next build`, `alembic upgrade head` + autogenerate
  drift check, Dependabot + audit steps. A green check must mean deployable.
- **Startup work moves out of the app factory**: seeding becomes a CLI command run from the
  migrate step; bucket + policy provisioning stays in `minio-init`, leaving the runtime
  credential needing object CRUD only.
- **OpenAPI contract is explicitly deferred** to an M9 (mobile) prerequisite — it earns its
  cost only when a second consumer exists.

**Consequences.** M11 joins observability (Logfire/OTel + Sentry), secrets management, backups,
and TOU/legal on the pre-production checklist; after M11 those remaining checklist items are the
only known deploy blockers. The refresh-rotation change is a breaking contract change for the
frontend session layer (`refreshSession` must persist the newly returned refresh token) and
lands as one coordinated PR.

---

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| JWT in httpOnly cookies | ADR-001 | 2025-01-01 | Access 15 min, refresh 30 days; mobile must use SecureStore (ADR-015) |
| PostgreSQL + PostGIS | ADR-002 | 2025-01-01 | `Geography(Point, 4326)`, GeoAlchemy2 |
| UUID v7 primary keys | ADR-003 | 2025-01-01 | `uuid7` library, server-side generation |
| Alembic direct, not Flask-Migrate | ADR-004 | 2025-01-01 | `flask db` commands never used |
| MinIO for object storage | ADR-005 | 2025-04-01 | S3-compatible; avatars public-read; GDPR exports private bucket (pending) |
| RabbitMQ / Redis / Celery | ADR-007 | 2025-01-01 | Fixed Redis DB allocation |
| Structured JSON logging | ADR-010 | 2025-10-01 | Extended by Logfire (ADR-009) when OTel lands |
| Logfire for observability | ADR-009 | 2026-05-09 | Proposed — replaces manual OTel+Grafana plan |
| Logfire base wiring | ADR-009 | 2026-07-24 | `LOGFIRE_TOKEN` env var; `Api/observability.py` `setup_logfire()` called from `createApp()` — `logfire.configure(send_to_logfire="if-token-present", console=False)` + `instrument_flask`/`instrument_sqlalchemy`/`instrument_celery`. No-ops cleanly without a token (CI/tests unaffected). `RequestContextFilter` now also injects `trace_id`/`span_id` from the active OTel span into `JsonFormatter` output. ProxyFix must wrap `app.wsgi_app` *after* `setup_logfire()` so it stays the outermost WSGI layer (resolves real client IP before OTel tags spans with it) |
| Logfire M13 §A.2/§A.3 — SSE guardrail + frontend | ADR-009 | 2026-07-24 | Per-process `service.name` (`_resolve_service_name`); tile proxy/health/SSE routes excluded from Flask auto-tracing, replaced by one manual `logfire.span` per SSE connection (`LiveStreamService.stream_events`) instead of one per 15s tick — verified live via `curl -N`. `frontend/instrumentation.ts`: `@vercel/otel` + a Logfire OTLP exporter whose region is resolved from the write token itself (`logfire`'s `resolveBaseUrl`), gated on `LOGFIRE_TOKEN`/`NEXT_RUNTIME=nodejs`; verified one connected trace end-to-end (server action → `apiFetch` → Flask → SQLAlchemy). Budget guardrail: Personal (free) plan hard-stops ingestion at 10M records/month automatically — no dashboard config needed at this tier. Browser RUM and Sentry remain deferred |
| Logfire M13 — four pre-existing/introduced bugs found + fixed while verifying trace_id correlation and FE↔BE trace linking | ADR-009/ADR-010 | 2026-07-24 | (1) `RequestContextFilter` was attached to the root **Logger** (`addFilter`), not its **Handlers** — Python only invokes a Logger's own filters for records it directly originates, so every child-logger call (`Resources.*`, `Services.*`, i.e. all real application logging) silently skipped it; `request_id`/`trace_id`/`span_id` had never reached a real log line. Fixed in `Api/logging_config.py`; regression-guarded in `Tests/70_logging_context_filter_test.py`. (2) `Api/celery_app.py` left Celery's `worker_hijack_root_logger` at its default `True`, so the worker/beat processes wiped `setup_logging()`'s handlers at bootstrap and replaced them with Celery's own plain-text formatter — every task log line lost JSON formatting and correlation fields. Fixed via `worker_hijack_root_logger=False`. (3) `frontend/instrumentation.ts` had no `instrumentationConfig` — `@vercel/otel`'s fetch instrumentation only propagates W3C trace context to Vercel's own deployment URLs by default, silently excluding this self-hosted backend; every `apiFetch` call created its own disconnected trace instead of continuing the frontend's. Invisible on page-load GETs, confirmed broken once a POST mutation was checked specifically via a direct Logfire Query API call. Fixed via `instrumentationConfig.fetch.propagateContextUrls: [API_URL, SSE_URL]`; regression-guarded in `frontend/__tests__/instrumentation.test.ts`. (4) None of `setup_logfire()`'s `instrument_*` calls touch stdlib `logging` — added `logfire.LogfireLoggingHandler()` so application logs reach Logfire itself, not just stdout; uncapped, this forwarded every third-party DEBUG line and duplicated Logfire's own outbound-call logs via the handler's fallback (suppressed-instrumentation StreamHeader), so capped it at `INFO`. Regression-guarded in `Tests/71_observability_test.py`. All four verified live: a triggered `Tasks.ping.ping` emits JSON `task_started`/`task_completed` with matching `trace_id`/`span_id`, and a direct Logfire Query API call confirmed `parent_span_id` linkage frontend→backend→SQL for both a GET and a POST/PATCH mutation |
| Thin resources / service layer | ADR-014 | 2025-01-01 | — |
| Self-hosted architecture | ADR-016 | 2026-05-09 | Logfire is the only managed exception |
| Static type checking with mypy | ADR-029 | 2026-06-19 | Gradual, layer-by-layer; for correctness/tooling not perf; `TYPE_CHECKING` `Base` shim for `db.Model` |
| E2E backend mirrors prod concurrency (gunicorn, not `flask run`) | ADR-030 | 2026-06-22 | Single-threaded dev server serialized the 7-call trip-detail fan-out → flaky post-mutation assertions; M6b's +2 calls tipped it over. Full revalidation breadth stays (member-removal cascades); fix is concurrency, not caching. Aggregate `/api/trip/:id/detail` tracked separately |
| API versioning — URL-path `/api/v1` | ADR-031 | 2026-06-26 | Hard-cut all routes to `/api/v1` before mobile/PWA-offline clients ship (independently-deployed → need versioning); URL-path over header negotiation; frontend versions centrally in `apiFetch` (callers unchanged); v2 will be a parallel blueprint set, not an in-place rewrite |
| SSE via hybrid Flask-gevent sidecar (M8) | ADR-033 | 2026-07-17 | Ranked hybrid sidecar > gevent-everywhere (recorded fallback) > ASGI sidecar. Same image, Celery-style second gunicorn (`SERVICE_ROLE=sse`, `--worker-class gevent`, dedicated `wsgi_sse.py` with monkey-patch + psycogreen quarantined to it); proxy path-routes `/api/v1/live/*` streams to it. Stream endpoints I/O-thin by rule. Crew stream auth = short-lived `purpose:"live-stream"` JWT ticket minted by the main API (EventSource can't send headers; cookies live on the Next origin), route also accepts a plain `Authorization` header (checked first) so M9's React Native client — no `EventSource` constraint, token already in `expo-secure-store` — authenticates the same as any other API call without a later route change. Redis db/3 allocated for `live:trip:<id>` pub/sub. Future rider: trip-collab notifications over the same path |
| Production hardening scoped as M11 | ADR-032 | 2026-07-04 | 2026-07-04 site evaluation remediation crystallized in `plans/M11.md`: refresh rotation + reuse detection on `token_version` (no server-side token store); security headers in Next.js not Flask; honest CI (blocking lint, `next build`, migration run + drift check, Dependabot/audits); seeding out of app factory; bucket provisioning to `minio-init`; ProxyFix at deploy; OpenAPI deferred to M9 prerequisite |
