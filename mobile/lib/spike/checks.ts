// The conditions M9e WP0 left open (plans/M9e.md), kept as a standing list the evidence log answers by
// itself: each one says what to do to exercise it, stays "waiting" until the log shows it happened, and
// then states what was measured. They are collected passively while WP1 is built, so nobody has to
// remember what has been seen. Pure; the screen and the shared report print the result. Throwaway with
// the rest of lib/spike, removed before a release.

import { EARLIER_LOG_LABEL, lastBefore, splitRuns, stretches, type Run, type SpikeEvent } from "./run-report"

export type CheckResult = {
  id: string
  title: string
  status: "waiting" | "seen"
  // What to do for the log to answer it.
  condition: string
  // What the log showed, once it has.
  finding: string | null
}

const MIN = 60_000
const NO_SIGNAL_MIN_MS = 5 * MIN
const BATTERY_CLEAN_MIN_MS = 30 * MIN
const KEEP_ALIVE_WAKES_NEEDED = 3

type Span = { run: Run; from: number; to: number; events: SpikeEvent[] }

function spansOf(all: SpikeEvent[]): Span[] {
  return splitRuns(all)
    .filter((run) => run.label !== EARLIER_LOG_LABEL)
    .map((run) => {
      const stop = run.events.find((event) => event.ev === "run-stop")
      const to = stop ? stop.t : run.events.reduce((latest, event) => Math.max(latest, event.t), run.startedAt)
      return { run, from: run.startedAt, to, events: run.events.filter((event) => event.t <= to) }
    })
}

const minutes = (ms: number): string => `${Math.round(ms / MIN)} min`
const clock = (ms: number): string => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`

function of<K extends SpikeEvent["ev"]>(events: SpikeEvent[], kind: K): Extract<SpikeEvent, { ev: K }>[] {
  return events.filter((event): event is Extract<SpikeEvent, { ev: K }> => event.ev === kind)
}

function check(id: string, title: string, condition: string, finding: string | null, seen: boolean): CheckResult {
  return { id, title, status: seen ? "seen" : "waiting", condition, finding }
}

function noSignal(all: SpikeEvent[], spans: Span[]): CheckResult {
  const id = "no-signal"
  const title = "Fixes and pings with no signal"
  const condition = "While sharing, switch mobile data and wifi off for 5 minutes or more while you walk, then switch them back on."
  let best: { span: Span; from: number; to: number } | null = null
  for (const span of spans) {
    const before = lastBefore<Extract<SpikeEvent, { ev: "net" }>>(all, "net", span.from)
    const changes = of(span.events, "net").map((event) => ({ t: event.t, active: event.connected === false }))
    for (const offline of stretches(before?.connected === false, changes, span.from, span.to)) {
      if (offline.to - offline.from >= NO_SIGNAL_MIN_MS && (!best || offline.to - offline.from > best.to - best.from)) {
        best = { span, ...offline }
      }
    }
  }
  if (!best) return check(id, title, condition, null, false)

  const { span, from, to } = best
  const inside = (t: number) => t >= from && t <= to
  const fixes = of(span.events, "fix").filter((event) => inside(event.t)).length
  const failed = of(span.events, "ping").filter((event) => inside(event.t) && event.outcome === "retry").length
  const firstSent = of(span.events, "ping").find((event) => event.t > to && event.outcome === "sent")
  const after = firstSent
    ? `first ping sent ${minutes(firstSent.t - to)} after the connection came back`
    : "no ping went out after the connection came back"
  return check(id, title, condition, `Offline ${minutes(to - from)} at ${clock(from)}: fixes ${fixes}, pings that failed ${failed}; ${after}.`, true)
}

function processKilled(spans: Span[]): CheckResult {
  const id = "process-killed"
  const title = "The app killed or force-stopped during a share"
  const condition = "While sharing, force-stop the app from the system settings (or let the phone clear it), then open it again."
  for (const span of spans) {
    const stop = span.events.find((event) => event.ev === "run-stop")
    const launch = of(span.events, "launch").find((event) => event.t > span.from && (!stop || event.t < stop.t))
    if (!launch) continue
    const lastFix = of(span.events, "fix").filter((event) => event.t < launch.t).pop()
    const registered =
      launch.taskRegistered === null
        ? "the location task's state could not be read"
        : launch.taskRegistered
          ? "the location task was still registered"
          : "the location task was NOT registered"
    const back = of(span.events, "reregister").some((event) => event.t >= launch.t && event.t - launch.t < 5 * MIN)
    const lastFixText = lastFix ? `last fix before it ${clock(lastFix.t)}` : "no fix before it"
    return check(
      id,
      title,
      condition,
      `The process started again at ${clock(launch.t)} during a share (${lastFixText}); on relaunch ${registered}${back ? "; the app re-registered it" : ""}.`,
      true,
    )
  }
  return check(id, title, condition, null, false)
}

type Level = { t: number; level: number; charging: boolean }

function batteryClean(all: SpikeEvent[], spans: Span[]): CheckResult {
  const id = "battery-clean"
  const title = "Battery cost with the screen off"
  const condition = "Share for 30 minutes or more with the screen off, the phone unplugged and nothing else running, for instance in a pocket on a walk."
  const levels: Level[] = of(all, "battery").map((event) => ({ t: event.t, level: event.level, charging: event.charging }))
  const levelAt = (t: number): Level | undefined => levels.filter((entry) => entry.t <= t).pop()

  let best: { from: number; to: number; drop: number } | null = null
  for (const span of spans) {
    const screenBefore = lastBefore<Extract<SpikeEvent, { ev: "screen" }>>(all, "screen", span.from)
    const changes = of(span.events, "screen").map((event) => ({ t: event.t, active: !event.on }))
    for (const off of stretches(screenBefore ? !screenBefore.on : false, changes, span.from, span.to)) {
      if (off.to - off.from < BATTERY_CLEAN_MIN_MS) continue
      const start = levelAt(off.from)
      const end = levelAt(off.to)
      if (!start || !end) continue
      const charged = start.charging || levels.some((entry) => entry.t > off.from && entry.t <= off.to && entry.charging)
      if (charged) continue
      if (!best || off.to - off.from > best.to - best.from) best = { ...off, drop: start.level - end.level }
    }
  }
  if (!best) return check(id, title, condition, null, false)

  const elapsed = best.to - best.from
  const perHour = (best.drop * 60) / (elapsed / MIN)
  const resolution = 60 / (elapsed / MIN)
  return check(
    id,
    title,
    condition,
    `${plural(best.drop, "point")} in ${minutes(elapsed)} with the screen off and the phone unplugged: ${perHour.toFixed(1)} %/h ` +
      `(1 point is ${resolution.toFixed(1)} %/h at this length, so read it as within that).`,
    true,
  )
}

function switchOffMidRun(spans: Span[]): CheckResult {
  const id = "switch-off-mid-run"
  const title = "Location switched off while sharing"
  const condition = "While sharing, switch location off from the quick settings for a few minutes, then switch it back on."
  for (const span of spans) {
    const switches = of(span.events, "locsw")
    const off = switches.find((event) => !event.on && event.t > span.from)
    if (!off) continue
    const on = switches.find((event) => event.on && event.t > off.t)
    const until = on ? on.t : span.to
    const fixesWhileOff = of(span.events, "fix").filter((event) => event.t >= off.t && event.t <= until).length
    const head = `Switched off for ${minutes(until - off.t)} at ${clock(off.t)} (fixes while off ${fixesWhileOff})`
    if (!on) return check(id, title, condition, `${head}; it was still off when the run ended.`, true)
    const firstFix = of(span.events, "fix").find((event) => event.t > on.t)
    const resumed = firstFix ? `back on, first fix ${minutes(firstFix.t - on.t)} after` : "back on, but no fix came before the run ended"
    const reregistered = of(span.events, "reregister").some((event) => event.t >= on.t && event.t - on.t < 5 * MIN)
    return check(id, title, condition, `${head}; ${resumed}${reregistered ? "; the app re-registered the task" : ""}.`, true)
  }
  return check(id, title, condition, null, false)
}

function keepAlive(spans: Span[]): CheckResult {
  const id = "keep-alive"
  const title = "The hourly keep-alive wake-up"
  const condition = "Share for 3 hours or more. The wake-up runs about hourly, so the screen off and the phone left alone is the real test."
  let best: SpikeEvent[] = []
  for (const span of spans) {
    const wakes = of(span.events, "watchdog")
    if (wakes.length > best.length) best = wakes
  }
  if (best.length === 0) return check(id, title, condition, null, false)

  const wakes = best as Extract<SpikeEvent, { ev: "watchdog" }>[]
  let longestGap = 0
  for (let index = 1; index < wakes.length; index += 1) longestGap = Math.max(longestGap, wakes[index].t - wakes[index - 1].t)
  const counts = new Map<string, number>()
  wakes.forEach((wake) => counts.set(wake.outcome, (counts.get(wake.outcome) ?? 0) + 1))
  const outcomes = [...counts.entries()].map(([outcome, count]) => `${outcome} ${count}`).join(", ")
  const gap = wakes.length > 1 ? `, longest gap ${minutes(longestGap)} between wakes` : ""
  const finding = `${plural(wakes.length, "wake")}${gap}; ${outcomes}.`
  return check(id, title, condition, finding, wakes.length >= KEEP_ALIVE_WAKES_NEEDED)
}

export function evaluateChecks(events: SpikeEvent[]): CheckResult[] {
  const all = [...events].sort((a, b) => a.t - b.t)
  const spans = spansOf(all)
  return [noSignal(all, spans), processKilled(spans), batteryClean(all, spans), switchOffMidRun(spans), keepAlive(spans)]
}

export function formatChecks(checks: CheckResult[]): string[] {
  return checks.map((entry) =>
    entry.status === "seen"
      ? `[x] ${entry.title}: ${entry.finding ?? "seen"}`
      : entry.finding
        ? `[ ] ${entry.title}: so far ${entry.finding} Still needed: ${entry.condition}`
        : `[ ] ${entry.title}: waiting. ${entry.condition}`,
  )
}
