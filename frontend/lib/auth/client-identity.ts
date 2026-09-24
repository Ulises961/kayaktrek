import "server-only"
import { headers } from "next/headers"

/**
 * The browser's own identity, forwarded to the backend so the sessions list can say whose
 * device a row is.
 *
 * Sign-in and refresh both run as server actions, so the request the backend actually sees
 * comes from Node: its User-Agent describes our own server and its address is the
 * datacentre's. Every web session was therefore labelled "Unknown device", and in
 * production each 15-minute refresh overwrote the location with the server's.
 *
 * The values do not travel under Cloudflare's own header names. Cloudflare rewrites those
 * on any request it proxies, so if the frontend→backend hop ever goes through it, ours
 * would be replaced by the server's again — the exact bug, reintroduced by the fix.
 *
 * `X-Client-Forwarded` carries a shared secret the backend compares with `compare_digest`.
 * Without it the backend ignores every `X-Client-*` header, because otherwise anyone
 * calling the API directly could choose how their session appears in the one list a paddler
 * would use to spot a session that is not theirs.
 */
export async function clientIdentityHeaders(): Promise<Record<string, string>> {
  const secret = process.env.CLIENT_FORWARDING_SECRET
  if (!secret) return {}

  const incoming = await headers()
  const forwarded: Record<string, string> = { "X-Client-Forwarded": secret }

  const userAgent = incoming.get("user-agent")
  if (userAgent) forwarded["X-Client-User-Agent"] = userAgent

  // Cloudflare's location headers on the *browser's* request — the one hop that actually
  // saw the paddler. Absent in local development, where there is no Cloudflare at all, and
  // the backend simply records no location in that case.
  const city = incoming.get("cf-ipcity")
  const region = incoming.get("cf-region") ?? incoming.get("cf-ipregion")
  const country = incoming.get("cf-ipcountry")
  if (city) forwarded["X-Client-City"] = city
  if (region) forwarded["X-Client-Region"] = region
  if (country) forwarded["X-Client-Country"] = country

  return forwarded
}
