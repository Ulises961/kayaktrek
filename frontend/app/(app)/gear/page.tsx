import { apiGet } from "@/lib/api/client"
import { ItemsSchema } from "@/lib/dtos/item"
import { ItemCategoriesSchema } from "@/lib/dtos/item-category"
import { GearCloset } from "@/components/inventory/gear-closet"

// "My kit" segment — the personal gear closet. The default-template editor
// lives at /gear/templates (M12 §F route-segment split); the shared heading
// and nav are owned by the layout.
export default async function GearPage() {
  const [items, categories] = await Promise.all([
    apiGet("/api/item/all")
      .then((r) => ItemsSchema.parse(r))
      .catch(() => []),
    apiGet("/api/item-categories")
      .then((r) => ItemCategoriesSchema.parse(r))
      .catch(() => []),
  ])

  return <GearCloset items={items} categories={categories} />
}
