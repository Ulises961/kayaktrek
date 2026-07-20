import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useSaveStatus } from "../use-save-status"

describe("useSaveStatus", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("starts idle", () => {
    const { result } = renderHook(() => useSaveStatus())
    expect(result.current.status).toBe("idle")
  })

  it("goes to saving while the save is pending, then saved once it resolves", async () => {
    const { result } = renderHook(() => useSaveStatus())
    let resolveSave!: () => void
    const save = () => new Promise<void>((resolve) => (resolveSave = resolve))

    let runPromise!: Promise<void>
    act(() => {
      runPromise = result.current.run(save)
    })
    expect(result.current.status).toBe("saving")

    await act(async () => {
      resolveSave()
      await runPromise
    })
    expect(result.current.status).toBe("saved")
  })

  it("reverts to idle after the clear delay", async () => {
    const { result } = renderHook(() => useSaveStatus(2000))
    await act(async () => {
      await result.current.run(() => Promise.resolve())
    })
    expect(result.current.status).toBe("saved")

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.status).toBe("idle")
  })

  it("reverts to idle (not stuck on saving) when the save rejects", async () => {
    const { result } = renderHook(() => useSaveStatus())
    await act(async () => {
      await expect(result.current.run(() => Promise.reject(new Error("nope")))).rejects.toThrow(
        "nope",
      )
    })
    expect(result.current.status).toBe("idle")
  })
})
