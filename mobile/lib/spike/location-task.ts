// M9e WP0 spike (plans/M9e.md): does position sharing survive a locked screen?
//
// The task is defined at module scope and this module is imported by the root layout, because
// expo-task-manager looks a task up by name in the JS runtime and that runtime must already know
// it when a fix arrives. Every fix, and every Start and Stop, is appended to the evidence log
// (events.ts); the screen turns the log into a report. Throwaway with the rest of lib/spike.

import * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"

import { logEvent } from "./events"

export const SPIKE_TASK = "m9e-spike-location"

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

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(SPIKE_TASK, async ({ data, error }) => {
  const receivedAt = Date.now()
  if (error) {
    logEvent({ ev: "error", t: receivedAt, message: error.message })
    return
  }
  for (const location of data.locations) {
    const speed = location.coords.speed
    logEvent({
      ev: "fix",
      t: location.timestamp,
      rx: receivedAt,
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      accuracyM: location.coords.accuracy,
      // Android reports -1 for "no speed".
      speedMs: speed !== null && speed >= 0 ? speed : null,
    })
  }
})

export async function currentPermission(): Promise<Location.PermissionStatus> {
  const { status } = await Location.getForegroundPermissionsAsync()
  return status
}

export async function ensureForegroundPermission(): Promise<Location.PermissionStatus> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  logEvent({ ev: "perm", t: Date.now(), status })
  return status
}

export async function startSharing(preset: SpikePreset, killServiceOnDestroy: boolean): Promise<void> {
  // Logged first, so that every fix of the run falls after its marker.
  logEvent({ ev: "run-start", t: Date.now(), label: preset.label, killOnDestroy: killServiceOnDestroy })
  try {
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
  } catch (error) {
    logEvent({ ev: "error", t: Date.now(), message: `start failed: ${error instanceof Error ? error.message : String(error)}` })
    throw error
  }
}

export async function stopSharing(): Promise<void> {
  logEvent({ ev: "run-stop", t: Date.now() })
  if (await Location.hasStartedLocationUpdatesAsync(SPIKE_TASK)) {
    await Location.stopLocationUpdatesAsync(SPIKE_TASK)
  }
}

export function isSharing(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(SPIKE_TASK)
}
