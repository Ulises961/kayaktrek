import { describe, expect, it } from "vitest"

import { LivePositionsPageSchema } from "../live-position"

const entry = {
  userId: "01952f1a-0000-7000-8000-000000000001",
  name: "Ada Paddler",
  lat: 43.1,
  lon: 13.2,
  accuracyM: 8,
  headingDeg: null,
  speedMs: 1.2,
  recordedAt: "2026-11-06T10:00:00+00:00",
}

describe("LivePositionsPageSchema", () => {
  it("accepts the positions poll's answer, each entry in the stream snapshot's shape", () => {
    expect(LivePositionsPageSchema.parse({ positions: [entry] }).positions).toEqual([entry])
  })

  it("accepts a trip nobody has shared a position on yet", () => {
    expect(LivePositionsPageSchema.parse({ positions: [] }).positions).toEqual([])
  })

  it.each([
    ["a bare array, which is what the stream's snapshot is", [entry]],
    ["an answer with no positions field", {}],
    ["an entry without coordinates", { positions: [{ ...entry, lat: undefined }] }],
  ])("rejects %s", (_label, body) => {
    expect(LivePositionsPageSchema.safeParse(body).success).toBe(false)
  })
})
