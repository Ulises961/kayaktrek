import { summarise, type SpikeFix } from "../location-log"

const START = 1_700_000_000_000

function fix(secondsIn: number, deliveredAfterMs = 0): SpikeFix {
  return {
    t: START + secondsIn * 1000,
    rx: START + secondsIn * 1000 + deliveredAfterMs,
    lat: 41.9,
    lon: 8.7,
    accuracyM: 12,
  }
}

describe("summarise", () => {
  it("reports an empty log as zeros, not NaN", () => {
    expect(summarise([], 45_000)).toEqual({
      count: 0,
      firstAt: null,
      lastAt: null,
      spanMs: 0,
      longestGapMs: 0,
      longestGapEndedAt: null,
      medianGapMs: 0,
      gapsOverThreshold: 0,
      maxDeliveryDelayMs: 0,
    })
  })

  it("finds the longest gap, when it ended, and how many gaps passed the threshold", () => {
    // Beats every 15 s, then a 10-minute hole (the service was killed), then beats again.
    const fixes = [fix(0), fix(15), fix(30), fix(630), fix(645)]

    const summary = summarise(fixes, 45_000)

    expect(summary.count).toBe(5)
    expect(summary.spanMs).toBe(645_000)
    expect(summary.longestGapMs).toBe(600_000)
    expect(summary.longestGapEndedAt).toBe(fix(630).t)
    expect(summary.medianGapMs).toBe(15_000)
    expect(summary.gapsOverThreshold).toBe(1)
  })

  it("reports the worst delay between a fix being taken and the task receiving it", () => {
    // Android may hold fixes back and hand them over in a batch; that is a finding too.
    const fixes = [fix(0, 200), fix(15, 90_000), fix(30, 1_000)]

    expect(summarise(fixes, 45_000).maxDeliveryDelayMs).toBe(90_000)
  })
})
