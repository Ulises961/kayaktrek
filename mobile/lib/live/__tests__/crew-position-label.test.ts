import type { LivePosition } from "@shared/dtos/live-position"

import { formatAge } from "../position/sharing-status"
import { crewMarkerLabel, STALE_AFTER_MS } from "../crew-position-label"

const NOW = Date.parse("2026-11-06T10:30:00Z")

function position(overrides: Partial<LivePosition> = {}): LivePosition {
  return {
    userId: "u1",
    name: "Ada Paddler",
    lat: 43.1,
    lon: 13.2,
    accuracyM: null,
    headingDeg: null,
    speedMs: null,
    recordedAt: new Date(NOW - 2 * 60_000).toISOString(),
    ...overrides,
  }
}

describe("crewMarkerLabel", () => {
  it("names the paddler by first name, with how long ago they were heard from", () => {
    const label = crewMarkerLabel(position(), NOW)

    expect(label.text).toBe(`Ada · ${formatAge(2 * 60_000)}`)
    expect(label.stale).toBe(false)
  })

  it("falls back to a generic name when the paddler has none", () => {
    expect(crewMarkerLabel(position({ name: "  " }), NOW).text).toBe(`Crew · ${formatAge(2 * 60_000)}`)
  })

  it("is not stale up to the threshold, and stale just past it", () => {
    const atThreshold = position({ recordedAt: new Date(NOW - STALE_AFTER_MS).toISOString() })
    const pastThreshold = position({ recordedAt: new Date(NOW - STALE_AFTER_MS - 1).toISOString() })

    expect(crewMarkerLabel(atThreshold, NOW).stale).toBe(false)
    expect(crewMarkerLabel(pastThreshold, NOW).stale).toBe(true)
  })

  it("matches web's ten minutes, so the same paddler goes quiet on both screens at once", () => {
    expect(STALE_AFTER_MS).toBe(10 * 60_000)
  })

  it("reads a ping from the future (a phone clock running ahead) as just now, never as a negative age", () => {
    const label = crewMarkerLabel(position({ recordedAt: new Date(NOW + 5 * 60_000).toISOString() }), NOW)

    expect(label.text).toBe(`Ada · ${formatAge(0)}`)
    expect(label.stale).toBe(false)
  })

  it("treats a time it cannot read as stale rather than showing a broken age", () => {
    const label = crewMarkerLabel(position({ recordedAt: "not a time" }), NOW)

    expect(label.stale).toBe(true)
    expect(label.text).toBe("Ada")
  })
})
