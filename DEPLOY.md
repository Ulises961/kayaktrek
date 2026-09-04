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

From your own machine, `scripts/deploy.sh` runs the whole sequence — sync the deploy set
(`deploy-sync.sh`), pull, `up -d --remove-orphans`, then a health check — in one call:

```bash
DEPLOY_HOST=user@box ./scripts/deploy.sh                        # deploy :latest
DEPLOY_HOST=user@box KAYAK_IMAGE_TAG=v0.8.0 ./scripts/deploy.sh  # pin a version
DEPLOY_HOST=user@box ./scripts/deploy.sh --dry-run               # sync preview only
```

What it runs on the box, if you'd rather do it by hand over an existing ssh session:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

`pull` fetches `:latest`, i.e. the most recently *tagged* release. To deploy a specific version
instead, set `KAYAK_IMAGE_TAG` (it defaults to `latest`); put it in the box's `.env` to make the
pin stick across deploys. See "Rolling back" for the full form and its one real caveat.

`migrate` re-runs `alembic upgrade head && flask seed` on every `up` — both are idempotent, so
this is safe to run on every deploy, not just the first one.

> **One-time note for the deploy that carries `e7a2c40d9b13` (medical-notes parking, 2026-09-02).**
> That migration **deletes data and cannot be undone** — every stored medical note, consent
> timestamp and access-log row, on purpose (`docs/adr/safety-privacy.md` "Parked (2026-09-02)").
> The plaintext was never on the server and the ciphertext is gone after this, so the only route
> back is a database restore from a backup taken beforehand. Take one first if you want that
> option; `kayak-backup.timer`'s most recent run is probably enough, but check its timestamp
> rather than assuming. Keypairs are kept, so nothing else about accounts changes.
>
> No environment variable needs setting for this: `MEDICAL_NOTES_ENABLED` and
> `NEXT_PUBLIC_MEDICAL_NOTES` are both off when unset, and the released image is built without
> the frontend one. Unparking later means setting the backend var *and* rebuilding the frontend
> image with the build arg — the client flag is inlined at build time and is not a runtime toggle.

Check it came up clean:
```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:5000/api/v1/health
```

## Monitoring / admin tooling

`docker-compose.monitoring.yml` — Portainer (containers), Glances (host CPU/RAM/disk/network),
pgweb (browse Postgres), Uptime Kuma (health-endpoint monitoring + alert notification — narrows
the silent-failure gap ADR-034 flagged for the home-hosted RabbitMQ path, but does not close it;
it runs on the box it watches, so see "What this stack cannot do" below; monitors and
notification channels are configured post-boot in its own web UI, not declaratively here).
Independent of the app stack's lifecycle — never touched by the redeploy loop above. **Must be
brought up after `docker-compose.prod.yml` at least once** — it joins the `kayak_net` network that
file creates, so pgweb can resolve `postgres` by name; a fresh box without the app stack running
yet will fail with a "network not found" error.

```bash
docker compose -f docker-compose.monitoring.yml pull
docker compose -f docker-compose.monitoring.yml up -d
```

**Brought up in production on 2026-08-28.** Not `--remove-orphans` — both compose files share a
directory with no explicit `-p` project name, so Compose labels the *other* file's containers
"orphans" of this one's view; that's a label artifact, not something to clean up, and passing
`--remove-orphans` here would actually stop the running app stack.

All on `127.0.0.1` only, same rule as everything else here: Portainer `:9002`, Glances `:61208`,
pgweb `:8081`, Uptime Kuma `:3001`. None of these are ever routed through the public Cloudflare
Tunnel domain — a DB browser or container-lifecycle UI reachable from the internet is not an
acceptable mistake to be one DNS record away from. Reach them from your own machine with one
tunnel:

```bash
ssh -L 3001:127.0.0.1:3001 -L 9002:127.0.0.1:9002 -L 61208:127.0.0.1:61208 -L 8081:127.0.0.1:8081 <box>
```

### Uptime Kuma — what to actually configure

Portainer, Glances and pgweb are pull tools: they answer when you go look, and cannot tell you
anything is wrong on their own. Uptime Kuma is the one push tool in this set, and it is the one
that matters for the root `CLAUDE.md` alerting checklist item (second in that item's cost order,
after a Logfire error-rate alert).

This is deliberately not scripted — first-run admin signup and typing an SMTP password into the
notification form are both account/credential steps, done once by a human in the web UI:

1. First visit creates the admin account.
2. **Settings → Notifications → Setup Notification → SMTP**, using the same relay already
   configured for the app (`MAIL_SERVER`/`MAIL_PORT`/`MAIL_USERNAME`/`MAIL_PASSWORD`/
   `MAIL_DEFAULT_SENDER`, `backend/.env.example`) — one more consumer of the existing Brevo
   relay, not a second one to provision.
3. Add these monitors, each with that notification attached:

   | Name | Type | Target | Why |
   |---|---|---|---|
   | App — public | HTTP | `https://api.<domain>/api/v1/health` | The path a real user takes: DNS → Cloudflare → tunnel → nginx → app. A local-only check can't see the tunnel drop. **`api.`, not the apex** — corrected 2026-08-31, this line said `https://<domain>/…` and the apex proxies to the frontend, so it 404s. A monitor built from it sits permanently red and gets dismissed as broken. Verify with `curl` before saving any monitor: the apex answers `/` and `api.` answers `/api/v1/health`. |
   | App — local | HTTP | `http://127.0.0.1:5000/api/v1/health` | If only the public one goes red, it's the tunnel, not the app — this pair is the diagnosis. |
   | RabbitMQ | TCP | `127.0.0.1:5672` | ADR-034's original reason for this container: a silent RabbitMQ death would take the missed-checkpoint shore-contact alert down with it, invisibly. |
   | ~~Backup heartbeat~~ | Push | — | **Declined 2026-08-31.** `BACKUP_HEARTBEAT_URL` stays unset. A *push* monitor needs the droplet to reach Kuma, and Kuma binds to `127.0.0.1:3001` here and is deliberately never tunnelled — so this would need either a second service or a path-scoped ingress rule on this box. Disproportionate, because the heartbeat's rationale was the *home box's* suspend behaviour (`backup-db.sh`'s comment: "the box suspends, so a missed window produces no output anywhere") and the droplet does not suspend. Accepted gap: a backup job that stops running is not alerted on. |

**What this stack cannot do, by construction.** Every monitor above runs on the machine being
monitored. That is fine for the pull tools, and it is a real limitation for Kuma: a dead box is a
dead Kuma. Treat this section as *diagnosis* — which service broke, tunnel or app — and put
*detection* somewhere that survives the host. See the "Still open" items in the Status section.

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

## Mail — two providers, two directions

Outbound and inbound are separate systems and neither can do the other's job. Worth stating
plainly, because "why not put it all in one place" is the obvious question and the answer is a
product limitation rather than a preference.

| Direction | Provider | Why not the other one |
|---|---|---|
| **Outbound** — app → any user (verification, password reset, invitations, shore-contact alerts) | **Brevo**, SMTP relay that Flask-Mail points at | Cloudflare has no transactional relay. Its Workers `send_email` binding may only send to addresses pre-verified on the account, which cannot serve an app that mails people it has never seen |
| **Inbound** — `privacy@` and friends → a real mailbox | **Cloudflare Email Routing**, free | Brevo is a sending relay; it does not host mailboxes |

ADR-016 already recorded the outbound half as the one acknowledged exception to the self-hosted
rule, because IP reputation cannot be self-generated. The split also puts the two in different
failure domains: a Brevo outage stops the app mailing users, but a data subject can still reach
`privacy@`, which the privacy policy names as the route for GDPR requests.

### DNS inventory

Six things live at the apex and they belong to three different systems. Deleting the wrong one
is quiet — mail keeps flowing until a receiver decides otherwise.

| Record | Belongs to | Purpose |
|---|---|---|
| `MX route{1,2,3}.mx.cloudflare.net` | Cloudflare | inbound routing. **Must be the only MX records** — Email Routing refuses to activate alongside any other |
| `TXT v=spf1 include:spf.brevo.com include:_spf.mx.cloudflare.net ~all` | both | authorises Brevo to send *and* Cloudflare to forward |
| `CNAME brevo1._domainkey`, `brevo2._domainkey` | Brevo | DKIM signing for outbound |
| `TXT cf2024-1._domainkey` | Cloudflare | DKIM for forwarded mail |
| `TXT brevo-code:…` | Brevo | domain ownership verification — Brevo stops sending without it |
| `TXT _dmarc` (`p=none`, rua to both) | both | reporting only; not enforcing |

**Exactly one `v=spf1` record, always.** RFC 7208 makes multiple SPF records a *permanent error*,
and a receiver hitting one stops evaluating SPF for every sender — so adding a second to
"authorise one more thing" silently disables the whole mechanism. Merge includes into the single
record instead. Cloudflare's Email Routing wizard offers to add its own SPF line; take the include
and edit the existing record rather than accepting a second.

This was wrong from the Brevo migration until 2026-08-31: the record carried only Namecheap's
forwarder, so every message the app sent failed SPF and passed DMARC on DKIM alignment alone.
Delivery worked, which is exactly why it went unnoticed for months.

### Changing any of it

Verify from outside, not from the dashboard:

```bash
dig +short MX  kayaktrek.app @1.1.1.1
dig +short TXT kayaktrek.app @1.1.1.1 | grep -c 'v=spf1'   # must print 1
dig +short TXT _dmarc.kayaktrek.app @1.1.1.1
```

Order matters when moving inbound providers: create and verify the destination address *first*,
then swap MX. Mail bounces in the window between the old MX being deleted and the new ones
propagating, and there is no queue to catch it.

### Aliases

`privacy@` is named in the privacy policy as the route for GDPR requests and must stay deliverable
for as long as the policy is published — letting it lapse is a compliance failure, not a broken
link. Keep `support@` separate rather than folding it in: a data subject request carries a
statutory one-month deadline where a how-do-I question does not, and Play's store listing requires
a support address of its own.

**Live as of 2026-08-31**, both forwarding to the operator's mailbox:

| Address | Role |
|---|---|
| `privacy@kayaktrek.app` | named in the privacy policy; GDPR requests |
| `support@kayaktrek.app` | user-facing help; the address Play's store listing requires |
| `no-reply@kayaktrek.app` | `MAIL_DEFAULT_SENDER` — outbound app mail only, not a mailbox. Set as `Kayaktrek <no-reply@kayaktrek.app>` (2026-08-31): a bare address in the From line is the shape both spam filters and cautious humans dislike, on a product that asks for float-plan and emergency-contact details. The display part must not be quoted in `.env`, or the quotes reach the header |

Verified by SMTP probe against `route1.mx.cloudflare.net` rather than by trusting the dashboard —
both accepted with `250`, and a made-up address on the same domain got `550 Address does not
exist`. That third check is the one that matters: without it a catch-all rule would look identical
to working routing. `RCPT TO` then `RSET` tests acceptance without delivering anything:

```bash
python3 - <<'EOF'
import smtplib
s = smtplib.SMTP("route1.mx.cloudflare.net", 25, timeout=12)
s.ehlo("kayaktrek.app")
for addr in ["privacy@kayaktrek.app", "nope@kayaktrek.app"]:
    s.mail("postmaster@kayaktrek.app")
    print(addr, s.rcpt(addr))
    s.rset()
s.quit()
EOF
```

**Changing `MAIL_*` needs a container recreate, not a restart.** Compose passes environment at
container *creation*, so `docker compose restart` picks up nothing — `up -d` recreates whatever
changed. And edit `.env.prod` on the dev machine, never `.env` on the box: the next
`deploy-sync.sh` overwrites the box's copy, which is the drift that script exists to prevent.

Acceptance at the MX is not delivery — Cloudflare accepts at the edge and forwards afterwards, so
an unverified destination or a spam filter still fails silently downstream. Send a real message
before depending on either address.

**Replying needs one extra step**, easily missed. Email Routing forwards *to* a personal mailbox,
so a reply leaves as the personal address unless Gmail is told otherwise. **Gmail → Settings →
Accounts → Send mail as → Add another email address**, then in the second popup:

| Field | Value |
|---|---|
| SMTP server | `smtp-relay.brevo.com` |
| Port | `587` |
| Secured connection | **TLS** — not SSL; pairing SSL with 587 fails opaquely |
| Username | the Brevo SMTP login (`MAIL_USERNAME` on the box) |
| Password | the Brevo **SMTP key**, not the Brevo account password |

Then set the radio in that same block to **"Reply from the same address the message was sent
to"**. Adding the alias alone does nothing without it — replies keep going out as the personal
address, which is the whole thing this exists to prevent.

Replies then carry the same SPF and DKIM as the app's own mail.

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

**Closed since (2026-08-30):**
- **Uptime Kuma monitors** — configured and verified: health-endpoint checks plus a notification
  channel. Monitor list and notification setup are under "Monitoring / admin tooling" above.
  **Read what this does and does not buy** (corrected 2026-08-31 — the first version of this line
  claimed it catches the box being gone, which is exactly backwards): Kuma runs on the box it
  watches, so a dead host is a dead Kuma. It cannot report a power cut, an ISP drop, a kernel panic
  or an unintended suspend — the failure modes that most need an alert. It is a **diagnostic panel**
  for failures *while the host is alive* (RabbitMQ dead, app 500ing, the public-vs-local pair that
  separates a tunnel fault from an app fault), and detection has to live somewhere else.
- **`StorageService.move()` under the live two-bucket R2 split** — manually verified (the M19
  `isPublic` public/private image toggle).

**Still open, not blockers to the current live state:**
- ✅ **Backups scheduled and rehearsed on the droplet (2026-08-31).** `kayak-backup.timer` enabled,
  a real run verified (`kayak-2026-08-31T121029Z.sql.gz.age`, size-checked against B2 by the script),
  and a restore rehearsed **on this box** rather than only on the retired one. Schedule is **09:17
  UTC**, not the small hours — see `systemd/kayak-backup.timer`: the heartbeat receiver is Kuma on
  the home box, which suspends, and a success ping fired at a suspended receiver fails rather than
  queues, so a night run would false-alarm every morning.
- ✅ **Off-box monitoring, in two layers (2026-08-31).** DO alert policies and uptime checks run on
  their control plane — always up, off-droplet by construction — covering droplet-down, CPU, memory,
  disk and public URL reachability. **Uptime Kuma on the home box** covers the richer application
  checks during its waking hours; now that the app lives on a droplet, `aspire` is a genuinely
  independent observer (different machine, network and provider), which is the property the
  "a box cannot monitor itself" finding demanded — obtained with no new vendor. Healthchecks.io was
  considered and proved unnecessary. **Residual:** a monitor that silently stops looks identical to
  "all fine" — if `aspire` fails to wake, no email arrives either way. DO's layer covers the
  important half.
- **A Logfire alert on error rate** — cheap, not yet done, and first in the alerting cost order.
  Sentry proper stays deliberately deferred past the Play closed beta (`CLAUDE.md`'s observability
  checklist).
- **R2 object versioning** — R2's durability covers hardware; versioning covers our own delete bug.
- ✅ **Privacy policy live in the app** (2026-08-31) — `frontend/app/(public)/privacy`. The
  earlier plan to put it on a separate `get.kayaktrek.app` static site was dropped the same day
  (that site's whole premise — surviving the box being down — was removed by this migration;
  see `docs/adr/foundation.md`'s ADR-034 decision log).
- **Secrets management** — `.env` still lives in exactly one place with no offsite copy; both
  `.env` files belong in a password manager. The trigger for a real secrets manager is a CI/CD
  pipeline holding secrets, which M9's mobile builds bring.
- Minor: two `apispec` `UserWarning`s during `flask seed` (`User`, `UserCertification` schema
  name collisions, M13's OpenAPI spec generation) — non-fatal, doc-quality only.
