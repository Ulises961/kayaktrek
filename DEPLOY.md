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
   baked into the frontend image at build time (`frontend-ci.yml`) — there's no way to change
   them after the fact without rebuilding. Until Cloudflare Tunnel + a domain exist (ADR-034
   point 3), point them at whatever address the box is reachable at for testing; expect to bump
   these and let CI rebuild once the real domain is live.

4. **Copy the deploy files onto the box**: `docker-compose.prod.yml` and a filled-in `.env`
   (copy `.env.prod.example` → `.env`, fill in every blank — secrets, mail, storage/frontend
   URLs). Keep `.env` out of git, same as every other workspace's `.env`.

## Deploying (every time)

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

`pull` fetches whatever's currently tagged `:latest` in GHCR (i.e., whatever last merged to
`master` and passed CI) for both the backend and frontend images. `migrate` re-runs
`alembic upgrade head && flask seed` on every `up` — both are idempotent, so this is safe to run
on every deploy, not just the first one.

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

## Before going live — open items

Not blockers to using this pipeline for LAN-local dev/testing today, but need sorting before the
app is reachable by anyone off the box's own LAN:

- **Local exposure model — resolved, install pending.** The box runs **nginx as a host service**
  (every app on the box registers there) — `docker-compose.prod.yml`'s existing `127.0.0.1`-only
  bindings were already correct for this (nginx and the containers' published ports share the
  same network namespace), no compose change needed. `nginx/kayak-expedition-planner.conf` has
  the three server blocks to install (frontend/backend/SSE stay separate origins, matching how
  the app already treats them — see the file's own header comment for why). Blocked only on the
  domain: `server_name` needs real hostnames to route on, so this can't actually go live until
  then, even though the config itself is ready. `PROXY_TRUSTED_HOPS` is now `1` by default
  (`.env.prod.example`) to account for nginx being a hop regardless of Tunnel status — bump to
  `2` once Tunnel is also added in front of nginx. Routing everything through one nginx entry
  point rather than binding each container's port directly is also a deliberate security
  choice, not just a topology-matching one: it keeps per-service ports and internal container
  layout from being directly probeable by anything scanning the LAN or the box, versus exposing
  `:3300`/`:5000`/`:5001` etc. as separate discoverable targets.
- **Domain purchase** — blocks the nginx `server_name`s above and both of the next two items.
- **Cloudflare Tunnel + DNS** (ADR-034 point 3) — needed before anything outside the box's own LAN
  can reach it. Points at nginx (`127.0.0.1:80`), not directly at each container.
- **Brevo account + domain verification** — SPF/DKIM/DMARC TXT records, once the domain exists.
  `.env.prod.example`'s `MAIL_*` values are placeholders until then.
- **`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SSE_URL` repo Variables** — currently unset; the frontend
  image builds with empty values until the real public URLs exist.
- **`autosuspend.conf`'s connection-state check** — without it, a live session with light traffic
  (mobile testing, SSE) can get suspended out from under itself.
- **GHCR PAT + `docker login` on the box, and a first real run-through of this runbook** — nothing
  in this pipeline has been executed on the physical box yet.
- **Uptime Kuma monitor configuration** — done in its web UI post-first-boot, not in compose:
  health-endpoint checks + a notification channel, closing the "silent failure" gap ADR-034 flagged
  for the home-hosted RabbitMQ path.
- **Carried over from `CLAUDE.md`'s existing pre-production checklist** (unaffected by this PR,
  listed here so "before going live" has one place to look): Sentry error alerting, the safety
  disclaimer in-app + Terms of Use, and revisiting `.env`-file secrets management now that a
  staging-shaped server is genuinely being provisioned (the condition `CLAUDE.md` already names
  for that revisit).
