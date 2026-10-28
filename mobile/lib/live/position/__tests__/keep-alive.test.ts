import { KEEP_ALIVE_STALE_MS, KEEP_ALIVE_WAKE_MINUTES, keepAliveDue } from "../keep-alive"

const NOW = 10 * 3_600_000

describe("keepAliveDue", () => {
  it("pins the cadence: wake hourly, treat 30 minutes of silence as stale", () => {
    expect(KEEP_ALIVE_WAKE_MINUTES).toBe(60)
    expect(KEEP_ALIVE_STALE_MS).toBe(30 * 60_000)
  })

  it("is due when nothing has ever been sent", () => {
    expect(keepAliveDue(null, NOW)).toBe(true)
  })

  it("is not due while a ping went out inside the stale window", () => {
    expect(keepAliveDue(NOW - KEEP_ALIVE_STALE_MS + 1, NOW)).toBe(false)
  })

  it("is due once the last ping is as old as the stale window", () => {
    expect(keepAliveDue(NOW - KEEP_ALIVE_STALE_MS, NOW)).toBe(true)
  })
})
