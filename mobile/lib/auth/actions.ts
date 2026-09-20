import { API_URL, API_PREFIX } from "../api/config"
import { getAccessToken, setTokens, clearTokens } from "./token-store"

export type LoginResult =
  | { success: true }
  | { success: false; error: string; code?: string }

// Mirrors frontend/lib/auth/actions.ts's login() request/response shape exactly — same
// backend endpoint, same {mail, pwd} body, same {access_token, refresh_token} response.
export async function login(mail: string, password: string): Promise<LoginResult> {
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
  await setTokens(access_token, refresh_token)
  return { success: true }
}

// Ends this device's session only — the mobile equivalent of frontend's logout() (M17:
// per-device, other sessions unaffected). Best effort on the server call: an unreachable
// server or an already-expired token shouldn't block clearing local tokens.
export async function logout(): Promise<void> {
  const accessToken = await getAccessToken()
  if (accessToken) {
    try {
      await fetch(`${API_URL}${API_PREFIX}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    } catch {
      // ignore — tokens are cleared below regardless
    }
  }
  await clearTokens()
}

// Ends EVERY session, this device included — the mobile equivalent of frontend's
// logoutEverywhere(). The backend bumps token_version and revokes every session, so every
// outstanding access/refresh token on every device dies at once (M17). Local tokens are
// cleared the same best-effort way logout() clears them: the server call having failed
// does not make the tokens on this device worth keeping.
export async function logoutEverywhere(): Promise<void> {
  const accessToken = await getAccessToken()
  if (accessToken) {
    try {
      await fetch(`${API_URL}${API_PREFIX}/auth/logout-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    } catch {
      // ignore — tokens are cleared below regardless
    }
  }
  await clearTokens()
}
