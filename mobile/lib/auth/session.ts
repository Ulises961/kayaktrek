import { getAccessToken } from "./token-store"

export type Session = {
  userId: string
  email: string
}

// Mirrors frontend/lib/auth/session.ts's decodeJwtPayload/getSession — same JWT claims
// (user_id, email), same technique (decode the payload, no signature verification since
// the backend is the only party that needs to trust it), just reading from SecureStore
// instead of a cookie jar.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payloadB64] = token.split(".")
    const json = decodeURIComponent(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export async function getSession(): Promise<Session | null> {
  const token = await getAccessToken()
  if (!token) return null

  const payload = decodeJwtPayload(token)
  if (!payload) return null

  return {
    userId: payload.user_id as string,
    email: payload.email as string,
  }
}
