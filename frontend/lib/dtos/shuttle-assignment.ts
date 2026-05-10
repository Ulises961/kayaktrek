import { z } from "zod"

export const SHUTTLE_ROLES = ["driver", "passenger"] as const
export type ShuttleRole = (typeof SHUTTLE_ROLES)[number]

export const ShuttleAssignmentSchema = z.object({
  id: z.uuidv7().optional(),
  logisticsId: z.uuidv7().optional(),
  tripMemberId: z.uuidv7(),
  role: z.enum(SHUTTLE_ROLES),
  vehicleDescription: z.string().nullish(),
  pickupPoint: z.string().nullish(),
})

export const ShuttleAssignmentFieldsSchema = z.object({
  tripMemberId: z.uuidv7("Select a valid trip member."),
  role: z.enum(SHUTTLE_ROLES, { message: "Role must be driver or passenger." }),
  vehicleDescription: z.string().max(200).optional(),
  pickupPoint: z.string().max(200).optional(),
})

export type ShuttleAssignment = z.infer<typeof ShuttleAssignmentSchema>
export type ShuttleAssignmentFields = z.infer<typeof ShuttleAssignmentFieldsSchema>
