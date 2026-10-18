// M9e WP0 spike (plans/M9e.md): the native side of the evidence collector. Throwaway with lib/spike.

import { requireNativeModule } from "expo-modules-core"

export type DeviceSnapshot = {
  interactive: boolean
  idle: boolean
  powerSave: boolean
  ignoringBatteryOptimizations: boolean
  standbyBucket: number | null
  battery: number
  charging: boolean
  sdk: number
  manufacturer: string
  model: string
}

type SpikeDeviceEventsNative = {
  start(path: string): void
  snapshot(): DeviceSnapshot
}

const native = requireNativeModule<SpikeDeviceEventsNative>("SpikeDeviceEvents")

// Starts the native log (screen, deep sleep, battery saver, battery) at `path`, a plain file path.
export function startDeviceEvents(path: string): void {
  native.start(path)
}

export function deviceSnapshot(): DeviceSnapshot {
  return native.snapshot()
}
