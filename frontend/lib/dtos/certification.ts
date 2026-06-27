import { z } from "zod"
import { isoDateField, noHtmlTags } from "../validators"

// A paddler's qualification/membership badge (e.g. BC Sea Leader, RYA).
// Mirrors the backend UserCertification model. Self-asserted — never an
// endorsement input (see plans/M7a.md: badge, not authority).
export const CertificationSchema = z.object({
  id: z.uuidv7().optional(),
  userId: z.uuidv7().nullish(),
  organization: z.string(),
  award: z.string(),
  membershipNumber: z.string().nullish(),
  awardedAt: isoDateField.nullish(),
  validUntil: isoDateField.nullish(),
})

export const CertificationsSchema = z.array(CertificationSchema)

// Form schema for add/edit. membershipNumber + dates optional.
export const CertificationFieldsSchema = z.object({
  organization: z
    .string()
    .min(1, "Organization is required")
    .max(100, "Max 100 characters")
    .refine(noHtmlTags.check, noHtmlTags.message),
  award: z
    .string()
    .min(1, "Award is required")
    .max(200, "Max 200 characters")
    .refine(noHtmlTags.check, noHtmlTags.message),
  membershipNumber: z
    .string()
    .max(100, "Max 100 characters")
    .refine(noHtmlTags.check, noHtmlTags.message)
    .optional(),
  awardedAt: isoDateField.optional(),
  validUntil: isoDateField.optional(),
})

export type Certification = z.infer<typeof CertificationSchema>
export type CertificationFields = z.infer<typeof CertificationFieldsSchema>
