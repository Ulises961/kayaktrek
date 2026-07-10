import { apiGet } from "@/lib/api/client"
import { ItemsSchema } from "@/lib/dtos/item"
import { ItemCategoriesSchema } from "@/lib/dtos/item-category"
import { CatalogItemsSchema } from "@/lib/dtos/catalog-item"
import { GearCloset } from "@/components/inventory/gear-closet"
import { CatalogKitSection } from "@/components/inventory/catalog-kit-section"

export default async function GearPage() {
  const [items, categories, catalogItems] = await Promise.all([
    apiGet("/api/item/all")
      .then((r) => ItemsSchema.parse(r))
      .catch(() => []),
    apiGet("/api/item-categories")
      .then((r) => ItemCategoriesSchema.parse(r))
      .catch(() => []),
    apiGet("/api/catalog-item/all")
      .then((r) => CatalogItemsSchema.parse(r))
      .catch(() => []),
  ])

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Gear closet</h1>
          <p className="text-muted-foreground text-sm">
            Your personal kit. Confirm what you own, then contribute it to a trip&rsquo;s
            requirements.
          </p>
        </div>

        <GearCloset items={items} categories={categories} />
      </div>

      <CatalogKitSection items={catalogItems} categories={categories} />
    </div>
  )
}
