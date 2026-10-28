import { describe, expect, it } from "vitest"
import {
  PING_MIN_DISPLACEMENT_M,
  PING_THROTTLE_MS,
  shouldSendPing,
  type PingAnchor,
} from "../ping-throttle"

const HERE = { lat: 46.0, lon: 11.0 }
// 0.0001 degrees of latitude is about 11.1 m; 0.00005 is about 5.6 m.
const ELEVEN_METRES_NORTH = { lat: 46.0001, lon: 11.0 }
const SIX_METRES_NORTH = { lat: 46.00005, lon: 11.0 }
const NOW = 1_000_000

function anchor(msAgo: number, at = HERE): PingAnchor {
  return { ...at, at: NOW - msAgo }
}

describe("shouldSendPing", () => {
  it("pins the web constants: one ping per 15 s, and only after 10 m", () => {
    expect(PING_THROTTLE_MS).toBe(15_000)
    expect(PING_MIN_DISPLACEMENT_M).toBe(10)
  })

  it("sends the first fix of a share", () => {
    expect(shouldSendPing(null, HERE, NOW)).toBe(true)
  })

  it("holds back a fix that arrives inside the throttle window, however far it moved", () => {
    expect(shouldSendPing(anchor(PING_THROTTLE_MS - 1), ELEVEN_METRES_NORTH, NOW)).toBe(false)
  })

  it("holds back a fix that has moved less than the displacement, once the window is over", () => {
    expect(shouldSendPing(anchor(PING_THROTTLE_MS), SIX_METRES_NORTH, NOW)).toBe(false)
  })

  it("sends a fix that is both late enough and far enough", () => {
    expect(shouldSendPing(anchor(PING_THROTTLE_MS), ELEVEN_METRES_NORTH, NOW)).toBe(true)
  })

  it("holds back a fix at exactly the same place, however long ago the last ping was", () => {
    expect(shouldSendPing(anchor(60 * 60_000), HERE, NOW)).toBe(false)
  })
})
