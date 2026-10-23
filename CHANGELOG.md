# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A version here means a git tag, which is the only thing that publishes images — see
`DEPLOY.md`. Tagging does not deploy; deploying is a separate manual step.

## [1.4.0] - 2026-10-23

### Added

- **Switch your inReach on for each trip.** A registered inReach feed no longer posts to every
  trip that happens to be under way. You switch it on for the trips you are paddling, in the
  trip's Float plan tab, and it is off until you do. A trip you have not switched it on for gets
  nothing, and leaving a trip ends it. Switching it on asks you first, and says who sees the
  position: the other crew and, if a float plan link has been shared, the shore contact.
  **After this update an inReach that was feeding a trip stops until you switch it on for that
  trip.**
- **Heading and speed from the inReach.** The positions it posts now carry heading and speed
  where the device reports them. This has not yet been checked against a real inReach feed.
- **Navigate shows the crew without sharing your phone when your inReach is the source.** With
  the inReach switched on and its feed being read, Navigate no longer asks to share your phone's
  location and no longer sends it. The status chip reads "inReach · N crew live" instead of
  "Sharing position". If the feed was removed or needs its password again, Navigate behaves as
  before.
- **An "inReach is off" notice on a trip under way.** If you have a feed registered and have not
  switched it on for a trip that is under way, the Float plan tab says so.

### Changed

- **A compact trip header, and one Float plan tab.** The trip header is now the title, state,
  difficulty, dates, crew and a menu. Begin expedition, Mark as past, Pause, Edit, Leave and
  Delete are in that menu; each still asks for confirmation. The Details drawer is gone. The
  description is on the trip card, and the successor picker is in the Crew tab. The former
  Emergency info tab is now **Float plan**, and holds your details, your inReach switch and, for
  the leader, **Safety and rescue information** (the shore contact, the share link and email, and
  the printable plan).
- **The privacy policy now covers the inReach feed.** It says what is kept for a registered feed,
  that the stored password can be read by the service (it has to be, to fetch your feed), that
  Garmin sees the requests, and when sharing ends.
- **The Settings card for the feed says a trip receives your position only once you switch it on
  for that trip.** On the mobile app, which is not released yet, it points to the web for now.
- **Backend housekeeping, with no behaviour change intended.** Every backend function is now
  type-annotated and checked in CI, endpoints no longer catch every exception themselves (the
  central handler does, and logs the traceback), and data access moved out of the endpoint layer.
  The visible effects are the Fixed entries below. It is the part of this release that touches the
  most files (126 in the backend), so look here first if an endpoint behaves differently.

### Fixed

- **The data export failed for anyone with a logged distance.** The export task stopped before
  uploading anything, so those accounts received no export at all. Distances are now written as
  numbers.
- **A crewmate's consent time was visible in some trip responses.** Only the leader should see
  when another member shared their medical notes (a feature that is not offered at the moment).
  The rule now applies to every response that lists a trip's members, including the list a crew
  member opens their trips from.
- **Some refusals were reported as server errors.** A "you may not do that" from deep in the app
  could come back as a generic 500; it is now a 403 carrying the reason, and other mistakes by the
  caller (a malformed request, a missing record) are reported as such rather than as a crash.

### Security

- **Next.js updated to 16.4.2.** Three advisories were published against 16.0.0 to 16.4.0, two
  critical (remote code execution in the image optimizer with SVG files, and in `use cache`
  functions) and one high (denial of service through Server Actions). The app does not use
  `use cache`, and its lockfile already resolved the patched `sharp` that the image advisory asks
  for (the running image was not inspected), so the one that applies to it is the Server Actions
  denial of service, which needs no sign-in and affects availability only.
- **A user's password hash no longer appears if a user object is printed to a log.**
- Dependency updates, among them `zod`, `vitest`, `lucide-react`, `motion`, `logfire` and
  `prettier`.

### Deploy notes

- **One migration, expand-only:** `trip_member.shares_satellite_position`, a non-null boolean
  with a default of false. The previous release's code keeps working against it, so a rolling
  deploy is safe. It is applied by the usual `alembic upgrade head` step.
- **No new required environment variable, no email template change, no forced logout.** The
  compose and `.env.example` files are unchanged since 1.3.0, and the token, session and login
  code changed only in type annotations, comments and removed catch-all error arms.
- **Check after deploying:** open a trip's Float plan tab as a leader and as a crew member (the
  new layout has not been looked at on a real screen before this release), and switch an inReach
  on and off for a trip.

## [1.3.0] - 2026-10-16

### Added

- **What your crew changes now appears on your open trip page, without reloading.** When someone
  else edits the trip — moves a point or a day boundary, ticks or adds a packing item, invites or
  removes a member, changes the float plan or the shore contact — every other crew member's page
  for that trip updates on its own, within about seven seconds while the tab is open and in front.
  A page ignores changes it has nothing to show for (a route edit does not re-draw the crew
  list), and refreshes at most once every 30 seconds however busy the trip is.
- **Your own half-finished work is never overwritten.** If the route changes under a draft you
  are part-way through, the planner keeps your draft and shows "Someone else changed this route",
  with a "Load their version" button.

### Changed

- **Deploys now show a maintenance page.** While the app is being updated, visitors see a short,
  styled "back shortly" page instead of a browser error. It is served by the web server, so it
  stays up even while the whole app is down.
- **The mobile app polls for the same changes.** The mobile app is not released yet, so nothing
  visibly changes.

### Fixed

- **Editing the float plan or the shore contact could save an older value over a newer one.**
  Both forms opened on whatever was loaded with the page, so if a crew member changed the shore
  contact — the person who gets the missed-checkpoint alert — and you then saved the form, your
  copy of the old one went back in. They now open on the latest saved values.
- **The planner map did not show another person's route edit until you reloaded.** It now does,
  unless you are in the middle of editing.

### Security

- Updated Next.js to 16.4.0, which clears advisories in `next`, `sharp` and `source-map-js`, along
  with werkzeug 3.1.9, a `handlebars` override and the web app's other dependency updates.

### Deploy notes

- **No migration, no new required environment variable, no forced logout.** One optional
  variable, `TRIP_CHANGES_POLL_RATE_LIMIT` (default `120 per minute` per user), is deliberately
  not in `docker-compose.prod.yml`; the default is the production value.
- **Nothing to change on the box's nginx for this feature.** The page only makes short requests,
  not held connections. The maintenance page above was installed on the production box on
  2026-10-08; a new box needs the one-off setup under "Maintenance mode" in `DEPLOY.md`, and
  `deploy.sh` refuses to run without it (`DEPLOY_MAINTENANCE=0` skips it).

## [1.2.0] - 2026-10-05

### Added

- **A banner photo on your profile.** Like a LinkedIn cover, it sits behind your avatar on your
  profile page and on your public paddler page. Upload or remove it from Edit profile (images up
  to 8 MB). It is deleted with your account.
- **A way back from the Terms and Privacy pages.** They now have a back link that steps back to
  where you came from, or goes home if you arrived directly.
- **Groundwork for the mobile map's wind and swell working without signal.** The mobile sync now
  carries each day's wind and swell flow (the area, its land mask and an hourly direction and
  strength), computed by the same code that serves the map's wind and swell layers on the web, so
  the two cannot disagree. The mobile app itself is not released yet, so nothing on the web
  changes.

### Changed

- **The wind legend on the planner map now matches the colours it explains.** It was labelled
  0 / 20 / 40+ m/s while the wind animation was coloured over 0–10 m/s, so a gentle breeze
  looked like a strong one. It now reads 0 / 5 / 10+ m/s; the animation's colours are unchanged.

### Fixed

- **A new trip can no longer start in the past or end before it starts, and editing a trip can no
  longer leave its end date before its start.** Both are rejected with a clear message.
- **A place with no wave forecast says so.** For somewhere like a lake, the sea panel now says
  there is no wave forecast instead of showing a row of dashes.
- **Adding or removing a day now counts as a change to the route.** Previously a phone editing
  the route offline could overwrite a day added or removed on the web without being told. The
  mobile app is not released yet, so nothing visibly changes on the web.

### Security

- Updated `urllib3` (to 2.8.0) and `PyJWT` (to 2.15.1) for newly published advisories, along
  with Next.js 16.3.6 and the web app's other dependency updates.

### Deploy notes

- **One additive migration**, `users.banner_url` (a nullable column). `migrate` applies it on
  deploy; there is no forced logout and no downtime. Rolling back restores the code but not the
  schema, which is harmless here since the old code ignores the column.
- **The backend and SSE healthchecks changed**, and the image must move with the compose file.
  They now run `busybox wget` instead of starting Python every ten seconds, and the backend image
  installs busybox (and drops the compiler, `libpq-dev` and bundled package tests, over 200 MB
  smaller). `./scripts/deploy.sh` syncs the compose file and pulls the images together, so a
  normal deploy needs nothing extra. **Rolling back to an older image tag also needs the older
  compose file**, or the healthchecks fail against an image with no busybox and the containers
  report unhealthy.
- No new environment variables.

## [1.1.0] - 2026-09-26

### Added

- **A paddler who leaves a trip under way is recorded as having left, and everyone who reads the
  float plan is told.** A leader can note that a crew member left, with the time and a short
  reason (injury, evacuation, picked up by the support boat). The crew list on the float plan
  and on the shareable public float plan then shows "Left the trip on …" for that person, and
  the missed-checkpoint email to the shore contact says the same beside their emergency
  contact, so nobody is sent looking for someone who is no longer on the water. Recording this
  is done from the mobile app; the web shows it.
- **Groundwork for editing a trip offline in the mobile app.** The backend now accepts a batch
  of changes made while the phone had no signal — route edits, pause/abort/finish, an extra
  day, a crew departure, kit and float-plan details, logs — and reports back which were applied
  and which conflicted. The mobile app itself is not released yet, so nothing on the web
  changes.

### Fixed

- **A route with no wave forecast no longer breaks the app.** Open-Meteo has no wave data for
  some places — Lake Garda, estuaries, inshore water — and a trip planned there took down the
  dashboard, the trips list and the itinerary page together. Those hours now show a dash on the
  web and mobile, and the rest of the day's forecast still displays.
- **A slow or failing backend no longer looks like a missing trip.** A timeout or server error
  used to show a "not found" page on the trip, the itinerary, your profile and settings, and on
  shared route, story and paddler links, and made the trips list say "No trips yet" for someone
  who had trips. These now show an error page with a reference, and the trips list keeps what
  it already loaded and tells you when a reload failed. A genuinely missing trip still shows
  "not found".
- **Server-side page errors now reach monitoring.** The reference shown on an error page is
  recorded with the error, so a report of "Reference: 3967558296" can be traced to its cause.

### Changed

- Requests the web app makes to the backend now give up after 15 seconds instead of waiting on a
  stalled server.
- The old mobile sync "push" endpoint is gone, replaced by the batch endpoint above. Nothing
  released called it.

### Deploy notes

- **Two migrations, both additive:** a new `processed_mutation` table, and two nullable columns
  on `trip_member` (`left_at`, `left_note`). Every existing row is untouched and existing code
  keeps working. `migrate` only ever upgrades, so a rollback restores the old code but leaves
  the new table and columns in place — harmless to the old code.
- **One new scheduled task:** `processed-mutation-prune` runs daily at 03:50 UTC and deletes
  offline-change records older than 90 days. The `beat` container needs restarting to pick it
  up, which the deploy already does.
- **The missed-checkpoint email template changed.** It is the shore contact's safety alert, so
  send a test trip through it after deploying rather than trusting the release.
- **No new environment variables.**
- **Watch for `TimeoutError` in Logfire after deploying.** The 15 second limit is new for every
  server-side call; a burst of them would mean a backend endpoint is slower than that.
- **To check the error reporting:** trigger any server render error and search Logfire for
  `next.digest`.

## [1.0.15] - 2026-09-25

### Fixed

- **The sitemap and `robots.txt` now point at the real site.** Both advertised
  `http://localhost:3000/...` for every page, so a search engine that read them was sent to an
  address that does not exist and could not find a single page. They are now built from the
  site's own address on every request, and list the current public routes rather than the ones
  that existed when the app was last built.
- **A mistyped site address fails with a clear message.** Setting the site's address without
  `https://` in front used to break every page with an unexplained error; it now names the
  setting and what it needs.

### Deploy notes

- **No migrations.**
- **`FRONTEND_URL` must be the full origin, scheme included** — `https://app.kayaktrek.app`,
  not `app.kayaktrek.app` — in `.env.prod`. It is now required on the `frontend` container as
  well as the four services that already had it, so the stack refuses to start without it.
  The same variable builds the links in password-reset and verification emails, which a bare
  host would have broken.
- **Check it after deploying:** `curl https://app.kayaktrek.app/robots.txt` should end with
  `Sitemap: https://app.kayaktrek.app/sitemap.xml`.

## [1.0.14] - 2026-09-25

### Fixed

- **Search engines are now actually told the route library moved.** 1.0.13 sent a signed-out
  visitor from `/explore` to the front page, and in a browser it did exactly that — but the
  server answered "here is a page" rather than "this has moved", and the page it described
  was the empty application frame. A crawler had no way to know. It is a proper redirect now,
  answered before the page is built, so what a search engine records is the front page and
  nothing else.

## [1.0.13] - 2026-09-25

### Changed

- **Signed out, the route library has one address: the site's front page.** Opening
  `/explore` without being signed in used to put you inside the app's own frame — a sidebar
  with a single entry in it and an account menu with nothing behind it — and left out
  everything the front page gives you for the same routes: the chart, the introduction, and
  somewhere to sign up. It now takes you to the front page. Signed in, `/explore` is
  unchanged.
- **Search engines are pointed at one copy of the library instead of two.** The same listing
  was being advertised at both addresses, which left search engines to pick between them.
  Only the front page is listed now; `/explore` stays reachable so a crawler that already
  knows it follows the move.

### Fixed

- **A sign-in the app can no longer use no longer sends you round in circles.** The front
  page decided you were signed in if a login cookie merely existed, so an expired or
  revoked one sent you to the dashboard, which sent you back to the login screen. The front
  page, `/explore` and the public route pages now all ask the same question, and someone the
  app cannot recognise simply sees the public library.
- **A public route page no longer offers a stale session a fork button that cannot work.**
  With an unusable sign-in it showed "use this route", which only ever reached the login
  screen, and spent a request checking ownership that could not succeed.

## [1.0.12] - 2026-09-24

### Fixed

- **A session the app can no longer use is treated as signed out.** If your sign-in had
  expired, or you had signed that device out from elsewhere, the app still showed you the
  full navigation — Dashboard, Trips, Gear, Logs — and every one of those simply bounced you
  to the login screen. You now get the signed-out view, which is the truth.
- **Your devices are named.** The list showed "Unknown device" and "Unknown location" for
  almost every row, which made it useless for its one purpose: spotting a sign-in that was
  not you. Browser sessions now show the browser and approximate city, and the app names
  itself and your phone. Existing entries fill themselves in as you use them — you do not
  need to sign out everywhere.
- **Each row says when that session began**, not only when it was last active. Two sign-ins
  from the same browser in the same place were otherwise impossible to tell apart.

### Changed

- **The navigation is now a proper landmark for screen readers.** The app's own destinations
  were an unlabelled list, so there was nothing to jump to — on the Explore page, no
  navigation landmark existed at all.

### Deploy notes

- **No migrations.** Nothing here changes the database schema.
- **`CLIENT_FORWARDING_SECRET` is new, optional, and must match on two services.** It lets
  the backend trust the browser details the frontend forwards, so a session row can name a
  real device instead of the server. Set the **same value** on `backend` and `frontend` in
  `.env.prod`; unset is a working configuration and simply leaves the labels as they are
  today. A *mismatch* fails silently, so check a real session row after deploying. Generate
  with `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'` — see `DEPLOY.md`,
  "Session device and location labels".
- Device labels are also refreshed on token refresh, so rows predating this fill in within
  about fifteen minutes of ordinary use rather than needing anyone to sign out everywhere.

## [1.0.11] - 2026-09-24

### Added

- **Satellite tracking, in Settings.** Register a Garmin inReach MapShare feed and your
  position is picked up automatically about every ten minutes while a trip is under way, so
  crew and shore contact can follow along without anyone reaching for a phone. Your device's
  SOS button is unaffected — it goes straight to Garmin, never through this app.

### Changed

- **A shared link now shows a proper preview card** — the compass mark over the Kayaktrek
  name and what the app is — instead of a bare favicon.
- **Map tiles are kept for 90 days instead of 7, and the least recently used are dropped
  first.** Fewer trips out to the OpenStreetMap and OpenSeaMap servers, and a map region
  downloads at full speed. Tiles your browser already holds are reused for a week.

### Fixed

- **A password reset no longer leaves an account without its encryption keys.** Resetting
  clears them of necessity — they are locked with the password you forgot — but nothing
  built new ones afterwards, so the account simply stayed without. They are now regenerated
  quietly the next time you sign in.
- **A saved MapShare password can be removed again.** Turning the password switch off clears
  the stored one; before this the only way to drop it was to delete the feed and register it
  a second time.

### Deploy notes

- **No migrations.** Nothing here changes the database schema.
- **`FEED_CREDENTIAL_KEY` now reaches the containers.** It is wired into
  `docker-compose.prod.yml` for `backend` and `worker` — not `beat` or `sse`, which never
  touch feed credentials. Blank-defaulted, so a deploy without it still succeeds; but a
  MapShare feed that is password-protected will fail to poll until it is set, and the
  credential helper raises rather than failing quietly. Generate it once and deliver it with
  `scripts/deploy-sync.sh` — see `DEPLOY.md` "Satellite feed credentials".
- **Tiles already cached on the box are unaffected.** Existing files keep their original
  fetch time, so there is no cache to wipe and nothing to clear by hand.

## [1.0.10] - 2026-09-17

### Fixed

- Weather forecasts now actually refresh on the schedule 1.0.9 described. The daily refresh
  could be skipped entirely on any day the server was updated; trips underway refreshed about
  half as often as intended; forecasts were fetched twice for the same day; long trips fetched
  days beyond the 10-day forecast window; and trips nobody had opened kept refreshing forever
  instead of pausing after a week.
- The mobile app keeps your paddlers, logs and blocked list readable offline, and no longer
  crashes its background sync when the connection drops. Cached trip data is now kept per trip,
  so opening one trip can no longer show another's stale data.
- The mobile app shows a persistent banner while offline, and network problems now read as a
  plain message instead of a raw error.
- On phones, the footer on the explore page no longer covers the list of routes.

### Deploy notes

- Migration `92fbca47995b` fills in a last-viewed date for existing trips, taken from when each
  was last edited. After it runs, **a trip nobody has opened or edited in 7 days stops fetching
  forecasts until someone views it** — expect weather API calls to drop noticeably.
- `OPEN_METEO_WEATHER_BASE_URL`, `OPEN_METEO_MARINE_BASE_URL` and `OPEN_METEO_API_KEY` now reach
  the `backend` and `worker` containers. All three stay unset here, which keeps the free
  Open-Meteo tier exactly as before; see `DEPLOY.md` for switching to the paid plan.

## [1.0.9] - 2026-09-16

### Changed

- Weather forecasts now refresh on a smarter schedule: trips that are currently underway or
  starting soon get updates every 6 hours instead of waiting for the once-daily sweep, and a
  trip nobody has opened in a week pauses its refreshes until someone looks at it again.
- Weather refreshes no longer run for trips that are already over or that haven't started
  being planned.

## [1.0.8] - 2026-09-15

### Fixed

- The anonymous route library's header logo didn't reset an active search — clicking it while
  already on the page looked like a dead link, since the search box's state lived only in the
  browser and never in the URL. It now takes you back to a clean, unfiltered library.
- The "no results" panel on the anonymous route library could overflow past the right edge of
  the screen on narrower viewports.

### Changed

- More breathing room between the "Log in" and "Sign up" buttons in the anonymous route
  library's header.

## [1.0.7] - 2026-09-15

### Removed

- The always-present "demo" route that used to guarantee a non-empty public route library is
  gone — the library now has two genuine, author-published routes, so the placeholder is no
  longer needed.

## [1.0.6] - 2026-09-12

### Changed

- The public route library (`/explore`) and individual public route pages are now crawlable
  by search engines, now that the library has real, author-pitched routes rather than only
  the operator's own demo content.

### Fixed

- A route's owner could no longer edit its name, description, difficulty, or make it private
  again once the route had been published to the public library — any change at all was
  rejected. Editing those now works again; only the route's actual path (its days and points)
  stays locked once published, and only the route's own author (not merely a trip member with
  access to it) can make these changes.

## [1.0.5] - 2026-09-12

### Fixed

- A route's name could never be changed after creation — the edit dialog only exposed
  description and difficulty, even though the server has always accepted a name update.
- The "beach" map-place icon rendered as a generic rain umbrella instead of a beach umbrella.
- Route authors and fork-source attribution in the route library showed a paddler's chosen
  display name instead of their username.

## [1.0.4] - 2026-09-12

### Fixed

- Registration: a password whose only "special character" was a space or a non-ASCII
  character (e.g. an accented letter) passed the signup form's validation but was then
  rejected by the server with a confusing error. The form now checks against the same fixed
  set of punctuation characters the backend accepts.

## [1.0.3] - 2026-09-11

### Added

- Wind diamonds — a static hazard-reminder marker on the map (not a forecast) for noting a
  known wind pattern at a spot.
- A "kayak rental" place category for map annotations.
- The route's overall start and finish are now marked on the map, distinct from individual
  day-route markers.

### Changed

- Tidal and wind diamonds you've placed on one trip are now visible (position only) on your
  other trips, so a hazard noted once doesn't need to be re-entered per trip. The diamond's
  full content (notes, timing) stays trip-private — only its position and type are shared.
- Mobile: the itinerary viewer's weather/sea and day strip moved off the map's fixed top row
  onto a persistently-docked bottom sheet, giving the map full-bleed screen space.

### Security

- Closed an unauthenticated endpoint (`/tidal-station/nearby`) that returned full tidal-diamond
  content rather than just position to anonymous callers.

## [1.0.2] - 2026-09-09

### Changed

- The itinerary map's on-map discard control now always sits on the route's last point rather
  than only the point you just dropped — deleting it hands the control to the point now
  underneath, so a run of stray points can be trimmed back-to-front without the sidebar. The
  control is icon-only (a neutral trash-can icon) and now sits alongside the point's
  distance/time label instead of replacing it.

### Fixed

- A point dropped into an already-planned trip's staging day didn't mark the day boundaries as
  changed, so "Save days" stayed disabled with no way to persist it short of an unrelated drag.

### Security

- Bumped a transitive dependency (`js-yaml`, via `logfire`) to clear a high-severity CPU-DoS
  advisory (GHSA-2883-xcg3-v3hh). No application code was affected.

## [1.0.1] - 2026-09-07

### Fixed

- The register page's "Sign in" link could split across two lines at narrow widths ("Sign" on
  one line, "in" folding onto the next).

## [1.0.0] - 2026-09-07

The first 1.0 release. Registration is open to everyone — the closed-beta invite code is off
by default — and confirming your email now signs you straight in. Terms of Use and Privacy
Policy have both been substantially expanded, and outbound mail (verification, password reset,
crew invitations) is fixed after a production-only delivery failure.

### Added

- **About page**, linked from the landing footer and Settings — the app's version, a link to
  the developer's GitHub profile, and a support email address. Previously nothing in the app
  named a contact.
- **Confirming your email now signs you in.** Clicking the confirmation link and then "Confirm
  my email" takes you straight to your dashboard — no separate login step afterward.
- The registration form now shows an invite-code field only when one is actually required. If
  registration is ever closed again in an emergency (`DEPLOY.md` "Closing registration in a
  hurry"), visitors see the field instead of a rejected submission with no way to fix it.

### Changed

- **Registration is open by default** — the closed-beta invite code is no longer required to
  create an account.
- **Minimum account age raised to 18** (from the GDPR floor of 16/14), reflected in both the
  Terms of Use and the Privacy Policy — most of what this app asks for (emergency contacts,
  live position, shore-contact sharing) is safety-adjacent.
- **Terms of Use, substantially expanded**: using the Service on behalf of an organization (a
  club, an expedition company), an itemized acceptable-use list (no scraping the public route
  library, no reverse engineering, no building a competing product from it), account rules (no
  impersonation, no sharing or transferring an account), a statement that entered safety data
  is the user's own responsibility, and an explicit license grant describing what right you
  actually have to use the Service.
- **Privacy Policy**: legal-basis citations (GDPR Art. 6(1)) next to how your data is used and
  your rights, and a stated retention window for technical logs (30 days).

### Fixed

- **Outbound email works in production again.** Verification, password reset and crew-invite
  emails could silently fail to send — DigitalOcean blocks outbound SMTP on every droplet
  unconditionally, which was undiagnosed until a real registration hung the request until
  Gunicorn's worker timeout killed it. Mail now goes over Brevo's HTTP API instead of SMTP.
- The login, register, and reset-password forms no longer briefly show a mismatched/flashing
  state on first load in some browsers (autofill extensions mutating the form before React
  finished hydrating it).

### Security

- **Confirming your email now requires an explicit click**, not just opening the emailed link —
  closes a gap where an email provider's automatic link-scanning could otherwise consume the
  confirmation link before a user ever saw it.

### Deploy notes

- **`BREVO_API_KEY` is a new environment variable, effectively required.** Without it, production
  cannot send mail at all under DigitalOcean's SMTP block — this is not a degraded fallback.
  Get it from the Brevo dashboard (SMTP & API → API Keys — a different key from the SMTP one
  already configured).
- **Container log rotation is now configured** for every service (`docker-compose.prod.yml`,
  10 MB × 3 files). Previously unbounded; existing large log files on the box are not
  retroactively truncated.
- R2 object storage (photos, avatars, documents) now has an offsite backup alongside the
  database, mirrored into the same B2 bucket.
- `/explore` and public route pages remain excluded from search-engine indexing for now — a
  deliberate, reversible choice (the public library only has a couple of routes today), not an
  oversight. See `frontend/lib/seo/robots.ts` for how to reverse it once the library has real
  content.
- Mobile (React Native) is not part of this release — it continues in parallel and ships
  separately once it reaches a store listing.

## [0.8.0] - 2026-09-04

The signed-out home page is now the public route library instead of a decorative map — the
public library was already there and working, it just had no door into it. Route detail pages
(both the public library and the builder's own Route tab) can now show you the paddling
in between two stops, not just the stops themselves. Medical notes have been withdrawn.

### Added

- **See the shape of a day, not just its stops.** Positions between two stops — the geometry
  that bends a route around a headland or through a channel — now show on request: an
  expandable waypoint list under each stop, with each position's own distance and estimated
  time from that stop. Available both on the itinerary planner's Route tab and on every public
  route page.

### Changed

- **The signed-out home page is the route library.** Previously a decorative map with no way
  into the app's actual public content; anonymous visitors now land directly on the searchable,
  filterable library that `/explore` already offered, with the pitch for signing up alongside
  it rather than in its way.
- **Registration no longer asks for a full name.**

### Removed

- **Medical notes have been withdrawn.** The app no longer asks for allergies, conditions, or
  medication, and no longer stores them. Any notes previously saved — yours and any a crew
  member shared with you as a trip leader — have been permanently deleted from the database
  and cannot be recovered. Float plans still carry vessel details and emergency contacts,
  which is what a search-and-rescue service asks for first.
- The privacy policy's health-data section is gone with it. It now states plainly that the
  Service does not collect health data.

  Why: holding medical information means holding a special category of personal data under the
  GDPR, and that responsibility is disproportionate for a feature nothing else in the app
  depends on, at this stage of the product. The feature is set aside, not deleted from the
  codebase, and could return.

### Security

- `fast-uri` bumped past three high-severity advisories.

### Deploy notes

- **One migration, destructive and irreversible for medical notes.** It permanently purges
  every stored note, consent record and access log. It deliberately **keeps** each user's
  encryption keypair, so re-enabling the feature later does not require re-keying every
  account. `migrate` only ever runs `alembic upgrade head` — rolling back the images afterwards
  restores code, not the deleted data.
- **Two flags, both default off:** `MEDICAL_NOTES_ENABLED` (backend) and
  `NEXT_PUBLIC_MEDICAL_NOTES` (frontend, baked in at image build). Both must agree — one hides
  the UI, the other closes the API, and neither substitutes for the other.

## [0.7.1] - 2026-08-31

Medical notes are now encrypted and decrypted on your own device instead of the server, and
Navigate mode asks before it starts sharing your position.

### Added

- **Terms of Use and Privacy Policy are now reachable from inside the app** (Settings → Legal),
  alongside a contact address — previously only visible before signing in.
- **Navigate now asks first.** Turning on live position sharing shows a confirmation naming who
  receives it (the rest of the trip's crew, and the shore contact if a float plan link has been
  shared) before anything is sent, whether entered from the map or from the trip's Live tab.

### Changed

- **Medical notes are now end-to-end encrypted.** Encrypting and decrypting your medical notes
  now happens in your browser; your password is never sent to the server to do it. No stored
  data changed shape and no action is needed on existing notes.
- The privacy policy's data section is less itemized (vessel and trip data are now described by
  purpose rather than field-by-field), and its international-transfers section explains that
  only an encrypted backup file — unreadable by the storage provider — ever leaves the EU.

### Security

- Closed a gap where the app's own UI never told a user, before they turned on live position
  sharing, who would receive it — the only prompt was the browser's generic "allow location
  access?" dialog, which says nothing about the app's own audience for that data.

## [0.7.0] - 2026-08-31

Registration is now invite-gated for the closed beta, the privacy policy is live, and
production moved from a home server to a managed cloud droplet.

### Added

- **Closed-beta invite code.** Creating an account now requires an invite code; everything
  else (signing in, the public map, `/explore`, shared routes) is unaffected.
- **Privacy policy**, linked from the landing footer and the registration form alongside the
  Terms of Use — covers precise location, health data, the third parties the app actually
  talks to, retention windows, and how to delete an account when you can no longer sign in.

### Changed

- The app's own version number, shown at the bottom of the sidebar, now always matches what's
  actually running instead of a placeholder that had been stuck since the very first release.
- Production hosting moved from a home server to a managed cloud droplet, with offsite backups
  and health monitoring verified end-to-end on the new box.

### Fixed

- Closed a near-miss in the backup-restore tool where a database name could reach the
  destructive-restore confirmation prompt before being validated. No live data was ever at
  risk — the operation failed safely before anything destructive ran — but the prompt and the
  error it hit afterwards were both confusing, and both are fixed.

### Security

- **Corrected an overstated claim in the Terms of Use**: medical notes were described as
  "end-to-end encrypted", which is not accurate. They are encrypted at rest with a
  password-derived key — meaning a stolen database or backup is unreadable — but the
  encryption happens on the server, not only on your device, so this is not end-to-end
  encryption in the strict sense. The underlying protection is unchanged and remains sound;
  only the description of it was wrong, and only in that one place.

### Deploy notes

- New optional `INVITE_CODE` environment variable — set it to require that code at
  registration, leave it unset to register exactly as before.
- Production `.env` and deploy tooling now target the new droplet; see `DEPLOY.md`.

## [0.6.0] - 2026-08-28

The app has a name. Kayaktrek replaces the four different names the product was using across
the web UI, its email and the live domain. Underneath, the deployment lost about 4.5 GB of
memory it never needed, map tiles stopped taking a round trip to Cloudflare and back before
the server could answer, and the phone layout was fixed in the places people actually hit.

### Added

- **Every container now has a memory limit.** Previously none did, so a single process
  losing control could take the whole machine down with it — and on a one-box deployment
  that includes the database.

### Changed

- **The product is called Kayaktrek**, on every user-visible surface: the app's wordmark and
  page titles, and all 38 email strings and 9 subject lines, which had been using a third
  name again. "Sea-kayak expedition planner" stays as a descriptor where it earns its place.
- **Map tiles are served from the server's own disk** instead of the object store. A cached
  tile now answers in about 4 ms rather than ~210 ms, because serving one no longer meant a
  round trip out to Cloudflare and back before the server could reply.
- **The deployment uses about 4.5 GB less memory.** A geography library was unpacking a
  900 MB global land/sea map into memory in every one of the four backend processes at
  startup — including the two that never consult it — to answer questions about 576 points.
  It is now read from disk on demand. Idle memory across the whole stack went from 5.5 GB to
  under 1 GB.

### Fixed

- **Missed-checkpoint alerts and shared float plans told people to write to an email address
  that does not exist.** The support address was hardcoded to a domain nobody owns, in every
  environment — so a shore contact who replied to a safety alert reached nothing.
- **Running the test suite sent telemetry to the production monitoring project.** Test traffic
  landed in the same place real traffic does and spent the monthly record allowance on
  synthetic data. It reached there without anyone configuring it to: the application loads
  `.env` when it is imported, and the test suite imports the application, so the production
  credential was present in every local run regardless of how clean the shell was.
- **The printable float plan was unusable on a phone.** Crew emails and vessel details ran
  off the edge of the card or were squeezed into a column a few characters wide.
- **Settings controls ran off the edge on a phone** — the current email address, and the
  change-password and account-deletion buttons.
- **The Import GPX dialog** could be pushed past the screen edge by a long filename.
- **The profile page's cards** at phone width: stat tiles left half empty by a wrapping
  label, distance-by-month bars squeezed to under 10 pixels, and the avatar crowding the
  name and contact details into an 84-pixel column.

### Security

- **Signing a device out could silently stop taking effect.** The revoked-session list
  shared a Redis instance with caches and rate-limit counters, and that instance evicts
  whatever was used least recently under memory pressure — which is exactly what a
  revocation entry is, since it is written once at sign-out and then usually never read
  again. Evicting one let a signed-out device keep working for the remainder of its
  15-minute token. The revocation list now has an instance of its own that cannot evict.

### Deploy notes

- **Bring the stack up with `--remove-orphans`.** This release adds a container and removes
  two, and `docker compose up -d` on its own will leave the removed ones running:
  `KAYAK_IMAGE_TAG=v0.6.0 docker compose -f docker-compose.prod.yml up -d --remove-orphans`
- **New container: `redis-auth`**, holding the revoked-session list. It must be up before
  the backend and SSE containers; `depends_on` orders that, but only once the container
  exists.
- **`REVOCATION_REDIS_URL` can be deleted from `.env`.** It is now set in the compose file
  and any value left in `.env` is ignored. This is deliberate: the setting is not a free
  choice — it must point at an instance that does not evict — and a stale `.env` value
  silently winning is how the problem above would come back.
- **MinIO is gone from production** (it stays for local development). Object storage has
  been on Cloudflare R2 since 26 August and the tile cache no longer uses a bucket, so
  nothing was left for it to serve. Its data directory on the box is untouched by the
  removal.
- **`STORAGE_ENDPOINT` is now required** in production. It used to fall back to the local
  MinIO, which no longer exists — an unset value now refuses to start rather than pointing
  at a hostname that does not resolve.
- **Two new volumes** are created automatically: `tile_cache` and `land_mask_cache`. The
  first marine-forecast request after the upgrade spends about two seconds unpacking the
  land map into its cache, once.
- Optional cleanup: the `tiles/` prefix in the private R2 bucket is dead data now and can be
  deleted.

## [0.5.2] - 2026-08-25

Photo uploads tell you they are working, and the tracing budget stops being spent on
health checks. Mostly operator-facing: backups now reach Backblaze, and the server's
configuration is pushed from one place instead of copied by hand.

### Fixed

- **Uploading a photo looked like the app had frozen.** The upload ran with no spinner and
  no disabled control, so on a slow connection there was nothing to say it was working.
  Both upload buttons now show progress, and a failed upload, delete or visibility change
  says so instead of silently doing nothing.
- **Health checks were the largest source of tracing records in the deployment** — polled
  every ten seconds by two processes, and excluded in a way that removed the cheap half of
  the cost while leaving the expensive half unparented. Roughly 17,000 records a day, well
  ahead of live-expedition streaming.
- **Database backups could not reach Backblaze.** Every upload failed with an
  authorisation error naming a permission that was deliberately withheld.

### Changed

- **Server configuration is pushed from one place** (`scripts/deploy-sync.sh`) rather than
  copied by hand. Hand-copying had already caused two outages in a day, both invisible
  until something crashed. The whole set goes every time, so no single file can go stale.
- **Storage connections are reused** instead of rebuilt per request, removing a handshake
  to Cloudflare from every upload.

### Deploy notes

- **The nginx config in the repo is now `.conf.template`** and is deliberately excluded
  from the config push. It contains placeholder domains; copying it over a live config
  replaces a working one. Install it by substituting the real domain — see `DEPLOY.md`.
- **Backups need `BACKUP_B2_ENDPOINT`** (the bucket's S3-compatible endpoint) and a key
  with read **and** write, not write alone.
- Nothing else new is required. No forced logout, no destructive migration.

## [0.5.1] - 2026-08-24

Makes the Cloudflare R2 support from `0.5.0` actually work, and stops live expeditions
quietly burning the observability budget. Adds encrypted offsite database backups and moves
the production environment file out of hand-copying and into the repo, encrypted.

### Added

- **Encrypted offsite database backups.** `scripts/backup-db.sh` dumps the database,
  encrypts it, and uploads it to Backblaze B2; `scripts/restore-db.sh` brings one back —
  into a scratch database by default, so rehearsing a restore is easy and destroying the
  live one is not. The server holds only the encryption *public* key, so it writes backups
  it cannot itself read, and the storage credential can write but not delete. Setup is a
  one-time operator task; see `DEPLOY.md`.
- **The production environment file is now encrypted in the repo** (SOPS + age) instead of
  copied to the box by hand. The server gets it with `git pull`, so the two can no longer
  silently disagree — which had already happened, and surfaced only as a container refusing
  to start. Variable names stay readable in the diff; values do not.

### Fixed

- **Uploads and private downloads failed against Cloudflare R2.** A storage region was
  hardcoded to a value R2 rejects, so every image upload and every permit or document
  download errored out. MinIO ignores the setting, which is why it survived until the first
  R2 request. Nothing was lost — the requests simply failed.
- **A live expedition cost thousands of redundant tracing records.** The guardrail meant to
  cap that had been removing the wrong thing since it was written, and the loop turns on
  every position relayed as well as every heartbeat, so an active trip traced harder than an
  idle one. A connection now costs one record however long it lasts.
- **The share-link ticket request was not traced at all**, having been swallowed by an
  over-broad exclusion pattern intended only for the stream itself.

### Deploy notes

- **`STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` are now required.** They were previously
  derived from the MinIO credentials, so an `.env` copied before this release will make the
  stack refuse to start. To stay on MinIO, set them to the MinIO user and password. To move
  to R2, set them to the R2 credentials along with `STORAGE_ENDPOINT`,
  `STORAGE_BUCKET_PUBLIC`, `STORAGE_BUCKET_PRIVATE` and `STORAGE_PUBLIC_BASE_URL`.
- **`STORAGE_REGION` is new and optional**, defaulting to a value R2 accepts. Only set it if
  a provider needs a specific region.
- **The migration that rewrites stored object URLs needs the `STORAGE_*` environment**, and
  refuses to run without it rather than pointing every avatar and photo at a dead host. It
  runs once; the compose file passes what it needs, so `git pull` before `docker compose up`.
- **Moving objects to R2 is not automatic.** Copy them across *before* the migration runs,
  or the URLs will point at a bucket that does not have them yet. Procedure in `DEPLOY.md`.
- No forced logout, no destructive migration.

## [0.5.0] - 2026-08-24

Production object storage can now be Cloudflare R2 instead of the self-hosted MinIO. Nothing
changes for anyone using the app; this is entirely about where photos and documents live.

### Changed

- **Object storage is configurable per environment, and understands two buckets.** Production
  can point at Cloudflare R2 — a public bucket behind a CDN domain for avatars and public route
  photos, a private one for documents, private photos, data exports and cached tiles. Local
  development and CI are untouched: with the two new bucket variables unset, everything falls
  back to the single MinIO bucket exactly as before. The split exists because MinIO scopes
  anonymous read by *prefix* while R2 scopes it by *bucket*, so keeping the same access
  boundary means keeping the two kinds of object apart.
- **Development and end-to-end test mail goes to a local sink.** The dev stack now sends to a
  `mailpit` container (web UI on `http://localhost:8025`) rather than the real relay, so the
  test suite cannot post mail to the addresses it invents.

### Fixed

- **The production stack ignored its own storage settings.** `docker-compose.prod.yml`
  hardcoded the storage endpoint to the local MinIO and took the credentials from the MinIO
  root user, so R2 values placed in `.env` were read by nothing at all.
- **The database migration would have pointed every stored image at a dead host.** The
  `migrate` service was passed no storage variables, and the URL-rebuild migration reads them
  to work out what to rewrite avatars and route photos against. It would have silently used
  the local-MinIO defaults. The migration now refuses to run on fallback defaults in
  production or staging rather than guessing.
- **Empty environment variables are treated as unset.** Compose renders an unconfigured
  variable as an empty string rather than omitting it, so the fallbacks never fired — both
  bucket roles would have resolved to `""` and every object would have been written to a
  nameless bucket.

### Deploy notes

- **New required variables: `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY`.** These replace
  `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` as the source of the application's storage
  credentials. Compose now refuses to start without `STORAGE_SECRET_KEY` and
  `STORAGE_PUBLIC_URL`, so **a box that upgrades without setting them will fail to come up** —
  including one staying on MinIO, where the values are simply the MinIO ones. `MINIO_ROOT_*`
  are still needed by MinIO itself.
- **Optional, for R2:** `STORAGE_ENDPOINT`, `STORAGE_BUCKET_PUBLIC`, `STORAGE_BUCKET_PRIVATE`,
  `STORAGE_PUBLIC_BASE_URL`. Leave all four unset to stay on single-bucket MinIO.
  `backend/.env.example` maps each one to what the Cloudflare console shows you, including the
  trap that the S3 API endpoint is account-level and not per-bucket.
- **Migration `d4e8b03c1f27` rewrites stored URLs in place** (`users.avatar_url`,
  `image.location`) against whatever storage the environment currently points at. It is
  idempotent and runs in both directions, but it only rewrites *addresses* — **it does not move
  any objects**. Moving a populated deployment to R2 means copying the objects across first
  (`rclone`/`mc mirror`), or every existing photo 404s. On an empty deployment there is nothing
  to copy.
- Rollback restores code but not schema — `migrate` only ever runs `alembic upgrade head`. To
  go back to MinIO, point the storage variables at it and run the migration's down leg, which
  renormalises to that base the same way.

## [0.4.1] - 2026-08-23

A hotfix: the 0.4.0 frontend image could not start.

### Fixed

- **The 0.4.0 frontend image died on startup and restarted forever.** The build left out part
  of a package the server needs on its very first module load, so the container never served a
  request. `0.4.0` cannot be deployed; use this. Nothing about the application itself changed
  between the two.

### Deploy notes

- **Frontend image only.** The backend image is rebuilt and republished by the tag, but its
  code is identical to `0.4.1`'s predecessor. No migration, no environment variables, no
  forced logout.
- If you are on `0.4.0`, this is the upgrade. If you rolled back to `0.3.0`, upgrading here
  brings the `0.4.0` changes with it — see that entry for its migration note.

## [0.4.0] - 2026-08-23

Routes you clone are editable again, points can go in the middle of a route, and the map
tells you how far you have paddled to any point you ask about.

### Added

- **Drop a point in the middle of a route.** Tap a leg between two points and the new point
  goes there, rather than at the end of the route where every new point used to land. This
  works while a day-boundary edit is still unsaved — the boundaries follow the insert.
- **Any point will tell you its distance.** Click a waypoint and it reports how far you have
  paddled since the last stop, on the map and on its row in the planner's point list — the row
  that carries the control for turning it into a stop, which is the decision the figure is for.
  Stops still carry their leg permanently, as before.

### Fixed

- **A cloned route could not be edited at all.** Cloning a shared route — including the demo
  route on the landing page, the most likely first thing anyone clones — produced a route that
  silently swallowed every point you dropped on it and every day boundary you tried to save. No
  error, no message, nothing in the console: the clicks simply did nothing. Routes already in
  this state are repaired by the upgrade.
- **The first point of each day showed no distance.** The stretch paddled from the previous
  night's stop into the next day was missing from every per-point reading, so a day's first
  point looked like a starting point you had not travelled to. It now reports that crossing,
  and a day's running total starts where the day's paddling actually starts — matching the
  day total shown on the boundary, which the two used to disagree about.
- **The shuttle vehicle form was unusable on a phone.** "Seats available" collapsed to a sliver
  while "Kayak spots" took the whole row, leaving both labels and both numbers unreadable at
  narrow widths.
- **Leaving a page with a map on it could throw an error onto the page.** Navigating away
  while the wind overlay was still starting up left two callbacks pointing at a map that no
  longer existed. Most visible on the landing chart, and most likely on a slow machine.

### Deploy notes

- **One migration, data-only**, run automatically by the `migrate` service. It repairs routes
  that are missing their internal staging day — the cause of the un-editable clone above. It
  adds no columns, drops nothing, and re-running it changes nothing.
- The demo route seeded on an existing database keeps the internal shape it was created with;
  seeding skips a route that already exists. The migration makes it editable, so re-seeding is
  optional — delete and re-run `flask seed` only if you want it rebuilt.
- No new environment variables, and no forced logout.

## [0.3.0] - 2026-08-22

Shared routes now say something about themselves, and the page that shows them works again.

### Added

- **A pitch and a grade on every shared route.** A route can carry a short description of what
  it is and a difficulty grade, both written when you publish it — asked for and saved in the
  same step, so a route is never listed with nothing describing it. They show on the discovery
  cards (clamped to two lines) and in full on the route's own page, and the grade is now one of
  the filters you can search the library by.
- **Captions on photos.** A photo can say what it shows, and that caption is what a screen
  reader announces instead of the upload's filename.
- **The places you marked are published with the route.** Launches, water, hazards, camps and
  viewpoints you pinned while planning now appear to anyone you share the route with, grouped
  by kind, each with its own glyph and note. Publishing a place is deliberate and separate:
  dropping a pin never publishes it, you turn it public afterwards.
- **A photo strip on the route page.** Every opted-in photo in one gallery; clicking one pans
  the map to where it was taken. Previously a photo could only be found by clicking its marker.

### Fixed

- **Shared route and story pages returned a server error to everyone.** `/routes/…` and
  `/story/…` failed to render at all — for the author and for anyone following a link. Anyone
  who opened a shared link since the previous release saw an error page.
- **A route's point order could come out wrong.** A route created with its points sent all at
  once stored no order at all, and the app then guessed one — differently on different reads,
  so the same route could report two different distances and draw two different lines. Order is
  now recorded when the route is created. Routes built point-by-point on the map were never
  affected; a route already stored without an order keeps whatever it has until it is edited.
- **Taps were being lost in the itinerary planner on a phone.** The map's credit line was a
  full-width strip across the bottom of the map, swallowing every tap in it — and a tap that
  landed on the licence link navigated away, taking an unsaved day draft with it. It is now a
  small badge that opens the credits on tap. Separately, dragging a day boundary auto-scrolled
  the list out from under your finger, because the scroll zone was a fixed size that covered
  more than half the list on a phone; it now scales with the list.

### Deploy notes

- **Two migrations, both additive**, run automatically by the `migrate` service. One adds the
  description and difficulty columns to itineraries; the other adds the photo caption column.
  Nothing is dropped and no data is rewritten.
- The first migration also **renames the Postgres enum type** `tripdifficultytype` to
  `difficultytype` in place, since the grade is now shared between trips and routes. `migrate`
  only ever runs `alembic upgrade head` — rolling back the images restores the code but not the
  schema, so roll forward rather than back.
- No new environment variables, and no forced logout.

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
