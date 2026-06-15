import { z } from "zod"
import { noHtmlTags } from "../validators"

export const LogisticsSchema = z.object({
  id: z.uuidv7().optional(),
  tripId: z.uuidv7().optional(),
  shoreContactName: z.string().nullish(),
  shoreContactEmail: z.string().nullish(),
  shoreContactPhone: z.string().nullish(),
  shoreContactRelationship: z.string().nullish(),
  shuttleNotes: z.string().nullish(),
  shuttleMeetingTime: z.string().nullish(),
  shareToken: z.string().nullish(),
  snapshotGeneratedAt: z.string().nullish(),
})

export const LogisticsFieldsSchema = z.object({
  shoreContactName: z.string().max(200).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  shoreContactEmail: z.string().email("Enter a valid email address.").or(z.literal("")).optional(),
  shoreContactPhone: z.string().max(20).optional(),
  shoreContactRelationship: z
    .string()
    .max(100)
    .refine(noHtmlTags.check, noHtmlTags.message)
    .optional(),
  shuttleNotes: z.string().max(1000).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  shuttleMeetingTime: z.string().max(50).optional(),
})

export type Logistics = z.infer<typeof LogisticsSchema>
export type LogisticsFields = z.infer<typeof LogisticsFieldsSchema>
