# Mobile sync protocol — WatermelonDB design spec

> **Status: drafted 2026-08-26.** M9a WP1 output. This is the document
> `docs/adr/mobile-offline.md` names as its own gate: *"Nothing here should be coded before the
> WatermelonDB schema is written as a full design document and reviewed against the final server
> schema."* Written against the schema as it actually is, not as the ADR describes it — several
> mechanisms in that ADR turn out not to survive contact with the real models, and each is called
> out below.
>
> Companion WP outputs: `offline-tiles-spec.md` (WP2), `satellite-feed-spec.md` (WP3),
> `../play-store-checklist.md` (WP4). Reconciliation of all four into `mobile-offline.md` is WP6.

---

## 1. Vocabulary — three independent axes

These were being used as if they were one list. They are not; they combine.

**Axis 1 — direction.**

- **sync-down** — server → device. "Here is what the plan looks like."
- **sync-up** — device → server. "Here is what I did while offline."

**Axis 2 — payload shape.**

- **wholesale** — send everything; the receiver replaces its copy.
- **delta** — send only what changed since a marker; the receiver applies the changes.

|            | wholesale                                    | delta                                             |
| ---------- | -------------------------------------------- | ------------------------------------------------- |
| **down**   | server sends the whole trip each reconnect   | server sends "these 3 points changed, day 3 is gone" |
| **up**     | device sends its entire local trip state     | device sends its queued mutations                 |

**Axis 3 — conflict policy.** Not on either axis above. It answers "whose version survives when
*both* sides changed the same thing?" — `device-wins` or `server-wins`. Independent of direction
and shape.

**Wholesale is not a different mechanism from delta.** It is delta whose granularity is
"everything." Choosing between them is really choosing *where the boundary sits*, which is why
§4 sets granularity per aggregate rather than globally.

Note that sync-up was never genuinely in question: a mutation queue **is** delta-up by
construction. Each queued envelope is a change record. The only live decision was sync-down.

---

## 2. What WatermelonDB actually requires

> **Sync-up superseded, 2026-09-25 (M9d).** The app uses WatermelonDB for sync-*down* only.
> Everything the phone changes, except the route, goes up as envelopes through the mutation
> queue (`docs/adr/mobile-offline.md` "Sync up", the M9d plan); the `pushChanges` endpoint
> item 4 below built was removed once nothing used it. The route still travels on its own
> channel (§8.2). The `pushChanges` discussion below is kept as the design history it is.

`synchronize({ pullChanges, pushChanges })`.

- **`pullChanges({ lastPulledAt, ... })` → `{ changes, timestamp }`** — this is **sync-down**.
- **`pushChanges({ changes, lastPulledAt })`** — this is **sync-up**.

Both directions carry the identical shape:

```js
{
  days:   { created: [...], updated: [...], deleted: ["id", ...] },
  points: { created: [...], updated: [...], deleted: [...] },
  // ... one entry per synced table
}
```

Three properties of the library that constrain everything downstream:

1. **Deleted records are represented by ID only**, never as full records. The pull endpoint must
   return the IDs of everything deleted server-side since `lastPulledAt`.
2. **Every record needs a single string `id`.** Composite primary keys have no representation in
   WatermelonDB's model.
3. **Conflict resolution is per-column, client-wins**: on pull, the server's version of a record
   is taken, then any column the client changed locally since last sync is re-applied. The device
   tracks this with `_status` (`synced`/`created`/`updated`/`deleted`) and `_changed` (the list of
   locally-changed columns).

**The device side of tombstones is already solved by the library.** A local delete does not remove
the row; it flags `_status = deleted`, which is how `pushChanges` reports deletions upward, and
the row is purged only after a successful push. The gap is entirely **server-side** — see §5.

**The consequence that decides §7:** property 3 operates on *one record, column by column*.
WatermelonDB has no concept of an invariant spanning multiple records.

Sources: [Sync — Backend](https://watermelondb.dev/docs/Sync/Backend),
[Sync — Frontend](https://watermelondb.dev/docs/Sync/Frontend),
[Sync implementation](https://watermelondb.dev/docs/Implementation/SyncImpl),
[Sync — Limitations](https://watermelondb.dev/docs/Sync/Limitations).

---

## 3. Decision — delta sync-down

**Decided: delta, not wholesale snapshots.**

The deciding argument is not bandwidth, it is the library. `pullChanges` is delta-shaped by
contract; shipping wholesale snapshots would mean bypassing `synchronize()` and hand-rolling
reconciliation against the library's grain.

The cost this accepts, made visible now rather than discovered in M9c: **delta requires
server-side tombstones**, which this schema has none of (§5).

Conflict policy stays **device-wins during `happening`**, per `mobile-offline.md` — the crew on
the water have ground truth the server does not. Note this aligns with WatermelonDB's built-in
per-column client-wins default, so it costs nothing to implement for ordinary fields. It is the
*route* where "device wins" needs care — the representation in §7, the divergence handling in §8.
There, "device wins" is deliberately **not** automatic: a diverged route is adjudicated by the
leader rather than silently resolved in either direction.

---

## 4. Delta granularity — chosen per aggregate

Uniform per-row delta is wrong here. The unit is chosen by whether an aggregate's correctness is
local to a row or global across rows.

| Aggregate                          | Delta unit                                          | Why                                                                                        |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Route** (days + points + boundaries) | **Whole itinerary subtree, atomically** — any change resends all of it | Integrity is global; a chain is only valid as a whole. Cheap — kilobytes.                    |
| **Weather / Sea**                  | **Per day**                                          | The payload bulk, refreshed independently on its own schedule. Granularity the data already has (§6). |
| **TripMember / crew**              | **Per row**                                          | Independent rows, no cross-row invariants.                                                  |
| **Inventory / requirements**       | **Per row**                                          | Same.                                                                                       |

Every table still reports `created`/`updated`/`deleted`, so WatermelonDB's contract holds
throughout. What varies is what counts as "changed."

---

## 5. Tombstones — the server-side gap

A tombstone records that something *used to exist*. It is required because **absence is not
queryable**: `SELECT * FROM day WHERE updated > :last_pulled` cannot return a row that has been
deleted, so a device that missed the deletion keeps showing the day forever — with its `next_id`
chain still routed through it.

Confirmed by grep across `Models/` and `Services/`: **there are no soft deletes anywhere in this
codebase.** Every deletion is a hard delete, most of them via DB-level cascade.

Two implementations, either acceptable:

1. **Soft delete** — a `deleted_at` column; `DELETE` becomes `UPDATE … SET deleted_at = now()`.
2. **Deletion log** — a separate table `(table_name, record_id, trip_id, deleted_at)`; the row
   really goes, the marker is recorded beside it.

**The real cost, and it is not small:**

- With soft deletes, **every ordinary query must filter `WHERE deleted_at IS NULL`.** Forget one
  and deleted data reappears in the UI — a whole class of easy, quiet bug.
- **The cascades are DB-level.** `Day.itinerary_id` is `ondelete="CASCADE"`, `Point.day_id`
  likewise. **Postgres cascades do not write tombstones.** Deleting one itinerary vaporises its
  days and points with no markers for any of them. This requires either DB triggers that write
  tombstones on cascade, or moving cascade responsibility into the service layer for synced
  tables.

That second point lands in the exact area M16 found four separate cascade bugs in (`Day.points`
missing an ORM cascade, `Point.next` missing `passive_deletes`, the GDPR erasure chain, the
`trip_member` cardinality warning). **Budget this as careful work in fragile territory, not as a
column you add.**

Recommendation: prefer the **deletion log** over soft deletes, precisely because it does not
require auditing every existing query in the application for a new `WHERE` clause. The tradeoff
is that it needs triggers (or service-layer cascade) to capture DB-cascaded deletes.

---

## 6. Weather / Sea

### 6.1 Why they do not derive `BaseModel` — and why that was right

`Weather`, `WeatherState`, `Sea`, `SeaState` and `TidalStreamEntry` extend `Base`, not
`BaseModel`: no `id`, no `created`, no `updated`. `Weather`/`Sea` are keyed by `day_id`;
`WeatherState`/`SeaState` by the composite `(day_id, time)`.

This is deliberate and documented as a pattern (the M5 plan calls out `TidalStreamEntry` as
"composite PK, no `BaseModel`"). The reason is visible in `Tasks/weather_fetch_task.py:90`:

```python
weather = db.session.get(Weather, day_uuid)
```

The day's id fetches the weather row **directly**, because it *is* the primary key. Three
consequences, all wanted:

1. **1:1 is enforced at schema level.** Two `Weather` rows for one day are physically impossible.
   A surrogate `id` would require a separate `UNIQUE(day_id)` — re-implementing the primary key
   just discarded.
2. **Lookup is a PK fetch**, not a secondary-index query.
3. **These are not entities.** They have no identity apart from their day. `Weather` *is* the
   day's weather; a `WeatherState` *is* the weather at hour H on day D. The composite key is what
   identifies it, and it makes two rows for 14:00 on one day impossible.

Textbook natural key on a dependent value object. **Do not "fix" this for M9.**

### 6.2 It is actively good for sync

`_upsert_weather` **deletes every `WeatherState` and re-adds them** on each refresh. There is no
update path; the collection is replaced wholesale per day.

Two things follow:

- **An `updated` column per state row would be meaningless** — a row that is only ever created or
  destroyed has `updated == created` forever. `BaseModel` would not have helped.
- **The natural key keeps identity stable across refetches.** A refetched 14:00 row has the same
  identity `(day_id, time)` as the row it replaced. Had these carried surrogate UUIDs, every
  refresh would mint 24 new ids per day and the device would see **24 deletions + 24 creations per
  refresh** — enormous churn for a forecast that barely moved.

**So WatermelonDB's single-`id` requirement needs no schema change**: derive a deterministic id in
the sync serializer — `f"{day_id}:{time}"` for state rows, `day_id` for the parents. It is stable
across refetches *precisely because* the natural key is stable.

### 6.3 The one change actually needed

Add **`fetched_at` to `Weather`**, and make **`Sea.recorded_at` bump on refresh** (today it is
`server_default=now()` with no `onupdate`, so it records insert time only).

**At the parent level, not per state row** — because the whole collection is replaced atomically
per day, one timestamp per day answers both questions that matter:

- "Has this day's forecast changed since `lastPulledAt`?" (the delta query)
- "Forecast as of …" (the label `mobile-offline.md` requires always be shown)

This also corrects the ADR, whose freshness algorithm reads
`server.weather.updated_at > device.cached_weather.updated_at` — **a column that does not exist on
either model.**

### 6.4 The device must be able to *request* a fresh forecast

`mobile-offline.md` says weather is "read-only on the device" and refreshed "on reconnection."
The first half is right; the second half quietly encodes an assumption that is wrong, and it
matters more than anything else in this section.

**The most important moment for a weather pull is from the phone, at the launch site, before
committing to the day's crossing.** That is the decision this product exists to inform. A design
where the device passively receives whatever the Celery beat task last happened to fetch gets the
freshness story exactly backwards — the leader standing on the beach with one bar of signal is
precisely the person who most needs the current forecast, and under the ADR as written they have
no way to ask for it.

**The resolution is a distinction the ADR conflates:**

- **"Read-only" is a *sync* property** and it holds: the device never mutates weather rows, so
  weather **never appears in `pushChanges`**. §4's per-day delta is sync-down only. Keep this.
- **Triggering a refetch is not a mutation.** It is an out-of-band action — an RPC that asks the
  server to go fetch from OpenMeteo. It sits *outside* the sync protocol entirely.

So: **`POST /api/v1/day/<id>/weather/refresh`** (name provisional). The server refetches, upserts
through the existing `_upsert_weather`/`_upsert_sea` path, bumps `fetched_at`, and the **next
`pullChanges` carries the new rows down through the ordinary delta path**. No new sync machinery,
no violation of the read-only invariant.

Design constraints on that endpoint:

- **The 6h Redis TTL must be bypassable** — its rationale ("conditions change slowly at
  day-planning granularity", `docs/adr/features.md`) is a *planning-desk* assumption and does not
  hold at a launch site. Guard OpenMeteo instead with a short per-day cooldown (order of minutes)
  plus the existing rate limiter, rather than by serving a stale cache to someone about to launch.
- **It is online-only and foreground-only by definition**, and must fail *legibly*: no signal
  means the UI says "no signal — showing forecast from 18:42 yesterday", never a silent no-op or a
  spinner that resolves to unchanged data. The `fetched_at` label is what makes the failure
  honest.
- **Frame it as safety, not convenience**, in both UI copy and the Play Store listing — it informs
  a go/no-go decision. This also feeds the Data safety narrative in `../play-store-checklist.md`.
- **Bound the claim.** This does not make forecasts available *at sea*. No signal, no refresh.
  Say so plainly to beta testers, alongside the same honesty the PWA-decline already requires
  about reading the plan offline.

### 6.5 The map overlay's wind and swell fields (M35)

The itinerary map's animated wind and swell are drawn from the same grids the
`GET /api/v1/day/<id>/wind-vectors` and `/wave-vectors` endpoints return. Each is one `(u, v)`
stamped across a 24×24 grid over the day's bounding box, with land cells nulled for waves — so the
pull carries the ingredients, not 24 hours of full grids (about 55,000 numbers a day). Two more
tables, read-only like weather and sea, and sent **whole on every pull** rather than by delta:
the box comes from the route's points, which have no tombstones and no per-row delta, and a day's
rows are about 5 KB a day raw (a few hundred bytes gzipped; about 50 KB raw for a ten-day trip)
that apply idempotently.

`velocity_days` — one row per day that has weather or sea data (`id` = `dayId`):

| Field | Meaning |
|---|---|
| `south`, `north`, `west`, `east` | The day's padded route bounding box, in degrees |
| `size` | Cells per axis (24) |
| `landMask` | `size × size` characters, `"1"` where the cell is land, flat and row-major from the NW corner |

`velocity_hours` — 24 rows per such day, hours 0–23 (`id` = `<dayId>:<hour>`): `windU`, `windV`,
`waveU`, `waveV`, each in m/s and `null` when the day has no usable state. Every hour is always
sent, so a stale one on the device is overwritten rather than kept.

**The device stamps; it does not compute.** It rebuilds a field by filling `size × size` cells with
the hour's `(u, v)` and, for waves only, nulling the `"1"` cells. The unit conversion (wind km/h →
m/s), the nearest-hour fallback and the rounding all stay on the server
(`TidalService.wind_flow_at_hour` / `wave_flow_at_hour`), shared with the two endpoints, and
`Tests/92_m35_velocity_sync_test.py` asserts that the stamped result equals what the endpoints
return for the same day and hour. A device with no cached rows falls back to fetching the endpoint.

The "forecast as of" age is the day's existing `weather.fetched_at` / `sea.recorded_at`; these
rows add no timestamp of their own.

---

## 7. The point linked list

**Direction: both — and sync-up is the dangerous one**, since that is where the leader reroutes
while offline.

### 7.1 Why per-record sync cannot hold this invariant

`next_id` is, to WatermelonDB, an opaque string column on one row. The library does not know it is
a pointer, and its conflict resolution (§2, property 3) is per-column on a single record. **A
multi-record invariant is structurally invisible to it.**

The concrete failure:

> Leader inserts point X between A and B while offline. Locally: `A.next = X`, `X.next = B`.
> Meanwhile, on the web, someone deletes B.
> Pull arrives carrying `points.deleted = [B]`. WatermelonDB deletes B.
> `X.next → B`, which no longer exists. **Dangling pointer.**

The same hazard applies on push: apply A's `next_id` update but not X's create — or apply them in
the wrong order — and the chain forks, cycles, or dangles.

This is not hypothetical territory. M19 (`chain_in_order`, PR #119) and M20 §4 both shipped
ordering bugs **server-side, with full consistent state in hand**. Doing it incrementally on a
device holding partial information is strictly harder.

### 7.2 Resolution — sync an order key, never `next_id`

**The linked list is a server-side storage representation, not a domain requirement**, and the
codebase already agrees:

- `pointOrder` — a flat array — has been the web client's canonical route order since **M4b**.
- **M20** added `POST /itinerary/<id>/point-order`, which re-chains the whole route via
  `chain_in_order`.

The conversion between "ordered list" and "linked chain" **already exists in this codebase**.

So the device's `points` table carries an **order key** and never sees `next_id`. The server
converts at the boundary, atomically, in one transaction — where chain integrity can actually be
guaranteed.

**Use a fractional / lexicographic order key, not an integer.** With integers, inserting between
positions 3 and 4 renumbers everything after it, turning one logical edit into N record updates
that must all land together — recreating exactly the multi-record invariant this is escaping. With
a fractional rank (`3.5` between `3` and `4`, or `"m"` between `"h"` and `"t"`), **an insert
touches exactly one record.**

That is the whole trick: **it converts a global invariant into a per-record property**, which is
precisely the shape WatermelonDB's per-column model handles correctly.

Worst case under concurrent edits is two points landing on the same rank — a cosmetic tie, broken
deterministically by id. Compare with a dangling `next_id`, which is a broken route.

### 7.3 Interaction with `Day.start_point_id` / `end_point_id`

Days share boundary points (the overnight stop belongs to the day that *ends* there — M20 §2).
A day boundary is therefore a property of the route as a whole, not of one day row, which is why
§4 keeps days and points in one atomic aggregate even though point *ordering* is per-record.

---

## 8. Post-divergence reconciliation — decided

§7.2 shrinks the original "409 question" but does not dissolve it. The device pushes per-point
order keys rather than a whole-route re-chain, so it is no longer submitting a stale id set — but
the server must still decide what happens when the two point sets have genuinely diverged (leader
added X offline; someone deleted B on the web).

**Decided 2026-08-26.** Divergence is detected mechanically, adjudicated by a human, and the
adjudication is applied as a command rather than merged.

### 8.1 Detection — `Itinerary.route_version`

Per-row comparison is the wrong test. Per §7 the route's correctness is global, so "did the route
diverge?" is not answerable by asking whether any individual `Point` row changed on both sides.

**A route-level optimistic-concurrency token**: `Itinerary.route_version`, an integer bumped on
any structural change — point add/delete/reorder, day boundary move. The device stores the version
it last pulled and sends it as the base of any route push. **Version mismatch is divergence**,
full stop. Same idea as an ETag, cheap to implement, and it needs no diffing.

Who can detect:

| Party | Can detect? | When |
|---|---|---|
| **Server** | Yes | At push — compares the device's base `route_version` to current. |
| **Device** | Yes | At pull — WatermelonDB already computes this in its conflict step (`_changed` vs incoming). |
| **Web client** | **No** | It only ever sees server state and cannot know a phone holds divergent data. Web is a *consumer* of the resolution, never a detector. |

**Scope is route-only.** Weather is read-only (§6). Crew, inventory and float-plan fields are
per-row with no cross-row invariants, so WatermelonDB's per-column client-wins resolves them
correctly with no human involved. The conflict machinery below is built **once, for one
aggregate** — it is not a general mechanism, and should not become one.

**Leader-only by construction.** Route edits are leader-only, so crew devices cannot create route
divergence and must never be offered the choice.

### 8.2 The route travels on its own channel — including when there is no conflict

**The route does not go through WatermelonDB's `pushChanges` at all.**

The reason is failure containment, not elegance. A failed push fails the whole sync, so if the
route rode the ordinary channel, a parked route conflict would wedge **queued check-ins,
float-plan edits and inventory updates behind a route disagreement the leader has not looked at
yet.** A check-in is safety data; it must never be held hostage that way.

The route is already exceptional in every other respect — atomic aggregate (§4), order keys rather
than `next_id` (§7.2), server-side chain conversion. Its own push path means conflicts stay
contained, and the same channel carries both the ordinary push and the resolution.

Accepted cost: two sync paths to maintain, and the device must render "everything synced except
the route."

### 8.3 Adjudication — non-blocking, and it must show the difference

**Detection must never block sync on a human.** Reconnection happens when it happens: landing on a
beach, phone in a drybag, 2am in a tent when it finds wifi. A modal firing *during* sync fires at
the worst possible moments. So a detected conflict is **parked** — surfaced as persistent state,
resolved when the leader is actually able to.

**The notification opens a comparison view, not a dialog.** "Keep mine / keep theirs" with nothing
shown asks a leader to guess about route data, and a guess about route data is a safety-relevant
guess. To choose meaningfully they must *see* both variants with the differences highlighted on a
map. **This is a real M9d feature and should be sized as one** — not a popup.

**While a conflict is parked, the device keeps showing the local route**, with a persistent
"route not synced — needs review" banner. Showing server state instead would make the leader's
offline edits appear to have silently vanished, which is the worst available failure mode at sea.
**Queued mutations stay queued and are never dropped.**

### 8.4 Resolution is a command, not a merge

Once adjudicated, the resolution must not go back through the merge path — the merge path is what
produced the ambiguity. It is a *command*: "the route is now exactly this." Applied as a **replace
in one transaction**, bumping `route_version`. Other devices and the web then pull it as an
ordinary update.

**This resolves the M20 409 tension cleanly:**

- **`POST /itinerary/<id>/point-order` keeps its 409** on a mismatched id set. That guard is
  correctly protecting against the stale-list orphan bug, where an orphan's position falls to the
  UUIDv7 tie-break PR #119 was paid to fix.
- **The resolution endpoint is the one path allowed to accept a mismatched id set** — because a
  human just adjudicated it. Same shape as `point-order`, different precondition: it carries the
  `route_version` it supersedes instead of requiring the sets to match.

So the general rule holds — never apply a re-chain over a set you cannot account for — with
exactly one explicit, human-authorised exception.

---

## 9. Backend work this commits to, before M9c

None of this is mobile code. All of it blocks M9c.

| # | Item | Notes |
|---|------|-------|
| 1 | **Tombstones** on synced tables — deletion log preferred | Must capture DB-cascaded deletes (triggers or service-layer cascade). Fragile territory — see §5. |
| 2 | **`Weather.fetched_at`**, and `Sea.recorded_at` bumping on refresh | Parent level only. Serves both the delta query and the "forecast as of" label. |
| 3 | **`POST /day/<id>/weather/refresh`** | §6.4. TTL-bypassing with a short cooldown. |
| 4 | **`pullChanges`/`pushChanges` endpoints** | Granularity per §4; deterministic derived ids for weather/sea per §6.2. **Excludes the route** — see item 7. |
| 5 | **Order-key column on `Point`** + conversion to/from `next_id` at the sync boundary | Reuses `chain_in_order`. Fractional ranks per §7.2. |
| 6 | **`Itinerary.route_version`**, bumped on any structural route change | §8.1. Optimistic-concurrency token; the whole divergence test. |
| 7 | **Dedicated route push/pull channel**, outside `pushChanges` | §8.2. Failure containment: a parked route conflict must not wedge check-in or float-plan sync. |
| 8 | **Route resolution endpoint** — replace-in-one-transaction, carries the superseded `route_version` | §8.4. The one path allowed to accept a mismatched id set; `point-order` keeps its 409. |

M9d additionally owns the **route comparison view** (§8.3) — a map showing both variants with
differences highlighted. Frontend, and it is a feature, not a dialog. Size it as such.

## 10. Corrections this spec makes to `docs/adr/mobile-offline.md`

For WP6 to fold in:

- Weather freshness algorithm reads `updated_at` on `Weather`/`Sea` — **no such column exists**
  on either model (§6.3).
- "Refreshed on reconnection" omits the device-initiated refresh, which is the **highest-value**
  weather moment in the product (§6.4).
- The sync-down protocol's `last_synced_at` + `updated_at` delta **cannot detect deletions** at
  all in this schema (§5).
- `updated` (not `updated_at`) is the real column name on `BaseModel`, and it does **not**
  propagate to parents — moving a `Point` leaves `Day.updated` and `Itinerary.updated` untouched.
- The tile source is described as "our own MinIO proxy … and titiler (Sentinel-2 satellite)".
  **`titiler` appears nowhere in the backend**; only `osm` and `seamark` are proxied, and the
  MinIO half did **not** move to R2 with the rest of object storage — v0.6.0 moved the tile
  cache to local disk (`Services/tile_cache.py`) precisely because the proxy re-serves bytes
  through Flask, making every cache hit a WAN round trip (see `offline-tiles-spec.md`).

## 11. Medical notes — what M22 changes for this spec (2026-09-01)

> **Moot as of 2026-09-02 — nothing to sync.** The medical-notes feature was **parked**
> (`docs/adr/safety-privacy.md` "Parked (2026-09-02)"): the endpoints 404, the UI does not
> render it, and the stored ciphertext was purged. There are no notes for a device to hold,
> so M9c has no medical-notes decision to make.
>
> **The question is sidestepped, not answered.** If medical notes are ever unparked, WP6's
> open question comes back exactly as stated below — a leader needs crew notes when there is
> no connectivity, and that is still in tension with what belongs on a phone that can be lost
> at sea. Everything below stays because it is the work already done on that trade, and it is
> the right starting point for whoever picks it up.

WP1 §9's list above still stands unchanged; this section doesn't add a backend item, it changes
what the answer to WP6's open question would cost if M9c says yes.

**The open question itself is not decided here.** M9a WP6 left it open: whether medical notes
sync to the device at all, because a leader needs a crew member's notes in an emergency and an
emergency at sea is exactly when there is no connectivity — but the sync table said no, because
server-side decryption meant offline access = caching plaintext health data in WatermelonDB on a
phone that can be lost at sea. That trade is what M9c has to weigh, and it still does.

**What M22 changes is the cost side of that trade, not the decision.** Medical-notes crypto now
runs client-side (`frontend/lib/crypto/medical.ts` on web; the same module, or a React Native
port of it per the library-choice note in the M22 plan, would run on
mobile). Concretely, if M9c decides notes should sync:

- What syncs down is `User.public_key` / `private_key_ciphertext/nonce/salt` and the sealed
  `medical_notes_ciphertext/nonce/salt` triples (own and, for a leader, each consenting crew
  member's leader-sealed copy) — opaque strings, synced like any other row via the existing
  `pullChanges` shape (§4). No new sync mechanism, no new conflict semantics: these columns are
  never edited concurrently by two devices the way a route point is.
- **No plaintext note, and no plaintext private key, is ever written to WatermelonDB.** The
  private key is derived and held in memory only, for the session, the same "derive once per
  session, never on disk" rule §"Library choice" in the M22 plan sets for the web session-length
  key hold — mobile has the same requirement and a harder deadline, since a lost phone is the
  threat model this whole milestone exists for.
- The **PBKDF2 cost measured in that plan** (600k iterations: 365ms via WebCrypto, ~2.9s in pure
  `@noble` JS — the only path React Native has) is the real budget for whatever "unlock to read
  crew notes offline" interaction M9c designs, not an estimate to redo from scratch.

So M9c's decision is unblocked from "would this mean shipping plaintext health data to a phone" —
it no longer would — and is now purely about UX and the interaction cost of a multi-second local
unlock, which is a product call M9c is better placed to make than this spec.
