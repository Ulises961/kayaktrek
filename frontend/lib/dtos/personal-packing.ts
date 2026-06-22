import { z } from "zod"
import { ItemSchema } from "./item"

// A member's private per-trip packing entry — one of their own gear-closet
// items they are carrying for themselves on this trip. Distinct from a
// requirement contribution: this is personal kit, never lent to the group, and
// visible only to its owner.
export const PersonalPackingItemSchema = z.object({
  id: z.uuidv7().optional(),
  item: ItemSchema.nullish(),
  checked: z.boolean().nullish(),
})

export type PersonalPackingItem = z.infer<typeof PersonalPackingItemSchema>
export const PersonalPackingItemsSchema = z.array(PersonalPackingItemSchema)
