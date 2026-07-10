import { z } from "zod"
import { ItemCategorySchema } from "./item-category"

// Item = personal gear, owned by a user (no inventory_id). A user's gear
// closet is all their items. Each item carries its category inline as the
// nested ItemCategory entity (dump shape). On load the client sends
// `categoryId` instead — see lib/inventory/actions.ts.
export const ItemStatusSchema = z.enum(["suggested", "owned"])
export type ItemStatus = z.infer<typeof ItemStatusSchema>

export const ItemSchema = z.object({
  id: z.uuidv7().optional(),
  userId: z.uuidv7().nullish(),
  name: z.string(),
  checked: z.boolean().nullish(),
  status: ItemStatusSchema.nullish(),
  category: ItemCategorySchema.nullish(),
  // Trip-packing intent: auto-suggest this item onto future trips' private
  // packing lists. Null/false on custom items until the user opts in.
  defaultPack: z.boolean().nullish(),
})

export type Item = z.infer<typeof ItemSchema>
export const ItemsSchema = z.array(ItemSchema)
