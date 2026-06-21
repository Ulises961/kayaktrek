import { z } from "zod"
import { ItemSchema } from "./item"

// Shallow contributor (a trip member's user) embedded on a requirement.
// Defined locally rather than importing UserSchema to avoid the
// inventory → user → inventory circular schema dependency.
export const RequirementContributorSchema = z.object({
  id: z.uuidv7().optional(),
  username: z.string(),
  name: z.string(),
  surname: z.string().nullish(),
  avatarUrl: z.string().url().nullish(),
})

export const RequirementStatusSchema = z.enum(["needed", "covered"])
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>

// A TripRequirement is a slot on an inventory — a piece of gear the trip
// needs. It is "covered" once an owned personal item is contributed to it.
export const TripRequirementSchema = z.object({
  id: z.uuidv7().optional(),
  name: z.string(),
  category: z.string().nullish(),
  catalogItemId: z.uuidv7().nullish(),
  coveringItemId: z.uuidv7().nullish(),
  coveringItem: ItemSchema.nullish(),
  checked: z.boolean().nullish(),
  status: RequirementStatusSchema.nullish(),
  contributors: z.array(RequirementContributorSchema).nullish(),
})

export type TripRequirement = z.infer<typeof TripRequirementSchema>

// Inventories hold requirement slots, never items (items are personal gear).
export const InventorySchema = z.object({
  id: z.uuidv7().optional(),
  tripId: z.uuidv7().nullish(),
  userId: z.uuidv7().nullish(),
  requirements: z.array(TripRequirementSchema).nullish(),
})

export type Inventory = z.infer<typeof InventorySchema>
export const InventoriesSchema = z.array(InventorySchema)
