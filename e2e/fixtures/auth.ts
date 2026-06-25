import { APIRequestContext } from "@playwright/test"
import { API_URL } from "../playwright.config"

export interface UserCredentials {
  name: string
  username: string
  mail: string
  pwd: string
  phone: string
}

export const LEADER: UserCredentials = {
  name: "E2E Leader",
  username: "e2e_leader",
  mail: "e2e.leader@example.com",
  pwd: "Leader$ecure1",
  phone: "+391110000001",
}

export const CREW: UserCredentials = {
  name: "E2E Crew",
  username: "e2e_crew",
  mail: "e2e.crew@example.com",
  pwd: "Crew$ecure1!",
  phone: "+391110000002",
}

export async function registerAndActivate(
  request: APIRequestContext,
  creds: UserCredentials,
): Promise<void> {
  // Registration is idempotent from our perspective — a 400/409 just means
  // the user already exists from a prior run, which is fine.
  await request.post(`${API_URL}/api/v1/auth/register`, { data: creds })

  // Activation sets active=true unconditionally — safe to call every run.
  const activate = await request.post(`${API_URL}/api/v1/auth/activate-test`, {
    data: { mail: creds.mail },
  })
  if (!activate.ok()) {
    throw new Error(`Activation failed for ${creds.mail}: ${activate.status()} ${await activate.text()}`)
  }
}

export async function apiLogin(
  request: APIRequestContext,
  creds: UserCredentials,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { mail: creds.mail, pwd: creds.pwd },
  })
  if (!res.ok()) throw new Error(`Login failed for ${creds.mail}: ${res.status()}`)
  const body = await res.json()
  return { accessToken: body.access_token, refreshToken: body.refresh_token }
}
