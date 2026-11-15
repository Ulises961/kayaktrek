import { API_URL, API_PREFIX } from "../api/config"
import { clearBiometricCredentials } from "./biometric-store"
import { getAccessToken, setTokens, clearTokens } from "./token-store"

export const INVALID_CREDENTIALS = "invalid_credentials"
export const DELETION_PENDING = "deletion_pending"

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
    if (body?.code === DELETION_PENDING) {
      return {
        success: false,
        error: "This account is scheduled for deletion.",
        code: DELETION_PENDING,
      }
    }
    return { success: false, error: "Access denied." }
  }
  if (res.status === 401) {
    // The code lets the fingerprint shortcut tell "the saved password is out of date" from a
    // network failure: the first discards it, the second must not.
    return { success: false, error: "Invalid email or password.", code: INVALID_CREDENTIALS }
  }
  if (!res.ok) {
    return { success: false, error: "Something went wrong. Please try again." }
  }

  const { access_token, refresh_token } = await res.json()
  await setTokens(access_token, refresh_token)
  return { success: true }
}

export type RegisterResult =
  | { success: true }
  | { success: false; error: string; code?: string }

// Mirrors frontend/lib/auth/actions.ts's register() body: {mail, username, pwd}, no keypair — the
// backend treats the medical-notes key material as optional and that feature is parked. A 201
// does not mean an account was made (an address already in use answers the same way, so a caller
// cannot probe for accounts); it means "check your email".
export async function register(
  mail: string,
  username: string,
  password: string,
): Promise<RegisterResult> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail, username, pwd: password }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (res.status === 201) return { success: true }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}))
    // INVITE_CODE re-armed on the server closes sign-up (DEPLOY.md "Closing registration in a
    // hurry"); the form has no field for a code, so every attempt lands here.
    if (body?.code === "invalid_invite_code") {
      return {
        success: false,
        error: "Sign-ups are closed right now.",
        code: "invalid_invite_code",
      }
    }
    return { success: false, error: "Access denied." }
  }
  if (res.status === 422) {
    return { success: false, error: "Some details were not accepted. Check them and try again." }
  }
  if (res.status === 429) {
    return { success: false, error: "Too many attempts. Please try again later." }
  }
  return { success: false, error: "Something went wrong. Please try again." }
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
  // "Everywhere" is the lost-phone and shared-phone case: the fingerprint shortcut would
  // otherwise still sign this device straight back in.
  await clearBiometricCredentials()
}
