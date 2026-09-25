import { z } from "zod"
import { noHtmlTags } from "../validators"
import { TravellerSchema } from "./user"

export const MEMBER_ROLE = {
  LEADER: "leader",
  CREW: "crew",
} as const

export const TripMemberSchema = z.object({
  id: z.uuidv7().optional(),
  role: z.enum(["leader", "crew"]),
  user: TravellerSchema,
  // Float plan snapshot (M3d)
  vesselMake: z.string().nullish(),
  vesselModel: z.string().nullish(),
  vesselLengthCm: z.number().int().nullish(),
  vesselColorPrimary: z.string().nullish(),
  vesselColorSecondary: z.string().nullish(),
  emergencyContactName: z.string().nullish(),
  emergencyContactPhone: z.string().nullish(),
  emergencyContactRelationship: z.string().nullish(),
  medicalNotesConsentAt: z.string().nullish(),
  hasTripMedicalNotes: z.boolean().optional(),
  hasLeaderMedicalNotes: z.boolean().optional(),
  floatPlanConfirmedAt: z.string().nullish(),
  // Set by the leader when this paddler left a trip under way (M9d): who was on
  // the water, and until when.
  leftAt: z.string().nullish(),
  leftNote: z.string().nullish(),
  // Leadership succession (trip-leadership-succession)
  nominatedSuccessor: z.boolean().optional(),
})

export type TripMember = z.infer<typeof TripMemberSchema>

// Form validation for PATCH /api/trip/:id/member/me
export const FloatPlanFormSchema = z.object({
  vesselMake: z.string().max(100).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  vesselModel: z.string().max(100).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  vesselLengthCm: z
    .string()
    .optional()
    .refine((val) => !val || /^\d+$/.test(val), "Must be a positive integer"),
  vesselColorPrimary: z.string().max(50).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  vesselColorSecondary: z.string().max(50).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  emergencyContactName: z.string().max(200).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyContactRelationship: z
    .string()
    .max(100)
    .refine(noHtmlTags.check, noHtmlTags.message)
    .optional(),
})

export type FloatPlanFormValues = z.infer<typeof FloatPlanFormSchema>
