import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { debounce, useDebouncedValue } from "../debounce"

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("invokes the function only after the delay elapses", () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("collapses rapid calls into a single trailing invocation with the last args", () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced("a")
    debounced("b")
    debounced("c")
    vi.advanceTimersByTime(200)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("c")
  })

  it("cancel() drops a pending invocation", () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(200)

    expect(fn).not.toHaveBeenCalled()
  })
})

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("initial", 300))
    expect(result.current).toBe("initial")
  })

  it("updates to the latest value only after the delay", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: "a" },
    })

    rerender({ value: "b" })
    expect(result.current).toBe("a")

    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe("b")
  })

  it("collapses rapid value changes into a single update with the final value", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: "a" },
    })

    rerender({ value: "b" })
    rerender({ value: "c" })
    rerender({ value: "d" })
    // All still show the initial value before the delay
    expect(result.current).toBe("a")

    act(() => vi.advanceTimersByTime(300))
    // Only the final value settles
    expect(result.current).toBe("d")
  })
})
