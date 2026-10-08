import { act, renderHook, waitFor } from "@testing-library/react-native"

import { hasCachedVelocity } from "../../db/velocity-cache"
import { useHasCachedVelocity } from "../use-has-cached-velocity"

jest.mock("../../db/velocity-cache", () => ({ hasCachedVelocity: jest.fn() }))

const mockHas = hasCachedVelocity as jest.Mock

beforeEach(() => mockHas.mockReset())

describe("useHasCachedVelocity", () => {
  it("is null while it checks, then true when the day's flow is saved on the phone", async () => {
    let answer: (saved: boolean) => void = () => {}
    mockHas.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)))

    const { result } = await renderHook(() => useHasCachedVelocity("day-1"))

    expect(result.current).toBeNull()
    await act(async () => answer(true))
    expect(result.current).toBe(true)
    expect(mockHas).toHaveBeenCalledWith("day-1")
  })

  it("is false when nothing is saved for the day", async () => {
    mockHas.mockResolvedValue(false)

    const { result } = await renderHook(() => useHasCachedVelocity("day-1"))

    await waitFor(() => expect(result.current).toBe(false))
  })

  it("is false when the saved rows cannot be read, rather than offering what it cannot draw", async () => {
    mockHas.mockRejectedValue(new Error("no such table: velocity_days"))

    const { result } = await renderHook(() => useHasCachedVelocity("day-1"))

    await waitFor(() => expect(result.current).toBe(false))
  })

  it("is false without a day, and does not look", async () => {
    const { result } = await renderHook(() => useHasCachedVelocity(null))

    expect(result.current).toBe(false)
    expect(mockHas).not.toHaveBeenCalled()
  })

  it("checks again for another day, and never reports the earlier day's answer for it", async () => {
    let answerSecond: (saved: boolean) => void = () => {}
    mockHas.mockImplementation((dayId: string) =>
      dayId === "day-1" ? Promise.resolve(true) : new Promise<boolean>((resolve) => (answerSecond = resolve)),
    )

    const { result, rerender } = await renderHook(({ dayId }: { dayId: string }) => useHasCachedVelocity(dayId), {
      initialProps: { dayId: "day-1" },
    })
    await waitFor(() => expect(result.current).toBe(true))

    await rerender({ dayId: "day-2" })
    expect(result.current).toBeNull()

    await act(async () => answerSecond(false))
    expect(result.current).toBe(false)
  })
})
