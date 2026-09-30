import type { Day } from "@shared/dtos/day"
import type { Image } from "@shared/dtos/image"

import { withLiveImages } from "../live-images"

function image(id: string): Image {
  return { id, size: 10, name: `${id}.jpg`, location: `https://example.com/${id}.jpg`, isPublic: false }
}

function day(id: string, points: Day["points"]): Day {
  return { id, dayNumber: 1, points }
}

describe("withLiveImages", () => {
  it("grafts a live point's images onto the matching point in days", () => {
    const days = [day("d1", [{ id: "a", type: "stop" }])]
    const liveDays = [day("d1", [{ id: "a", type: "stop", images: [image("img-1")] }])]

    const result = withLiveImages(days, liveDays)

    expect(result[0].points?.[0].images).toEqual([image("img-1")])
  })

  it("leaves a point with no live images untouched", () => {
    const days = [day("d1", [{ id: "a", type: "stop" }])]
    const liveDays = [day("d1", [{ id: "a", type: "stop" }])]

    const result = withLiveImages(days, liveDays)

    expect(result[0].points?.[0].images).toBeUndefined()
  })

  it("matches by point id, not array position", () => {
    // The offline-reconstructed days and the live days aren't guaranteed to
    // list points in the same order.
    const days = [day("d1", [{ id: "b", type: "stop" }, { id: "a", type: "stop" }])]
    const liveDays = [day("d1", [{ id: "a", type: "stop", images: [image("img-1")] }])]

    const result = withLiveImages(days, liveDays)

    expect(result[0].points?.find((p) => p.id === "a")?.images).toEqual([image("img-1")])
    expect(result[0].points?.find((p) => p.id === "b")?.images).toBeUndefined()
  })

  it("returns the same days reference when the live trip has no images at all", () => {
    const days = [day("d1", [{ id: "a", type: "stop" }])]
    const liveDays = [day("d1", [{ id: "a", type: "stop" }])]

    expect(withLiveImages(days, liveDays)).toBe(days)
  })
})
