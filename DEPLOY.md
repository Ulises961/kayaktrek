# Release & deploy runbook

Two separate operations, in this order: **cutting a release** publishes versioned images to GHCR
from a git tag, and **deploying** pulls a published version onto a box. They are kept in one file
because for a single operator they are one continuous flow, and two files would drift.

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

`pull` fetches `:latest`, i.e. the most recently *tagged* release. To deploy a specific version
instead, set `KAYAK_IMAGE_TAG` (it defaults to `latest`); put it in the box's `.env` to make the
pin stick across deploys. See "Rolling back" for the full form and its one real caveat.

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

## Deploying configuration to the box

The server runs prebuilt images from GHCR — nothing is built there — but it still needs a
handful of files from this repo: the compose file, the backup scripts, the nginx config,
and a `.env`. `scripts/deploy-sync.sh` pushes that whole set over SSH from your machine.

```bash
DEPLOY_HOST=user@box ./scripts/deploy-sync.sh --dry-run   # show what would change
DEPLOY_HOST=user@box ./scripts/deploy-sync.sh             # push it
```

`DEPLOY_PATH` sets the target directory (default `kayak`), `DEPLOY_ENV_FILE` the local env
file (default `.env.prod`, landing as `.env` with mode 600).

**Why a script rather than copying files across.** Hand-copying caused two outages on
2026-08-24: a `docker-compose.prod.yml` that predated the R2 wiring, so `migrate` ran with
no `STORAGE_*` environment and refused (correctly) to rewrite every stored object URL
against a dead host; and a `.env` that predated `STORAGE_SECRET_KEY` becoming required, so
the stack would not start. Neither was hard to fix. Both were invisible until something
crashed, because nothing could answer *"is what is on the box what is in the repo?"*.

Pushing the whole set every time means a subset cannot go stale. The remaining failure mode
is forgetting to run it — one thing to remember, rather than a judgement per file per
release. The dry run prints what it is about to correct, which is worth reading after a
quiet week.

**nginx is deliberately not synced.** `nginx/kayak-expedition-planner.conf.template` is a
template whose every `server_name` and certificate path reads `kayak.example.com`. Installing
it means substituting the real domain first:

```bash
sed 's/kayak\.example\.com/<real-domain>/g' nginx/kayak-expedition-planner.conf.template \
  | sudo tee /etc/nginx/sites-available/kayak-expedition-planner.conf
sudo nginx -t && sudo systemctl reload nginx
```

Copying it *unsubstituted* over a live config replaces a working one with placeholders —
which happened on 2026-08-24, from a deploy script that both synced this file and printed a
`sudo cp` of it into `sites-available`. The failure is quiet at first: `nginx -t` fails on
the missing certificate directory, so the reload is refused and the running process keeps
serving the old config until something restarts it. The `.template` suffix now makes the
plain `cp` impossible, and host-level config needing substitution and root is out of the
automated push entirely. It changes about once a year.

**Adding a file the server needs?** Put it in the `FILES` array in the script. A file that
is not in that list is a file that will drift.

**Nothing here is encrypted at rest, deliberately.** SSH encrypts it in transit and it lands
on a machine you control — there is no third party in the path, so there is nothing to
protect it from. The database dumps *are* encrypted (see Backups below) because those go to
Backblaze. That difference — where the data ends up — is the whole rule.

A SOPS-encrypted env committed to the repo was built and then removed on 2026-08-24: it
solved the same drift problem, but only because the server had a checkout to pull it into.
Once the sync script delivers the file directly, the encryption guarded nothing and cost a
keypair to manage. See `docs/adr/foundation.md`.

**`.env.prod` now exists only on your dev machine.** Nothing else holds a copy, so put it in
your password manager — losing `JWT_SECRET_KEY` logs out every user, and the rest is not
reconstructable from memory during an outage.

## Backups

`scripts/backup-db.sh` dumps Postgres, compresses, encrypts to an `age` public key and
uploads to Backblaze B2. `scripts/restore-db.sh` brings one back — into a **scratch**
database by default, so rehearsing is easy and destroying the live one is not.

Two properties drive the whole design, and both are worth preserving if you change it:

- **The box holds only the age _public_ key.** It can write backups it cannot itself read,
  so a compromised server does not hand over the backup history with it. The private key
  lives in your password manager and is fetched only for an actual restore. *Not* in GNOME
  Keyring or any other keyring on this machine — that key would die with the box whose
  death is the reason the backups exist.
- **The B2 credential can write but not delete.** Retention is a bucket lifecycle rule,
  applied server-side, so no script ever needs delete rights and a compromised box cannot
  erase history. This is why there is no pruning code in `backup-db.sh`.

B2 rather than R2 because once objects live in R2, Cloudflare holds primary data — a dump
beside them means one account suspension takes out both the data and the ability to
restore it.

### One-time setup

1. **Generate the keypair**, somewhere other than the server:
   ```bash
   age-keygen -o kayak-backup-key.txt
   ```
   The `age1…` public key goes in `.env` as `BACKUP_AGE_RECIPIENT`. The file's
   `AGE-SECRET-KEY-1…` line goes in your password manager, and nowhere else. Consider
   printing it: it is one line, and you need it exactly once, on the worst day.

2. **Create the B2 bucket and an application key scoped to that bucket only**, with
   **listFiles, readFiles and writeFiles — but not deleteFiles**. Put the key id, key and
   bucket name in `.env`, along with `BACKUP_B2_ENDPOINT`: the bucket's **S3-compatible**
   endpoint (`https://s3.<region>.backblazeb2.com`, shown on the bucket's page).

   `readFiles` and `listFiles` are needed even though this only ever uploads — rclone checks
   the destination before writing, verifies the size afterwards, and the restore path reads.
   Withholding `deleteFiles` is the one that matters: it is what stops a compromised box
   erasing the backup history.

   The scripts use B2's **S3 API**, not rclone's native `b2` backend. The native backend
   always checks the bucket exists and creates it if not, with no way to turn that off
   (`--s3-no-check-bucket` exists; `--b2-no-check-bucket` does not) — and a bucket-scoped key
   cannot create buckets, so every upload fails with a 401 reading *"failed to create
   bucket"*, naming a permission that was withheld on purpose.

3. **Add a lifecycle rule** on the bucket to expire files after your retention window
   (30 days is a reasonable start). This is what prunes old dumps.

4. **Install the two tools system-wide** on the box:
   ```bash
   sudo apt install age rclone
   ```

   **System-wide matters.** A scheduled job runs with a minimal `PATH` that excludes
   `~/.local/bin`, `~/go/bin` and `/snap/bin` — which is exactly where a `go install`, a
   `cargo install` or a snap puts these. The scripts check for their tools and abort with
   `ERROR: 'age' is not installed`, which is misleading when age *is* installed and merely
   invisible to the scheduler. Confirm with the scheduler's view, not your shell's:
   ```bash
   env -i /bin/sh -c 'command -v age; command -v rclone'   # must print both paths
   ```
   The unit in step 5 also pins `PATH` explicitly, as a second line of defence.

5. **Schedule it with a systemd timer** — from the host, not Celery beat. A backup that
   depends on the application stack being healthy is exactly the backup you cannot take on
   the day the application stack is not healthy.

   ```bash
   sudo cp systemd/kayak-backup.service.template /etc/systemd/system/kayak-backup.service
   sudo cp systemd/kayak-backup.timer            /etc/systemd/system/kayak-backup.timer
   sudo -e /etc/systemd/system/kayak-backup.service   # fill in __USER__ and __REPO_DIR__
   sudo systemctl daemon-reload
   sudo systemctl enable --now kayak-backup.timer
   systemctl list-timers kayak-backup                 # confirm the next run
   sudo systemctl start kayak-backup.service          # run one now, on demand
   ```

   **A cron line will not work on this box, and will not tell you so.** The machine runs
   `autosuspend`; cron has no concept of a missed run, so an entry at 03:17 on a suspended
   machine does not fire and does not catch up. It also produces no output, so cron's
   mail-on-failure never triggers either — the job reads as configured and silently never
   runs. `Persistent=true` on the timer is the fix: systemd records the last trigger and
   fires on the next wake.

   Enable the **timer**, never the service — the unit has no `[Install]` section on purpose,
   because enabling it would take a backup at every boot.

   **Failure visibility.** Output goes to the journal (`journalctl -u kayak-backup`), which
   nobody reads, and the job's real failure mode is *never running at all* — which produces
   no output anywhere. Set `BACKUP_HEARTBEAT_URL` in `.env` to a push-monitor URL and the
   script pings it only on success, so a missed run, a suspended box and a broken `PATH` all
   surface the same way: as silence where a ping was expected. `uptime-kuma` is already in
   `docker-compose.monitoring.yml` and supports push monitors; set the expected interval to
   about 25 hours. Until then this has no alerting at all — see the Observability checklist.

   On a DigitalOcean droplet (ADR-034) all of this moves across **unchanged**: a droplet is
   an ordinary Linux host with systemd, so there is no cron container to build. Only two
   things change — nothing suspends, so `Persistent=true` becomes belt-and-braces rather
   than load-bearing; and if you take DO Managed Postgres instead of the container, the
   `docker compose exec postgres pg_dump` line becomes a `pg_dump` against the connection
   string. Note that DO's own managed backups do **not** replace this one: they live inside
   DO, so one suspended account takes the database and its backups together. Keeping the
   dump at a different provider is the entire point of the design.

### Rehearsing a restore

**Do this once when you set it up, and after any change to either script.** A backup you
have never restored is not a backup — it is a file-copying job you hope is a backup.

```bash
BACKUP_AGE_IDENTITY_FILE=<(pw-cli get kayak-backup-age-key) ./scripts/restore-db.sh
```

That is a bash process substitution: the private key travels down a file descriptor and
never touches a filesystem, so there is nothing to clean up afterwards. Prefer this over
writing the key to a file and deleting it — `shred` cannot reliably erase anything on a
journaling filesystem or on flash, and `/tmp` on this box is ext4-on-SSD, so the delete-
after pattern this used to recommend gives less assurance than it looks like. If you must
use a file, put it on `/dev/shm` (tmpfs), where a plain `rm` is genuinely sufficient.

It downloads the newest backup, decrypts it, loads it into `kayak_restore_check`, and
reports the row count in `users` — a load that "succeeds" but produces no rows is the
failure this is looking for. Drop the scratch database when you are satisfied. Use
`./scripts/restore-db.sh --list` to see backup names, and pass one explicitly to rehearse
a specific one rather than always the newest.

### Real recovery

First, find the exact backup you want — this needs only the B2 credentials, not the
private key:

```bash
./scripts/restore-db.sh --list
```

That prints real B2 object keys, e.g. `kayak-2026-08-24T151700Z.sql.gz.age`. Then:

```bash
BACKUP_AGE_IDENTITY_FILE=<(pw-cli get kayak-backup-age-key) \
    ./scripts/restore-db.sh --into-live kayak-2026-08-24T151700Z.sql.gz.age
```

**That argument is the backup name from `--list`, never the database name** — the two
can look interchangeable under pressure, since the confirmation prompt right after this
also asks you to type the database name, for a different reason. Get it backwards and the
script now rejects it immediately, before asking you to confirm anything destructive
(closed after a real incident where a database name was passed here: the restore silently
failed to find anything to load — decrypt errored on a file that had never downloaded —
having already asked for, and received, the DROP confirmation for a request that was
never going to succeed. The live database was never touched, because the DROP itself
only runs after a successful decrypt, but the sequence should never have gotten that far).

It requires you to type the live database name before it does anything destructive.

### What is not backed up

**Objects** — avatars, route photos, documents — are not in these dumps. They live in R2
with object versioning, which covers hardware failure and an accidental delete but **not**
account-level loss (Cloudflare suspension, billing lapse, a credential compromise used to
delete). That is a recorded, deliberate risk acceptance: photos are regrettable to lose,
the database is fatal. See `docs/adr/foundation.md`. When photo volume makes it worth it,
add a periodic `rclone` copy R2 → B2; R2 charges no egress, so it is free to run.

**`.env` itself** is not backed up either, and holds `JWT_SECRET_KEY` — losing it logs out
every user. It belongs in your password manager.

## Rolling back

Set `KAYAK_IMAGE_TAG` to the last known-good version and redeploy — no file edits, no rebuild:

```bash
KAYAK_IMAGE_TAG=v0.1.0 docker compose -f docker-compose.prod.yml pull
KAYAK_IMAGE_TAG=v0.1.0 docker compose -f docker-compose.prod.yml up -d
```

Every release is also tagged `:sha-<short>`, so a specific build can be pinned the same way when
there is no version boundary to fall back to (`KAYAK_IMAGE_TAG=sha-1a2b3c4`). Both images are
published together by `release.yml`, so one tag always names a matching pair.

**This rolls back code only.** `migrate` runs `alembic upgrade head` and never a downgrade, so a
release containing a destructive migration is not reversible this way — the schema stays forward
while the code goes back, and an older image may not understand it. Check what the release's
migrations did before relying on this.

## Status (2026-07-31 — first real deploy)

Live end-to-end for the first time: `kayaktrek.app` (frontend, bare apex — see
`nginx/kayak-expedition-planner.conf.template`'s header comment for why there's no `app.` subdomain),
`api.kayaktrek.app`, `live.kayaktrek.app`, `storage.kayaktrek.app` (MinIO S3 API, correctly
denying anonymous root-listing while serving `avatars/`/`point-images/` public-read) all resolve
through Cloudflare → `cloudflared` Tunnel → host nginx (TLS via certbot-dns-cloudflare,
auto-renewing) → the right container. GHCR images built and pushed on every merge to `master` at
the time; since 2026-08-02 (PR #100) publishing is driven by version tags instead — see "Cutting a
release" above.
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
