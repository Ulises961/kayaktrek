// M9e WP0 spike (plans/M9e.md): does position sharing survive a locked screen?
//
// The task is defined at module scope and this module is imported by the root layout, because
// expo-task-manager looks a task up by name in the JS runtime and that runtime must already know
// it when a fix arrives. Every fix is appended to a file so a walk with the phone in a pocket can
// be read back afterwards (the screen summarises it; `adb exec-out run-as app.kayaktrek cat
// files/m9e-spike-fixes.jsonl` gives the raw lines). Throwaway with the rest of lib/spike.

import { File, Paths } from "expo-file-system"
import * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"

export const SPIKE_TASK = "m9e-spike-location"
const LOG_NAME = "m9e-spike-fixes.jsonl"

export type SpikePreset = {
  label: string
  accuracy: Location.Accuracy
  timeIntervalMs: number
  distanceM: number
}

// The first is what web does (at most one ping per 15 s, only when moved 10 m). The second is
// the same with the high-accuracy chip, for the battery comparison. The third has no distance
// filter, so a stationary phone still beats once per interval: a pure "is it alive" probe.
export const PRESETS: SpikePreset[] = [
  { label: "Balanced, 15 s, 10 m", accuracy: Location.Accuracy.Balanced, timeIntervalMs: 15_000, distanceM: 10 },
  { label: "High, 15 s, 10 m", accuracy: Location.Accuracy.High, timeIntervalMs: 15_000, distanceM: 10 },
  { label: "Balanced, 15 s, no filter", accuracy: Location.Accuracy.Balanced, timeIntervalMs: 15_000, distanceM: 0 },
]

function logFile(): File {
  return new File(Paths.document, LOG_NAME)
}

function append(line: string): void {
  const file = logFile()
  if (!file.exists) file.create()
  file.write(`${line}\n`, { append: true })
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(SPIKE_TASK, async ({ data, error }) => {
  const receivedAt = Date.now()
  try {
    if (error) {
      append(JSON.stringify({ error: error.message, rx: receivedAt }))
      return
    }
    for (const location of data.locations) {
      append(
        JSON.stringify({
          t: location.timestamp,
          rx: receivedAt,
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          accuracyM: location.coords.accuracy,
        }),
      )
    }
  } catch {
    // Nothing to do: a task that throws here would only hide the symptom being measured.
  }
})

export async function ensureForegroundPermission(): Promise<Location.PermissionStatus> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status
}

export async function startSharing(preset: SpikePreset, killServiceOnDestroy: boolean): Promise<void> {
  await Location.startLocationUpdatesAsync(SPIKE_TASK, {
    accuracy: preset.accuracy,
    timeInterval: preset.timeIntervalMs,
    distanceInterval: preset.distanceM,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "Kayaktrek",
      notificationBody: "Sharing your position (spike)",
      killServiceOnDestroy,
    },
  })
}

export async function stopSharing(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(SPIKE_TASK)) {
    await Location.stopLocationUpdatesAsync(SPIKE_TASK)
  }
}

export function isSharing(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(SPIKE_TASK)
}

export function readLog(): string {
  const file = logFile()
  return file.exists ? file.textSync() : ""
}

export function clearLog(): void {
  const file = logFile()
  if (file.exists) file.delete()
}
