import { z } from "zod"
import { ItemCategorySchema } from "./item-category"

// CatalogItem = a curator's personal template for a trip's shared requirement
// list — not trip-scoped, reused across every trip the owner creates. On load
// the client sends `categoryId` instead of the nested `category` — mirrors
// the Item write/read split (see lib/inventory/actions.ts).
export const CatalogItemSchema = z.object({
  id: z.uuidv7().optional(),
  ownerId: z.uuidv7().nullish(),
  name: z.string(),
  category: ItemCategorySchema.nullish(),
})

export type CatalogItem = z.infer<typeof CatalogItemSchema>
export const CatalogItemsSchema = z.array(CatalogItemSchema)
