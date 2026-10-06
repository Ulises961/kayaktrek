import { renderHook, waitFor } from "@testing-library/react-native"

import { loadCachedVelocityField } from "../../db/velocity-cache"
import { fetchWaveVectors, fetchWindVectors, type VelocityField } from "../velocity"
import { useVelocityField } from "../use-velocity-field"

jest.mock("../velocity", () => ({
  fetchWindVectors: jest.fn(),
  fetchWaveVectors: jest.fn(),
}))
jest.mock("../../db/velocity-cache", () => ({ loadCachedVelocityField: jest.fn() }))

const mockWind = fetchWindVectors as jest.Mock
const mockWave = fetchWaveVectors as jest.Mock
const mockCached = loadCachedVelocityField as jest.Mock

const field: VelocityField = {
  north: 54.2,
  south: 54.0,
  west: -4.6,
  east: -4.4,
  nx: 1,
  ny: 1,
  u: [1],
  v: [2],
}

beforeEach(() => {
  mockWind.mockReset()
  mockWave.mockReset()
  // Nothing saved on the phone unless a test says so.
  mockCached.mockReset().mockResolvedValue(undefined)
})

describe("useVelocityField", () => {
  it("does not fetch while disabled", async () => {
    const { result } = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: false }))

    expect(result.current.status).toBe("idle")
    expect(result.current.field).toBeNull()
    expect(mockWind).not.toHaveBeenCalled()
  })

  it("does not fetch without a day", async () => {
    const { result } = await renderHook(() => useVelocityField({ dayId: null, hour: 12, kind: "wind", enabled: true }))

    expect(result.current.status).toBe("idle")
    expect(mockWind).not.toHaveBeenCalled()
  })

  it("loads the wind field for the day and hour", async () => {
    mockWind.mockResolvedValue(field)

    const { result } = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 14, kind: "wind", enabled: true }))

    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(mockWind).toHaveBeenCalledWith("day-1", 14)
    expect(mockWave).not.toHaveBeenCalled()
    expect(result.current.field).toBe(field)
  })

  it("loads the wave field when asked for waves", async () => {
    mockWave.mockResolvedValue(field)

    const { result } = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 9, kind: "wave", enabled: true }))

    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(mockWave).toHaveBeenCalledWith("day-1", 9)
    expect(mockWind).not.toHaveBeenCalled()
  })

  it("reports empty, not an error, when the day has no data", async () => {
    mockWind.mockResolvedValue(null)

    const { result } = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true }))

    await waitFor(() => expect(result.current.status).toBe("empty"))
    expect(result.current.field).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it("reports the failure and drops any previous field", async () => {
    mockWind.mockRejectedValue(new Error("Could not reach the server."))

    const { result } = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true }))

    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(result.current.error).toBe("Could not reach the server.")
    expect(result.current.field).toBeNull()
  })

  it("refetches when the hour changes and ignores a slower earlier response", async () => {
    const early: VelocityField = { ...field, u: [9] }
    const late: VelocityField = { ...field, u: [5] }
    let resolveFirst: (value: VelocityField) => void = () => {}
    mockWind
      .mockReturnValueOnce(new Promise<VelocityField>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(late)

    const { result, rerender } = await renderHook(
      ({ hour }: { hour: number }) => useVelocityField({ dayId: "day-1", hour, kind: "wind", enabled: true }),
      { initialProps: { hour: 8 } },
    )
    await rerender({ hour: 9 })
    await waitFor(() => expect(result.current.field).toBe(late))

    resolveFirst(early)
    await Promise.resolve()

    expect(result.current.field).toBe(late)
    expect(mockWind).toHaveBeenNthCalledWith(1, "day-1", 8)
    expect(mockWind).toHaveBeenNthCalledWith(2, "day-1", 9)
  })

  // M35: the pull saves each day's flow on the phone, so the overlay draws with no connection.
  describe("with the flow saved on the phone", () => {
    const saved: VelocityField = { ...field, u: [7] }

    it("online, asks the server and does not touch the saved rows when that works", async () => {
      mockWind.mockResolvedValue(field)

      const { result } = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true }))

      await waitFor(() => expect(result.current.status).toBe("ready"))
      expect(result.current.fromCache).toBe(false)
      expect(mockCached).not.toHaveBeenCalled()
    })

    it("offline, uses the saved rows and never asks the server", async () => {
      mockCached.mockResolvedValue(saved)

      const { result } = await renderHook(() =>
        useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true, offline: true }),
      )

      await waitFor(() => expect(result.current.status).toBe("ready"))
      expect(result.current.field).toBe(saved)
      expect(result.current.fromCache).toBe(true)
      expect(mockCached).toHaveBeenCalledWith("day-1", 12, "wind")
      expect(mockWind).not.toHaveBeenCalled()
    })

    it("offline, a day saved with no forecast for the layer is empty, not an error", async () => {
      mockCached.mockResolvedValue(null)

      const { result } = await renderHook(() =>
        useVelocityField({ dayId: "day-1", hour: 12, kind: "wave", enabled: true, offline: true }),
      )

      await waitFor(() => expect(result.current.status).toBe("empty"))
      expect(result.current.error).toBeNull()
      expect(mockWave).not.toHaveBeenCalled()
    })

    it("offline with nothing saved says so, and does not try the network", async () => {
      const { result } = await renderHook(() =>
        useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true, offline: true }),
      )

      await waitFor(() => expect(result.current.status).toBe("error"))
      expect(result.current.error).toMatch(/not saved|nothing is saved/i)
      expect(result.current.field).toBeNull()
      expect(mockWind).not.toHaveBeenCalled()
    })

    it("falls back to the saved rows when the server cannot be reached, though the phone thinks it is online", async () => {
      mockWind.mockRejectedValue(new Error("Could not reach the server."))
      mockCached.mockResolvedValue(saved)

      const { result } = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true }))

      await waitFor(() => expect(result.current.status).toBe("ready"))
      expect(result.current.field).toBe(saved)
      expect(result.current.fromCache).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it("keeps the server's error when it fails and nothing is saved", async () => {
      mockWind.mockRejectedValue(new Error("Could not reach the server."))

      const { result } = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true }))

      await waitFor(() => expect(result.current.status).toBe("error"))
      expect(result.current.error).toBe("Could not reach the server.")
    })

    it("does not trust saved rows it cannot read: offline that is a message, online it is the server's error", async () => {
      mockCached.mockRejectedValue(new Error("The saved wind and swell data for this day is damaged."))
      mockWind.mockRejectedValue(new Error("Could not reach the server."))

      const offline = await renderHook(() =>
        useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true, offline: true }),
      )
      const online = await renderHook(() => useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true }))

      await waitFor(() => expect(offline.result.current.status).toBe("error"))
      await waitFor(() => expect(online.result.current.status).toBe("error"))
      expect(offline.result.current.field).toBeNull()
      expect(online.result.current.error).toBe("Could not reach the server.")
    })

    it("re-reads when the phone goes offline, so a field fetched live is not kept past the connection", async () => {
      mockWind.mockResolvedValue(field)
      mockCached.mockResolvedValue(saved)

      const { result, rerender } = await renderHook(
        ({ offline }: { offline: boolean }) =>
          useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled: true, offline }),
        { initialProps: { offline: false } },
      )
      await waitFor(() => expect(result.current.field).toBe(field))

      await rerender({ offline: true })

      await waitFor(() => expect(result.current.field).toBe(saved))
      expect(result.current.fromCache).toBe(true)
    })
  })

  it("goes back to idle and clears the field when disabled again", async () => {
    mockWind.mockResolvedValue(field)

    const { result, rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) => useVelocityField({ dayId: "day-1", hour: 12, kind: "wind", enabled }),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(result.current.status).toBe("ready"))

    await rerender({ enabled: false })

    await waitFor(() => expect(result.current.status).toBe("idle"))
    expect(result.current.field).toBeNull()
  })
})
