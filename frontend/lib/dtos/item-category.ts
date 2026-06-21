import { z } from "zod"

// Mirrors the backend `ItemCategory` entity (a real table, not an enum).
// Seeded slugs: first_aid, camping, repair, travel, generic, food.
// Public list available at GET /api/item-categories.
// Filter/group by `slug`; display `name`.
export const ItemCategorySchema = z.object({
  id: z.uuidv7().optional(),
  slug: z.string(),
  name: z.string(),
})

export type ItemCategory = z.infer<typeof ItemCategorySchema>
export const ItemCategoriesSchema = z.array(ItemCategorySchema)
