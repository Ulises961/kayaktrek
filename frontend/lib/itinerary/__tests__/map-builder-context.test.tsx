import { describe, it, expect } from "vitest"
import { renderHook } from "@testing-library/react"
import { createElement } from "react"
import { MapBuilderContext, useMapBuilder } from "../map-builder-context"
import type { MapBuilderContextValue } from "../map-builder-context"
import type { MapState } from "../map-reducer"

const ITIN_ID = "01952f1a-0000-7000-8000-000000000001"

const BASE_STATE: MapState = {
  points: [],
  pointOrder: [],
  pendingPointId: null,
  pendingPointName: null,
  savingCount: 0,
  days: [],
}

const MOCK_CTX: MapBuilderContextValue = {
  state: BASE_STATE,
  dispatch: () => {},
  draftSlices: null,
  setDraftSlices: () => {},
  tripId: null,
  itineraryId: ITIN_ID,
  distanceUnit: "nm",
  setDistanceUnit: () => {},
  avgSpeedKnots: 2.5,
  setAvgSpeedKnots: () => {},
  activePointId: null,
  setActivePointId: () => {},
  day0Id: null,
  viewMode: true,
  setViewMode: () => {},
  selectedDayId: null,
  setSelectedDayId: () => {},
  selectedPointId: null,
  setSelectedPointId: () => {},
  tripState: null,
  isLeader: true,
}

describe("useMapBuilder", () => {
  it("throws when called outside MapBuilderContext.Provider", () => {
    expect(() => renderHook(() => useMapBuilder())).toThrow(
      "useMapBuilder must be used inside MapBuilder",
    )
  })

  it("returns the context value when inside the provider", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(MapBuilderContext.Provider, { value: MOCK_CTX }, children)

    const { result } = renderHook(() => useMapBuilder(), { wrapper })
    expect(result.current.itineraryId).toBe(ITIN_ID)
    expect(result.current.avgSpeedKnots).toBe(2.5)
    expect(result.current.distanceUnit).toBe("nm")
    expect(result.current.tripId).toBeNull()
  })

  it("provides draftSlices as null initially", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(MapBuilderContext.Provider, { value: MOCK_CTX }, children)

    const { result } = renderHook(() => useMapBuilder(), { wrapper })
    expect(result.current.draftSlices).toBeNull()
  })

  it("exposes activePointId and day0Id from context", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(MapBuilderContext.Provider, { value: MOCK_CTX }, children)

    const { result } = renderHook(() => useMapBuilder(), { wrapper })
    expect(result.current.activePointId).toBeNull()
    expect(result.current.day0Id).toBeNull()
  })
})
