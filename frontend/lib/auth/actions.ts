"use server"

import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { API_URL, API_PREFIX } from "@/lib/api/config"
import { z } from "zod"
import {
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@/lib/auth/schemas"

export type AuthResult =
  | { success: true }
  | {
      success: false
      error: string
      code?: string
      fieldErrors?: ReturnType<typeof z.treeifyError>
    }

async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies()
  cookieStore.set("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15, // 15 minutes
  })
  cookieStore.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function login(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = LoginSchema.safeParse({
    mail: formData.get("mail"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: z.treeifyError(parsed.error),
    }
  }

  const { mail, password } = parsed.data

  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail, pwd: password }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}))
    if (body?.code === "deletion_pending") {
      return {
        success: false,
        error: "This account is scheduled for deletion.",
        code: "deletion_pending",
      }
    }
    return { success: false, error: "Access denied." }
  }
  if (res.status === 401) {
    return { success: false, error: "Invalid email or password." }
  }
  if (!res.ok) {
    return { success: false, error: "Something went wrong. Please try again." }
  }

  const { access_token, refresh_token } = await res.json()
  await setAuthCookies(access_token, refresh_token)
  redirect("/dashboard")
}

const KEYPAIR_FIELDS = [
  "publicKey",
  "privateKeyCiphertext",
  "privateKeyNonce",
  "privateKeySalt",
] as const

/** All four keypair fields, or none — a partial keypair is unusable, so it is not sent. */
function keypairFields(formData: FormData): Record<string, string> {
  const entries = KEYPAIR_FIELDS.map((field) => [field, formData.get(field)] as const)
  if (entries.some(([, value]) => typeof value !== "string" || !value)) return {}
  return Object.fromEntries(entries as readonly (readonly [string, string])[])
}

export async function register(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = RegisterSchema.safeParse({
    mail: formData.get("mail"),
    username: formData.get("username"),
    phone: formData.get("phone") ?? undefined,
    inviteCode: formData.get("inviteCode") ?? undefined,
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: z.treeifyError(parsed.error),
    }
  }

  const { mail, username, phone, inviteCode, password } = parsed.data
  // phone/inviteCode are optional client-side — JSON.stringify drops the undefined key.
  // name is omitted entirely: the backend defaults it to username at signup and it's
  // collected later in Settings (simplify-register, same pattern as phone, M12 §F).
  const body = {
    mail,
    username,
    phone: phone || undefined,
    inviteCode: inviteCode || undefined,
    pwd: password,
    // The medical-notes keypair, generated in the browser (M22) and passed through
    // untouched — this action never derives or unwraps anything. Deliberately outside
    // RegisterSchema: it is opaque key material, not a field a user typed, and the
    // backend treats all four as optional (an account with no keypair adds one later).
    ...keypairFields(formData),
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}))
    if (body?.code === "invalid_invite_code") {
      return {
        success: false,
        error: "Invalid or missing invite code.",
        code: "invalid_invite_code",
      }
    }
    return { success: false, error: "Access denied." }
  }
  if (res.status === 409) {
    return { success: false, error: "Email or username already in use." }
  }
  if (!res.ok) {
    return { success: false, error: "Something went wrong. Please try again." }
  }

  redirect("/login?registered=1")
}

export async function forgotPassword(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = ForgotPasswordSchema.safeParse({ mail: formData.get("mail") })
  if (!parsed.success) {
    return { success: false, error: "Enter a valid email address." }
  }

  try {
    await fetch(`${API_URL}${API_PREFIX}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail: parsed.data.mail }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  return { success: true }
}

export async function resetPassword(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please fix the errors below.",
    }
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: parsed.data.token, pwd: parsed.data.password }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (!res.ok) {
    return { success: false, error: "Invalid or expired reset link." }
  }

  redirect("/login?reset=1")
}

export async function cancelDeletion(token: string): Promise<AuthResult> {
  let res: Response
  try {
    res = await fetch(
      `${API_URL}${API_PREFIX}/user/me/deletion-request?token=${encodeURIComponent(token)}`,
      {
        method: "DELETE",
      },
    )
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return {
      success: false,
      error: body?.description ?? "The cancellation link is invalid or has expired.",
    }
  }

  return { success: true }
}

export async function resendDeletionCancel(mail: string): Promise<AuthResult> {
  try {
    await fetch(`${API_URL}${API_PREFIX}/auth/resend-deletion-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  return { success: true }
}

// Best effort on the server call: an unreachable server or an already-expired token
// shouldn't block the user from clearing their local cookies and leaving.
async function endSession(endpoint: "/auth/logout" | "/auth/logout-all") {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get("access_token")?.value

  if (accessToken) {
    try {
      await fetch(`${API_URL}${API_PREFIX}${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    } catch {
      // ignore — cookies are cleared below regardless
    }
  }

  cookieStore.delete("access_token")
  cookieStore.delete("refresh_token")
  redirect("/")
}

/** Ends this device's session only; the user's other devices stay signed in (M17). */
export async function logout() {
  await endSession("/auth/logout")
}

/** Ends every session the user has, on every device. */
export async function logoutEverywhere() {
  await endSession("/auth/logout-all")
}

type TokenPair = { access_token: string; refresh_token: string }

// Keyed by the refresh token being spent, and held only while the exchange is actually in
// flight. Concurrent callers presenting the same token await one exchange instead of each
// consuming it; the entry is dropped the moment it settles, so a token presented again
// later is genuinely re-exchanged and reuse detection still sees a replay for what it is.
const inFlightRefreshes = new Map<string, Promise<TokenPair | null>>()

async function exchangeRefreshToken(refreshToken: string): Promise<TokenPair | null> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  return (await res.json()) as TokenPair
}

// Refresh tokens are single-use and rotate on every exchange (M11 §2, ADR-032; per-session
// since M17) — presenting the same not-yet-rotated token twice is indistinguishable,
// server-side, from theft, and revokes that device's session. Two layers guard against
// spending it twice. cache() (mirrors getMe(), lib/user/me.ts) covers the fan-out inside a
// single render: the app layout's Promise.all, getPendingRequestsSummary's own Promise.all
// and the page's own fetch all read the same expired access_token cookie and 401 together.
// The map above covers what cache() cannot — separate concurrent requests, such as two open
// tabs, which get their own cache scope but share one cookie jar.
export const refreshSession = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get("refresh_token")?.value
  if (!refreshToken) return false

  let exchange = inFlightRefreshes.get(refreshToken)
  if (!exchange) {
    exchange = exchangeRefreshToken(refreshToken)
    inFlightRefreshes.set(refreshToken, exchange)
    void exchange.finally(() => inFlightRefreshes.delete(refreshToken))
  }

  const tokens = await exchange
  if (!tokens) return false

  await setAuthCookies(tokens.access_token, tokens.refresh_token)
  return true
})
