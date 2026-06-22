import { z } from "zod"
import { ItemStatusSchema } from "./item"

// Shallow user embedded on a member. Defined locally rather than importing
// UserSchema to avoid the inventory → user → inventory circular schema dependency.
export const RequirementUserSchema = z.object({
  id: z.uuidv7().optional(),
  username: z.string(),
  name: z.string(),
})

// A trip member reduced to identity + user — deliberately excludes the vessel,
// emergency and encrypted-medical fields (mirrors the backend shallow dump).
export const RequirementMemberSchema = z.object({
  id: z.uuidv7().optional(),
  user: RequirementUserSchema.nullish(),
})
export type RequirementMember = z.infer<typeof RequirementMemberSchema>

// The shallow item embedded on a contribution (backend dumps id, name, status).
export const ContributionItemSchema = z.object({
  id: z.uuidv7().optional(),
  name: z.string().nullish(),
  status: ItemStatusSchema.nullish(),
})

// One member bringing one of their owned items to cover a requirement slot.
// Several members may each cover the same requirement; each contributes at most
// once. Packing confirmation (`checked`) lives here, per contributor.
export const RequirementContributionSchema = z.object({
  id: z.uuidv7().optional(),
  member: RequirementMemberSchema.nullish(),
  item: ContributionItemSchema.nullish(),
  checked: z.boolean().nullish(),
})
export type RequirementContribution = z.infer<typeof RequirementContributionSchema>

export const RequirementStatusSchema = z.enum(["needed", "covered"])
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>

// A TripRequirement is a slot on an inventory — a piece of gear the trip needs.
// `proposedBy` records who added it (you may remove only what you proposed).
// `status` is derived server-side: "covered" once it has ≥1 contribution.
export const TripRequirementSchema = z.object({
  id: z.uuidv7().optional(),
  name: z.string(),
  category: z.string().nullish(),
  catalogItemId: z.uuidv7().nullish(),
  proposedBy: RequirementMemberSchema.nullish(),
  contributions: z.array(RequirementContributionSchema).nullish(),
  status: RequirementStatusSchema.nullish(),
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
