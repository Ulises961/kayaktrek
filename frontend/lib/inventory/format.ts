// Inventory display derivations (M12 §P) — category bucketing shared by the
// requirements checklist (free-text category) and the My-kit list (FK-backed
// Item.category name), plus the private-kit pack progress.

import type { ItemCategory } from "@/lib/dtos/item-category"

export const UNCATEGORISED_LABEL = "Uncategorised"

export type CategoryBucket<T> = {
  /** The category's slug, else the case-folded free text ("" for uncategorised). */
  key: string
  /** The category's name, else the free text as first typed, or UNCATEGORISED_LABEL. */
  label: string
  entries: T[]
}

// Buckets entries by trimmed + case-folded category so "Safety" and " safety "
// land together (the requirements side is free text — reconciling it to the
// controlled ItemCategory FK is a known rough edge, out of this phase's scope).
// The seeded requirements store an ItemCategory slug ("first_aid"): given the categories,
// a value matching a slug or a name resolves to that category, keyed by its slug and shown
// by its name, so the slug and the name typed by hand share one group. Anything else is
// free text, shown first-seen as typed. null/blank goes to a trailing Uncategorised bucket,
// never silently dropped.
export function bucketByCategory<T>(
  entries: T[],
  getCategory: (entry: T) => string | null | undefined,
  categories: ItemCategory[] = [],
): CategoryBucket<T>[] {
  const bySlugOrName = new Map<string, ItemCategory>()
  for (const category of categories) {
    bySlugOrName.set(category.slug.toLowerCase(), category)
    bySlugOrName.set(category.name.toLowerCase(), category)
  }
  const buckets = new Map<string, CategoryBucket<T>>()
  const uncategorised: CategoryBucket<T> = { key: "", label: UNCATEGORISED_LABEL, entries: [] }
  for (const entry of entries) {
    const raw = (getCategory(entry) ?? "").trim()
    if (!raw) {
      uncategorised.entries.push(entry)
      continue
    }
    const known = bySlugOrName.get(raw.toLowerCase())
    const key = known ? known.slug : raw.toLowerCase()
    const bucket = buckets.get(key) ?? { key, label: known ? known.name : raw, entries: [] }
    bucket.entries.push(entry)
    buckets.set(key, bucket)
  }
  const result = [...buckets.values()]
  if (uncategorised.entries.length > 0) result.push(uncategorised)
  return result
}

// "N of M packed" for the private kit — a pure derivation from data the items
// page already fetched (no backend endpoint involved).
export function packProgress(entries: { checked?: boolean | null }[]): {
  packed: number
  total: number
} {
  return {
    packed: entries.filter((e) => e.checked === true).length,
    total: entries.length,
  }
}
