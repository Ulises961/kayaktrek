// M9e WP0 spike (the M9e plan): the report and the event list as text, for the screen and for the
// Share button (so a walk's evidence can leave the phone with no cable). Throwaway with the rest of
// lib/spike.

import { MISSED_BEAT_MS, type RunReport, type SpikeEvent } from "./run-report"

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB")
}

export function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 120) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 120) return `${minutes} min ${seconds % 60} s`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function speed(metresPerSecond: number | null): string {
  return metresPerSecond === null ? "?" : metresPerSecond.toFixed(1)
}

export function formatReport(report: RunReport): string {
  const lines: string[] = []
  lines.push(`Run: ${report.label}`)
  lines.push(
    `Started ${clock(report.startedAt)}, ended ${clock(report.endedAt)} (${duration(report.endedAt - report.startedAt)}), ` +
      (report.stopped ? "stopped" : "still running or never stopped"),
  )

  const { fixes, screen } = report
  if (fixes.count === 0) {
    lines.push("Fixes: none")
  } else {
    lines.push(`Fixes: ${fixes.count} (first ${clock(fixes.firstAt ?? 0)}, last ${clock(fixes.lastAt ?? 0)})`)
    lines.push(
      `Gaps: median ${duration(fixes.medianGapMs)}, longest ${duration(fixes.longestGapMs)}, over ${duration(MISSED_BEAT_MS)}: ${fixes.gapsOverThreshold}`,
    )
    lines.push(`Delivery: worst delay between a fix and the app receiving it ${duration(fixes.maxDeliveryDelayMs)}`)
  }

  lines.push(`Screen off: ${duration(screen.offMs)} in ${screen.offPeriods} period(s)`)
  lines.push(`Fixes with the screen off: ${screen.fixesWhileOff} of ${fixes.count}`)
  lines.push(`Longest silence wholly under a locked screen: ${duration(screen.longestFixGapWhileOffMs)}`)

  if (report.longestGaps.length > 0) {
    lines.push("Longest gaps:")
    report.longestGaps.forEach((gap, index) => {
      const during = gap.screenOffThroughout ? "screen off throughout" : "screen on during it"
      lines.push(
        ` ${index + 1}. ${duration(gap.ms)}, ${clock(gap.startedAt)} to ${clock(gap.endedAt)}, ${during}, ` +
          `speed ${speed(gap.speedBefore)} to ${speed(gap.speedAfter)} m/s`,
      )
    })
  }

  const { battery } = report
  if (battery.first === null || battery.last === null) {
    lines.push("Battery: no readings")
  } else if (battery.dropPerHour === null) {
    lines.push(`Battery: ${battery.first}% to ${battery.last}% (too short for an hourly figure)`)
  } else {
    lines.push(
      `Battery: ${battery.first}% to ${battery.last}%, ${battery.dropPerHour.toFixed(1)}% per hour` +
        (battery.charging ? " (charging at some point, so unreliable)" : ""),
    )
  }

  lines.push(`Deep sleep: ${report.doze.entries} time(s), ${duration(report.doze.idleMs)}`)
  lines.push(
    `Heartbeats: ${report.liveness.beats}, longest silence ${duration(report.liveness.longestBeatGapMs)}, location task stopped in ${report.liveness.beatsTaskStopped}`,
  )
  lines.push(`App out of the foreground: ${duration(report.appBackgroundMs)}`)
  lines.push(`Process launches during the run: ${report.launches}`)
  lines.push(`Network changes: ${report.netChanges}`)
  lines.push(`Errors: ${report.errors.length === 0 ? "none" : report.errors.join("; ")}`)
  return lines.join("\n")
}

export function formatEvent(event: SpikeEvent): string {
  const time = clock(event.t)
  switch (event.ev) {
    case "fix":
      return `${time} fix ${event.lat.toFixed(5)},${event.lon.toFixed(5)} ±${event.accuracyM ?? "?"} m ${speed(event.speedMs)} m/s`
    case "launch":
      return `${time} app process started (location task ${event.taskRegistered === null ? "?" : event.taskRegistered ? "already registered" : "not registered"})`
    case "run-start":
      return `${time} START pressed: ${event.label}${event.killOnDestroy ? ", stops with the app" : ""}`
    case "run-stop":
      return event.reason === null || event.reason === "user" ? `${time} STOP pressed` : `${time} STOP (${event.reason})`
    case "ping":
      return `${time} ping ${event.source}: ${event.outcome}${event.detail ? ` (${event.detail})` : ""}`
    case "watchdog":
      return `${time} keep-alive wake: ${event.outcome}${event.sinceLastWakeMs === null ? "" : `, ${duration(event.sinceLastWakeMs)} since the last`}`
    case "locsw":
      return `${time} location switch ${event.on ? "ON" : "OFF"} (${event.source})`
    case "reregister":
      return `${time} location task re-registered: ${event.reason}`
    case "screen":
      return `${time} screen ${event.on ? "ON" : "OFF"}`
    case "unlock":
      return `${time} unlocked`
    case "doze":
      return `${time} deep sleep ${event.idle ? "ON" : "off"}`
    case "powersave":
      return `${time} battery saver ${event.on ? "ON" : "off"}`
    case "battery":
      return `${time} battery ${event.level}%${event.charging ? " charging" : ""}`
    case "app":
      return `${time} app ${event.state}`
    case "net":
      return `${time} network ${event.type}, ${event.connected === null ? "?" : event.connected ? "connected" : "offline"}`
    case "beat":
      return `${time} heartbeat: task ${event.taskRunning === null ? "?" : event.taskRunning ? "running" : "STOPPED"}, app ${event.app}, screen ${event.interactive === null ? "?" : event.interactive ? "on" : "off"}, bucket ${event.standbyBucket ?? "?"}`
    case "perm":
      return `${time} location permission ${event.status}`
    case "error":
      return `${time} ERROR ${event.message}`
  }
}
