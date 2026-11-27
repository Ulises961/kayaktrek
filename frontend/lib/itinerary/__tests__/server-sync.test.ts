import { describe, it, expect } from "vitest"
import { itinerarySignature, routeSignature } from "../server-sync"
import { initialMapState, mapReducer } from "../map-reducer"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { Point } from "@/lib/dtos/point"

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

  it("changes when a point is moved", () => {
    const before = withDays([
      { id: "d1", dayNumber: 1, points: [{ id: "p1", latitude: 39.5, longitude: 2.5 }] },
    ])
    const after = withDays([
      { id: "d1", dayNumber: 1, points: [{ id: "p1", latitude: 39.6, longitude: 2.5 }] },
    ])

    expect(itinerarySignature(before)).not.toBe(itinerarySignature(after))
  })

  it("changes when a day boundary moves", () => {
    const points = [{ id: "p1" }, { id: "p2" }, { id: "p3" }]
    const before = withDays([
      { id: "d1", dayNumber: 1, startPointId: "p1", endPointId: "p2", points },
    ])
    const after = withDays([
      { id: "d1", dayNumber: 1, startPointId: "p1", endPointId: "p3", points },
    ])

    expect(itinerarySignature(before)).not.toBe(itinerarySignature(after))
  })

  it("changes when a photo is added to a point", () => {
    const before = withDays([{ id: "d1", dayNumber: 1, points: [{ id: "p1", images: [] }] }])
    const after = withDays([
      { id: "d1", dayNumber: 1, points: [{ id: "p1", images: [{ id: "img-1" }] }] },
    ])

    expect(itinerarySignature(before)).not.toBe(itinerarySignature(after))
  })

  it("ignores a forecast arriving on a day, which is not a route edit", () => {
    const route = { id: "d1", dayNumber: 1, points: [{ id: "p1" }] }

    expect(itinerarySignature(withDays([route]))).toBe(
      itinerarySignature(withDays([{ ...route, weather: { id: "w1" }, sea: { id: "s1" } }])),
    )
  })

  it("treats an itinerary with no days as an empty one", () => {
    expect(itinerarySignature({ id: "i" } as unknown as Itinerary)).toBe(
      itinerarySignature(withDays([])),
    )
  })
})

describe("routeSignature", () => {
  const dropped = (id: string, latitude: number): Point => ({
    id,
    type: "position",
    latitude,
    longitude: 2.5,
    dayId: "d0",
  })

  it("reads a point the user just saved the same as the server's copy of it", () => {
    // The builder's state holds the create response; a refresh brings the full row.
    // Neither carries the same extra fields, and the user must not be told someone else
    // made the change.
    const seeded = initialMapState([dropped("p1", 39.5)])
    const dropping = mapReducer(seeded, { type: "POINT_ADD", point: dropped("tmp-1", 39.6) })
    const saved = mapReducer(dropping, {
      type: "POINT_CONFIRM",
      tempId: "tmp-1",
      point: dropped("p2", 39.6),
    })

    const refreshed = withDays([
      {
        id: "d0",
        dayNumber: 0,
        points: [
          { ...dropped("p1", 39.5), nextId: "p2", notes: null, images: [] },
          { ...dropped("p2", 39.6), nextId: null, notes: null, images: [] },
        ],
      },
    ])

    expect(routeSignature(saved)).toBe(itinerarySignature(refreshed))
  })

  it("differs from the server's copy while a point is still unsaved", () => {
    const seeded = initialMapState([dropped("p1", 39.5)])
    const dropping = mapReducer(seeded, { type: "POINT_ADD", point: dropped("tmp-1", 39.6) })

    const refreshed = withDays([{ id: "d0", dayNumber: 0, points: [dropped("p1", 39.5)] }])

    expect(routeSignature(dropping)).not.toBe(itinerarySignature(refreshed))
  })
})
