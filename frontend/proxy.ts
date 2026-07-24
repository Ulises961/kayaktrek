import { NextRequest, NextResponse } from "next/server"
import { API_URL, API_PREFIX, SSE_URL } from "@/lib/api/config"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

// Mirrors lib/auth/actions.ts's setAuthCookies — kept in sync manually since that file
// is a "use server" module (next/headers) and this one runs in the Edge middleware
// runtime, so it can't be imported directly.
const ACCESS_TOKEN_COOKIE = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 15,
}
const REFRESH_TOKEN_COOKIE = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

function isTokenExpired(token: string): boolean {
  try {
    const [, payloadB64] = token.split(".")
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"))
    return typeof payload.exp === "number" && Date.now() / 1000 > payload.exp
  } catch {
    return true
  }
}

// Cookie-gated segments — one entry per `app/(app)/*` segment (M11 §3: this list had drifted
// to cover only 3 of the ~10 segments; server components still 401→redirect as a fallback,
// but keep this in sync going forward). Anonymous-facing routes deliberately stay ungated —
// they live under `app/(public)/` (landing, float-plan share, export download, public paddler
// profiles) — keep that grouping in sync too.
//
// `/paddlers` is intentionally an EXACT match, not a prefix: `(app)/paddlers` (the authed
// connections index) and `(public)/paddlers/[username]` (the public profile) share the
// `/paddlers` URL prefix, and a prefix match here would gate the public profile pages behind
// auth.
//
// `/explore` is intentionally ABSENT: the M7c public route library is anonymous-facing by
// design (fork/CTA gating happens in-page via `isAuthenticated`), even though it lives in
// `(app)` for the sidebar shell. The M11 §3 matcher sweep briefly gated it and broke anon
// discovery (caught by e2e 13-explore-discovery, fixed 2026-07-10).
//
// This used to be the proxy's `matcher` — now the matcher runs on every route (needed so the
// CSP nonce below is set everywhere, not just authenticated segments), so the auth gate is a
// path check inside the function instead.
const AUTH_GATED_PREFIXES = [
  "/dashboard",
  "/design",
  "/gear",
  "/invitations",
  "/itinerary",
  "/logs",
  "/profile",
  "/settings",
  "/trips",
  "/users",
]

export function isAuthGatedPath(pathname: string): boolean {
  if (pathname === "/paddlers") return true
  return AUTH_GATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

// Built per-request, never in next.config.ts: the nonce must be fresh every time, which a
// static config-time header value cannot provide. `'strict-dynamic'` lets the nonced initial
// script load Next's own runtime/chunk scripts; browsers without strict-dynamic support fall
// back to trusting `'self'` + the nonce. Dev needs 'unsafe-eval' (Turbopack/React dev-mode
// error-stack reconstruction uses eval) — not needed in production.
//
// style-src is 'unsafe-inline' with no nonce token, in both dev and prod: React's
// `style={{...}}` prop (used throughout the map builder — day-rail, point-row,
// layers-control, etc.) and Leaflet's own marker positioning both set the inline `style`
// attribute directly, and nonces only cover <style>/<link> elements, never style=""
// attributes. A nonce token in this directive also makes browsers ignore 'unsafe-inline'
// entirely (a CSP backwards-compat rule), so it has to stay nonce-free to have any effect.
// script-src (the actual XSS vector) keeps its strict nonce + strict-dynamic policy.
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // API_URL covers the M8 tile proxy (GET /api/v1/tiles/...) — in dev that's
    // http://localhost:5000, which the bare `https:` grant below doesn't match.
    `img-src 'self' data: https: http://localhost:9000 ${API_URL}`,
    "font-src 'self' data:",
    // Was 'self' only — this app never fetched Flask from client-side JS, every
    // mutation went through a server action. M8's live-position layer breaks that:
    // the browser's EventSource connects directly to the API origin (public story
    // stream) and the SSE sidecar (crew Navigate mode, ticketed), so both must be
    // allowed here.
    `connect-src 'self' ${API_URL} ${SSE_URL}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")
}

// Matches the backend's actual contract (Resources/authentication_resource.py
// refresh_token): the refresh token goes in the JSON body, not an Authorization
// header — the same mismatch that made lib/auth/actions.ts's refreshSession silently
// fail on every call (fixed alongside this).
async function tryRefresh(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return null
    const body = await res.json()
    return { accessToken: body.access_token, refreshToken: body.refresh_token }
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  let refreshed: { accessToken: string; refreshToken: string } | null = null

  if (isAuthGatedPath(pathname)) {
    const token = request.cookies.get("access_token")?.value
    if (!token || isTokenExpired(token)) {
      const refreshToken = request.cookies.get("refresh_token")?.value
      refreshed = refreshToken ? await tryRefresh(refreshToken) : null

      if (!refreshed) {
        const loginUrl = new URL("/login", request.url)
        loginUrl.searchParams.set("from", pathname)
        return NextResponse.redirect(loginUrl)
      }

      // Give the request this navigation is about to render the refreshed access
      // token immediately — otherwise the page renders as logged-out even though
      // the refresh just succeeded, and the browser only gets the new cookie for
      // its *next* request.
      request.cookies.set("access_token", refreshed.accessToken)
      request.cookies.set("refresh_token", refreshed.refreshToken)
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development")

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)

  if (refreshed) {
    response.cookies.set("access_token", refreshed.accessToken, ACCESS_TOKEN_COOKIE)
    response.cookies.set("refresh_token", refreshed.refreshToken, REFRESH_TOKEN_COOKIE)
  }

  return response
}

// Runs on every route except static assets — CSP must protect anonymous-facing pages
// (landing, login, public profiles) too, not only the auth-gated segments above. Excludes
// prefetch requests (next/link) per Next's own recommendation: no point minting a nonce and
// CSP header for a request that never renders anything.
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
