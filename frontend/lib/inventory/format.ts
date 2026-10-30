// Inventory display derivations (M12 §P) — category bucketing shared by the
// requirements checklist (free-text category) and the My-kit list (FK-backed
// Item.category name), plus the private-kit pack progress.

export const UNCATEGORISED_LABEL = "Uncategorised"

export type CategoryBucket<T> = {
  /** Case-folded bucket key ("" for uncategorised). */
  key: string
  /** First-seen casing of the category, or UNCATEGORISED_LABEL. */
  label: string
  entries: T[]
}

// Buckets entries by trimmed + case-folded category so "Safety" and " safety "
// land together (the requirements side is free text — reconciling it to the
// controlled ItemCategory FK is a known rough edge, out of this phase's scope).
// The seeded requirements store a category slug ("first_aid"), so underscores read as
// spaces: it shows as words and lands with "First aid" typed by hand. Display uses the
// first-seen casing; null/blank goes to a trailing Uncategorised bucket, never silently
// dropped.
export function bucketByCategory<T>(
  entries: T[],
  getCategory: (entry: T) => string | null | undefined,
): CategoryBucket<T>[] {
  const buckets = new Map<string, CategoryBucket<T>>()
  const uncategorised: CategoryBucket<T> = { key: "", label: UNCATEGORISED_LABEL, entries: [] }
  for (const entry of entries) {
    const spaced = (getCategory(entry) ?? "").replaceAll("_", " ").trim()
    if (!spaced) {
      uncategorised.entries.push(entry)
      continue
    }
    const key = spaced.toLowerCase()
    const bucket = buckets.get(key) ?? { key, label: spaced, entries: [] }
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
