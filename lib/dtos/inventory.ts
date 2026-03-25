import { z } from "zod";
import { ItemsSchema } from "./item";

export const InventorySchema = z.object({
  id: z.uuidv7().optional(),
  tripId: z.uuidv7().optional(),
  userId: z.uuidv7(),
  items: ItemsSchema.optional(),
});

export type Inventory = z.infer<typeof InventorySchema>;
export const InventoriesSchema = z.array(InventorySchema);
