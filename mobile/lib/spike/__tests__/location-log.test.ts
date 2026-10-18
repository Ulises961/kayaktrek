import { parseLog, parseProcessStarts, summarise, type SpikeFix } from "../location-log"

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

describe("parseLog", () => {
  it("skips blank lines and a line cut short by the process dying, and sorts by fix time", () => {
    const text = [
      JSON.stringify(fix(30)),
      "",
      JSON.stringify(fix(0)),
      '{"t": 17000000',
      JSON.stringify({ error: "location unavailable", rx: START }),
    ].join("\n")

    expect(parseLog(text).map((parsed) => parsed.t)).toEqual([fix(0).t, fix(30).t])
  })
})

describe("parseProcessStarts", () => {
  it("lists when the app process started, in order, ignoring fixes, errors and cut-off lines", () => {
    // Each launch of the process writes one of these, so a walk that was killed and restarted
    // by Android shows up as more than one.
    const text = [
      JSON.stringify({ start: START + 5000 }),
      JSON.stringify(fix(1)),
      JSON.stringify({ start: START }),
      JSON.stringify({ error: "location unavailable", rx: START }),
      '{"start": 17000',
    ].join("\n")

    expect(parseProcessStarts(text)).toEqual([START, START + 5000])
  })

  it("returns nothing for an empty log", () => {
    expect(parseProcessStarts("")).toEqual([])
  })
})

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
