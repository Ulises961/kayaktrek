import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { proxy, isAuthGatedPath, buildCsp, config } from "../proxy"

beforeEach(() => {
  vi.unstubAllGlobals()
})

// The (app) route group's actual segments — kept in sync with app/(app)/*.
// If this test breaks, a route was added/removed under (app) and the gated-prefix
// list (or this list) needs updating to match. See coding-rules-frontend routing
// conventions and the comment in proxy.ts.
const APP_SEGMENTS = [
  "dashboard",
  "design",
  "gear",
  "invitations",
  "itinerary",
  "logs",
  "profile",
  "settings",
  "trips",
  "users",
]

function requestFor(pathname: string, cookie?: string) {
  return new NextRequest(new URL(pathname, "http://localhost"), {
    headers: cookie ? { cookie } : {},
  })
}

describe("isAuthGatedPath", () => {
  it("gates every (app) segment, exact and with a sub-path", () => {
    for (const segment of APP_SEGMENTS) {
      expect(isAuthGatedPath(`/${segment}`)).toBe(true)
      expect(isAuthGatedPath(`/${segment}/some-id`)).toBe(true)
    }
  })

  it("does NOT gate /explore — the M7c route library is anonymous-facing", () => {
    // (app)/explore renders for anonymous visitors (fork CTA gated in-page via
    // isAuthenticated). Gating it here broke anon discovery (2026-07-10 fix).
    expect(isAuthGatedPath("/explore")).toBe(false)
  })

  it("gates /paddlers as an EXACT match only — never a prefix", () => {
    // (app)/paddlers/page.tsx (the authed connections index) and
    // (public)/paddlers/[username]/page.tsx (the public profile) share the
    // /paddlers URL prefix. A prefix match here would incorrectly gate public
    // profiles behind auth.
    expect(isAuthGatedPath("/paddlers")).toBe(true)
    expect(isAuthGatedPath("/paddlers/some-username")).toBe(false)
  })

  it("does not gate public/anonymous routes", () => {
    expect(isAuthGatedPath("/")).toBe(false)
    expect(isAuthGatedPath("/login")).toBe(false)
    expect(isAuthGatedPath("/register")).toBe(false)
  })
})

describe("proxy matcher", () => {
  it("runs on every route except static assets, not just gated segments", () => {
    // CSP must be set on anonymous-facing pages too — the matcher can no longer
    // be scoped to just the (app) segments the way the auth gate is.
    const [entry] = config.matcher
    expect(entry.source).toContain("_next/static")
    expect(entry.source).toContain("_next/image")
  })
})

describe("buildCsp", () => {
  it("includes a strict-dynamic nonce in script-src", () => {
    const csp = buildCsp("test-nonce", false)
    expect(csp).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
  })

  it("allows unsafe-eval only in dev (Turbopack/React dev-mode error stacks)", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'")
    expect(buildCsp("n", false)).not.toContain("'unsafe-eval'")
  })

  it("keeps style-src on 'unsafe-inline' with no nonce, in both dev and prod", () => {
    // Inline style="" attributes (React's style={{...}} prop, Leaflet's own marker
    // positioning) have no nonce escape hatch — only <style>/<link> elements do. A nonce
    // token in style-src also makes browsers ignore 'unsafe-inline' entirely, so this
    // directive has to stay nonce-free to have any effect.
    expect(buildCsp("n", false)).toContain("style-src 'self' 'unsafe-inline'")
    expect(buildCsp("n", true)).toContain("style-src 'self' 'unsafe-inline'")
    expect(buildCsp("n", false)).not.toMatch(/style-src[^;]*nonce/)
  })
})

describe("proxy", () => {
  it("sets a fresh, non-empty Content-Security-Policy header on every response", async () => {
    const res1 = await proxy(requestFor("/"))
    const res2 = await proxy(requestFor("/"))
    const csp1 = res1.headers.get("Content-Security-Policy")
    const csp2 = res2.headers.get("Content-Security-Policy")
    expect(csp1).toBeTruthy()
    expect(csp1).not.toEqual(csp2) // nonce must differ per request
  })

  it("redirects a gated path with no token at all to /login, preserving the origin path", async () => {
    const res = await proxy(requestFor("/dashboard"))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/login")
    expect(location.searchParams.get("from")).toBe("/dashboard")
  })

  it("does not redirect an ungated path even with no token", async () => {
    const res = await proxy(requestFor("/"))
    expect(res.status).not.toBe(307)
  })

  // /explore's own page redirects a visitor it cannot recognise to `/`, but by the time a
  // page can decide that, the (app) layout above it has already begun streaming — so Next
  // cannot send a status and embeds the redirect in a 200 instead. A browser follows it; a
  // crawler records a 200 whose body is the app shell, which is precisely the duplicate the
  // redirect exists to remove. Answering here, before anything renders, is what makes it a
  // real 307. Shipped as a 200 in v1.0.13 and verified against production.
  it("answers an anonymous /explore with a real 307 to the root, not /login", async () => {
    const res = await proxy(requestFor("/explore"))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/")
  })

  it("carries the query string over, so a shared filtered link survives the redirect", async () => {
    const res = await proxy(requestFor("/explore?q=fjord"))
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/")
    expect(location.searchParams.get("q")).toBe("fjord")
  })

  // Only the cookie-less case is decidable here: the middleware runtime cannot tell a live
  // session from a revoked one without a round trip. A visitor holding any credential falls
  // through to the page, whose hasLiveSession() check is the one that can. That split is
  // deliberate — the clean 307 is for crawlers and genuinely anonymous visitors, which is
  // the case the SEO half depends on.
  it("leaves /explore alone when the visitor presents credentials", async () => {
    const res = await proxy(requestFor("/explore", "refresh_token=whatever"))
    expect(res.status).not.toBe(307)
  })

  describe("expired access token with a refresh token present", () => {
    // Regression guard: proxy.ts used to redirect straight to /login the moment the
    // access token looked expired, without ever trying the refresh token — meaning
    // every user was logged out ~15 minutes after login regardless of a still-valid
    // 30-day refresh token. See lib/auth/actions.ts's refreshSession fix (matching bug
    // in the request shape sent to /auth/refresh).
    const expiredToken =
      "header." + Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url") + ".sig"

    it("refreshes and does NOT redirect when the backend accepts the refresh token", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }),
        }),
      )

      const res = await proxy(
        requestFor("/dashboard", `access_token=${expiredToken}; refresh_token=old-refresh`),
      )

      expect(res.status).not.toBe(307)
      expect(res.cookies.get("access_token")?.value).toBe("new-access")
      expect(res.cookies.get("refresh_token")?.value).toBe("new-refresh")
    })

    it("sends the refresh token in the JSON body, matching the backend contract", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }),
      })
      vi.stubGlobal("fetch", fetchMock)

      await proxy(
        requestFor("/dashboard", `access_token=${expiredToken}; refresh_token=old-refresh`),
      )

      const [, init] = fetchMock.mock.calls[0]
      expect(JSON.parse(init.body)).toEqual({ refresh_token: "old-refresh" })
    })

    it("falls back to redirecting to /login when the backend rejects the refresh token", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

      const res = await proxy(
        requestFor("/dashboard", `access_token=${expiredToken}; refresh_token=old-refresh`),
      )

      expect(res.status).toBe(307)
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login")
    })

    it("falls back to redirecting to /login when the refresh request itself fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))

      const res = await proxy(
        requestFor("/dashboard", `access_token=${expiredToken}; refresh_token=old-refresh`),
      )

      expect(res.status).toBe(307)
    })
  })
})
