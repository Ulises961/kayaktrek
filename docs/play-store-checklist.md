# Play Store Submission Checklist

**Status**: M9a WP4 (design-only prerequisite) research output. Not a build task — this feeds
the M9 launch timeline and M9a WP6's coordinator sign-off.

**Why this exists**: `plans/M9.md` item 10 pulled this into M9a specifically because it costs
**calendar time, not engineering time** — a closed-testing tenure requirement or a permission
review discovered at M9h (ship time) blocks a launch date; discovered now, it's a scheduling
input.

**Research method — read before trusting any number below.** `plans/M9.md` explicitly flagged
that Play policy has been revised multiple times (the closed-testing tester count alone changed
from 20 → 12 in December 2024) and instructed against answering from training data. In this
research session, direct `WebFetch` access to `support.google.com` (and every other external
domain tested, including `example.com`) was blocked by the sandbox's network egress policy —
**not a Google-specific block, a blanket one** for this session. All findings below therefore
come from `WebSearch` result snippets, which do quote and cite the official
`support.google.com` pages directly (URLs given per claim) and were cross-checked against 3–5
independent secondary sources (developer blogs, testing-service guides) per topic for
consistency. This is one level short of reading the primary source directly. **Recommended
before acting on this document**: have whoever holds Play Console access open each cited
`support.google.com` URL directly in a browser and confirm the figures below during M9h
(pre-submission), since policy can move again between now (2026-08-26) and actual submission.

---

## 1. Closed-testing tenure requirement (personal developer account)

**Current requirement, as of 2026-08-26**: a personal (non-organization) Play Developer account
created on or after **November 13, 2023** must run a **closed test with a minimum of 12 testers,
each opted in continuously for at least 14 days**, before Google will grant production access.
This app's developer account will be newly created for M9, so it is squarely in scope — not
exempt.

- The requirement was originally **20 testers** (introduced November 2023) and was reduced to
  **12 testers** in **December 2024**. Multiple independent sources (testing-service guides
  dated 2026) confirm the 12/14 figure has held stable since that December 2024 change and is
  still current as of mid-2026 — no further revision found.
- **Mechanics that matter for scheduling**:
  - The 14 days must be **consecutive** for a given tester's opt-in. A tester who opts out and
    back in restarts their clock; testers who opt in for under 14 days don't count toward the 12.
  - Organization accounts, and personal accounts created **before** Nov 13, 2023, are exempt and
    can publish straight to production. (Not this app's situation — flagging in case the team
    considers registering under an existing older account instead of a fresh one, which would
    remove this gate entirely and is worth a deliberate decision, not a default.)
  - **New nuance reported for 2026** (multiple secondary sources, unverified against the primary
    page directly): since around April 2026, Google's review of the subsequent production-access
    questionnaire also checks that testers **genuinely used the app**, not merely installed it —
    vague "no issues found" testing narratives reportedly trigger rejection. Budget real usage
    time from testers, not just an install-and-forget headcount.
  - After the 14 days elapse, a **production access questionnaire** must be filled out (roughly
    10 questions, ~300 characters each, about tester recruitment, feedback received, and changes
    made) before the production review itself starts. Reported timelines vary by source: one
    source estimated "~48 hours" for a decision on the questionnaire and "up to 7 days" for the
    subsequent production review; this was not corroborated against the primary Google page and
    should be treated as a rough order of magnitude, not a commitment.
- **Practical scheduling implication for M9**: from "closed test starts" to "eligible for
  production" is **a minimum of 14 calendar days**, plus however long recruiting 12 engaged
  testers takes (this is normally the longer pole — 12 kayaking/outdoors-adjacent testers who
  will actually open and use the app for two weeks is not a trivial ask), plus the questionnaire
  + review turnaround on top. **Start tester recruitment well before M9h**, not at M9h.

**Sources** (checked 2026-08-26, via WebSearch snippets citing these pages — not fetched
directly, see Research method above):
- [App testing requirements for new personal developer accounts — Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Everything about the 12 testers requirement — Google Play Developer Community guide](https://support.google.com/googleplay/android-developer/community-guide/255621488/everything-about-the-12-testers-requirement?hl=en)
- [About the Data Safety Form and Account Deletion — Play Developer Community](https://support.google.com/googleplay/android-developer/community-guide/246344978/about-the-data-safety-form-and-account-deletion?hl=en) (cross-reference)

---

## 2. Background-location permission review (`ACCESS_BACKGROUND_LOCATION`)

This app needs background location for two real, user-visible features: **live position sharing
during an active expedition** (M8's web feature, mirrored on mobile) and **tracking an external
GPS device** during a multi-day trip when the phone may be in a pocket/dry bag rather than
actively on-screen. Both are legitimate justifications under policy, but both must be
demonstrated, not just claimed.

**What Google requires:**

- Any app requesting `ACCESS_BACKGROUND_LOCATION` must pass an extended review, triggered by
  submitting Play Console's **Permissions Declaration Form**. This applies to new apps and to
  existing apps adding the permission.
- The declaration form requires answering why the permission is needed **and providing a video**
  demonstrating the actual in-app feature that uses background location — including how the
  user triggers the prominent in-app disclosure and the Android runtime permission prompt. Google
  states apps submitted **without** the video will be rejected outright.
- **Core-functionality bar**: background location may only be used for a feature that is
  central to the app and directly benefits the user — never for analytics or advertising. "Live
  position sharing so your shore contact can see you at sea" and "external GPS tracking during an
  offline multi-day expedition" both read as legitimate core functionality for a kayak expedition
  planner; a generic "so we can show you nearby stuff" justification would not pass.
- **Minimum-scope expectation (a newer, separate requirement worth designing around)**: Google's
  policy explicitly prefers **foreground** location wherever possible, and — per a 2026-era page
  found in this research — is pushing a **"location button"** pattern as the required minimum
  scope for one-off/transactional precise-location requests (apps targeting a sufficiently new
  Android API level are required to use it for that case). This app's core map/route-planning
  screens (view current position on the map, drop a pin) are transactional and should use
  foreground location / the location button, not background — reserve the background permission
  request specifically for the two features named above, and be prepared to explain in the
  declaration form why those two features can't be satisfied by foreground access alone (they
  can't — a paddler mid-crossing with the screen off is exactly the case background access
  exists for).
- **Review turnaround**: figures found were inconsistent across sources — one placed it at "up to
  several weeks" for the extended review after submission; none of the phrasing was corroborated
  directly against the primary Play Console Help page in this session (blocked, see Research
  method above). **Treat this as a multi-week gate, not a multi-day one**, for scheduling
  purposes, and re-verify the actual current wording directly in Play Console when the
  declaration form is actually filled out.

**Action items for M9 (not this WP, but worth flagging now for the build phase):**
- Design the background-location feature so a short screen-recording of it (live position
  sharing turning on, the OS permission dialog appearing) can be captured as part of QA — this
  becomes the required demo video with no extra work if planned for.
- Keep the map/pin-drop/route-planning screens on foreground-only location requests; do not let
  the background grant get requested any earlier or any more broadly than the two features that
  actually need it.

**Sources** (checked 2026-08-26, via WebSearch snippets):
- [Understanding location in the background permissions — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9799150?hl=en)
- [Minimum Scope: Foreground Location Access and the Location Button — Play Console Help](https://support.google.com/googleplay/android-developer/answer/17033915?hl=en)
- [Permissions and APIs that Access Sensitive Information — Play Console Help](https://support.google.com/googleplay/android-developer/answer/16585319?hl=en)
- [Tips for getting your app approved for background location access — Android Developers Blog](https://android-developers.googleblog.com/2020/11/tips-for-getting-your-app-approved-for-background-location-access.html)

---

## 3. Data safety section

Every app on Play, at every release track including closed testing, must complete the Data
safety form, and it must stay in sync with what the app actually does — a mismatch between
declared and actual behavior is called out (2026-era source) as one of the most common causes of
listing suppression/removal. This app collects two categories worth getting right deliberately:

### 3a. Precise location

- Declare under **Location → Precise location** (Play's threshold: "precise" is location
  resolvable to better than ~3 sq km; "approximate" is coarser). This app's live position
  sharing and route/point placement are precise-location uses — declare precise, not
  approximate.
- Declare the **purpose(s)**: "App functionality" applies directly (the live-tracking/expedition
  feature requires the data to work at all). If any analytics use of location is ever added,
  that would need its own separate purpose declaration — don't bundle it into "app
  functionality" implicitly.
- Declare whether location is **shared with third parties** — per the current architecture
  (Redis pub/sub + Postgres, self-hosted, no third-party location SDK), the honest answer is no
  sharing with third parties for this data type. Re-check if any mapping/tile SDK embedded in
  the mobile build turns out to phone home a device's location itself — the form must cover what
  bundled SDKs do, not just first-party code.
- Declare whether it's **encrypted in transit** (yes — everything goes over HTTPS/TLS to the
  Flask API) and whether users can **request deletion** (yes, see §4).

### 3b. Health-adjacent data (medical notes)

This is the one requiring the most care, because it must be described **accurately, not
omitted just because it's encrypted**, per the explicit instruction in both `plans/M9.md` and
this task.

**Correction (2026-09-01):** this section originally claimed the feature (M3g) was "genuinely
client-side E2E encrypted" when it was written (2026-08-26) — that was false at the time. The
crypto ran server-side: keypair generation and every decrypt sent the plaintext password to the
backend (`Services/crypto_service.py`), which could therefore read a note in transit even though
it never stored plaintext. `docs/adr/safety-privacy.md`'s 2026-08-31 correction pass caught the
same false claim in `CLAUDE.md` and the Terms of Use and fixed both, but missed this file — the
"all corrected" note in that decision log was wrong about scope, not about the underlying fact.
**M22 (2026-09-01) closed the gap by changing the code, not just the words**: the crypto moved
client-side (`frontend/lib/crypto/medical.ts`), no medical-notes endpoint accepts a password any
more, and the argument below is now actually true, restored with today's date rather than the
original one. The X25519 ECIES design itself never changed — only where it runs.

The backend's medical notes feature (M3g/M22) is genuinely **client-side E2E encrypted**
(X25519 ECIES) — the server stores only ciphertext it cannot read, and only the trip leader
holds a key able to decrypt a given crew member's note.

- **Google's own guidance distinguishes end-to-end encrypted data from encryption-in-transit**:
  data that is end-to-end encrypted such that no intermediary — including the developer — can
  read it does **not** need to be disclosed under the "Data collection" section in the same way
  first-party-readable data does, because the app operator is not actually "collecting" it in
  the sense the form is asking about (Google, and cannot access, the plaintext). This is a real
  and meaningful distinction, but it needs to be applied carefully, not used as a blanket excuse
  to skip the health-data declaration entirely:
  - The **ciphertext itself is still stored** on the backend and still needs to be described
    honestly wherever the form asks about data storage/retention, even though its content is
    opaque to the operator.
  - The **trip leader** is a real, first-party (well, another end-user, not Google/the operator)
    reader of a decrypted note once they hold the wrapped key — this is closer to a
    "shared with other users, not with the developer" pattern than pure zero-knowledge SaaS
    storage, and the form's questions about whether data is shared with other users (as opposed
    to third parties/the developer) should reflect that leader-decrypt design honestly.
  - Google's April/2026-era health-data guidance (found in this research, not independently
    verified against the primary page) explicitly names **prohibited use cases** — e.g. never
    using health data for employment/insurance eligibility determination or unauthorized social
    sharing — worth a one-line confirmation in whatever privacy documentation accompanies the
    listing that this app does neither.
  - Practical recommendation: declare "Health info" as a collected data type, mark it as
    **not readable by the developer** (E2E encrypted) where the form allows that distinction,
    describe the purpose as "App functionality" (safety/emergency use during an expedition), and
    do **not** claim "not collected" — the ciphertext blob is collected even if unreadable.

**Sources** (checked 2026-08-26, via WebSearch snippets):
- [Provide information for Google Play's Data safety section — Play Console Help](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Understand app privacy and security practices with Google Play's Data safety section — Google Play Help](https://support.google.com/googleplay/answer/11416267?hl=en)
- [Policy announcement: April 15, 2026 — Play Console Help](https://support.google.com/googleplay/android-developer/answer/16926792?hl=en)

---

## 4. Account deletion — in-app + web URL

**Confirmed current requirement**: since full enforcement on **April 15, 2024**, any Play app
that lets a user create an account must provide **both**:
1. An in-app path to delete the account and its data, **and**
2. A **public web URL**, entered in the Data safety form, where a user can request account and
   data deletion **without installing the app, without logging in via the app, and without
   reinstalling it if they've already removed it**. Multiple sources agree this web resource is
   required even when a full in-app deletion flow exists — it is not an either/or, it's both.
   Google is reported to reject the URL at submission time if it is broken, is just a marketing
   page, or is hidden behind a login wall the requester can't get through without installing the
   app.

**Backend already supports this — this is scoped as UI work, not backend work.** Per root
`CLAUDE.md`'s GDPR section, the Flask backend already implements Article 17 erasure end to end:

- `DELETE /api/v1/user/me` (authenticated) — begins the erasure grace period: deactivates the
  account, revokes all sessions, and emails a cancellation link valid 30 days
  (`Resources/user_resource.py:872`, `request_deletion`).
- `DELETE /api/v1/user/me/deletion-request` (no auth required — the emailed token is the
  credential) — cancels a pending deletion within the grace period.
- A daily Celery beat task (`Tasks/erasure.py`, `run_erasure`) hard-deletes any user whose grace
  period has elapsed: archives trips they led (preserving the route for remaining crew, nulling
  the leader pointer), deletes their personal logs, removes their avatar from object storage,
  and hard-deletes the user row (FK cascades handle session/invitation/certification rows).

**What's actually needed for M9 / this checklist item, therefore:**
- **Mobile UI**: a settings screen calling the existing `DELETE /api/v1/user/me` endpoint,
  surfacing the 30-day grace period and cancellation-email behavior the backend already
  implements — no new backend endpoint required.
- **One new public web page**: a route reachable from `kayaktrek.app` with **no login required**
  (e.g. `/delete-account` or similar) that lets a visitor either (a) submit their email to
  trigger the same deletion-request flow if they still remember credentials, or (b), since
  Google's bar is "can request deletion without installing/logging in," at minimum clearly
  explain how to request deletion and provide a contact/form path — this is the "one public web
  page" referenced in `plans/M9.md`. This is a small, standalone frontend task, not gated on
  mobile shipping, and could reasonably land in the M9 frontend track or earlier.
- The existing `support_email` fallback already wired into the deletion-request email template
  (`support@kayakplanner.app` default) could double as the no-login contact path if a full
  self-service web form isn't built first — confirm this satisfies the "readily discoverable,
  not hidden behind a login" bar Google describes, or build the minimal self-service form instead
  to be safe.

**Sources** (checked 2026-08-26, via WebSearch snippets):
- [Understanding Google Play's app account deletion requirements — Play Console Help](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [About the Data Safety Form and Account Deletion — Play Developer Community guide](https://support.google.com/googleplay/android-developer/community-guide/246344978/about-the-data-safety-form-and-account-deletion?hl=en)
- Root `CLAUDE.md` "GDPR" references + `backend/Resources/user_resource.py` + `backend/Tasks/erasure.py` (read directly from the repo, not web research — the "already built" half of this claim).

---

## 5. No social login (already decided, not re-researched here)

Per `plans/M9.md` item 10 and root `CLAUDE.md`, the app will **not** add Google or Facebook
sign-in. This is a deliberate decision, not a gap: adding third-party social login on iOS
triggers Apple's **Sign in with Apple** requirement (any app offering a third-party social login
option must also offer Sign in with Apple) for the eventual App Store release. Staying with
**email/password only** — which is what the web client already does — sidesteps that requirement
entirely for the mobile client too. No live research was performed on this item per the task
instructions (already-decided, confirm-only); it's included here for checklist completeness and
because it interacts with §3/§4 (an email/password-only account is exactly what `DELETE
/api/v1/user/me` and the deletion-request flow are built against).

---

## Summary — what differs from `plans/M9.md`'s current assumptions

Nothing found in this research **contradicts** `plans/M9.md`'s existing text — every item it
flagged (tenure requirement revised more than once, background-location review, Data safety
declaration needing to describe E2E-encrypted medical notes accurately, GDPR backend already
built) held up under live-ish research. Three points sharpen or add to what the plan currently
says and are worth folding back in:

1. **The 12-testers/14-days figure has been stable since December 2024 and is still current** —
   `plans/M9.md` correctly flagged it as "revised more than once" but didn't state the current
   number; it's **12 testers, 14 continuous days**, confirmed current as of 2026-08-26.
2. **A newer minimum-scope "location button" pattern** for one-off/transactional location
   requests is worth designing the mobile map screens around from the start, so the background
   permission stays scoped to only the two features that actually need it (live tracking,
   external GPS) — this wasn't previously called out in the plan and affects mobile screen
   design, not just paperwork.
3. **Tester engagement, not just headcount, appears to now matter** (2026-era reports of
   Google rejecting production requests where testers didn't meaningfully use the app) — this
   affects how tester recruitment should be run in M9h, not just how many testers are recruited.
4. **Review-turnaround figures for both the background-location extended review and the
   production-access review were not confirmed against primary sources in this session** (the
   sandbox's network egress blocked direct `WebFetch` to every domain tried, including
   `support.google.com`, so all figures here come from `WebSearch` snippets rather than a direct
   page read) — both should be treated as **multi-week, not multi-day**, for scheduling, and
   re-confirmed directly in Play Console when M9h actually starts.
