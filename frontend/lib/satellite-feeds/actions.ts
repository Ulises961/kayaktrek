"use server"

import { revalidatePath } from "next/cache"

import { apiDelete, apiGet, apiPatch, apiPost, isRedirectError } from "@/lib/api/client"
import {
  SatelliteFeedFormSchema,
  SatelliteFeedSchema,
  SatelliteFeedsSchema,
  type SatelliteFeed,
  type SatelliteFeedFormValues,
} from "@/lib/dtos/satellite-feed"

const FEEDS_PATH = "/api/satellite-feeds"

export type SatelliteFeedActionResult = { success: true } | { success: false; error: string }

/**
 * Every registered feed for the signed-in user.
 *
 * Returns an empty list on failure rather than throwing: Settings renders five other
 * cards and one failing lookup must not take the page down — the same treatment
 * `listSessions` gets. A redirect is rethrown so an expired session still reaches
 * /login instead of rendering as "no feeds".
 */
export async function listSatelliteFeeds(): Promise<SatelliteFeed[]> {
  try {
    const raw = await apiGet<unknown>(`${FEEDS_PATH}/all`)
    return SatelliteFeedsSchema.parse(raw)
  } catch (e) {
    if (isRedirectError(e)) throw e
    return []
  }
}

/**
 * Creates a feed when `id` is null, updates it in place otherwise.
 *
 * One action rather than two because the form is identical either way, and the caller
 * already knows which it is from whether it was handed an existing feed.
 */
export async function saveSatelliteFeed(
  id: string | null,
  values: SatelliteFeedFormValues,
): Promise<SatelliteFeedActionResult> {
  const parsed = SatelliteFeedFormSchema.safeParse(values)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the feed details." }
  }

  const { provider, feedUrl, setPassword, feedPassword } = parsed.data
  const body: Record<string, unknown> = { provider, feedUrl }
  // Three distinct instructions to the server, and an empty string is none of them:
  //   switch off            → null, which clears the stored password
  //   switch on + typed     → the value, which replaces it
  //   switch on + blank     → the key omitted, which leaves it alone
  // A value typed and then switched off is deliberately dropped: the switch is the
  // intent, so changing one's mind must not save a password the user just removed.
  if (!setPassword) body.feedPassword = null
  else if (feedPassword) body.feedPassword = feedPassword

  try {
    const raw = id
      ? await apiPatch<unknown>(`${FEEDS_PATH}/${id}`, body)
      : await apiPost<unknown>(`${FEEDS_PATH}/create`, body)
    // Parsed even though the value is discarded — a response that does not match the
    // contract is a failure worth surfacing, not something to shrug at.
    SatelliteFeedSchema.parse(raw)
    revalidatePath("/settings")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to save the feed." }
  }
}

export async function deleteSatelliteFeed(id: string): Promise<SatelliteFeedActionResult> {
  try {
    await apiDelete(`${FEEDS_PATH}/${id}`)
    revalidatePath("/settings")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to remove the feed." }
  }
}
