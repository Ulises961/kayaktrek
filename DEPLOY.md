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

## Secrets (SOPS)

The production `.env` used to be copied to the box by hand. It then drifted: the local copy
gained variables the server had never heard of, nothing could show the difference, and the
first symptom was a container refusing to start on a variable name that meant nothing on its
own. That is the failure this replaces.

`secrets/env.prod.sops` is the encrypted production environment, committed to the repo. The
server gets it with `git pull` like any other file, so there is only ever one copy.

**Only values are encrypted — variable names stay readable.** A `git diff` therefore shows
which variables were added or removed without exposing any of them, which is what makes the
drift visible in review instead of at 3am.

> **The deploy key is not the backup key.** This key's private half *must* live on the server,
> because that is where decryption happens. The backup key's private half must *never* be
> there — that is the whole property that makes `scripts/backup-db.sh` worth having. Generate
> two keypairs and keep them apart.

### One-time setup

1. **Generate the deploy keypair** on your dev machine:
   ```bash
   age-keygen -o deploy-key.txt
   ```
   Put the `age1…` public key in `.sops.yaml`, replacing the placeholder. Put the private
   half in your password manager.

2. **Install the private key on BOTH machines**, where sops looks for it by default:
   ```bash
   mkdir -p ~/.config/sops/age && chmod 700 ~/.config/sops/age
   $EDITOR ~/.config/sops/age/keys.txt      # paste the AGE-SECRET-KEY-1... line
   chmod 600 ~/.config/sops/age/keys.txt
   ```
   The server needs it to deploy. **Your dev machine needs it to edit** — `sops
   secrets/env.prod.sops` decrypts into your editor and re-encrypts on save, so without
   the key there you can only ever re-encrypt from scratch, never change one variable.
   Without it, `sops --decrypt` fails with *"identity did not match any of the
   recipients"*, which reads like a wrong-key problem rather than a missing-key one.

   This costs nothing in exposure: the dev machine already holds `.env.prod` in plaintext,
   so holding the key that decrypts its ciphertext gives an attacker nothing extra. **That
   reasoning is specific to the deploy key** — it does not extend to the backup key, whose
   entire value is living nowhere near the data it protects.

3. **Install sops** on both machines — your dev box encrypts, the server decrypts. It is
   not in Ubuntu's repositories (`apt-cache search sops` finds only the unrelated
   `orca-sops`), but the project ships a `.deb`, which is preferable to dropping a loose
   binary in `/usr/local/bin` since apt then knows how to remove it:
   ```bash
   VER=$(curl -s https://api.github.com/repos/getsops/sops/releases/latest \
         | grep -oP '"tag_name":\s*"\Kv[0-9.]+')
   curl -sSLo /tmp/sops.deb \
     "https://github.com/getsops/sops/releases/download/${VER}/sops_${VER#v}_amd64.deb"
   sudo dpkg -i /tmp/sops.deb && rm /tmp/sops.deb
   ```
   `age` and `rclone`, by contrast, *are* in apt (`sudo apt install age rclone`);
   `age-keygen` ships inside the `age` package.

4. **Encrypt the current `.env`** from your dev machine and commit it:
   ```bash
   ./scripts/env-encrypt.sh          # reads .env, writes secrets/env.prod.sops
   git add secrets/env.prod.sops && git commit -m "chore: encrypted production env"
   ```

### Changing a variable

```bash
sops secrets/env.prod.sops     # opens decrypted in $EDITOR, re-encrypts on save
git commit -am "chore: <what changed>"
git push
```

Then on the server, as part of deploying:

```bash
git pull
./scripts/env-decrypt.sh       # writes .env, reports which variable NAMES changed
docker compose -f docker-compose.prod.yml up -d
```

`env-decrypt.sh` keeps the previous `.env` as `.env.bak` and refuses to overwrite a working
one with a decrypt that produced almost nothing.

### If an existing server `.env` predates this

Two variables became **required** in `docker-compose.prod.yml` and are not in any `.env`
copied before 2026-08-23, so compose will refuse to start until they exist:

- `STORAGE_SECRET_KEY` — previously derived from `MINIO_ROOT_PASSWORD`
- `STORAGE_ACCESS_KEY` — previously derived from `MINIO_ROOT_USER`

To stay on MinIO, set them to those same two values. To cut over to R2, set them to the R2
credentials along with `STORAGE_ENDPOINT`, `STORAGE_BUCKET_PUBLIC`, `STORAGE_BUCKET_PRIVATE`
and `STORAGE_PUBLIC_BASE_URL`. See `.env.prod.example`.

### When this moves to DigitalOcean

Revisit, but not necessarily replace. SOPS keeps working unchanged on a droplet — the model
is "encrypted file in the repo, private key on the box", and a droplet is just a different
box. What changes is that a **CI/CD pipeline holding secrets** (M9's mobile builds, or
automated deploys) is one of the triggers in the root `CLAUDE.md` Secrets Management section
for moving to a real secrets manager: at that point the key has to be given to a runner, and
Doppler or Infisical earn their cost. Until a machine that is not yours needs to decrypt,
SOPS is the right size.

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

2. **Create the B2 bucket and an application key** scoped to it, with **write but not
   delete**. Put the key id, key, and bucket name in `.env`.

3. **Add a lifecycle rule** on the bucket to expire files after your retention window
   (30 days is a reasonable start). This is what prunes old dumps.

4. **Install the two tools** on the box:
   ```bash
   sudo apt install age rclone
   ```

5. **Schedule it** from the host's cron — not Celery beat. A backup that depends on the
   application stack being healthy is exactly the backup you cannot take on the day the
   application stack is not healthy:
   ```
   17 3 * * *  cd /path/to/kayak-expedition-planner && ./scripts/backup-db.sh >> /var/log/kayak-backup.log 2>&1
   ```
   Cron mails failures to the local user, which is the only alerting this has until the
   Observability checklist's alerting item is done.

### Rehearsing a restore

**Do this once when you set it up, and after any change to either script.** A backup you
have never restored is not a backup — it is a file-copying job you hope is a backup.

```bash
BACKUP_AGE_IDENTITY_FILE=/tmp/kayak-backup-key.txt ./scripts/restore-db.sh
shred -u /tmp/kayak-backup-key.txt      # put the key back where it belongs
```

It downloads the newest backup, decrypts it, loads it into `kayak_restore_check`, and
reports the row count in `users` — a load that "succeeds" but produces no rows is the
failure this is looking for. Drop the scratch database when you are satisfied.

### Real recovery

```bash
BACKUP_AGE_IDENTITY_FILE=/tmp/key.txt ./scripts/restore-db.sh --into-live <backup-name>
```

It requires you to type the live database name before it does anything.

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
`nginx/kayak-expedition-planner.conf`'s header comment for why there's no `app.` subdomain),
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
