import { z } from "zod"

const SnapshotVesselSchema = z.object({
  make: z.string().nullish(),
  model: z.string().nullish(),
  lengthCm: z.number().nullish(),
  colorPrimary: z.string().nullish(),
  colorSecondary: z.string().nullish(),
})

const SnapshotEmergencyContactSchema = z.object({
  name: z.string().nullish(),
  phone: z.string().nullish(),
  relationship: z.string().nullish(),
})

const SnapshotCrewMemberSchema = z.object({
  name: z.string(),
  mail: z.string(),
  role: z.enum(["leader", "crew"]),
  floatPlanConfirmedAt: z.string().nullish(),
  vessel: SnapshotVesselSchema,
  emergencyContact: SnapshotEmergencyContactSchema,
})

export const FloatPlanSnapshotSchema = z.object({
  generatedAt: z.string(),
  trip: z.object({
    destination: z.string().nullish(),
    dateFrom: z.string().nullish(),
    dateTo: z.string().nullish(),
  }),
  shoreContact: z
    .object({
      name: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
      relationship: z.string().nullish(),
    })
    .nullish(),
  crew: z.array(SnapshotCrewMemberSchema),
})

export type FloatPlanSnapshot = z.infer<typeof FloatPlanSnapshotSchema>
export type SnapshotCrewMember = z.infer<typeof SnapshotCrewMemberSchema>
