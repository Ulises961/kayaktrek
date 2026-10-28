// M9e WP0 spike (plans/M9e.md): everything the walk wrote down, and the report that sets the fixes
// against what the phone itself was doing (screen on or off, deep sleep, battery, the app in or out of
// the foreground). Pure, so it is tested; the file reading lives in events.ts. Throwaway with the
// rest of lib/spike.

import { summarise, type SpikeFix, type SpikeSummary } from "./location-log"

export type SpikeEvent =
  | { ev: "fix"; t: number; rx: number; lat: number; lon: number; accuracyM: number | null; speedMs: number | null }
  | { ev: "launch"; t: number; taskRegistered: boolean | null }
  | { ev: "run-start"; t: number; label: string; killOnDestroy: boolean }
  | { ev: "run-stop"; t: number }
  | { ev: "screen"; t: number; on: boolean }
  | { ev: "unlock"; t: number }
  | { ev: "doze"; t: number; idle: boolean }
  | { ev: "powersave"; t: number; on: boolean }
  | { ev: "battery"; t: number; level: number; charging: boolean }
  | { ev: "app"; t: number; state: string }
  | { ev: "net"; t: number; connected: boolean | null; type: string }
  | {
      ev: "beat"
      t: number
      taskRunning: boolean | null
      app: string
      interactive: boolean | null
      idle: boolean | null
      powerSave: boolean | null
      battery: number | null
      standbyBucket: number | null
    }
  | { ev: "perm"; t: number; status: string }
  | { ev: "error"; t: number; message: string }

type Raw = Record<string, unknown>

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean"
const isString = (value: unknown): value is string => typeof value === "string"
const orNull = <T>(value: unknown, guard: (candidate: unknown) => candidate is T): T | null =>
  guard(value) ? value : null

function toEvent(raw: Raw): SpikeEvent | null {
  // The first builds wrote untagged lines; they are still in the log of any phone that ran them.
  if (raw.ev === undefined) {
    if (isNumber(raw.t) && isNumber(raw.lat) && isNumber(raw.lon)) {
      return {
        ev: "fix",
        t: raw.t,
        rx: isNumber(raw.rx) ? raw.rx : raw.t,
        lat: raw.lat,
        lon: raw.lon,
        accuracyM: orNull(raw.accuracyM, isNumber),
        speedMs: null,
      }
    }
    if (isNumber(raw.start)) return { ev: "launch", t: raw.start, taskRegistered: null }
    if (isString(raw.error) && isNumber(raw.rx)) return { ev: "error", t: raw.rx, message: raw.error }
    return null
  }
  if (!isNumber(raw.t)) return null
  const t = raw.t
  switch (raw.ev) {
    case "fix":
      if (!isNumber(raw.lat) || !isNumber(raw.lon)) return null
      return {
        ev: "fix",
        t,
        rx: isNumber(raw.rx) ? raw.rx : t,
        lat: raw.lat,
        lon: raw.lon,
        accuracyM: orNull(raw.accuracyM, isNumber),
        speedMs: orNull(raw.speedMs, isNumber),
      }
    case "launch":
      return { ev: "launch", t, taskRegistered: orNull(raw.taskRegistered, isBoolean) }
    case "run-start":
      return { ev: "run-start", t, label: isString(raw.label) ? raw.label : "Run", killOnDestroy: raw.killOnDestroy === true }
    case "run-stop":
      return { ev: "run-stop", t }
    case "screen":
      return isBoolean(raw.on) ? { ev: "screen", t, on: raw.on } : null
    case "unlock":
      return { ev: "unlock", t }
    case "doze":
      return isBoolean(raw.idle) ? { ev: "doze", t, idle: raw.idle } : null
    case "powersave":
      return isBoolean(raw.on) ? { ev: "powersave", t, on: raw.on } : null
    case "battery":
      return isNumber(raw.level) ? { ev: "battery", t, level: raw.level, charging: raw.charging === true } : null
    case "app":
      return isString(raw.state) ? { ev: "app", t, state: raw.state } : null
    case "net":
      return { ev: "net", t, connected: orNull(raw.connected, isBoolean), type: isString(raw.type) ? raw.type : "unknown" }
    case "beat":
      return {
        ev: "beat",
        t,
        taskRunning: orNull(raw.taskRunning, isBoolean),
        app: isString(raw.app) ? raw.app : "unknown",
        interactive: orNull(raw.interactive, isBoolean),
        idle: orNull(raw.idle, isBoolean),
        powerSave: orNull(raw.powerSave, isBoolean),
        battery: orNull(raw.battery, isNumber),
        standbyBucket: orNull(raw.standbyBucket, isNumber),
      }
    case "perm":
      return isString(raw.status) ? { ev: "perm", t, status: raw.status } : null
    case "error":
      return isString(raw.message) ? { ev: "error", t, message: raw.message } : null
    default:
      return null
  }
}

// One call takes the text of every log file together (the app's own and the one the native side
// writes), because the whole point is to read them against each other on one clock.
export function parseEvents(text: string): SpikeEvent[] {
  const events: SpikeEvent[] = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    try {
      const raw: unknown = JSON.parse(line)
      if (typeof raw !== "object" || raw === null) continue
      const event = toEvent(raw as Raw)
      if (event) events.push(event)
    } catch {
      // A line cut short by the process dying mid-write is itself a finding, not a crash.
    }
  }
  return events.sort((a, b) => a.t - b.t)
}

export type Run = {
  label: string
  startedAt: number
  // The next run's start (exclusive), or Infinity for the last one.
  endsBefore: number
  events: SpikeEvent[]
}

export const EARLIER_LOG_LABEL = "Earlier log (no run marker)"

export function splitRuns(events: SpikeEvent[]): Run[] {
  const sorted = [...events].sort((a, b) => a.t - b.t)
  const starts = sorted.filter((event): event is Extract<SpikeEvent, { ev: "run-start" }> => event.ev === "run-start")
  const runs: Run[] = []

  const firstStart = starts.length > 0 ? starts[0].t : Infinity
  const earlierFixes = sorted.filter((event) => event.ev === "fix" && event.t < firstStart)
  if (earlierFixes.length > 0) {
    // Fixes with no run marker came from a build that predates markers. What the phone logged after
    // the last of them belongs to no run, so the run stops there instead of stretching to now.
    const startedAt = earlierFixes[0].t
    const lastFixAt = earlierFixes[earlierFixes.length - 1].t
    runs.push({
      label: EARLIER_LOG_LABEL,
      startedAt,
      endsBefore: firstStart,
      events: sorted.filter((event) => event.t >= startedAt && event.t <= lastFixAt),
    })
  }
  starts.forEach((start, index) => {
    const endsBefore = index + 1 < starts.length ? starts[index + 1].t : Infinity
    runs.push({
      label: start.label,
      startedAt: start.t,
      endsBefore,
      events: sorted.filter((event) => event.t >= start.t && event.t < endsBefore),
    })
  })
  return runs
}

export type GapNote = {
  startedAt: number
  endedAt: number
  ms: number
  // True only when both ends of the gap fall inside one locked-screen period and nothing turned it on between.
  screenOffThroughout: boolean
  speedBefore: number | null
  speedAfter: number | null
}

export type RunReport = {
  label: string
  startedAt: number
  endedAt: number
  stopped: boolean
  fixes: SpikeSummary
  longestGaps: GapNote[]
  screen: {
    offMs: number
    offPeriods: number
    fixesWhileOff: number
    fixesWhileOn: number
    longestFixGapWhileOffMs: number
  }
  battery: { first: number | null; last: number | null; dropPerHour: number | null; charging: boolean }
  doze: { entries: number; idleMs: number }
  liveness: { beats: number; longestBeatGapMs: number; beatsTaskStopped: number }
  appBackgroundMs: number
  launches: number
  netChanges: number
  errors: string[]
}

// What counts as a missed beat: three of the 15 s intervals the spike asks for.
export const MISSED_BEAT_MS = 45_000
const MIN_RUN_FOR_HOURLY_MS = 5 * 60_000
const LONGEST_GAPS_SHOWN = 3

type Interval = { from: number; to: number }

// The stretches, inside [from, to], where a two-state signal read `active`. `before` is the state when
// the window opened (from the last event ahead of it); `changes` are the events inside it.
function stretches(
  before: boolean,
  changes: { t: number; active: boolean }[],
  from: number,
  to: number,
): Interval[] {
  const result: Interval[] = []
  let openedAt: number | null = before ? from : null
  for (const change of changes) {
    if (change.t < from || change.t > to) continue
    if (change.active && openedAt === null) openedAt = change.t
    if (!change.active && openedAt !== null) {
      result.push({ from: openedAt, to: change.t })
      openedAt = null
    }
  }
  if (openedAt !== null) result.push({ from: openedAt, to })
  return result
}

const total = (intervals: Interval[]): number => intervals.reduce((sum, interval) => sum + (interval.to - interval.from), 0)
const within = (intervals: Interval[], t: number): Interval | undefined =>
  intervals.find((interval) => t >= interval.from && t <= interval.to)

function lastBefore<T extends SpikeEvent>(all: SpikeEvent[], kind: T["ev"], t: number): T | undefined {
  let found: T | undefined
  for (const event of all) {
    if (event.t > t) break
    if (event.ev === kind) found = event as T
  }
  return found
}

function reportRun(run: Run, all: SpikeEvent[]): RunReport {
  const stop = run.events.find((event) => event.ev === "run-stop")
  const lastEventAt = run.events.reduce((latest, event) => Math.max(latest, event.t), run.startedAt)
  const endedAt = stop ? stop.t : lastEventAt
  const events = run.events.filter((event) => event.t <= endedAt)
  const from = run.startedAt

  const fixEvents = events.filter((event): event is Extract<SpikeEvent, { ev: "fix" }> => event.ev === "fix")
  const fixes: SpikeFix[] = fixEvents.map((fix) => ({
    t: fix.t,
    rx: fix.rx,
    lat: fix.lat,
    lon: fix.lon,
    accuracyM: fix.accuracyM,
  }))

  // Screen: off when the last screen event ahead of the run said so, then whatever changes during it.
  const screenBefore = lastBefore<Extract<SpikeEvent, { ev: "screen" }>>(all, "screen", from)
  const screenChanges = events
    .filter((event): event is Extract<SpikeEvent, { ev: "screen" }> => event.ev === "screen")
    .map((event) => ({ t: event.t, active: !event.on }))
  const screenOff = stretches(screenBefore ? !screenBefore.on : false, screenChanges, from, endedAt)

  const fixesWhileOff = fixEvents.filter((fix) => within(screenOff, fix.t)).length
  let longestFixGapWhileOffMs = 0
  const gapNotes: GapNote[] = []
  for (let index = 1; index < fixEvents.length; index += 1) {
    const before = fixEvents[index - 1]
    const after = fixEvents[index]
    const ms = after.t - before.t
    const lockedPeriod = within(screenOff, before.t)
    const screenOffThroughout = lockedPeriod !== undefined && after.t <= lockedPeriod.to
    if (screenOffThroughout && ms > longestFixGapWhileOffMs) longestFixGapWhileOffMs = ms
    gapNotes.push({
      startedAt: before.t,
      endedAt: after.t,
      ms,
      screenOffThroughout,
      speedBefore: before.speedMs,
      speedAfter: after.speedMs,
    })
  }
  const longestGaps = gapNotes.sort((a, b) => b.ms - a.ms).slice(0, LONGEST_GAPS_SHOWN)

  // Battery: every level we saw, including the last one before the run began and each heartbeat's.
  const batteryBefore = lastBefore<Extract<SpikeEvent, { ev: "battery" }>>(all, "battery", from)
  const samples: { t: number; level: number; charging: boolean }[] = []
  if (batteryBefore && batteryBefore.t < from) {
    samples.push({ t: batteryBefore.t, level: batteryBefore.level, charging: batteryBefore.charging })
  }
  for (const event of events) {
    if (event.ev === "battery") samples.push({ t: event.t, level: event.level, charging: event.charging })
    if (event.ev === "beat" && event.battery !== null) samples.push({ t: event.t, level: event.battery, charging: false })
  }
  samples.sort((a, b) => a.t - b.t)
  const firstSample = samples[0]
  const lastSample = samples[samples.length - 1]
  const sampledMs = firstSample && lastSample ? lastSample.t - firstSample.t : 0
  const battery = {
    first: firstSample ? firstSample.level : null,
    last: lastSample ? lastSample.level : null,
    dropPerHour:
      firstSample && lastSample && sampledMs >= MIN_RUN_FOR_HOURLY_MS
        ? (firstSample.level - lastSample.level) / (sampledMs / 3_600_000)
        : null,
    charging: samples.some((sample) => sample.charging),
  }

  // Deep sleep ("Doze"): how many times the phone went into it during the run, and for how long.
  const dozeBefore = lastBefore<Extract<SpikeEvent, { ev: "doze" }>>(all, "doze", from)
  const dozeEvents = events.filter((event): event is Extract<SpikeEvent, { ev: "doze" }> => event.ev === "doze")
  const idle = stretches(
    dozeBefore ? dozeBefore.idle : false,
    dozeEvents.map((event) => ({ t: event.t, active: event.idle })),
    from,
    endedAt,
  )

  const beats = events.filter((event): event is Extract<SpikeEvent, { ev: "beat" }> => event.ev === "beat")
  let longestBeatGapMs = 0
  for (let index = 1; index < beats.length; index += 1) {
    longestBeatGapMs = Math.max(longestBeatGapMs, beats[index].t - beats[index - 1].t)
  }

  const appBefore = lastBefore<Extract<SpikeEvent, { ev: "app" }>>(all, "app", from)
  const appChanges = events
    .filter((event): event is Extract<SpikeEvent, { ev: "app" }> => event.ev === "app")
    .map((event) => ({ t: event.t, active: event.state !== "active" }))
  const appOut = stretches(appBefore ? appBefore.state !== "active" : false, appChanges, from, endedAt)

  return {
    label: run.label,
    startedAt: from,
    endedAt,
    stopped: stop !== undefined,
    fixes: summarise(fixes, MISSED_BEAT_MS),
    longestGaps,
    screen: {
      offMs: total(screenOff),
      offPeriods: screenOff.length,
      fixesWhileOff,
      fixesWhileOn: fixEvents.length - fixesWhileOff,
      longestFixGapWhileOffMs,
    },
    battery,
    doze: { entries: dozeEvents.filter((event) => event.idle).length, idleMs: total(idle) },
    liveness: {
      beats: beats.length,
      longestBeatGapMs,
      beatsTaskStopped: beats.filter((beat) => beat.taskRunning === false).length,
    },
    appBackgroundMs: total(appOut),
    launches: events.filter((event) => event.ev === "launch").length,
    netChanges: events.filter((event) => event.ev === "net").length,
    errors: events.flatMap((event) => (event.ev === "error" ? [event.message] : [])),
  }
}

export function reportRuns(events: SpikeEvent[]): RunReport[] {
  const sorted = [...events].sort((a, b) => a.t - b.t)
  return splitRuns(sorted).map((run) => reportRun(run, sorted))
}
