// Registers the two background tasks at import time and wires the share's upkeep to the app's own
// lifecycle. The root layout imports this module: expo-task-manager looks a task up by name in the
// JavaScript runtime, and that runtime must already know it when a fix or a wake-up arrives.

import * as BackgroundTask from "expo-background-task"
import type * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"
import { AppState } from "react-native"

import { POSITION_TASK, ensureRunning, handleFixes } from "./position-engine"
import { runWatchdog } from "./watchdog"
import { WATCHDOG_TASK } from "./watchdog-schedule"

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(POSITION_TASK, async ({ data, error }) => {
  if (error) return
  try {
    await handleFixes(data.locations)
  } catch {
    // Nothing above this call can show an error, and a throw here would take the task's process down.
    // The next fix is handled afresh.
  }
})

TaskManager.defineTask(WATCHDOG_TASK, async () => {
  try {
    await runWatchdog()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
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
  // A failed check is retried on the next return to the foreground and at the next keep-alive wake.
  const check = (trigger: "launch" | "foreground") => ensureRunning(trigger).catch(() => undefined)
  void check("launch")
  AppState.addEventListener("change", (state) => {
    if (state === "active") void check("foreground")
  })
}
