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

export const config = {
  matcher: ["/dashboard/:path*", "/trips/:path*", "/invitations/:path*"],
}
