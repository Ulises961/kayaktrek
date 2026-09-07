import { describe, it, expect } from "vitest"
import { metadata } from "../page"

describe("PublicFloatPlanPage metadata", () => {
  it("is not indexed — unlisted-by-design, not unlisted-by-hope", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
