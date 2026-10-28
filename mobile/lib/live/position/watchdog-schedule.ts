import * as BackgroundTask from "expo-background-task"

import { KEEP_ALIVE_WAKE_MINUTES } from "./keep-alive"

export const WATCHDOG_TASK = "kayaktrek-keep-alive"

// Registered while a share runs and removed when it ends. The work scheduler keeps it across the
// process dying, which a JavaScript timer does not (the spike's heartbeat went quiet for 50 minutes).
export async function registerWatchdog(): Promise<void> {
  await BackgroundTask.registerTaskAsync(WATCHDOG_TASK, { minimumInterval: KEEP_ALIVE_WAKE_MINUTES })
}

export async function unregisterWatchdog(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(WATCHDOG_TASK)
  } catch {
    // Not registered, which is the state being asked for.
  }
}
