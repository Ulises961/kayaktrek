import { z } from "zod"
import { ItemsSchema } from "./item"

export const InventorySchema = z.object({
  id: z.uuidv7().optional(),
  tripId: z.uuidv7().nullish(),
  userId: z.uuidv7().nullish(),
  items: ItemsSchema.nullish(),
})

export type Inventory = z.infer<typeof InventorySchema>
export const InventoriesSchema = z.array(InventorySchema)
