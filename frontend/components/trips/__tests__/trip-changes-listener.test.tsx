import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, render } from "@testing-library/react"

const { mockRefresh, mockUseTripChanges, mockGetChangesStreamUrl } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockUseTripChanges: vi.fn(),
  mockGetChangesStreamUrl: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock("@/hooks/use-trip-changes", () => ({ useTripChanges: mockUseTripChanges }))
vi.mock("@/lib/live/actions", () => ({ getChangesStreamUrl: mockGetChangesStreamUrl }))

import { TripChangesListener, TRIP_CHANGES_REFRESH_DEBOUNCE_MS } from "../trip-changes-listener"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

function renderListener() {
  const view = render(<TripChangesListener tripId={TRIP_ID} />)
  const { onChange, mintUrl } = mockUseTripChanges.mock.calls.at(-1)![1]
  return { ...view, onChange: onChange as () => void, mintUrl: mintUrl as () => Promise<unknown> }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mockUseTripChanges.mockReturnValue({ status: "connecting" })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("TripChangesListener", () => {
  it("shows nothing to the viewer", () => {
    const { container } = renderListener()
    expect(container).toBeVisible()
    expect(container.textContent).toBe("")
    expect(container.querySelector("[hidden]")).not.toBeNull()
  })

  it("exposes the stream status, so a test can wait for the stream to be live", () => {
    mockUseTripChanges.mockReturnValue({ status: "live" })
    const { container } = renderListener()
    expect(container.querySelector("[data-trip-changes-status]")).toHaveAttribute(
      "data-trip-changes-status",
      "live",
    )
  })

  it("subscribes for its own trip, minting through the changes ticket action", async () => {
    mockGetChangesStreamUrl.mockResolvedValue("http://sse/changes?ticket=a")
    const { mintUrl } = renderListener()
    expect(mockUseTripChanges.mock.calls[0][0]).toBe(TRIP_ID)
    await expect(mintUrl()).resolves.toBe("http://sse/changes?ticket=a")
    expect(mockGetChangesStreamUrl).toHaveBeenCalledWith(TRIP_ID)
  })

  it("refreshes once the debounce window has passed", () => {
    const { onChange } = renderListener()
    act(() => onChange())
    expect(mockRefresh).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("turns a burst of changes into a single refresh", () => {
    const { onChange } = renderListener()
    act(() => {
      onChange()
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS - 50)
      onChange()
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS - 50)
      onChange()
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("does not refresh after unmounting", () => {
    const { onChange, unmount } = renderListener()
    act(() => onChange())
    unmount()
    act(() => {
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS * 2)
    })
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
