import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook } from "@testing-library/react"

vi.mock("@/lib/requests/poll", () => ({ refreshPendingRequests: vi.fn() }))

import { refreshPendingRequests } from "@/lib/requests/poll"
import { usePendingRequests, PENDING_REQUESTS_POLL_MS } from "../use-pending-requests"
import type { PendingRequestsSummary } from "@/lib/requests/pending"

const mockRefresh = vi.mocked(refreshPendingRequests)

const NONE: PendingRequestsSummary = {
  tripInvitations: 0,
  buddyRequests: 0,
  endorsementRequests: 0,
}
const ONE_INVITATION: PendingRequestsSummary = { ...NONE, tripInvitations: 1 }

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true })
  document.dispatchEvent(new Event("visibilitychange"))
}

// Lets the awaited server action and the state update it triggers settle inside act().
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
  mockRefresh.mockReset()
  mockRefresh.mockResolvedValue(NONE)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("usePendingRequests", () => {
  it("starts from what the server rendered, without asking again straight away", () => {
    const { result } = renderHook(() => usePendingRequests(ONE_INVITATION))

    expect(result.current).toEqual(ONE_INVITATION)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("asks every 10 seconds and shows the newest counts", async () => {
    mockRefresh.mockResolvedValue({ ...NONE, buddyRequests: 2 })
    const { result } = renderHook(() => usePendingRequests(NONE))

    await tick(PENDING_REQUESTS_POLL_MS)

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual({ ...NONE, buddyRequests: 2 })

    await tick(PENDING_REQUESTS_POLL_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it("does not poll while the tab is hidden, and catches up the moment it is shown", async () => {
    mockRefresh.mockResolvedValue(ONE_INVITATION)
    const { result } = renderHook(() => usePendingRequests(NONE))

    act(() => setVisibility("hidden"))
    await tick(PENDING_REQUESTS_POLL_MS * 3)
    expect(mockRefresh).not.toHaveBeenCalled()

    act(() => setVisibility("visible"))
    await tick(0)

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual(ONE_INVITATION)
  })

  it("keeps the last counts when a poll fails", async () => {
    mockRefresh.mockResolvedValueOnce(ONE_INVITATION)
    const { result } = renderHook(() => usePendingRequests(NONE))
    await tick(PENDING_REQUESTS_POLL_MS)
    expect(result.current).toEqual(ONE_INVITATION)

    mockRefresh.mockResolvedValueOnce(null)
    await tick(PENDING_REQUESTS_POLL_MS)

    expect(result.current).toEqual(ONE_INVITATION)
  })

  it("keeps polling after a poll throws", async () => {
    mockRefresh.mockRejectedValueOnce(new Error("offline"))
    const { result } = renderHook(() => usePendingRequests(NONE))
    await tick(PENDING_REQUESTS_POLL_MS)

    mockRefresh.mockResolvedValueOnce(ONE_INVITATION)
    await tick(PENDING_REQUESTS_POLL_MS)

    expect(result.current).toEqual(ONE_INVITATION)
  })

  it("never has two polls in flight at once", async () => {
    let finishFirst: (value: PendingRequestsSummary) => void = () => {}
    mockRefresh.mockImplementationOnce(
      () => new Promise<PendingRequestsSummary>((resolve) => (finishFirst = resolve)),
    )
    renderHook(() => usePendingRequests(NONE))

    await tick(PENDING_REQUESTS_POLL_MS * 3)
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    await act(async () => finishFirst(NONE))
    await tick(PENDING_REQUESTS_POLL_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it("tells its caller when the counts changed, and not when they did not", async () => {
    const onChange = vi.fn()
    mockRefresh.mockResolvedValueOnce(NONE).mockResolvedValueOnce(ONE_INVITATION)
    renderHook(() => usePendingRequests(NONE, onChange))

    await tick(PENDING_REQUESTS_POLL_MS)
    expect(onChange).not.toHaveBeenCalled()

    await tick(PENDING_REQUESTS_POLL_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(ONE_INVITATION)
  })

  it("takes the server's counts again when the page is rendered afresh", async () => {
    const { result, rerender } = renderHook(({ initial }) => usePendingRequests(initial), {
      initialProps: { initial: NONE },
    })

    rerender({ initial: ONE_INVITATION })

    expect(result.current).toEqual(ONE_INVITATION)
  })

  it("stops asking once unmounted", async () => {
    const { unmount } = renderHook(() => usePendingRequests(NONE))
    unmount()

    await tick(PENDING_REQUESTS_POLL_MS * 3)

    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
