// Registers the two background tasks at import time and wires the share's upkeep to the app's own
// lifecycle. The root layout imports this module: expo-task-manager looks a task up by name in the
// JavaScript runtime, and that runtime must already know it when a fix or a wake-up arrives.

import * as BackgroundTask from "expo-background-task"
import type * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"
import { AppState } from "react-native"

import { logEvent } from "../../spike/events"
import { POSITION_TASK, ensureRunning, handleFixes } from "./position-engine"
import { runWatchdog } from "./watchdog"
import { WATCHDOG_TASK } from "./watchdog-schedule"

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(POSITION_TASK, async ({ data, error }) => {
  if (error) {
    logEvent({ ev: "error", t: Date.now(), message: error.message })
    return
  }
  try {
    await handleFixes(data.locations)
  } catch (caught) {
    // Nothing above this call can show an error, and a throw here would take the task's process down.
    logEvent({ ev: "error", t: Date.now(), message: `fix handler: ${errorText(caught)}` })
  }
})

TaskManager.defineTask(WATCHDOG_TASK, async () => {
  try {
    await runWatchdog()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch (caught) {
    logEvent({ ev: "error", t: Date.now(), message: `keep-alive: ${errorText(caught)}` })
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

let watching = false

// Called once from the root layout. A share outlives the process: on launch and on every return to the
// foreground the service is checked, and put back if it is gone or was registered while the system
// location switch was off.
export function watchSharing(): void {
  if (watching) return
  watching = true
  const check = (trigger: "launch" | "foreground") =>
    ensureRunning(trigger).catch((caught: unknown) =>
      logEvent({ ev: "error", t: Date.now(), message: `ensure running: ${errorText(caught)}` }),
    )
  void check("launch")
  AppState.addEventListener("change", (state) => {
    if (state === "active") void check("foreground")
  })
}
