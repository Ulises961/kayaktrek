import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, render } from "@testing-library/react"
import { TRIP_CHANGE_OPERATION, type TripChange } from "@/lib/dtos/trip-change"

const { mockRefresh, mockUseTripChanges, mockGetChangesPollUrl, pathnameState } = vi.hoisted(
  () => ({
    mockRefresh: vi.fn(),
    mockUseTripChanges: vi.fn(),
    mockGetChangesPollUrl: vi.fn(),
    pathnameState: { current: "" },
  }),
)

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
  usePathname: () => pathnameState.current,
}))
vi.mock("@/hooks/use-trip-changes", () => ({ useTripChanges: mockUseTripChanges }))
vi.mock("@/lib/live/actions", () => ({ getChangesPollUrl: mockGetChangesPollUrl }))

import {
  TripChangesListener,
  TRIP_CHANGES_REFRESH_DEBOUNCE_MS,
  TRIP_CHANGES_MIN_REFRESH_INTERVAL_MS,
} from "../trip-changes-listener"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const CREW_PAGE = `/trips/${TRIP_ID}/crew`
const ITEMS_PAGE = `/trips/${TRIP_ID}/items`

function change(table: string): TripChange {
  return { t: table, id: "x", op: TRIP_CHANGE_OPERATION.UPDATE }
}

function renderListener(pathname = CREW_PAGE, initialRev: number | null = 7) {
  pathnameState.current = pathname
  const view = render(<TripChangesListener tripId={TRIP_ID} initialRev={initialRev} />)
  const latest = () => mockUseTripChanges.mock.calls.at(-1)![1]
  return {
    ...view,
    onChange: (changes: TripChange[]) => latest().onChange(changes) as void,
    mintUrl: () => latest().mintUrl() as Promise<unknown>,
  }
}

function elapse(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
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
    expect(container.textContent).toBe("")
    expect(container.querySelector("[hidden]")).not.toBeNull()
  })

  it("exposes the poll status, so a test can wait for it to be live", () => {
    mockUseTripChanges.mockReturnValue({ status: "live" })
    const { container } = renderListener()
    expect(container.querySelector("[data-trip-changes-status]")).toHaveAttribute(
      "data-trip-changes-status",
      "live",
    )
  })

  it("polls for its own trip, from the revision the page was rendered at", () => {
    renderListener(CREW_PAGE, 7)
    expect(mockUseTripChanges.mock.calls[0][0]).toBe(TRIP_ID)
    expect(mockUseTripChanges.mock.calls[0][1].initialRev).toBe(7)
  })

  it("mints its poll url through the changes ticket action", async () => {
    mockGetChangesPollUrl.mockResolvedValue("http://sse/changes?ticket=a")
    const { mintUrl } = renderListener()
    await expect(mintUrl()).resolves.toBe("http://sse/changes?ticket=a")
    expect(mockGetChangesPollUrl).toHaveBeenCalledWith(TRIP_ID)
  })

  it("refreshes once the debounce window has passed", () => {
    const { onChange } = renderListener()
    act(() => onChange([change("invitation")]))
    expect(mockRefresh).not.toHaveBeenCalled()
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("refreshes for a change of unknown extent, whatever page this is", () => {
    const { onChange } = renderListener(ITEMS_PAGE)
    act(() => onChange([]))
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("does not refresh for a change this page cannot show", () => {
    const { onChange } = renderListener(CREW_PAGE)
    act(() => onChange([change("point"), change("day")]))
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS * 2)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("judges a change by the page the viewer is on now, not the one it mounted on", () => {
    const { onChange, rerender } = renderListener(CREW_PAGE)
    pathnameState.current = ITEMS_PAGE
    rerender(<TripChangesListener tripId={TRIP_ID} initialRev={7} />)

    act(() => onChange([change("trip_requirement")]))
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("turns a burst of changes into a single refresh", () => {
    const { onChange } = renderListener()
    act(() => {
      onChange([change("invitation")])
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS - 50)
      onChange([change("invitation")])
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS - 50)
      onChange([change("invitation")])
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("is not held up by changes it ignores", () => {
    const { onChange } = renderListener()
    act(() => {
      onChange([change("invitation")])
      vi.advanceTimersByTime(TRIP_CHANGES_REFRESH_DEBOUNCE_MS - 50)
      onChange([change("point")])
      vi.advanceTimersByTime(50)
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("holds a second refresh back until the minimum interval since the last one has passed", () => {
    const { onChange } = renderListener()
    act(() => onChange([change("invitation")]))
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    act(() => onChange([change("invitation")]))
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    elapse(TRIP_CHANGES_MIN_REFRESH_INTERVAL_MS - TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it("answers a change at the debounce once the page has been quiet for the interval", () => {
    const { onChange } = renderListener()
    act(() => onChange([change("invitation")]))
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    elapse(TRIP_CHANGES_MIN_REFRESH_INTERVAL_MS)

    act(() => onChange([change("invitation")]))
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it("turns every change made while it waits into one refresh when the wait ends", () => {
    const { onChange } = renderListener()
    act(() => onChange([change("invitation")]))
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS)

    for (let i = 0; i < 5; i++) {
      act(() => onChange([change("invitation")]))
      elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS * 4)
    }
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    elapse(TRIP_CHANGES_MIN_REFRESH_INTERVAL_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it("does not refresh after unmounting", () => {
    const { onChange, unmount } = renderListener()
    act(() => onChange([change("invitation")]))
    unmount()
    elapse(TRIP_CHANGES_REFRESH_DEBOUNCE_MS * 2)
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
