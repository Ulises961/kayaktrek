import { act, renderHook } from "@testing-library/react-native"
import { AppState } from "react-native"

import type { LivePosition } from "@shared/dtos/live-position"

import { getPositionsPollUrl } from "../actions"
import { createCrewPositionsPoller, type CrewPositionsPollerOptions } from "../crew-positions-poller"
import { createStreamingGate } from "../trip-changes-lifecycle"
import { useCrewPositions } from "../use-crew-positions"

jest.mock("../actions", () => ({ getPositionsPollUrl: jest.fn() }))
jest.mock("../crew-positions-poller", () => ({ createCrewPositionsPoller: jest.fn() }))
jest.mock("../trip-changes-lifecycle", () => ({ createStreamingGate: jest.fn() }))

const ada: LivePosition = {
  userId: "u1",
  name: "Ada Paddler",
  lat: 43.1,
  lon: 13.2,
  accuracyM: null,
  headingDeg: null,
  speedMs: null,
  recordedAt: "2026-11-06T10:00:00+00:00",
}
const bea: LivePosition = { ...ada, userId: "u2", name: "Bea Paddler" }

type FakePoller = { start: jest.Mock; stop: jest.Mock; setActive: jest.Mock; options: CrewPositionsPollerOptions }
const pollers: FakePoller[] = []
const stopGate = jest.fn()
let setGate: (enabled: boolean) => void = () => undefined

beforeEach(() => {
  pollers.length = 0
  jest.clearAllMocks()
  jest.mocked(createCrewPositionsPoller).mockImplementation((options) => {
    const poller = { start: jest.fn(), stop: jest.fn(), setActive: jest.fn(), options }
    pollers.push(poller)
    return poller
  })
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true })
  jest.mocked(createStreamingGate).mockImplementation((setStreaming) => {
    setGate = setStreaming
    return stopGate
  })
})

function latest(): FakePoller {
  return pollers[pollers.length - 1]
}

describe("useCrewPositions", () => {
  it("polls nothing, and shows nobody, while it is not wanted", async () => {
    const { result } = await renderHook(() => useCrewPositions("trip-1", false))

    expect(createCrewPositionsPoller).not.toHaveBeenCalled()
    expect(result.current).toEqual([])
  })

  it("polls the trip's positions through a ticketed url, and returns what the poll reports", async () => {
    jest.mocked(getPositionsPollUrl).mockResolvedValue("http://sse.test/positions?ticket=a")
    const { result } = await renderHook(() => useCrewPositions("trip-1", true))

    expect(latest().start).toHaveBeenCalledTimes(1)
    await expect(latest().options.mintUrl()).resolves.toBe("http://sse.test/positions?ticket=a")
    expect(getPositionsPollUrl).toHaveBeenCalledWith("trip-1")

    await act(async () => latest().options.onPositions([ada, bea]))

    expect(result.current).toEqual([ada, bea])
  })

  it("starts paused when the app is in the background, and follows the foreground gate", async () => {
    Object.defineProperty(AppState, "currentState", { value: "background", configurable: true })
    await renderHook(() => useCrewPositions("trip-1", true))

    expect(latest().options.startActive).toBe(false)
    setGate(true)
    expect(latest().setActive).toHaveBeenLastCalledWith(true)
    setGate(false)
    expect(latest().setActive).toHaveBeenLastCalledWith(false)
  })

  it("stops polling, and releases the gate, when the screen goes away", async () => {
    const { unmount } = await renderHook(() => useCrewPositions("trip-1", true))

    await unmount()

    expect(latest().stop).toHaveBeenCalledTimes(1)
    expect(stopGate).toHaveBeenCalledTimes(1)
  })

  it("forgets everyone, and stops, when it is no longer wanted", async () => {
    const { result, rerender } = await renderHook((enabled: boolean) => useCrewPositions("trip-1", enabled), {
      initialProps: true,
    })
    await act(async () => latest().options.onPositions([ada]))
    expect(result.current).toEqual([ada])

    await rerender(false)

    expect(result.current).toEqual([])
    expect(pollers[0].stop).toHaveBeenCalledTimes(1)
  })

  it("never shows one trip's crew on another trip", async () => {
    const { result, rerender } = await renderHook((tripId: string) => useCrewPositions(tripId, true), {
      initialProps: "trip-1",
    })
    await act(async () => latest().options.onPositions([ada]))

    await rerender("trip-2")

    expect(result.current).toEqual([])
    expect(pollers).toHaveLength(2)
    await act(async () => latest().options.onPositions([bea]))
    expect(result.current).toEqual([bea])
  })

  it("clears the crew when the poll ends: the trip is no longer under way", async () => {
    const { result } = await renderHook(() => useCrewPositions("trip-1", true))
    await act(async () => latest().options.onPositions([ada]))

    await act(async () => latest().options.onStatus?.("ended"))

    expect(result.current).toEqual([])
  })

  it("keeps showing the last known positions while the poll is failing, rather than blanking the map", async () => {
    const { result } = await renderHook(() => useCrewPositions("trip-1", true))
    await act(async () => latest().options.onPositions([ada]))

    await act(async () => latest().options.onStatus?.("error"))

    expect(result.current).toEqual([ada])
  })
})
