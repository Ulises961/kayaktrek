import { evaluateChecks, formatChecks, type CheckResult } from "../checks"
import type { SpikeEvent } from "../run-report"

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 28, 12, 0, 0)
const at = (minutes: number) => T0 + minutes * MIN

const runStart = (minutes: number): SpikeEvent => ({ ev: "run-start", t: at(minutes), label: "Trip share", killOnDestroy: false })
const runStop = (minutes: number): SpikeEvent => ({ ev: "run-stop", t: at(minutes), reason: "user" })
const fix = (minutes: number): SpikeEvent => ({
  ev: "fix", t: at(minutes), rx: at(minutes), lat: 46, lon: 11, accuracyM: 10, speedMs: 0,
})
const net = (minutes: number, connected: boolean): SpikeEvent => ({ ev: "net", t: at(minutes), connected, type: connected ? "wifi" : "none" })
const ping = (minutes: number, outcome: "sent" | "retry"): SpikeEvent => ({
  ev: "ping", t: at(minutes), source: "movement", outcome, detail: outcome === "retry" ? "offline" : null,
})
const screen = (minutes: number, on: boolean): SpikeEvent => ({ ev: "screen", t: at(minutes), on })
const battery = (minutes: number, level: number, charging = false): SpikeEvent => ({ ev: "battery", t: at(minutes), level, charging })
const locsw = (minutes: number, on: boolean): SpikeEvent => ({ ev: "locsw", t: at(minutes), on, source: "js" })
const watchdog = (minutes: number, outcome: "sent" | "recent"): SpikeEvent => ({
  ev: "watchdog", t: at(minutes), outcome, sinceLastWakeMs: null,
})

const byId = (checks: CheckResult[], id: string) => checks.find((check) => check.id === id)!

describe("evaluateChecks", () => {
  it("lists every open check as waiting when nothing has been recorded, each with its condition", () => {
    const checks = evaluateChecks([])
    expect(checks.map((check) => check.id)).toEqual([
      "no-signal",
      "process-killed",
      "battery-clean",
      "switch-off-mid-run",
      "keep-alive",
    ])
    for (const check of checks) {
      expect(check.status).toBe("waiting")
      expect(check.condition.length).toBeGreaterThan(20)
      expect(check.finding).toBeNull()
    }
  })

  describe("no-signal", () => {
    it("is seen once a run spent five minutes offline, and counts what happened in it", () => {
      const events = [
        runStart(0), net(0, true), fix(1), ping(1, "sent"),
        net(10, false), fix(12), ping(12, "retry"), fix(14), ping(14, "retry"),
        net(20, true), ping(21, "sent"), runStop(30),
      ]
      const check = byId(evaluateChecks(events), "no-signal")
      expect(check.status).toBe("seen")
      expect(check.finding).toContain("10 min")
      expect(check.finding).toContain("fixes 2")
      expect(check.finding).toContain("pings that failed 2")
      expect(check.finding).toContain("1 min after")
    })

    it("stays waiting when the connection dropped for under five minutes", () => {
      const events = [runStart(0), net(0, true), net(10, false), net(13, true), runStop(30)]
      expect(byId(evaluateChecks(events), "no-signal").status).toBe("waiting")
    })

    it("says so when no ping went out after the connection came back", () => {
      const events = [runStart(0), net(0, true), net(10, false), fix(12), net(20, true), runStop(25)]
      expect(byId(evaluateChecks(events), "no-signal").finding).toContain("no ping went out after")
    })
  })

  describe("process-killed", () => {
    it("is seen when the process started again inside a run that was never stopped", () => {
      const events = [
        runStart(0), fix(1), fix(2),
        { ev: "launch", t: at(40), taskRegistered: true } as SpikeEvent,
        { ev: "reregister", t: at(40), reason: "task-missing" } as SpikeEvent,
        fix(41),
      ]
      const check = byId(evaluateChecks(events), "process-killed")
      expect(check.status).toBe("seen")
      expect(check.finding).toContain("task was still registered")
      expect(check.finding).toContain("re-registered it")
    })

    it("stays waiting when the process only started before the run", () => {
      const events = [{ ev: "launch", t: at(-1), taskRegistered: false } as SpikeEvent, runStart(0), fix(1), runStop(5)]
      expect(byId(evaluateChecks(events), "process-killed").status).toBe("waiting")
    })
  })

  describe("battery-clean", () => {
    it("is seen after thirty minutes of screen-off, unplugged sharing, and gives points per hour with its resolution", () => {
      const events = [
        battery(-5, 80), runStart(0), screen(1, false), battery(20, 79), battery(50, 77), screen(62, true), runStop(65),
      ]
      const check = byId(evaluateChecks(events), "battery-clean")
      expect(check.status).toBe("seen")
      expect(check.finding).toContain("3 points in 61 min")
      expect(check.finding).toContain("3.0 %/h")
      expect(check.finding).toContain("1 point is")
    })

    it("ignores a screen-off stretch during which the phone charged", () => {
      const events = [battery(-5, 50), runStart(0), screen(1, false), battery(20, 52, true), screen(62, true), runStop(65)]
      expect(byId(evaluateChecks(events), "battery-clean").status).toBe("waiting")
    })

    it("stays waiting for a screen-off stretch shorter than thirty minutes", () => {
      const events = [battery(-5, 80), runStart(0), screen(1, false), battery(10, 79), screen(20, true), runStop(25)]
      expect(byId(evaluateChecks(events), "battery-clean").status).toBe("waiting")
    })
  })

  describe("switch-off-mid-run", () => {
    it("is seen when the switch went off and back on inside a run, and says whether fixes resumed", () => {
      const events = [
        runStart(0), locsw(0, true), fix(1), locsw(10, false), locsw(15, true),
        { ev: "reregister", t: at(15), reason: "switch-back-on" } as SpikeEvent, fix(16), runStop(30),
      ]
      const check = byId(evaluateChecks(events), "switch-off-mid-run")
      expect(check.status).toBe("seen")
      expect(check.finding).toContain("5 min")
      expect(check.finding).toContain("first fix 1 min after")
      expect(check.finding).toContain("re-registered the task")
    })

    it("says when fixes never came back", () => {
      const events = [runStart(0), locsw(0, true), locsw(10, false), locsw(15, true), runStop(30)]
      expect(byId(evaluateChecks(events), "switch-off-mid-run").finding).toContain("no fix came before the run ended")
    })

    it("stays waiting while the switch was never turned off during a run", () => {
      expect(byId(evaluateChecks([runStart(0), locsw(0, true), fix(1), runStop(5)]), "switch-off-mid-run").status).toBe("waiting")
    })
  })

  describe("keep-alive", () => {
    it("is seen after three wakes in one run, with the longest gap between them", () => {
      const events = [
        runStart(0), watchdog(60, "sent"), watchdog(125, "recent"), watchdog(180, "recent"), runStop(200),
      ]
      const check = byId(evaluateChecks(events), "keep-alive")
      expect(check.status).toBe("seen")
      expect(check.finding).toContain("3 wakes")
      expect(check.finding).toContain("longest gap 65 min")
      expect(check.finding).toContain("sent 1")
    })

    it("shows what it has so far while it waits for more wakes", () => {
      const check = byId(evaluateChecks([runStart(0), watchdog(60, "sent"), runStop(70)]), "keep-alive")
      expect(check.status).toBe("waiting")
      expect(check.finding).toContain("1 wake")
    })
  })
})

describe("formatChecks", () => {
  it("shows a waiting check with its condition and a seen one with its finding", () => {
    const lines = formatChecks([
      { id: "a", title: "First", status: "waiting", condition: "Do the thing.", finding: null },
      { id: "b", title: "Second", status: "seen", condition: "Do the other.", finding: "It went fine." },
    ])
    expect(lines).toEqual([
      "[ ] First: waiting. Do the thing.",
      "[x] Second: It went fine.",
    ])
  })
})
