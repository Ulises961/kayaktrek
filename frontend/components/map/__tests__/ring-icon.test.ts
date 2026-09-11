import { describe, it, expect, vi } from "vitest"

vi.mock("leaflet", () => ({
  default: { divIcon: (opts: { html: string }) => opts },
}))

import { ringIcon } from "../ring-icon"

describe("ringIcon — route start/finish badge", () => {
  it("renders no flag badge when routeMarker is not given", () => {
    const icon = ringIcon("#4a90d9", "position", 1) as unknown as { html: string }
    expect(icon.html).not.toContain("<svg")
  })

  it("renders a green flag badge for the route start", () => {
    const icon = ringIcon("#4a90d9", "position", 1, "start") as unknown as { html: string }
    expect(icon.html).toContain("#16a34a")
    expect(icon.html).toContain("<svg")
  })

  it("renders a dark flag badge for the route finish, distinct from start", () => {
    const icon = ringIcon("#4a90d9", "position", 1, "finish") as unknown as { html: string }
    expect(icon.html).toContain("#1e293b")
    expect(icon.html).not.toContain("#16a34a")
  })

  it("still renders the point number alongside the badge", () => {
    const icon = ringIcon("#4a90d9", "position", 3, "start") as unknown as { html: string }
    expect(icon.html).toContain(">3<")
  })
})
