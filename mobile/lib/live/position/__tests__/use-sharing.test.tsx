import { act, renderHook, waitFor } from "@testing-library/react-native"
import * as Location from "expo-location"

import { SharingStartError, startSharing, stopSharing } from "../position-engine"
import { setSharingRecord } from "../sharing-state"
import { STOP_REASON, type SharingRecord } from "../types"
import { useSharing } from "../use-sharing"

jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
}))
jest.mock("../position-engine", () => {
  class SharingStartError extends Error {
    reason: string
    constructor(reason: string, message: string) {
      super(message)
      this.reason = reason
    }
  }
  return { SharingStartError, startSharing: jest.fn(), stopSharing: jest.fn() }
})
jest.mock("../sharing-state", () => {
  let record: unknown = null
  const listeners = new Set<() => void>()
  return {
    getSharingRecord: () => record,
    setSharingRecord: (next: unknown) => {
      record = next
      listeners.forEach((listener) => listener())
    },
    subscribeSharing: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
})

const location = jest.mocked(Location)
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0)

function record(overrides: Partial<SharingRecord> = {}): SharingRecord {
  return {
    target: { kind: "trip", tripId: "trip-1" },
    startedAt: NOW - 600_000,
    lastSentAt: NOW - 60_000,
    lastFixAt: NOW - 30_000,
    lastWakeAt: null,
    lastFailure: null,
    endedReason: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  setSharingRecord(null)
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  location.getForegroundPermissionsAsync.mockResolvedValue({ status: "granted" } as never)
  location.hasServicesEnabledAsync.mockResolvedValue(true)
  location.hasStartedLocationUpdatesAsync.mockResolvedValue(true)
})

afterEach(() => jest.restoreAllMocks())

describe("useSharing", () => {
  it("is off when nothing is being shared", async () => {
    const { result } = await renderHook(() => useSharing("trip-1"))
    await waitFor(() => expect(location.hasServicesEnabledAsync).toHaveBeenCalled())
    expect(result.current.status).toEqual({ kind: "off" })
  })

  it("reports a running share with the age of the last ping", async () => {
    setSharingRecord(record())
    const { result } = await renderHook(() => useSharing("trip-1"))
    await waitFor(() => expect(result.current.status).toEqual({ kind: "sharing", lastSentAt: NOW - 60_000 }))
  })

  it("reports a switched-off location setting, which the app permission does not show", async () => {
    setSharingRecord(record())
    location.hasServicesEnabledAsync.mockResolvedValue(false)
    const { result } = await renderHook(() => useSharing("trip-1"))
    await waitFor(() => expect(result.current.status).toEqual({ kind: "location-off" }))
  })

  it("is off for a trip when the share belongs to a different trip", async () => {
    setSharingRecord(record({ target: { kind: "trip", tripId: "other-trip" } }))
    const { result } = await renderHook(() => useSharing("trip-1"))
    await waitFor(() => expect(location.hasServicesEnabledAsync).toHaveBeenCalled())
    expect(result.current.status).toEqual({ kind: "off" })
  })

  it("shows a share that ended by itself", async () => {
    setSharingRecord(record({ endedReason: STOP_REASON.TRIP_NOT_LIVE }))
    const { result } = await renderHook(() => useSharing("trip-1"))
    await waitFor(() => expect(result.current.status).toEqual({ kind: "ended", reason: STOP_REASON.TRIP_NOT_LIVE }))
  })

  it("starts a share for this trip", async () => {
    const { result } = await renderHook(() => useSharing("trip-1"))
    await act(async () => result.current.start())
    expect(startSharing).toHaveBeenCalledWith({ kind: "trip", tripId: "trip-1" })
    expect(result.current.error).toBeNull()
  })

  it("shows why a share could not start", async () => {
    jest.mocked(startSharing).mockRejectedValue(new SharingStartError("location-off", "Location is switched off."))
    const { result } = await renderHook(() => useSharing("trip-1"))
    await act(async () => result.current.start())
    expect(result.current.error).toBe("Location is switched off.")
  })

  it("shows a generic message for a failure it does not recognise", async () => {
    jest.mocked(startSharing).mockRejectedValue(new Error("native crash"))
    const { result } = await renderHook(() => useSharing("trip-1"))
    await act(async () => result.current.start())
    expect(result.current.error).toBe("Sharing could not be started.")
  })

  it("stops on request, as the paddler", async () => {
    setSharingRecord(record())
    const { result } = await renderHook(() => useSharing("trip-1"))
    await act(async () => result.current.stop())
    expect(stopSharing).toHaveBeenCalledWith(STOP_REASON.USER)
  })

  it("follows changes to the persisted record without being told", async () => {
    const { result } = await renderHook(() => useSharing("trip-1"))
    await act(async () => setSharingRecord(record({ lastSentAt: null })))
    await waitFor(() => expect(result.current.status).toEqual({ kind: "starting" }))
  })
})
