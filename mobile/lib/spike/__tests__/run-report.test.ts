import { parseEvents, reportRuns, splitRuns, type SpikeEvent } from "../run-report"

const START = 1_700_000_000_000

function at(seconds: number): number {
  return START + seconds * 1000
}

function fix(seconds: number, speedMs: number | null = 1.4): SpikeEvent {
  return { ev: "fix", t: at(seconds), rx: at(seconds), lat: 41.9, lon: 8.7, accuracyM: 10, speedMs }
}

const runStart = (seconds: number, label = "Balanced, 15 s, 10 m"): SpikeEvent => ({
  ev: "run-start",
  t: at(seconds),
  label,
  killOnDestroy: false,
})

const screen = (seconds: number, on: boolean): SpikeEvent => ({ ev: "screen", t: at(seconds), on })

describe("parseEvents", () => {
  it("reads the old fix and process-start lines too, skips junk and cut-off lines, and sorts by time", () => {
    const text = [
      JSON.stringify({ ev: "screen", t: at(60), on: false }),
      JSON.stringify({ t: at(10), rx: at(10), lat: 41.9, lon: 8.7, accuracyM: 12 }),
      "",
      JSON.stringify({ start: at(0) }),
      '{"ev": "doze", "t": 17000',
      JSON.stringify({ ev: "unheard-of", t: at(5) }),
      JSON.stringify({ error: "location unavailable", rx: at(20) }),
    ].join("\n")

    const events = parseEvents(text)

    expect(events.map((event) => event.ev)).toEqual(["launch", "fix", "error", "screen"])
    expect(events[1]).toMatchObject({ ev: "fix", t: at(10), speedMs: null })
  })

  it("reads the sender's events, keeping a stop's reason and dropping a ping or wake it cannot make sense of", () => {
    const text = [
      JSON.stringify({ ev: "run-stop", t: at(1), reason: "trip-not-live" }),
      JSON.stringify({ ev: "run-stop", t: at(2) }),
      JSON.stringify({ ev: "ping", t: at(3), source: "keep-alive", outcome: "retry", detail: "offline" }),
      JSON.stringify({ ev: "ping", t: at(4), source: "carrier-pigeon", outcome: "sent" }),
      JSON.stringify({ ev: "watchdog", t: at(5), outcome: "recent", sinceLastWakeMs: 3_600_000 }),
      JSON.stringify({ ev: "watchdog", t: at(6), outcome: "exploded" }),
      JSON.stringify({ ev: "locsw", t: at(7), on: false, source: "native" }),
      JSON.stringify({ ev: "locsw", t: at(8), on: true }),
      JSON.stringify({ ev: "reregister", t: at(9), reason: "switch-back-on" }),
    ].join("\n")

    expect(parseEvents(text)).toEqual([
      { ev: "run-stop", t: at(1), reason: "trip-not-live" },
      { ev: "run-stop", t: at(2), reason: null },
      { ev: "ping", t: at(3), source: "keep-alive", outcome: "retry", detail: "offline" },
      { ev: "watchdog", t: at(5), outcome: "recent", sinceLastWakeMs: 3_600_000 },
      { ev: "locsw", t: at(7), on: false, source: "native" },
      { ev: "locsw", t: at(8), on: true, source: "js" },
      { ev: "reregister", t: at(9), reason: "switch-back-on" },
    ])
  })
})

describe("splitRuns", () => {
  it("starts a run at each run marker and files fixes with no marker under an earlier-log run", () => {
    const events = [fix(0), fix(15), runStart(100, "High, 15 s, 10 m"), fix(110), runStart(300), fix(310)]

    const runs = splitRuns(events)

    expect(runs.map((run) => run.label)).toEqual(["Earlier log (no run marker)", "High, 15 s, 10 m", "Balanced, 15 s, 10 m"])
    expect(runs.map((run) => run.events.filter((event) => event.ev === "fix").length)).toEqual([2, 1, 1])
  })

  it("ends the earlier-log run at its last fix, not at whatever the phone logged after it", () => {
    // The first walk predates run markers; everything logged since (app state, heartbeats, the screen)
    // belongs to no run, and must not stretch that walk to the present.
    const events: SpikeEvent[] = [fix(0), fix(15), { ev: "app", t: at(5000), state: "active" }, screen(6000, false)]

    const [earlier] = reportRuns(events)

    expect(earlier.label).toBe("Earlier log (no run marker)")
    expect(earlier.endedAt).toBe(at(15))
  })

  it("has no runs when the log holds only phone events", () => {
    expect(splitRuns([screen(0, true)])).toEqual([])
  })
})

describe("reportRuns: screen state against fixes", () => {
  // Screen on until 60 s, off from 60 s to 130 s, on again after.
  const events = [
    runStart(0),
    fix(10),
    fix(25),
    fix(40),
    screen(60, false),
    fix(70),
    fix(85),
    fix(100),
    screen(130, true),
    fix(140),
  ]

  it("counts how many fixes arrived with the screen off and how long it was off", () => {
    const [report] = reportRuns(events)

    expect(report.fixes.count).toBe(7)
    expect(report.screen.offMs).toBe(70_000)
    expect(report.screen.offPeriods).toBe(1)
    expect(report.screen.fixesWhileOff).toBe(3)
    expect(report.screen.fixesWhileOn).toBe(4)
  })

  it("finds the longest silence that lay wholly inside a locked period", () => {
    const [report] = reportRuns(events)

    expect(report.screen.longestFixGapWhileOffMs).toBe(15_000)
  })

  it("says whether each long gap was entirely under a locked screen, with the speed on either side", () => {
    // A 66 s hole that ends just after the screen turns on, like the first walk's.
    const walk = [runStart(0), screen(10, false), fix(20, 1.2), fix(35, 1.3), fix(101, 0.1), screen(98, true)]

    const [report] = reportRuns(walk)

    expect(report.longestGaps[0]).toMatchObject({ ms: 66_000, screenOffThroughout: false, speedBefore: 1.3, speedAfter: 0.1 })
  })

  it("takes the screen state from before the run began, when the run began with the screen already off", () => {
    const report = reportRuns([screen(-30, false), runStart(0), fix(10), fix(25), screen(40, true)])[0]

    expect(report.screen.offMs).toBe(40_000)
    expect(report.screen.fixesWhileOff).toBe(2)
  })
})

describe("reportRuns: the rest of the evidence", () => {
  it("works out battery drop per hour from the first and last level in the run", () => {
    const events: SpikeEvent[] = [
      runStart(0),
      { ev: "battery", t: at(0), level: 80, charging: false },
      fix(60),
      { ev: "battery", t: at(1800), level: 78, charging: false },
      fix(1800),
    ]

    const [report] = reportRuns(events)

    expect(report.battery).toEqual({ first: 80, last: 78, dropPerHour: 4, charging: false })
  })

  it("gives no hourly figure for a run too short to mean anything", () => {
    const events: SpikeEvent[] = [
      runStart(0),
      { ev: "battery", t: at(0), level: 80, charging: false },
      { ev: "battery", t: at(120), level: 79, charging: false },
    ]

    expect(reportRuns(events)[0].battery.dropPerHour).toBeNull()
  })

  it("counts deep-sleep entries and the time spent in them", () => {
    const events: SpikeEvent[] = [
      runStart(0),
      { ev: "doze", t: at(100), idle: true },
      { ev: "doze", t: at(400), idle: false },
      { ev: "doze", t: at(500), idle: true },
      fix(600),
    ]

    const [report] = reportRuns(events)

    expect(report.doze).toEqual({ entries: 2, idleMs: 400_000 })
  })

  it("shows the longest silence between heartbeats, which is how a frozen JS runtime looks", () => {
    const beat = (seconds: number, taskRunning: boolean): SpikeEvent => ({
      ev: "beat",
      t: at(seconds),
      taskRunning,
      app: "background",
      interactive: false,
      idle: false,
      powerSave: false,
      battery: 70,
      standbyBucket: 10,
    })
    const events = [runStart(0), beat(60, true), beat(120, true), beat(420, false), beat(480, true)]

    const [report] = reportRuns(events)

    expect(report.liveness).toEqual({ beats: 4, longestBeatGapMs: 300_000, beatsTaskStopped: 1 })
  })

  it("counts process launches and time spent with the app out of the foreground", () => {
    const events: SpikeEvent[] = [
      runStart(0),
      { ev: "app", t: at(0), state: "active" },
      { ev: "app", t: at(30), state: "background" },
      { ev: "launch", t: at(200), taskRegistered: true },
      { ev: "app", t: at(210), state: "active" },
      fix(220),
    ]

    const [report] = reportRuns(events)

    expect(report.launches).toBe(1)
    expect(report.appBackgroundMs).toBe(180_000)
  })

  it("ends a stopped run at its stop marker, and an unstopped one at its last event", () => {
    const stopped = reportRuns([runStart(0), fix(10), { ev: "run-stop", t: at(50), reason: null }, fix(400)])
    const running = reportRuns([runStart(0), fix(10), fix(25)])

    expect(stopped[0]).toMatchObject({ stopped: true, endedAt: at(50) })
    expect(running[0]).toMatchObject({ stopped: false, endedAt: at(25) })
  })

  it("keeps errors the task logged", () => {
    const [report] = reportRuns([runStart(0), { ev: "error", t: at(5), message: "location unavailable" }])

    expect(report.errors).toEqual(["location unavailable"])
  })
})
