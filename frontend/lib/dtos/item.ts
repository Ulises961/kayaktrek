import { z } from "zod";

export const ItemCategorySchema = z.enum([
  "firstAid",
  "camping",
  "repair",
  "travel",
  "generic",
  "food",
]);

export type ItemCategory = z.infer<typeof ItemCategorySchema>;

export const ItemSchema = z.object({
  id: z.uuidv7().optional(),
  category: ItemCategorySchema,
  checked: z.boolean().nullish(),
  name: z.string(),
  userId: z.uuidv7().nullish(),
});

export type Item = z.infer<typeof ItemSchema>;
export const ItemsSchema = z.array(ItemSchema);
