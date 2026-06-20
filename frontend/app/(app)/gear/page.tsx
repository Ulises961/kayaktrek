import { apiGet } from "@/lib/api/client"
import { ItemsSchema } from "@/lib/dtos/item"
import { ItemCategoriesSchema } from "@/lib/dtos/item-category"
import { GearCloset } from "@/components/inventory/gear-closet"

export default async function GearPage() {
  const [items, categories] = await Promise.all([
    apiGet("/api/item/all")
      .then((r) => ItemsSchema.parse(r))
      .catch(() => []),
    apiGet("/api/item-categories")
      .then((r) => ItemCategoriesSchema.parse(r))
      .catch(() => []),
  ])

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Gear closet</h1>
        <p className="text-muted-foreground text-sm">
          Your personal kit. Confirm what you own, then contribute it to a trip&rsquo;s
          requirements.
        </p>
      </div>

      <GearCloset items={items} categories={categories} />
    </div>
  )
}
