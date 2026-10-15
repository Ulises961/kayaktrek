import { renderHook } from "@testing-library/react-native"
import { TRIP_CHANGE_OPERATION, type TripChange } from "@shared/dtos/trip-change"

import { useTripChanges } from "../use-trip-changes"
import type { TripChangeListener } from "../trip-changes-hub"

const mockUnsubscribe = jest.fn()
let capturedListener: TripChangeListener | null = null
const mockSubscribe = jest.fn((_tripId: string, listener: TripChangeListener) => {
  capturedListener = listener
  return mockUnsubscribe
})

jest.mock("../trip-changes", () => ({
  tripChangesHub: { subscribe: (tripId: string, listener: TripChangeListener) => mockSubscribe(tripId, listener) },
}))

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

function change(table: string): TripChange {
  return { t: table, id: "x", op: TRIP_CHANGE_OPERATION.UPDATE }
}

describe("useTripChanges", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    capturedListener = null
  })

  // This version of RNTL renders asynchronously: renderHook, rerender and unmount all
  // return promises, and a sync call here leaves the effect that subscribes unrun.
  it("subscribes for its trip and unsubscribes on unmount", async () => {
    const { unmount } = await renderHook(() => useTripChanges(TRIP_ID, jest.fn()))
    expect(mockSubscribe).toHaveBeenCalledWith(TRIP_ID, expect.any(Function))
    await unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it("calls back on any change when no tables are given", async () => {
    const onChange = jest.fn()
    await renderHook(() => useTripChanges(TRIP_ID, onChange))
    capturedListener?.([change("trip_member")])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("calls back only for the tables it was asked about", async () => {
    const onChange = jest.fn()
    await renderHook(() => useTripChanges(TRIP_ID, onChange, { tables: ["point", "day"] }))

    capturedListener?.([change("trip_requirement")])
    expect(onChange).not.toHaveBeenCalled()

    capturedListener?.([change("trip_requirement"), change("point")])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("always calls back when the delta is unknown, whatever tables it was asked about", async () => {
    const onChange = jest.fn()
    await renderHook(() => useTripChanges(TRIP_ID, onChange, { tables: ["point"] }))
    capturedListener?.([])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("calls the latest callback without resubscribing", async () => {
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = await renderHook(
      ({ onChange }: { onChange: () => void }) => useTripChanges(TRIP_ID, onChange),
      { initialProps: { onChange: first } },
    )
    await rerender({ onChange: second })
    capturedListener?.([change("point")])

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(mockSubscribe).toHaveBeenCalledTimes(1)
  })

  it("does nothing without a trip id", async () => {
    await renderHook(() => useTripChanges(undefined, jest.fn()))
    expect(mockSubscribe).not.toHaveBeenCalled()
  })
})
