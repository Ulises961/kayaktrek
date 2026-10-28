import * as TaskManager from "expo-task-manager"
import { AppState } from "react-native"

import { POSITION_TASK, ensureRunning, handleFixes } from "../position-engine"
import { watchSharing } from "../position-tasks"
import { runWatchdog } from "../watchdog"
import { WATCHDOG_TASK } from "../watchdog-schedule"

jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }))
jest.mock("expo-background-task", () => ({ BackgroundTaskResult: { Success: 1, Failed: 2 } }))
jest.mock("expo-location", () => ({}))
jest.mock("../../../spike/events", () => ({ logEvent: jest.fn() }))
jest.mock("../position-engine", () => ({
  POSITION_TASK: "kayaktrek-position",
  ensureRunning: jest.fn().mockResolvedValue(undefined),
  handleFixes: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("../watchdog", () => ({ runWatchdog: jest.fn().mockResolvedValue(undefined) }))

type Executor = (body: { data?: unknown; error?: { message: string } | null }) => Promise<unknown>

// The two executors were registered when position-tasks was first imported, before any test ran.
const defined = new Map<string, Executor>(
  jest.mocked(TaskManager.defineTask).mock.calls.map(([name, executor]) => [name, executor as unknown as Executor]),
)

describe("the registered tasks", () => {
  it("registers both tasks by name when the module loads", () => {
    expect([...defined.keys()].sort()).toEqual([POSITION_TASK, WATCHDOG_TASK].sort())
  })

  it("hands a delivered batch of fixes to the engine", async () => {
    const locations = [{ timestamp: 1 }]
    await defined.get(POSITION_TASK)!({ data: { locations } })
    expect(handleFixes).toHaveBeenCalledWith(locations)
  })

  it("does not let a failing handler take the task down", async () => {
    jest.mocked(handleFixes).mockRejectedValueOnce(new Error("boom"))
    await expect(defined.get(POSITION_TASK)!({ data: { locations: [] } })).resolves.toBeUndefined()
  })

  it("runs the watchdog and reports success to the scheduler", async () => {
    expect(await defined.get(WATCHDOG_TASK)!({})).toBe(1)
    expect(runWatchdog).toHaveBeenCalled()
  })

  it("reports failure to the scheduler when the watchdog throws", async () => {
    jest.mocked(runWatchdog).mockRejectedValueOnce(new Error("boom"))
    expect(await defined.get(WATCHDOG_TASK)!({})).toBe(2)
  })
})

describe("watchSharing", () => {
  it("checks the service at launch and again on each return to the foreground, once", () => {
    const addListener = jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove: jest.fn() })
    watchSharing()
    watchSharing()
    expect(ensureRunning).toHaveBeenCalledTimes(1)
    expect(ensureRunning).toHaveBeenCalledWith("launch")
    expect(addListener).toHaveBeenCalledTimes(1)

    const onChange = addListener.mock.calls[0][1] as (state: string) => void
    onChange("background")
    expect(ensureRunning).toHaveBeenCalledTimes(1)
    onChange("active")
    expect(ensureRunning).toHaveBeenLastCalledWith("foreground")
  })
})
