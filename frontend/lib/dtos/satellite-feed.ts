import { z } from "zod"

// M29 — a user's registered satellite communicator feed. A profile setting, not
// trip-scoped: the poll task resolves the user's HAPPENING trips at poll time.
//
// Garmin inReach only for v1 (`docs/mobile/satellite-feed-spec.md`'s confidence
// ranking). SPOT and Zoleo exist in the backend enum but stay unselectable until each
// provider's open questions are resolved, so the UI offers one option rather than three
// that mostly fail.
export const SATELLITE_PROVIDER = {
  INREACH_MAPSHARE: "inreach_mapshare",
  SPOT: "spot",
  ZOLEO: "zoleo",
} as const

export const SATELLITE_PROVIDERS = [
  SATELLITE_PROVIDER.INREACH_MAPSHARE,
  SATELLITE_PROVIDER.SPOT,
  SATELLITE_PROVIDER.ZOLEO,
] as const

export type SatelliteProvider = (typeof SATELLITE_PROVIDERS)[number]

export const SATELLITE_PROVIDER_LABELS: Record<SatelliteProvider, string> = {
  [SATELLITE_PROVIDER.INREACH_MAPSHARE]: "Garmin inReach",
  [SATELLITE_PROVIDER.SPOT]: "SPOT",
  [SATELLITE_PROVIDER.ZOLEO]: "Zoleo",
}

// `feedPassword` is absent by design: the backend marks it load_only and never echoes
// it, so a response shape carrying it would be a lie about what the server returns.
export const SatelliteFeedSchema = z.object({
  id: z.uuidv7(),
  provider: z.enum(SATELLITE_PROVIDERS),
  feedUrl: z.string(),
  feedUsername: z.string().nullish(),
  // Set when a poll failed authentication. The feed is skipped entirely until the user
  // re-saves credentials, so this is the one field the UI must surface loudly.
  needsReauth: z.boolean(),
  lastPolledAt: z.string().nullish(),
  lastIngestedAt: z.string().nullish(),
  created: z.string().nullish(),
})

export type SatelliteFeed = z.infer<typeof SatelliteFeedSchema>
export const SatelliteFeedsSchema = z.array(SatelliteFeedSchema)

// Mirrors the backend's own validation (Schemas/satellite_feed_schema.py): non-empty,
// at most 500 characters, and https only. Checked here so a typo is rejected without a
// round trip, not instead of the server check.
export const SatelliteFeedFormSchema = z.object({
  provider: z.enum(SATELLITE_PROVIDERS),
  feedUrl: z
    .string()
    .trim()
    .min(1, "Enter your feed URL")
    .max(500, "That URL is too long")
    .refine((value) => value.toLowerCase().startsWith("https://"), "Feed URL must use https://"),
  feedPassword: z.string().optional(),
})

export type SatelliteFeedFormValues = z.infer<typeof SatelliteFeedFormSchema>
