import { describe, it, expect } from "vitest"
import { itinerarySignature } from "../server-sync"
import type { Itinerary } from "@/lib/dtos/itinerary"

const withDays = (days: unknown): Itinerary => ({ id: "itinerary-1", days }) as unknown as Itinerary

describe("itinerarySignature", () => {
  it("is equal for equal content, whatever the object identity", () => {
    const days = [{ id: "d1", dayNumber: 1, points: [{ id: "p1", name: "Cala" }] }]

    expect(itinerarySignature(withDays(days))).toBe(
      itinerarySignature(withDays(JSON.parse(JSON.stringify(days)))),
    )
  })

  it("changes when a point's content changes", () => {
    const before = withDays([{ id: "d1", dayNumber: 1, points: [{ id: "p1", name: "Cala" }] }])
    const after = withDays([{ id: "d1", dayNumber: 1, points: [{ id: "p1", name: "Cala 2" }] }])

    expect(itinerarySignature(before)).not.toBe(itinerarySignature(after))
  })

  it("changes when a point is added to a day", () => {
    const before = withDays([{ id: "d1", dayNumber: 1, points: [{ id: "p1" }] }])
    const after = withDays([{ id: "d1", dayNumber: 1, points: [{ id: "p1" }, { id: "p2" }] }])

    expect(itinerarySignature(before)).not.toBe(itinerarySignature(after))
  })

  it("treats an itinerary with no days as an empty one", () => {
    expect(itinerarySignature({ id: "i" } as unknown as Itinerary)).toBe(
      itinerarySignature(withDays([])),
    )
  })
})
