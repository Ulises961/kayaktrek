import { describe, it, expect } from "vitest"
import { bucketByCategory, packProgress, UNCATEGORISED_LABEL } from "../format"

describe("bucketByCategory", () => {
  it("buckets entries by trimmed, case-folded category, displaying first-seen casing", () => {
    const entries = [
      { name: "Flares", category: "Safety" },
      { name: "VHF", category: " safety " },
      { name: "Stove", category: "Cooking" },
    ]
    const buckets = bucketByCategory(entries, (e) => e.category)
    expect(buckets.map((b) => b.label)).toEqual(["Safety", "Cooking"])
    expect(buckets[0].entries.map((e) => e.name)).toEqual(["Flares", "VHF"])
  })

  it("shows a stored category slug as words and merges it with the same category typed by hand", () => {
    const entries = [
      { name: "Group first aid kit", category: "first_aid" },
      { name: "Burn gel", category: "First aid" },
    ]
    const buckets = bucketByCategory(entries, (e) => e.category)
    expect(buckets.map((b) => b.label)).toEqual(["first aid"])
    expect(buckets[0].entries.map((e) => e.name)).toEqual(["Group first aid kit", "Burn gel"])
  })

  it("sends null, undefined and blank categories to a trailing Uncategorised bucket", () => {
    const entries = [
      { name: "Rope", category: null },
      { name: "Flares", category: "Safety" },
      { name: "Tape", category: "   " },
      { name: "Mystery", category: undefined },
    ]
    const buckets = bucketByCategory(entries, (e) => e.category)
    expect(buckets.map((b) => b.label)).toEqual(["Safety", UNCATEGORISED_LABEL])
    expect(buckets[1].entries.map((e) => e.name)).toEqual(["Rope", "Tape", "Mystery"])
  })

  it("returns no buckets for an empty list", () => {
    expect(bucketByCategory([], () => null)).toEqual([])
  })
})

describe("packProgress", () => {
  it("counts checked entries against the total", () => {
    expect(
      packProgress([{ checked: true }, { checked: false }, { checked: null }, { checked: true }]),
    ).toEqual({ packed: 2, total: 4 })
  })

  it("handles an empty kit", () => {
    expect(packProgress([])).toEqual({ packed: 0, total: 0 })
  })
})
