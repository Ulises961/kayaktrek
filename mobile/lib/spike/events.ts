// M9e WP0 spike (plans/M9e.md): the evidence files. JavaScript writes one (fixes, runs, app state,
// network, heartbeats); the native module writes another (screen, deep sleep, battery saver, battery),
// because the native side must keep logging when JavaScript is paused. They share a clock and are read
// together. There is deliberately no way to clear them. Throwaway with the rest of lib/spike.

import { File, Paths } from "expo-file-system"

import type { SpikeEvent } from "./run-report"

const APP_LOG = "m9e-spike-events.jsonl"
const DEVICE_LOG = "m9e-spike-device.jsonl"
// Written by the first builds, before runs and phone events existed; still read, so nothing already
// recorded is lost.
const LEGACY_LOG = "m9e-spike-fixes.jsonl"

function file(name: string): File {
  return new File(Paths.document, name)
}

// The native module wants a plain path, not a file:// URI.
export function deviceLogPath(): string {
  return decodeURI(file(DEVICE_LOG).uri.replace(/^file:\/\//, ""))
}

export function logEvent(event: SpikeEvent): void {
  try {
    const target = file(APP_LOG)
    if (!target.exists) target.create()
    target.write(`${JSON.stringify(event)}\n`, { append: true })
  } catch {
    // Nothing to do: a log that cannot be written must not take the task down with it.
  }
}

export function readAllLogText(): string {
  return [LEGACY_LOG, APP_LOG, DEVICE_LOG]
    .map((name) => {
      const source = file(name)
      return source.exists ? source.textSync() : ""
    })
    .join("\n")
}
