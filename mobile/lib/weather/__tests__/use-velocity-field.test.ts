import { renderHook, waitFor } from "@testing-library/react-native"

import { fetchWaveVectors, fetchWindVectors, type VelocityField } from "../velocity"
import { useVelocityField } from "../use-velocity-field"

jest.mock("../velocity", () => ({
  fetchWindVectors: jest.fn(),
  fetchWaveVectors: jest.fn(),
}))

const mockWind = fetchWindVectors as jest.Mock
const mockWave = fetchWaveVectors as jest.Mock

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
