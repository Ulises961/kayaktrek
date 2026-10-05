import { z } from "zod"
import { isoDateField } from "../validators"

// Aggregate logbook statistics. Mirrors LogService.stats_for_user — pure
// aggregation, no per-log detail. Reused by the private /stats endpoint and
// the public profile projection.
export const StatsSchema = z.object({
  totalDistance: z.number(),
  totalHours: z.number(),
  logCount: z.number(),
  tripCount: z.number(),
  endorsementsReceived: z.number(),
  // Histogram of Beaufort sea-state buckets; JSON object keys are stringified ints.
  conditionsDistribution: z.record(z.string(), z.number()),
  activityByMonth: z.array(
    z.object({
      month: z.string(),
      distance: z.number(),
      hours: z.number(),
      count: z.number(),
    }),
  ),
})

// Certifications on the public profile drop membership_number (a semi-identifier).
const PublicCertificationSchema = z.object({
  organization: z.string(),
  award: z.string(),
  awardedAt: isoDateField.nullish(),
  validUntil: isoDateField.nullish(),
})

// Privacy-safe public projection of a paddler. Mirrors PublicUserSchema on the
// backend: self-presentation + opt-in certs + aggregate stats only. Never any
// contact, vessel, emergency, medical, or per-log data.
export const PublicUserSchema = z.object({
  username: z.string(),
  name: z.string(),
  surname: z.string().nullish(),
  avatarUrl: z.string().url().nullish(),
  bannerUrl: z.string().url().nullish(),
  bio: z.string().nullish(),
  homeLocation: z.string().nullish(),
  certifications: z.array(PublicCertificationSchema),
  stats: StatsSchema,
})

export type Stats = z.infer<typeof StatsSchema>
export type PublicUser = z.infer<typeof PublicUserSchema>
export type PublicCertification = z.infer<typeof PublicCertificationSchema>
