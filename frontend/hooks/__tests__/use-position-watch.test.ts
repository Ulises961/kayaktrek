import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { usePositionWatch } from "../use-position-watch"

const { sendPositionPing } = vi.hoisted(() => ({ sendPositionPing: vi.fn() }))
vi.mock("@/lib/live/actions", () => ({ sendPositionPing }))

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

type SuccessCb = (position: { coords: Record<string, number | null> }) => void
type ErrorCb = (error: { code: number }) => void

class FakeGeolocation {
  watchCount = 0
  successCb: SuccessCb | null = null
  errorCb: ErrorCb | null = null
  cleared: number[] = []

  watchPosition(success: SuccessCb, error: ErrorCb) {
    this.watchCount += 1
    this.successCb = success
    this.errorCb = error
    return this.watchCount
  }

  clearWatch(id: number) {
    this.cleared.push(id)
  }

  emit(lat: number, lon: number, extra: Record<string, number | null> = {}) {
    this.successCb?.({
      coords: {
        latitude: lat,
        longitude: lon,
        accuracy: null,
        heading: null,
        speed: null,
        ...extra,
      },
    })
  }

  emitError(code: number) {
    this.errorCb?.({ code })
  }
}

let geolocation: FakeGeolocation

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  geolocation = new FakeGeolocation()
  vi.stubGlobal("navigator", { geolocation })
  Object.defineProperty(document, "hidden", { value: false, configurable: true })
  sendPositionPing.mockResolvedValue({ success: true })
})

afterEach(() => {
  // Unmount (which fires the hook's cleanup, clearing the watch) must run while
  // navigator is still this test's stub — otherwise it fires after
  // unstubAllGlobals, against an undefined navigator.geolocation.
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("usePositionWatch", () => {
  it("stays off when disabled", () => {
    const { result } = renderHook(() => usePositionWatch(TRIP_ID, false))
    expect(result.current.status).toBe("off")
    expect(geolocation.watchCount).toBe(0)
  })

  it("reports unsupported when the browser has no geolocation API", () => {
    vi.stubGlobal("navigator", {})
    const { result } = renderHook(() => usePositionWatch(TRIP_ID, true))
    expect(result.current.status).toBe("unsupported")
  })

  it("acquires, then sends on the first position fix", () => {
    const { result } = renderHook(() => usePositionWatch(TRIP_ID, true))
    expect(result.current.status).toBe("acquiring")

    act(() => geolocation.emit(43.0, 13.0))

    expect(result.current.status).toBe("sending")
    expect(sendPositionPing).toHaveBeenCalledTimes(1)
    expect(sendPositionPing).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ lat: 43.0, lon: 13.0 }),
    )
  })

  it("throttles a second fix within 15s even with a large displacement", () => {
    renderHook(() => usePositionWatch(TRIP_ID, true))
    act(() => geolocation.emit(43.0, 13.0))
    act(() => geolocation.emit(44.0, 14.0)) // huge displacement, but too soon

    expect(sendPositionPing).toHaveBeenCalledTimes(1)
  })

  it("skips a fix under 10m displacement even after the throttle window", () => {
    renderHook(() => usePositionWatch(TRIP_ID, true))
    act(() => geolocation.emit(43.0, 13.0))

    act(() => vi.advanceTimersByTime(16_000))
    // ~1m north — well under the 10m floor.
    act(() => geolocation.emit(43.000009, 13.0))

    expect(sendPositionPing).toHaveBeenCalledTimes(1)
  })

  it("sends again after the throttle window once displaced at least 10m", () => {
    renderHook(() => usePositionWatch(TRIP_ID, true))
    act(() => geolocation.emit(43.0, 13.0))

    act(() => vi.advanceTimersByTime(16_000))
    // ~1.1km north — comfortably past 10m.
    act(() => geolocation.emit(43.01, 13.0))

    expect(sendPositionPing).toHaveBeenCalledTimes(2)
  })

  it("pauses the watch when the tab is hidden and resumes when visible again", () => {
    renderHook(() => usePositionWatch(TRIP_ID, true))
    expect(geolocation.watchCount).toBe(1)

    act(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(geolocation.cleared).toEqual([1])

    act(() => {
      Object.defineProperty(document, "hidden", { value: false, configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(geolocation.watchCount).toBe(2)
  })

  it("sets status to denied on a PERMISSION_DENIED error", () => {
    const { result } = renderHook(() => usePositionWatch(TRIP_ID, true))
    act(() => geolocation.emitError(1))
    expect(result.current.status).toBe("denied")
  })

  it("clears the watch on unmount", () => {
    const { unmount } = renderHook(() => usePositionWatch(TRIP_ID, true))
    unmount()
    expect(geolocation.cleared).toEqual([1])
  })
})
