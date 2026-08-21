# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A version here means a git tag, which is the only thing that publishes images — see
`DEPLOY.md`. Tagging does not deploy; deploying is a separate manual step.

## [0.2.0] - 2026-08-21

The web client now works on a phone. Everything else here is a fix.

### Added

- **The whole app down to a 320px viewport.** Every screen was built desktop-first and is now
  built the other way round: single column at phone width, wider layouts layered on top. Forms
  and card grids stack, content surfaces reflow, and icon-only controls get a 44px touch area on
  a touch device without changing size on a desktop. A check on every route, at 320 and 640,
  keeps it that way.
- **The itinerary planner on a phone.** Day strip above, full-bleed map, and a bottom sheet you
  can drag up to see more of the route list or push down to see more of the map. Selecting a
  point opens its detail as a segment of that same sheet rather than a second panel fighting for
  the same edge. From tablet width up, the side-by-side panes are unchanged.
- **Map controls in fixed corners at every width** — annotate top-right, layers bottom-right,
  zoom bottom-left, scale bar bottom-centre — so nothing moves as you resize the window.
- **A collapsible route panel on shared links.** `/routes/…` and `/story/…` put the route detail
  on a right-hand panel that opens with the page and folds away to reveal the map, the same
  control in the same place on a phone as on a desktop.
- **Brand mark and a darker chart surface** in dark mode, plus one owner for page spacing so
  gutters stop varying between pages.

### Fixed

- **A shared route or story link showed a login page** to anyone whose browser still held an
  expired session cookie — the exact people most likely to open one.
- **The navigation drawer was unusable below tablet width**: it painted underneath its own
  backdrop, so on a phone there was no navigation at all. Menus, dialogs and tooltips also
  painted underneath the map on any page with one.
- **Shared route and story pages rendered no map at all at phone width** — the detail panel took
  the full viewport and left the map zero pixels wide.
- **Tapping the map did nothing in parts of the planner.** Two invisible control wrappers were as
  large as the menus they had closed, and swallowed taps on the map and on "Close day".
- **Selecting a point could scroll the map away from it** on a phone; the map now centres on what
  you tapped.
- **Failed saves no longer look like successful ones.** A dozen places updated the screen before
  checking whether the server had accepted the change — a renamed point, a reordered route, a
  deleted certification — and several more swallowed the error entirely. They now report failure
  and leave the data as it is.
- **Deleting an itinerary or a day left its points behind** in the database, and a failed day-
  boundary save left the days it had already created.
- **Editing another account's field could bypass the password-change safeguards** on a profile
  update — see Security.
- **Deleting your account removed a preserved trip's route.** Where a departed leader's trip is
  kept for the remaining crew, the itinerary is now kept with it.
- **Some errors returned a server error instead of "not found" or "conflict"**, on route points
  and on activity logs, so the app showed a blank failure instead of the reason.
- **A paused expedition could still be transitioned** through the generic state endpoint,
  bypassing the check the dedicated one makes.
- **One trip's failure no longer cancels the rest of a batch.** The unattended jobs that raise
  missed-checkpoint alerts and generate end-of-day logs now isolate each trip and each member.
- **Changing your password now clears the medical-notes re-entry state** the same way a password
  reset already did, instead of leaving the prompt stuck on.

### Security

- A profile update could change another field *and* a password in one request, skipping the
  current-password check, the session revocation and the medical-notes key re-encryption that
  the password-change endpoint performs. It now rejects that shape.
- `cryptography` 49.0.0 → 50.0.0, clearing PYSEC-2026-3552.

### Deploy notes

- No migration, no new environment variables, no manual step. `migrate` has nothing to apply.
- Sessions are unaffected — nobody is logged out by this upgrade.

## [0.1.0] - 2026-08-02

First tagged release. The app had already been deployed once (2026-07-31) from an untagged
`master` build, so this entry describes the product as a whole rather than a delta — but the
**Deploy notes** below still apply to anyone upgrading that earlier deployment.

### Added

- **Trips.** Create and manage expeditions through a forward-only lifecycle
  (`building → happening → past`), with leader/crew roles, email and in-app crew invitations,
  member removal, and leadership succession. Trip metrics and a difficulty rating.
- **Map-first itinerary planner.** Routes are built by dropping points on a Leaflet chart, never
  through a form. Points form a per-day ordered route; day boundaries are dragged directly on the
  route, with an implicit draft that only touches the server when you save. Point detail sheets,
  a day rail, a feature drawer, and standalone `Place` annotations queryable by proximity.
  Nautical-chart furniture throughout: graticule, scale bar, OpenSeaMap seamarks.
- **Weather and sea.** OpenMeteo forecasts and swell per day, manual tide entry with rule-of-
  twelfths interpolation, tidal-stream diamonds with rule-of-thirds, tidal gates, and wind/current
  velocity overlays over a marine land mask.
- **Inventory and gear.** A personal gear closet plus per-trip requirements with authorship,
  multiple contributors per item, and derived status. Private "my kit" packing lists, an
  "always pack" toggle, and a curated shared template that new trips seed from.
- **Logbook and profile.** Personal paddling logs with stats, peer endorsement limited to people
  who were on the same trip, certifications, and an opt-in public profile.
- **Paddler connections.** Member search, invite-by-search, mutual buddies, and blocking.
- **Live expedition.** Position sharing over SSE during a happening trip, with a Navigate mode in
  the planner, pause/resume/abort controls, missed-checkpoint email alerts to the shore contact,
  and automatic expedition-log generation at the close of each day.
- **Sharing.** Public float plan links, a day-by-day trip story with opted-in photos on an
  unlisted link, and a public route library with filtering and fork attribution. Visibility lives
  on the itinerary, never the trip — crew, contacts, logistics and medical data stay private
  regardless of what is published.
- **Logistics.** Travel documents, shuttle vehicles and passengers, reservations, shore contact,
  and a printable float plan.
- **Safety and legal.** In-app disclaimer wherever weather, tide or tidal-gate data is rendered,
  and a Terms of Use page. The app does not publish or vouch for crowdsourced life-safety data.
- **Platform.** Flask REST API under `/api/v1` with a generated OpenAPI contract and self-hosted
  Swagger UI; Celery workers and a beat scheduler; Redis for caching, rate limiting, live position
  pub/sub and session revocation; MinIO/S3 object storage; distributed tracing across all four
  backend processes and the Next.js server via Logfire.

### Security

- **Per-device sessions with instant revocation.** Each device's refresh-token chain is a session
  whose id rides on every token; revoking one takes effect on the next request via a Redis
  denylist, and leaves the user's other devices signed in. Access tokens remain stateless.
- **Refresh-token rotation with reuse detection.** Refresh tokens are single-use; presenting one
  twice is treated as theft and ends that device's session.
- **End-to-end encrypted medical notes.** X25519 ECIES with a password-derived keypair — the
  server never holds the plaintext or the key. A password reset clears the notes and tells the
  user, rather than silently orphaning undecryptable ciphertext.
- **Private document storage.** Documents and private point images are served only through
  ownership-gated, short-lived presigned URLs.
- **GDPR.** Data export, and account deletion with a 30-day cancellable grace period followed by
  hard erasure; trips led by a deleted user are preserved with the leader anonymised.
- Nonce-based enforcing Content-Security-Policy, security headers, JWTs in httpOnly cookies only,
  and rate limiting on every auth endpoint.

### Deploy notes

- **Every user is signed out once.** Tokens now carry a session id claim, and tokens issued before
  this release do not have one, so they are not honoured. One-time and expected.
- **Schema migration.** `alembic upgrade head` runs automatically on deploy and creates the
  `session` table. Rolling back to an earlier image afterwards restores code but not schema —
  `migrate` never downgrades.
- **`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SSE_URL` are now mandatory at image-build time.** An
  empty value fails the build instead of silently baking in a relative origin that would make
  every request point back at the Next.js server.
- **`REVOCATION_REDIS_URL`** (default `redis://localhost:6379/4`) is read once per authenticated
  request. If Redis is unreachable the check fails open — a revoked session survives until its
  access token expires, which is the pre-release behaviour, rather than logging out every user.

[0.1.0]: https://github.com/Ulises961/kayak-expedition-planner/releases/tag/v0.1.0
