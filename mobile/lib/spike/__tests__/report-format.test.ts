import { formatEvent, formatReport, duration } from "../report-format"
import { reportRuns, type SpikeEvent } from "../run-report"

const START = 1_700_000_000_000
const at = (seconds: number): number => START + seconds * 1000

const fix = (seconds: number, speedMs: number | null = 1.4): SpikeEvent => ({
  ev: "fix",
  t: at(seconds),
  rx: at(seconds),
  lat: 41.9,
  lon: 8.7,
  accuracyM: 10,
  speedMs,
})

describe("duration", () => {
  it("reads in seconds up to two minutes, then minutes and seconds, then hours and minutes", () => {
    expect(duration(45_000)).toBe("45 s")
    expect(duration(66_000)).toBe("66 s")
    expect(duration(5 * 60_000 + 31_000)).toBe("5 min 31 s")
    expect(duration(2 * 3_600_000 + 5 * 60_000)).toBe("2 h 5 min")
  })
})

describe("formatReport", () => {
  const events: SpikeEvent[] = [
    { ev: "run-start", t: at(0), label: "Balanced, 15 s, 10 m", killOnDestroy: false },
    fix(10),
    fix(25),
    { ev: "screen", t: at(30), on: false },
    fix(40),
    fix(55),
    { ev: "screen", t: at(90), on: true },
    fix(100),
  ]

  it("puts the screen-off share of the fixes on one line, which is the question the walk exists to answer", () => {
    const text = formatReport(reportRuns(events)[0])

    expect(text).toContain("Fixes with the screen off: 2 of 5")
    expect(text).toContain("Screen off: 60 s in 1 period(s)")
  })

  it("names the label and says whether the run is still going", () => {
    const text = formatReport(reportRuns(events)[0])

    expect(text).toContain("Balanced, 15 s, 10 m")
    expect(text).toContain("still running")
  })

  it("says when a long gap was not wholly under a locked screen, with the speed either side", () => {
    const walk: SpikeEvent[] = [
      { ev: "run-start", t: at(0), label: "x", killOnDestroy: false },
      { ev: "screen", t: at(10), on: false },
      fix(20, 1.2),
      fix(35, 1.3),
      { ev: "screen", t: at(98), on: true },
      fix(101, 0.1),
    ]

    const text = formatReport(reportRuns(walk)[0])

    expect(text).toContain("66 s")
    expect(text).toContain("screen on during it")
    expect(text).toContain("1.3 to 0.1 m/s")
  })

  it("says plainly when there are too few battery readings for a figure, instead of printing nothing", () => {
    expect(formatReport(reportRuns(events)[0])).toContain("Battery: no readings")
  })

  it("lists errors, or says there were none", () => {
    const withError: SpikeEvent[] = [
      { ev: "run-start", t: at(0), label: "x", killOnDestroy: false },
      { ev: "error", t: at(5), message: "location unavailable" },
    ]

    expect(formatReport(reportRuns(withError)[0])).toContain("location unavailable")
    expect(formatReport(reportRuns(events)[0])).toContain("Errors: none")
  })
})

describe("formatEvent", () => {
  it("shows the screen, deep-sleep and app-state changes in words", () => {
    expect(formatEvent({ ev: "screen", t: at(0), on: false })).toContain("screen OFF")
    expect(formatEvent({ ev: "doze", t: at(0), idle: true })).toContain("deep sleep ON")
    expect(formatEvent({ ev: "app", t: at(0), state: "background" })).toContain("app background")
  })

  it("tells a stop the paddler pressed from one the share ended by itself", () => {
    expect(formatEvent({ ev: "run-stop", t: at(0), reason: "user" })).toContain("STOP pressed")
    expect(formatEvent({ ev: "run-stop", t: at(0), reason: "trip-not-live" })).toContain("STOP (trip-not-live)")
  })

  it("shows each ping's outcome, each keep-alive wake and each change of the location switch", () => {
    expect(formatEvent({ ev: "ping", t: at(0), source: "keep-alive", outcome: "retry", detail: "offline" })).toContain(
      "ping keep-alive: retry (offline)",
    )
    expect(formatEvent({ ev: "watchdog", t: at(0), outcome: "sent", sinceLastWakeMs: 3_600_000 })).toContain(
      "keep-alive wake: sent",
    )
    expect(formatEvent({ ev: "locsw", t: at(0), on: false, source: "native" })).toContain("location switch OFF (native)")
    expect(formatEvent({ ev: "reregister", t: at(0), reason: "task-missing" })).toContain("re-registered: task-missing")
  })

  it("shows where a fix was and how fast the phone was moving", () => {
    const text = formatEvent(fix(0, 1.4))

    expect(text).toContain("41.90000")
    expect(text).toContain("1.4 m/s")
  })
})
