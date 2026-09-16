import { AppState } from "react-native"
import NetInfo from "@react-native-community/netinfo"

import { startSyncTrigger } from "../sync-trigger"

jest.mock("@react-native-community/netinfo", () => ({ addEventListener: jest.fn() }))
// sync.ts -> database.ts eagerly constructs a native SQLiteAdapter at import
// time — never usable under Jest (see sync.test.ts for the same pattern).
jest.mock("../database", () => ({ database: {} }))

const mockedNetInfoAddEventListener = NetInfo.addEventListener as jest.Mock

// runSync() chains sync(tripId).catch(...).finally(...) — the added .catch()
// (so a failed background sync never becomes an unhandled rejection) costs one
// extra microtask tick before `inFlight` resets, versus a bare .finally().
// A single `await Promise.resolve()` no longer flushes it.
async function flushRunSync() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("startSyncTrigger", () => {
  let mockedAppStateAddEventListener: jest.SpyInstance

  beforeEach(() => {
    mockedAppStateAddEventListener = jest.spyOn(AppState, "addEventListener")
    jest.clearAllMocks()
    mockedAppStateAddEventListener.mockReturnValue({ remove: jest.fn() })
    mockedNetInfoAddEventListener.mockReturnValue(jest.fn())
  })

  it("runs an immediate sync when started, so a first-time trip view populates the local cache", () => {
    const sync = jest.fn().mockResolvedValue(undefined)
    startSyncTrigger("trip-1", sync)

    expect(sync).toHaveBeenCalledWith("trip-1")
  })

  it("syncs when the app comes to the foreground", async () => {
    const sync = jest.fn().mockResolvedValue(undefined)
    startSyncTrigger("trip-1", sync)
    await flushRunSync()
    sync.mockClear()

    const appStateHandler = mockedAppStateAddEventListener.mock.calls[0][1] as (state: string) => void
    await appStateHandler("active")

    expect(sync).toHaveBeenCalledWith("trip-1")
  })

  it("does not sync on a foreground event that isn't 'active'", async () => {
    const sync = jest.fn().mockResolvedValue(undefined)
    startSyncTrigger("trip-1", sync)
    await flushRunSync()
    sync.mockClear()

    const appStateHandler = mockedAppStateAddEventListener.mock.calls[0][1] as (state: string) => void
    await appStateHandler("background")

    expect(sync).not.toHaveBeenCalled()
  })

  it("syncs on a disconnected-to-connected transition, not on an already-connected update", async () => {
    const sync = jest.fn().mockResolvedValue(undefined)
    startSyncTrigger("trip-1", sync)
    await flushRunSync()
    sync.mockClear()

    const netInfoHandler = mockedNetInfoAddEventListener.mock.calls[0][0] as (state: { isConnected: boolean | null }) => void
    netInfoHandler({ isConnected: false })
    expect(sync).not.toHaveBeenCalled()

    await netInfoHandler({ isConnected: true })
    expect(sync).toHaveBeenCalledTimes(1)

    await netInfoHandler({ isConnected: true })
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it("does not start a second overlapping sync while one is in flight", async () => {
    let resolveSync: () => void = () => {}
    const sync = jest.fn(() => new Promise<void>((resolve) => { resolveSync = resolve }))
    startSyncTrigger("trip-1", sync)
    // Flush the immediate on-start sync before exercising the overlap case below.
    resolveSync()
    await flushRunSync()
    sync.mockClear()

    const appStateHandler = mockedAppStateAddEventListener.mock.calls[0][1] as (state: string) => void
    void appStateHandler("active")
    void appStateHandler("active")
    expect(sync).toHaveBeenCalledTimes(1)

    resolveSync()
    await flushRunSync()
    await appStateHandler("active")
    expect(sync).toHaveBeenCalledTimes(2)
  })

  it("never lets a failed sync surface as an unhandled promise rejection", async () => {
    const handler = jest.fn()
    process.on("unhandledRejection", handler)
    try {
      const sync = jest.fn().mockRejectedValue(new Error("Could not reach the server."))
      startSyncTrigger("trip-1", sync)
      await flushRunSync()

      expect(handler).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", handler)
    }
  })

  it("stop() unsubscribes both listeners", () => {
    const removeAppState = jest.fn()
    const removeNetInfo = jest.fn()
    mockedAppStateAddEventListener.mockReturnValue({ remove: removeAppState })
    mockedNetInfoAddEventListener.mockReturnValue(removeNetInfo)

    const stop = startSyncTrigger("trip-1", jest.fn().mockResolvedValue(undefined))
    stop()

    expect(removeAppState).toHaveBeenCalled()
    expect(removeNetInfo).toHaveBeenCalled()
  })
})
