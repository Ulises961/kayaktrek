import "server-only"
import { cookies } from "next/headers"

export type Session = {
  userId: string
  email: string
  isAdmin: boolean
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payloadB64] = token.split(".")
    const json = Buffer.from(payloadB64, "base64url").toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null

  const payload = decodeJwtPayload(token)
  if (!payload) return null

  const exp = payload.exp as number | undefined
  if (exp && Date.now() / 1000 > exp) return null

  return {
    userId: payload.user_id as string,
    email: payload.email as string,
    isAdmin: (payload.is_admin as boolean) ?? false,
  }
}
