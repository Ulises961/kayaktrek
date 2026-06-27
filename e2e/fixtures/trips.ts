import { APIRequestContext } from "@playwright/test"
import { API_URL } from "../playwright.config"

// Module-level cache: one login call per user per worker process.
// Access tokens live 15 min — well within a full test run.
const _tokenCache = new Map<string, string>()

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
  const res = await request.post(`${API_URL}/api/v1/trip/${tripId}/invite`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { email },
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
  if (_tokenCache.has(mail)) return _tokenCache.get(mail)!
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { mail, pwd },
  })
  if (!res.ok()) throw new Error(`login failed for ${mail}: ${res.status()}`)
  const body = await res.json()
  _tokenCache.set(mail, body.access_token)
  return body.access_token
}
