import { describe, it, expect } from "vitest"
import { config } from "../proxy"

// The (app) route group's actual segments — kept in sync with app/(app)/*.
// If this test breaks, a route was added/removed under (app) and the matcher
// (or this list) needs updating to match. See coding-rules-frontend routing
// conventions and the comment in proxy.ts.
const APP_SEGMENTS = [
  "dashboard",
  "design",
  "gear",
  "invitations",
  "itinerary",
  "logs",
  "profile",
  "trips",
  "users",
]

describe("proxy matcher", () => {
  it("gates every (app) segment except paddlers and explore with a :path* wildcard", () => {
    for (const segment of APP_SEGMENTS) {
      expect(config.matcher).toContain(`/${segment}/:path*`)
    }
  })

  it("does NOT gate /explore — the M7c route library is anonymous-facing", () => {
    // (app)/explore renders for anonymous visitors (fork CTA gated in-page via
    // isAuthenticated). Gating it here broke anon discovery (2026-07-10 fix).
    expect(config.matcher.some((m: string) => m.startsWith("/explore"))).toBe(false)
  })

  it("gates /paddlers as an EXACT match only — never a wildcard", () => {
    // (app)/paddlers/page.tsx (the authed connections index) and
    // (public)/paddlers/[username]/page.tsx (the public profile) share the
    // /paddlers URL prefix. A wildcard here would incorrectly gate public
    // profiles behind auth.
    expect(config.matcher).toContain("/paddlers")
    expect(config.matcher).not.toContain("/paddlers/:path*")
  })
})
