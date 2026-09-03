/**
 * Feature flags for surfaces that exist in the codebase but are not currently offered.
 *
 * Read `NEXT_PUBLIC_*` through a direct `process.env.X` property access, never a
 * destructured or computed lookup — Next inlines these at build time by substituting the
 * literal expression, so `process.env[name]` is `undefined` in the browser bundle no
 * matter what the environment holds.
 */

/**
 * Medical notes (M3g, client-side crypto since M22) — parked 2026-09-02.
 *
 * Off unless a deployment opts in, matching the backend's `MEDICAL_NOTES_ENABLED`
 * (`backend/Api/features.py`). This flag hides the surface; the backend one closes it.
 * Both are needed and neither substitutes for the other: hiding a control in the client
 * does not stop an endpoint accepting data, and a 404 from an endpoint the UI still
 * offers is a broken page rather than a parked feature.
 *
 * See `docs/adr/safety-privacy.md` "Parked (2026-09-02)" for why.
 */
export const MEDICAL_NOTES_ENABLED = process.env.NEXT_PUBLIC_MEDICAL_NOTES === "true"
