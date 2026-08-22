import { APIRequestContext } from "@playwright/test"
import { API_URL } from "../playwright.config"

// Module-level cache: one login call per user per worker process, re-issued
// before the token it holds expires.
//
// Access tokens live 15 minutes (ACCESS_TOKEN_LIFETIME, Services/session_service.py).
// This cache used to hand one out forever on the premise that 15 minutes was
// "well within a full test run" — true when the suite was 66 tests and ran in
// under 5, false now that it is 128 and runs past 20. Past the 15-minute mark
// every seed call made with a cached token 401s, and because seeding happens in
// beforeAll, the whole spec file dies rather than one assertion.
//
// Re-login at 10 minutes rather than at expiry: the margin covers a seed that
// starts just under the line, and /auth/login's budget (10/min, 50/hour —
// Resources/authentication_resource.py) is nowhere near threatened by a couple
// of extra logins per user per hour.
const TOKEN_MAX_AGE_MS = 10 * 60 * 1000
const _tokenCache = new Map<string, { token: string; issuedAt: number }>()

export async function apiCreateTrip(
  request: APIRequestContext,
  accessToken: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; [key: string]: unknown }> {
  const res = await request.post(`${API_URL}/api/v1/trip/create`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      inventory: {},
      itinerary: { isPublic: false, totalMiles: 0, days: [] },
      ...overrides,
    },
  })
  if (!res.ok()) throw new Error(`createTrip failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiDeleteTrip(
  request: APIRequestContext,
  accessToken: string,
  tripId: string,
): Promise<void> {
  await request.delete(`${API_URL}/api/v1/trip/${tripId}?for_everyone=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function apiInviteByEmail(
  request: APIRequestContext,
  accessToken: string,
  tripId: string,
  email: string,
): Promise<void> {
  // The invite endpoint takes a userId, never a bare email (M12 §N closed that
  // enumeration oracle) — resolve it via the same search-by-email-prefix endpoint
  // the buddy picker/paddler search uses.
  const searchRes = await request.get(
    `${API_URL}/api/v1/user/search?q=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!searchRes.ok()) {
    throw new Error(`user search failed: ${searchRes.status()} ${await searchRes.text()}`)
  }
  const matches = (await searchRes.json()) as Array<{ id: string; mail: string }>
  const user = matches.find((u) => u.mail === email)
  if (!user) throw new Error(`invite failed: no user found for ${email}`)

  const res = await request.post(`${API_URL}/api/v1/trip/${tripId}/invite`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { userId: user.id },
  })
  if (!res.ok()) throw new Error(`invite failed: ${res.status()} ${await res.text()}`)
}

export async function apiAcceptInvitation(
  request: APIRequestContext,
  accessToken: string,
  tripId: string,
): Promise<void> {
  const res = await request.post(`${API_URL}/api/v1/trip/${tripId}/invitation`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { accepted: true },
  })
  if (!res.ok()) throw new Error(`accept invitation failed: ${res.status()} ${await res.text()}`)
}

export async function apiTransitionState(
  request: APIRequestContext,
  accessToken: string,
  tripId: string,
  state: string,
): Promise<void> {
  const res = await request.post(`${API_URL}/api/v1/trip/${tripId}/state`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { state },
  })
  if (!res.ok()) throw new Error(`transition to ${state} failed: ${res.status()}`)
}

export async function apiGetAccessToken(
  request: APIRequestContext,
  mail: string,
  pwd: string,
): Promise<string> {
  const cached = _tokenCache.get(mail)
  if (cached && Date.now() - cached.issuedAt < TOKEN_MAX_AGE_MS) return cached.token
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { mail, pwd },
  })
  if (!res.ok()) throw new Error(`login failed for ${mail}: ${res.status()}`)
  const body = await res.json()
  _tokenCache.set(mail, { token: body.access_token, issuedAt: Date.now() })
  return body.access_token
}
