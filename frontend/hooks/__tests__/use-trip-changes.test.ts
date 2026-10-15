import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useTripChanges } from "../use-trip-changes"
import { TRIP_CHANGE_OPERATION, type TripChange } from "@/lib/dtos/trip-change"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const OTHER_TRIP_ID = "01952f1a-0000-7000-8000-000000000002"
const POLL_URL = "http://sse/api/v1/live/trip/t/changes?ticket=a"
// The poller's first poll lands within a second of starting; a poll interval is a few seconds
// more. Either is well inside this.
const FIRST_POLL_WINDOW_MS = 1100
const POLL_INTERVAL_WINDOW_MS = 9000

const POINT_CHANGE: TripChange = { t: "point", id: "p1", op: TRIP_CHANGE_OPERATION.UPDATE }

let visibility: DocumentVisibilityState = "visible"
const fetchMock = vi.fn()

function reply(page: { rev: number; changes?: TripChange[]; truncated?: boolean }) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ changes: [], truncated: false, ...page }),
  }
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  document.dispatchEvent(new Event("visibilitychange"))
}

type HookProps = {
  tripId: string | null
  initialRev: number | null
  onChange: (changes: TripChange[]) => void
}

function render(options: Partial<HookProps> = {}) {
  const mintUrl = vi.fn().mockResolvedValue(POLL_URL)
  const onChange = options.onChange ?? vi.fn()
  const hook = renderHook(
    ({ tripId, initialRev, onChange: current }: HookProps) =>
      useTripChanges(tripId, { mintUrl, onChange: current, initialRev }),
    {
      initialProps: {
        tripId: options.tripId === undefined ? TRIP_ID : options.tripId,
        initialRev: options.initialRev === undefined ? 5 : options.initialRev,
        onChange,
      },
    },
  )
  return { ...hook, mintUrl, onChange }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = "visible"
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility })
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => reply({ rev: 5 }))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("useTripChanges", () => {
  it("polls nothing without a trip id", async () => {
    const { mintUrl } = render({ tripId: null })

    await advance(POLL_INTERVAL_WINDOW_MS)

    expect(mintUrl).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("starts from the revision the page was rendered at", async () => {
    render({ initialRev: 12 })

    await advance(FIRST_POLL_WINDOW_MS)

    expect(fetchMock.mock.calls[0][0]).toBe(`${POLL_URL}&since=12`)
  })

  it("starts from a baseline when the page was rendered without a revision", async () => {
    render({ initialRev: null })

    await advance(FIRST_POLL_WINDOW_MS)

    expect(fetchMock.mock.calls[0][0]).toBe(POLL_URL)
  })

  it("reports the status: connecting until the first answer, then live", async () => {
    const { result } = render()
    expect(result.current.status).toBe("connecting")

    await advance(FIRST_POLL_WINDOW_MS)

    expect(result.current.status).toBe("live")
  })

  it("reports what changed", async () => {
    fetchMock.mockImplementation(async () => reply({ rev: 6, changes: [POINT_CHANGE] }))
    const { onChange } = render()

    await advance(FIRST_POLL_WINDOW_MS)

    expect(onChange).toHaveBeenCalledWith([POINT_CHANGE])
  })

  it("keeps the same poll going, and uses the newest callback, when the caller passes a new one", async () => {
    const first = vi.fn()
    const second = vi.fn()
    let revision = 5
    fetchMock.mockImplementation(async () => {
      revision += 1
      return reply({ rev: revision, changes: [POINT_CHANGE] })
    })
    const { rerender, mintUrl } = render({ onChange: first })
    await advance(FIRST_POLL_WINDOW_MS)
    expect(first).toHaveBeenCalledTimes(1)

    rerender({ tripId: TRIP_ID, initialRev: 5, onChange: second })
    await advance(POLL_INTERVAL_WINDOW_MS)

    expect(mintUrl).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalled()
    expect(first).toHaveBeenCalledTimes(1)
  })

  it("does not poll while the tab is hidden, and catches up the moment it is shown", async () => {
    visibility = "hidden"
    fetchMock.mockImplementation(async () => reply({ rev: 6, changes: [POINT_CHANGE] }))
    const { onChange } = render()

    await advance(POLL_INTERVAL_WINDOW_MS * 3)
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => setVisibility("visible"))
    await advance(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([POINT_CHANGE])
  })

  it("stops polling when the tab is hidden", async () => {
    render()
    await advance(FIRST_POLL_WINDOW_MS)
    const polls = fetchMock.mock.calls.length

    act(() => setVisibility("hidden"))
    await advance(POLL_INTERVAL_WINDOW_MS * 3)

    expect(fetchMock.mock.calls.length).toBe(polls)
  })

  it("stops polling on unmount", async () => {
    const { unmount } = render()
    await advance(FIRST_POLL_WINDOW_MS)
    const polls = fetchMock.mock.calls.length

    unmount()
    await advance(POLL_INTERVAL_WINDOW_MS * 3)

    expect(fetchMock.mock.calls.length).toBe(polls)
  })

  it("stops listening for visibility on unmount", async () => {
    const { unmount } = render()
    await advance(FIRST_POLL_WINDOW_MS)
    unmount()
    const polls = fetchMock.mock.calls.length

    act(() => setVisibility("hidden"))
    act(() => setVisibility("visible"))
    await advance(0)

    expect(fetchMock.mock.calls.length).toBe(polls)
  })

  it("starts over, with a ticket of its own, for a different trip", async () => {
    const { rerender, mintUrl } = render()
    await advance(FIRST_POLL_WINDOW_MS)

    rerender({ tripId: OTHER_TRIP_ID, initialRev: 1, onChange: vi.fn() })
    await advance(FIRST_POLL_WINDOW_MS)

    expect(mintUrl).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`${POLL_URL}&since=1`)
  })
})
