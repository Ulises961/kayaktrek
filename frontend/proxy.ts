import { NextRequest, NextResponse } from "next/server"

function isTokenExpired(token: string): boolean {
  try {
    const [, payloadB64] = token.split(".")
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"))
    return typeof payload.exp === "number" && Date.now() / 1000 > payload.exp
  } catch {
    return true
  }
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value

  if (!token || isTokenExpired(token)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("from", request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

// Cookie-gated routes — one entry per `app/(app)/*` segment (M11 §3: this list had drifted
// to cover only 3 of the ~10 segments; server components still 401→redirect as a fallback,
// but keep this in sync going forward). Anonymous-facing routes deliberately live outside
// this matcher under the `app/(public)/` route group (landing, float-plan share, export
// download, public paddler profiles) — keep that grouping in sync too.
//
// `/paddlers` is intentionally an EXACT match, not a `:path*` wildcard: `(app)/paddlers`
// (the authed connections index) and `(public)/paddlers/[username]` (the public profile)
// share the `/paddlers` URL prefix, and a wildcard here would gate the public profile pages
// behind auth.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/design/:path*",
    "/explore/:path*",
    "/gear/:path*",
    "/invitations/:path*",
    "/itinerary/:path*",
    "/logs/:path*",
    "/paddlers",
    "/profile/:path*",
    "/trips/:path*",
    "/users/:path*",
  ],
}
