import { act, renderHook, waitFor } from "@testing-library/react-native"

import { useLiveCache } from "../use-live-cache"

// The live-first/cache-fallback shape duplicated across items.tsx, the
// paddlers screen (connections/blocks), and the logs screen (mine/endorsed)
// before this hook existed — one copy of the try/fetch/catch/cache-or-error
// logic instead of four+.
describe("useLiveCache", () => {
  it("sets data from the live fetch and saves it to cache, not offline", async () => {
    const fetchLive = jest.fn().mockResolvedValue(["a", "b"])
    const loadCache = jest.fn().mockResolvedValue([])
    const saveCache = jest.fn().mockResolvedValue(undefined)

    const { result } = await renderHook(() =>
      useLiveCache({ fetchLive, loadCache, saveCache, isCacheEmpty: (d: string[]) => d.length === 0 }),
    )

    await act(() => result.current.reload())

    expect(result.current.data).toEqual(["a", "b"])
    expect(result.current.isOffline).toBe(false)
    expect(result.current.error).toBeNull()
    await waitFor(() => expect(saveCache).toHaveBeenCalledWith(["a", "b"]))
  })

  it("falls back to cache and flags offline when the live fetch fails", async () => {
    const fetchLive = jest.fn().mockRejectedValue(new Error("Could not reach the server."))
    const loadCache = jest.fn().mockResolvedValue(["cached"])
    const saveCache = jest.fn()

    const { result } = await renderHook(() =>
      useLiveCache({ fetchLive, loadCache, saveCache, isCacheEmpty: (d: string[]) => d.length === 0 }),
    )

    await act(() => result.current.reload())

    expect(result.current.data).toEqual(["cached"])
    expect(result.current.isOffline).toBe(true)
    expect(result.current.error).toBeNull()
    expect(saveCache).not.toHaveBeenCalled()
  })

  it("surfaces the live error when the fetch fails and the cache is empty", async () => {
    const fetchLive = jest.fn().mockRejectedValue(new Error("Could not reach the server."))
    const loadCache = jest.fn().mockResolvedValue([])
    const saveCache = jest.fn()

    const { result } = await renderHook(() =>
      useLiveCache({ fetchLive, loadCache, saveCache, isCacheEmpty: (d: string[]) => d.length === 0 }),
    )

    await act(() => result.current.reload())

    expect(result.current.data).toBeNull()
    expect(result.current.isOffline).toBe(false)
    expect(result.current.error).toBe("Could not reach the server.")
  })

  it("keeps reload's identity stable across renders, even with fresh inline options", async () => {
    const { result, rerender } = await renderHook(
      (props: { seed: number }) =>
        useLiveCache({
          // Deliberately fresh closures every render, as a real screen would pass —
          // reload must not change identity anyway, or a `useEffect(() => {
          // void load() }, [load])` depending on it infinite-loops.
          fetchLive: async () => [props.seed],
          loadCache: async () => [],
          saveCache: async () => undefined,
          isCacheEmpty: (d: number[]) => d.length === 0,
        }),
      { initialProps: { seed: 1 } },
    )

    const firstReload = result.current.reload
    await rerender({ seed: 2 })
    expect(result.current.reload).toBe(firstReload)

    await act(() => result.current.reload())
    expect(result.current.data).toEqual([2])
  })

  it("clears a previous error on the next reload", async () => {
    const fetchLive = jest.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(["a"])
    const loadCache = jest.fn().mockResolvedValue([])
    const saveCache = jest.fn().mockResolvedValue(undefined)

    const { result } = await renderHook(() =>
      useLiveCache({ fetchLive, loadCache, saveCache, isCacheEmpty: (d: string[]) => d.length === 0 }),
    )

    await act(() => result.current.reload())
    expect(result.current.error).toBe("boom")

    await act(() => result.current.reload())
    expect(result.current.error).toBeNull()
    expect(result.current.data).toEqual(["a"])
  })
})
