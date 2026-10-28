// M9e WP0 spike (plans/M9e.md): what the phone and the app are doing, written to the evidence log
// for as long as the process lives: the app's state, the network, a heartbeat every minute, and the
// start of the native log (screen, deep sleep, battery). Called once from the root layout.
// Throwaway with the rest of lib/spike.

import NetInfo from "@react-native-community/netinfo"
import * as Location from "expo-location"
import { AppState } from "react-native"

import { deviceSnapshot, startDeviceEvents, type DeviceSnapshot } from "../../modules/spike-device-events"
import { POSITION_TASK } from "../live/position/types"
import { deviceLogPath, logEvent } from "./events"

function isSharing(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(POSITION_TASK)
}

const BEAT_MS = 60_000

let started = false

async function beat(): Promise<void> {
  let taskRunning: boolean | null = null
  try {
    taskRunning = await isSharing()
  } catch {
    // Left unknown.
  }
  let snapshot: DeviceSnapshot | null = null
  try {
    snapshot = deviceSnapshot()
  } catch {
    // Left unknown.
  }
  logEvent({
    ev: "beat",
    t: Date.now(),
    taskRunning,
    app: AppState.currentState,
    interactive: snapshot ? snapshot.interactive : null,
    idle: snapshot ? snapshot.idle : null,
    powerSave: snapshot ? snapshot.powerSave : null,
    battery: snapshot && snapshot.battery >= 0 ? snapshot.battery : null,
    standbyBucket: snapshot ? snapshot.standbyBucket : null,
  })
}

export function startDeviceWatch(): void {
  if (started) return
  started = true

  try {
    startDeviceEvents(deviceLogPath())
  } catch (error) {
    logEvent({ ev: "error", t: Date.now(), message: `native log: ${error instanceof Error ? error.message : String(error)}` })
  }

  // Whether a location task is already registered as the process comes up: a task that re-arms
  // itself on launch is a finding in its own right.
  isSharing()
    .then((registered) => logEvent({ ev: "launch", t: Date.now(), taskRegistered: registered }))
    .catch(() => logEvent({ ev: "launch", t: Date.now(), taskRegistered: null }))

  logEvent({ ev: "app", t: Date.now(), state: AppState.currentState })
  AppState.addEventListener("change", (state) => logEvent({ ev: "app", t: Date.now(), state }))
  NetInfo.addEventListener((state) =>
    logEvent({ ev: "net", t: Date.now(), connected: state.isConnected, type: state.type }),
  )
  setInterval(() => void beat(), BEAT_MS)
}
