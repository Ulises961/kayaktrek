import { z } from "zod"
import { TravellerSchema } from "./user"

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
  medicalNotes: z.string().nullish(),
  medicalNotesConsentAt: z.string().nullish(),
  floatPlanConfirmedAt: z.string().nullish(),
})

export type TripMember = z.infer<typeof TripMemberSchema>

// Form validation for PATCH /api/trip/:id/member/me
export const FloatPlanFormSchema = z.object({
  vesselMake: z.string().max(100).optional(),
  vesselModel: z.string().max(100).optional(),
  vesselLengthCm: z.string().optional().refine(
    (val) => !val || /^\d+$/.test(val),
    "Must be a positive integer"
  ),
  vesselColorPrimary: z.string().max(50).optional(),
  vesselColorSecondary: z.string().max(50).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyContactRelationship: z.string().max(100).optional(),
})

export type FloatPlanFormValues = z.infer<typeof FloatPlanFormSchema>
