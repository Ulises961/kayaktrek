import { apiGet } from "@/lib/api/client"
import { ItemCategoriesSchema } from "@/lib/dtos/item-category"
import { CatalogItemsSchema } from "@/lib/dtos/catalog-item"
import { CatalogKitSection } from "@/components/inventory/catalog-kit-section"

// "Default template" segment — the M10 curated CatalogItem editor that seeds
// every new trip's shared requirements. Given its own route segment in M12 §F
// instead of stacking beneath the personal closet.
export default async function GearTemplatesPage() {
  const [catalogItems, categories] = await Promise.all([
    apiGet("/api/catalog-item/all")
      .then((r) => CatalogItemsSchema.parse(r))
      .catch(() => []),
    apiGet("/api/item-categories")
      .then((r) => ItemCategoriesSchema.parse(r))
      .catch(() => []),
  ])

  return <CatalogKitSection items={catalogItems} categories={categories} />
}
