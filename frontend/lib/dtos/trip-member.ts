import { z } from "zod"
import { TravellerSchema } from "./user"

export const TripMemberSchema = z.object({
  id: z.uuidv7().optional(),
  role: z.enum(["leader", "crew"]),
  user: TravellerSchema,
})

export type TripMember = z.infer<typeof TripMemberSchema>
