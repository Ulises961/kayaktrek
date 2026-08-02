# Deploy runbook

Per ADR-034 (`docs/adr/foundation.md`): deploy target is a home server through the pre-traction
phase, DigitalOcean after the graduation trigger. Same steps either way — only the box changes.

## One-time setup (per box)

1. **Install Docker + the Compose plugin.**
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # log out/in after this
   ```

2. **Authenticate to GHCR.** Images are private (ADR-034) — generate a classic GitHub PAT with
   the `read:packages` scope at github.com/settings/tokens, then:
   ```bash
   echo "<PAT>" | docker login ghcr.io -u <your-github-username> --password-stdin
   ```

3. **Set the frontend's public URLs as repo Variables** (GitHub → repo → Settings → Secrets and
   variables → Actions → Variables tab): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SSE_URL`. These get
   baked into the frontend image at build time (`release.yml`) — there's no way to change
   them after the fact without cutting a new release. An unset one now fails the build outright
   (`lib/api/config.ts`) rather than silently baking in an empty origin. Until Cloudflare Tunnel + a domain exist (ADR-034
   point 3), point them at whatever address the box is reachable at for testing; expect to bump
   these and let CI rebuild once the real domain is live.

4. **Copy the deploy files onto the box**: `docker-compose.prod.yml` and a filled-in `.env`
   (copy `.env.prod.example` → `.env`, fill in every blank — secrets, mail, storage/frontend
   URLs). Keep `.env` out of git, same as every other workspace's `.env`.

## Cutting a release

Merging to `master` runs the gates (Backend CI, Frontend CI) but **publishes nothing**. Images
are built and pushed only by `release.yml`, which triggers on a version tag:

```bash
git checkout master && git pull
git tag -a v0.2.0 -m "Per-device sessions"
git push origin v0.2.0
```

That builds *both* images regardless of which paths changed and pushes
`:v0.2.0`, `:sha-<short>` and `:latest` for each. The workflow refuses to publish a commit that
isn't an ancestor of `origin/master`, so a tag on an unmerged branch can't reach GHCR without
having been through PR CI.

To rebuild without a code change (e.g. after changing a `NEXT_PUBLIC_*` repo Variable, which is
baked in at build time), run it by hand:

```bash
gh workflow run release.yml --ref v0.2.0     # republishes that version, moves :latest
gh workflow run release.yml --ref master     # publishes :sha-<short> only, never :latest
```

A manual run on a branch deliberately does **not** move `:latest` — `:latest` only ever points at
a tagged version, so "what is deployed" stays answerable.

## Deploying (every time)

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

`pull` fetches `:latest`, i.e. the most recently *tagged* release. To deploy or roll back to a
specific version, set `KAYAK_IMAGE_TAG` (it defaults to `latest`):

```bash
KAYAK_IMAGE_TAG=v0.1.0 docker compose -f docker-compose.prod.yml pull
KAYAK_IMAGE_TAG=v0.1.0 docker compose -f docker-compose.prod.yml up -d
```

Put it in the box's `.env` to make a pin stick across deploys. Note that rolling *back* only
rolls back code — `migrate` runs `alembic upgrade head`, never a downgrade, so a release
containing a destructive migration is not reversible this way.

`migrate` re-runs `alembic upgrade head && flask seed` on every `up` — both are idempotent, so
this is safe to run on every deploy, not just the first one.

Check it came up clean:
```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:5000/api/v1/health
```

## Monitoring / admin tooling

`docker-compose.monitoring.yml` — Portainer (containers), Glances (host CPU/RAM/disk/network),
pgweb (browse Postgres), Uptime Kuma (health-endpoint monitoring + alert notification —
closes the silent-failure gap ADR-034 flagged for the home-hosted RabbitMQ path; monitors and
notification channels are configured post-boot in its own web UI, not declaratively here).
Independent of the app stack's lifecycle — never touched by the redeploy loop above. **Must be
brought up after `docker-compose.prod.yml` at least once** — it joins the `kayak_net` network that
file creates, so pgweb can resolve `postgres` by name; a fresh box without the app stack running
yet will fail with a "network not found" error.

```bash
docker compose -f docker-compose.monitoring.yml pull
docker compose -f docker-compose.monitoring.yml up -d
```

All on `127.0.0.1` only, same rule as everything else here: Portainer `:9002`, Glances `:61208`,
pgweb `:8081`. None of these are ever routed through the public Cloudflare Tunnel domain — a DB
browser or container-lifecycle UI reachable from the internet is not an acceptable mistake to be
one DNS record away from.

## Rolling back

Pull an older tag by SHA instead of `latest` — every image is also tagged with the git SHA it was
built from (`backend-ci.yml`/`frontend-ci.yml`). Edit the `image:` lines in
`docker-compose.prod.yml` to the known-good SHA, `up -d`, then revert once the fix lands.

## Status (2026-07-31 — first real deploy)

Live end-to-end for the first time: `kayaktrek.app` (frontend, bare apex — see
`nginx/kayak-expedition-planner.conf`'s header comment for why there's no `app.` subdomain),
`api.kayaktrek.app`, `live.kayaktrek.app`, `storage.kayaktrek.app` (MinIO S3 API, correctly
denying anonymous root-listing while serving `avatars/`/`point-images/` public-read) all resolve
through Cloudflare → `cloudflared` Tunnel → host nginx (TLS via certbot-dns-cloudflare,
auto-renewing) → the right container. GHCR images build and push on every merge to `master`.
Currently paused at the operator's choice while doing further polish — `cloudflared` stopped
(`sudo systemctl stop cloudflared`), nginx/Docker stack still running on the box for local
testing; `sudo systemctl start cloudflared` brings it back with no other changes needed.

`autosuspend.conf`'s connection-state check (ADR-034 point 4) is also done — a new
`[check.AppConnections]` keys off `ss -tn state established` on the app's serving ports
(backend `:5000`, SSE sidecar `:5001`, frontend `:3300`), a binary presence signal that doesn't
average away the way the existing bandwidth check can for a live SSE session's small heartbeat
frames. Lives in the separate `~/Documents/aspire-sleep` box-management repo, not this one.

Five real, first-time-ever-exercised bugs surfaced getting here, none of them present in local
dev/CI-only testing because nothing had ever run this pipeline's `push`-to-`master` path or hit
a real production domain before:
1. **`toLower()` isn't a real GitHub Actions expression function** — invalidated the *entire*
   workflow file (any invalid expression does, regardless of which job references it), blocking
   `pull_request` CI on every commit since the pipeline's first commit. Fixed by computing the
   lowercase GHCR owner in a shell step instead (PR #76).
2. **Missing `docker/setup-buildx-action`** — the runner's default `docker` driver doesn't
   support `cache-to: type=gha` at all (PR #77).
3. **`apiGetPublic` had no fetch timeout** — the frontend build's static generation of `(auth)`
   pages hung until Next's own build watchdog killed it, because the layout's landing-routes
   fetch had nowhere to fail fast into its own already-correct empty-fallback path when the
   production API wasn't reachable yet (this deploy's chicken-and-egg: the build ran before the
   backend had ever been deployed). Fixed with `AbortSignal.timeout(10_000)` (PR #78).
4. **`migrate` never had `RATELIMIT_STORAGE_URI`** — `StagingConfig`/`ProductionConfig` both
   require it at class-definition time (M11 hardening, no default), so `flask seed` crashed
   importing the app at all, even though `migrate` never handles a rate-limited request. Every
   other service already set it; `migrate` never did (PR #80).
5. **A pre-existing DNS record at the zone apex** (likely an auto-created placeholder from
   registration) silently rejected every `cloudflared tunnel route dns kayaktrek kayaktrek.app`
   attempt — Cloudflare was faithfully proxying `kayaktrek.app` to that stale record the whole
   time, manifesting as a 522. Deleting it and re-running the route command fixed it.

**Still open, not blockers to the current live state:**
- **Uptime Kuma monitor configuration** — the compose service exists
  (`docker-compose.monitoring.yml`); the actual monitors (health-endpoint checks + a notification
  channel) still need setting up in its web UI, closing the "silent failure" gap ADR-034 flagged
  for the home-hosted RabbitMQ path.
- **Carried over from `CLAUDE.md`'s pre-production checklist**: Sentry error alerting, and
  revisiting `.env`-file secrets management now that a staging-shaped server is genuinely
  provisioned (the condition `CLAUDE.md` already names for that revisit).
- Minor: two `apispec` `UserWarning`s during `flask seed` (`User`, `UserCertification` schema
  name collisions, M13's OpenAPI spec generation) — non-fatal, doc-quality only.
