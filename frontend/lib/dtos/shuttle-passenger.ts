import { z } from "zod"

export const ShuttlePassengerSchema = z.object({
  id: z.uuidv7().optional(),
  vehicleId: z.uuidv7().optional(),
  tripMemberId: z.uuidv7(),
})

export type ShuttlePassenger = z.infer<typeof ShuttlePassengerSchema>
