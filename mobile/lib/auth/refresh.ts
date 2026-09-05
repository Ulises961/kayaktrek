import { API_URL, API_PREFIX } from "../api/config"
import { getRefreshToken, setTokens, clearTokens } from "./token-store"
import { notifySessionExpired } from "./session-events"

type TokenPair = { access_token: string; refresh_token: string }

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

// Single in-flight refresh, module-level. Mirrors frontend/lib/auth/actions.ts's
// refreshSession — same reason: the refresh token is single-use and rotates on every
// exchange (M11 §2, ADR-032; per-device since M17), so presenting it twice concurrently
// reads server-side as theft and revokes the device's session. The web client needs a
// Map keyed by token because multiple tabs share one cookie jar with separate render
// scopes; a single mobile app instance has neither, so one shared promise is enough —
// there is only ever one refresh token in flight at a time here.
let inFlightRefresh: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return false

  const tokens = await exchangeRefreshToken(refreshToken)
  if (!tokens) {
    await clearTokens()
    notifySessionExpired()
    return false
  }

  await setTokens(tokens.access_token, tokens.refresh_token)
  return true
}

export function refreshSession(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = doRefresh().finally(() => {
      inFlightRefresh = null
    })
  }
  return inFlightRefresh
}
