import {
  SatelliteFeedFormSchema,
  SatelliteFeedSchema,
  SatelliteFeedsSchema,
  type SatelliteFeed,
  type SatelliteFeedFormValues,
} from "@shared/dtos/satellite-feed"

import { apiDelete, apiGet, apiPatch, apiPost } from "@mobile/lib/api/client"

const FEEDS_PATH = "/api/satellite-feeds"

// M29 — the user's registered satellite communicator feed. Unlike web's list, this one
// throws: web's Settings page renders it server-side and degrades to "no feeds", but an
// empty list here would read as "nothing registered" and invite a second registration
// over a feed that is working. The Settings screen catches and shows its own message.
export async function listSatelliteFeeds(): Promise<SatelliteFeed[]> {
  const raw = await apiGet<unknown>(`${FEEDS_PATH}/all`)
  return SatelliteFeedsSchema.parse(raw)
}

// Creates a feed when `id` is null, updates it in place otherwise. The form is identical
// either way, and the caller already knows which it is from whether it holds a feed.
export async function saveSatelliteFeed(
  id: string | null,
  values: SatelliteFeedFormValues,
): Promise<SatelliteFeed> {
  const parsed = SatelliteFeedFormSchema.safeParse(values)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Check the feed details.")
  }

  const { provider, feedUrl, setPassword, feedPassword } = parsed.data
  const body: Record<string, unknown> = { provider, feedUrl }
  // Three distinct instructions to the server, and an empty string is none of them:
  //   switch off            → null, which clears the stored password
  //   switch on + typed     → the value, which replaces it
  //   switch on + blank     → the key omitted, which leaves it alone
  // Same contract as web's `saveSatelliteFeed`: the server never echoes a password, so
  // the request has to say what was meant instead of leaving it to be inferred from a
  // blank box. A value typed and then switched off is dropped on purpose.
  if (!setPassword) body.feedPassword = null
  else if (feedPassword) body.feedPassword = feedPassword

  const raw = id
    ? await apiPatch<unknown>(`${FEEDS_PATH}/${id}`, body)
    : await apiPost<unknown>(`${FEEDS_PATH}/create`, body)
  return SatelliteFeedSchema.parse(raw)
}

export async function deleteSatelliteFeed(id: string): Promise<void> {
  await apiDelete(`${FEEDS_PATH}/${id}`)
}
