import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, useCallback, useState } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import { mapReducer, type MapState } from "@/lib/itinerary/map-reducer"
import {
  initDraftBoundaries,
  appendDraftBoundary,
  removeDraftBoundary,
  resolveDraft,
} from "@/lib/itinerary/boundaries"
import type { DraftBoundary } from "@/lib/itinerary/boundaries"
import type { Point } from "@/lib/dtos/point"
import { haversineNm, legLabel } from "@/lib/itinerary/distance"
import type { Day } from "@/lib/dtos/day"

vi.mock("@/lib/itinerary/actions", () => ({
  createDay: vi.fn().mockResolvedValue({
    success: true,
    day: { id: "new-day", dayNumber: 1, itineraryId: "itin" },
  }),
  deleteDay: vi.fn().mockResolvedValue({ success: true }),
  updateDay: vi.fn().mockResolvedValue({ success: true }),
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
  deletePoint: vi.fn().mockResolvedValue({ success: true }),
  applyBoundaries: vi
    .fn()
    .mockResolvedValue({ success: true, itinerary: { id: "itin-1", days: [] } }),
}))

vi.mock("@/lib/trips/actions", () => ({ updateTrip: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { PointListPane } from "../point-list-pane"
import * as actions from "@/lib/itinerary/actions"

const DAY0_ID = "day-0"
const DAY1_ID = "day-1"
const DAY2_ID = "day-2"
const DAY3_ID = "day-3"
const ITIN_ID = "itin-1"
const POINT_ORDER = ["p1", "p2", "p3"]

const pt = (id: string, dayId = DAY0_ID): Point => ({
  id,
  type: "position",
  latitude: 44,
  longitude: 14,
  dayId,
})

const day = (id: string, dayNumber: number, extra: Partial<Day> = {}): Day => ({
  id,
  dayNumber,
  itineraryId: ITIN_ID,
  ...extra,
})

// Builds a DraftBoundary[] fixture from index-anchored (dayId/dayNumber/endIdx/date)
// entries — the last entry's endPointId is always null since resolveDraft's tail
// rule ignores it regardless of what's stored.
function draftFromEndIndices(
  entries: { dayId: string; dayNumber: number; endIdx: number; date: string | null }[],
  pointOrder: string[],
): DraftBoundary[] {
  return entries.map((e, i) => ({
    dayId: e.dayId,
    dayNumber: e.dayNumber,
    endPointId: i === entries.length - 1 ? null : (pointOrder[e.endIdx] ?? null),
    date: e.date,
  }))
}

function makeCtx(overrides: Partial<MapBuilderContextValue> = {}): MapBuilderContextValue {
  const state: MapState = {
    points: [pt("p1"), pt("p2"), pt("p3")],
    pointOrder: POINT_ORDER,
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [],
    ...overrides.state,
  }
  return {
    state,
    dispatch: vi.fn(),
    draft: null,
    setDraft: vi.fn(),
    removedRealDayIds: [],
    setRemovedRealDayIds: vi.fn(),
    tripId: null,
    tripName: "Test Trip",
    tripDateFrom: null,
    tripDateTo: null,
    itineraryId: ITIN_ID,
    distanceUnit: "nm",
    setDistanceUnit: vi.fn(),
    avgSpeedKnots: 2.5,
    setAvgSpeedKnots: vi.fn(),
    day0Id: DAY0_ID,
    resolveDay0Id: vi.fn(async () => DAY0_ID),
    viewMode: false,
    setViewMode: vi.fn(),
    selectedDayId: null,
    setSelectedDayId: vi.fn(),
    tripState: null,
    isLeader: true,
    selectedPointId: null,
    setSelectedPointId: vi.fn(),
    selectedHour: 12,
    setSelectedHour: vi.fn(),
    conditionsVersion: 0,
    bumpConditions: vi.fn(),
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(
    createElement(MapBuilderContext.Provider, { value: ctx }, createElement(PointListPane)),
  )
}

// ─── stateful harness ─────────────────────────────────────────────────────────
//
// renderWithCtx above freezes the context, which is enough to check a handler's
// pure output (e.g. "setDraft was called with X"). The tests that need to watch
// a user-visible *consequence* unfold across a gesture — a button's disabled
// attribute flipping, a divider migrating, a day count reverting after Discard —
// need the actual round trip: gesture → real state update → re-render. This
// wires draft/removedRealDayIds/state to real React state via mapReducer, so
// PointListPane behaves exactly as it would mounted under MapBuilder.
function StatefulPane({ initial = {} }: { initial?: Partial<MapBuilderContextValue> }) {
  const [state, setState] = useState<MapState>(
    initial.state ?? {
      points: [pt("p1"), pt("p2"), pt("p3")],
      pointOrder: POINT_ORDER,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [],
    },
  )
  const [draft, setDraft] = useState<DraftBoundary[] | null>(initial.draft ?? null)
  const [removedRealDayIds, setRemovedRealDayIds] = useState<string[]>(
    initial.removedRealDayIds ?? [],
  )
  const dispatch = useCallback(
    (action: Parameters<typeof mapReducer>[1]) => setState((s) => mapReducer(s, action)),
    [],
  )
  const ctx = makeCtx({
    ...initial,
    state,
    dispatch,
    draft,
    setDraft,
    removedRealDayIds,
    setRemovedRealDayIds,
  })
  return createElement(MapBuilderContext.Provider, { value: ctx }, createElement(PointListPane))
}

function renderStateful(initial: Partial<MapBuilderContextValue> = {}) {
  return render(createElement(StatefulPane, { initial }))
}

beforeEach(() => vi.clearAllMocks())

// ─── no active draft ──────────────────────────────────────────────────────────

describe("PointListPane — no active draft", () => {
  it("renders a row for each point in pointOrder", () => {
    renderWithCtx(makeCtx())
    expect(screen.getAllByTestId("point-row")).toHaveLength(3)
  })

  it("shows a Saved status after blur-saving the expanded row's name", async () => {
    const ctx = makeCtx({ selectedPointId: "p1" })
    renderWithCtx(ctx)
    const nameInput = screen.getByPlaceholderText("Point name")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { name: "New name" })
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
  })

  it("does not dispatch POINT_UPDATE or show Saved for a name edit when updatePoint fails", async () => {
    vi.mocked(actions.updatePoint).mockResolvedValueOnce({ success: false, error: "nope" })
    const dispatch = vi.fn()
    const ctx = makeCtx({ selectedPointId: "p1", dispatch })
    renderWithCtx(ctx)
    const nameInput = screen.getByPlaceholderText("Point name")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { name: "New name" })
    expect(screen.queryByText(/^saved$/i)).not.toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "POINT_UPDATE", id: "p1", fields: { name: "New name" } }),
    )
  })

  it("does not dispatch POINT_UPDATE for a type chip click when updatePoint fails", async () => {
    vi.mocked(actions.updatePoint).mockResolvedValueOnce({ success: false, error: "nope" })
    const dispatch = vi.fn()
    const ctx = makeCtx({ selectedPointId: "p1", dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }))
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { type: "stop" })
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "POINT_UPDATE", id: "p1", fields: { type: "stop" } }),
    )
  })

  it("renders Save days and Discard, both disabled, when there is no active draft", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByRole("button", { name: /save days/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled()
  })

  it("auto-expands the pending point row", () => {
    const ctx = makeCtx({
      state: {
        points: [pt("p1"), pt("p2"), pt("p3")],
        pointOrder: POINT_ORDER,
        pendingPointId: "p2",
        pendingPointName: null,
        savingCount: 0,
        days: [],
      },
    })
    renderWithCtx(ctx)
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument()
  })
})

// ─── point edits always live-save ────────────────────────────────────────────

describe("PointListPane — point edits always live-save", () => {
  it("saves a name edit immediately even while a boundary draft is active, and does not touch the draft", async () => {
    const setDraft = vi.fn()
    const draft: DraftBoundary[] = [{ dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null }]
    const ctx = makeCtx({ draft, setDraft, selectedPointId: "p1" })
    renderWithCtx(ctx)
    const nameInput = screen.getByPlaceholderText("Point name")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { name: "New name" })
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
    // A name save never routes through the draft — it has nothing to do with
    // day structure, so the draft the user is mid-edit on must survive untouched.
    expect(setDraft).not.toHaveBeenCalled()
  })

  it("dispatches POINT_UPDATE and calls updatePoint immediately on a type chip click, even with an active draft, and does not touch the draft", async () => {
    const dispatch = vi.fn()
    const setDraft = vi.fn()
    const draft: DraftBoundary[] = [{ dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null }]
    const ctx = makeCtx({ draft, setDraft, selectedPointId: "p1", dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "POINT_UPDATE", id: "p1", fields: { type: "stop" } }),
    )
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { type: "stop" })
    expect(setDraft).not.toHaveBeenCalled()
  })

  it("deleting a non-anchor point during an active draft saves live and leaves the draft's boundaries unchanged", async () => {
    const setDraft = vi.fn()
    const draft: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: "p2", date: null },
      { dayId: DAY2_ID, dayNumber: 2, endPointId: null, date: null },
    ]
    const ctx = makeCtx({ draft, setDraft, selectedPointId: "p3" })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /delete point/i }))
    expect(actions.deletePoint).toHaveBeenCalledWith("p3")
    // p3 is neither boundary's endPointId — handleDelete's re-anchor patch is
    // still applied (it always runs while a draft is active), but a point that
    // isn't an anchor produces a draft deep-equal to the original.
    expect(setDraft).toHaveBeenCalledWith(draft)
  })
})

// ─── boundaries are always interactive ───────────────────────────────────────

describe("PointListPane — boundaries are always interactive", () => {
  const stateWithDays = {
    points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY2_ID)],
    pointOrder: POINT_ORDER,
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [
      day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p2" }),
      day(DAY2_ID, 2, { startPointId: "p2", endPointId: "p3" }),
    ],
  }

  it("shows Day 1 header when days exist and no draft is active", () => {
    renderWithCtx(makeCtx({ state: stateWithDays }))
    expect(screen.getByTestId("day-1-header")).toBeInTheDocument()
  })

  it("shows an interactive drag handle between days even without an active draft", () => {
    renderWithCtx(makeCtx({ state: stateWithDays }))
    expect(screen.getByTestId("boundary-drag-handle")).toBeInTheDocument()
    expect(screen.queryByTestId("boundary-label")).not.toBeInTheDocument()
  })

  it("shows the zero-day bootstrap row when there are no days", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByTestId("day-bootstrap-row")).toBeInTheDocument()
    expect(screen.queryByTestId("day-1-header")).not.toBeInTheDocument()
    expect(screen.queryByTestId("boundary-drag-handle")).not.toBeInTheDocument()
  })
})

// ─── Save/Discard availability ────────────────────────────────────────────────

describe("PointListPane — Save/Discard availability", () => {
  it("are disabled when there is no draft", () => {
    renderWithCtx(makeCtx({ draft: null }))
    expect(screen.getByRole("button", { name: /save days/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled()
  })

  it("are enabled once a draft exists", () => {
    const draft: DraftBoundary[] = [{ dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null }]
    renderWithCtx(makeCtx({ draft }))
    expect(screen.getByRole("button", { name: /save days/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeEnabled()
  })

  it("clicking Discard calls setDraft(null) and resets removedRealDayIds", async () => {
    const setDraft = vi.fn()
    const setRemovedRealDayIds = vi.fn()
    const draft: DraftBoundary[] = [{ dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null }]
    renderWithCtx(makeCtx({ draft, setDraft, setRemovedRealDayIds, removedRealDayIds: [DAY2_ID] }))
    await userEvent.click(screen.getByRole("button", { name: /discard/i }))
    expect(setDraft).toHaveBeenCalledWith(null)
    expect(setRemovedRealDayIds).toHaveBeenCalledWith([])
  })

  it("clicking Save days dispatches BOUNDARIES_APPLY optimistically then calls applyBoundaries", async () => {
    const setDraft = vi.fn()
    const dispatch = vi.fn()
    const draft: DraftBoundary[] = [{ dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null }]
    renderWithCtx(makeCtx({ draft, setDraft, dispatch }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "BOUNDARIES_APPLY" }))
    expect(actions.applyBoundaries).toHaveBeenCalledWith(ITIN_ID, expect.any(Object))
    expect(setDraft).toHaveBeenCalledWith(null)
  })

  it("on success dispatches STATE_REPLACE with server state", async () => {
    const dispatch = vi.fn()
    const draft: DraftBoundary[] = [{ dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null }]
    renderWithCtx(makeCtx({ draft, dispatch }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "STATE_REPLACE" }))
  })

  // The clinching M14 regression guard: the pre-M14 baseline had a test that
  // drove this exact branch and asserted only the STATE_REPLACE rollback — it
  // never asserted that the Day rows created moments earlier in the same
  // attempt were deleted, so a real orphan-leak bug lived inside a line
  // coverage reported as green. This test asserts both together, for BOTH
  // days created in a two-day draft (not just the last one), plus the call
  // ordering that makes "compensation, not just rollback" actually true.
  it("on failure rolls back to the snapshot AND deletes every day created earlier in this same save attempt (M12/M14 orphan-leak regression guard)", async () => {
    vi.mocked(actions.applyBoundaries).mockResolvedValueOnce({
      success: false,
      error: "Server error",
    })
    vi.mocked(actions.createDay)
      .mockResolvedValueOnce({
        success: true,
        day: { id: "new-day-a", dayNumber: 1, itineraryId: ITIN_ID },
      })
      .mockResolvedValueOnce({
        success: true,
        day: { id: "new-day-b", dayNumber: 2, itineraryId: ITIN_ID },
      })
    const draftWithTwoNewDays: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: "p2", date: null },
      { dayId: "draft-2", dayNumber: 2, endPointId: null, date: null },
    ]
    const dispatch = vi.fn()
    const ctx = makeCtx({ draft: draftWithTwoNewDays, dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))

    // Both draft-only days were created...
    expect(actions.createDay).toHaveBeenNthCalledWith(1, ITIN_ID, 1)
    expect(actions.createDay).toHaveBeenNthCalledWith(2, ITIN_ID, 2)
    // ...and BOTH get cleaned up now that the apply failed — not just the
    // last one, which is what the pre-M14 test's assertion would have missed.
    expect(actions.deleteDay).toHaveBeenCalledWith("new-day-a")
    expect(actions.deleteDay).toHaveBeenCalledWith("new-day-b")
    expect(vi.mocked(actions.deleteDay).mock.calls).toHaveLength(2)

    // Ordering: both creates happen before the apply; both compensating
    // deletes happen only after the apply has actually failed.
    const createOrders = vi.mocked(actions.createDay).mock.invocationCallOrder
    const applyOrder = vi.mocked(actions.applyBoundaries).mock.invocationCallOrder[0]
    const deleteOrders = vi.mocked(actions.deleteDay).mock.invocationCallOrder
    expect(Math.max(...createOrders)).toBeLessThan(applyOrder)
    expect(Math.min(...deleteOrders)).toBeGreaterThan(applyOrder)

    // And the optimistic points/days get rolled back to the pre-save snapshot.
    const stateReplaceCalls = dispatch.mock.calls
      .map((c) => c[0])
      .filter((a) => a.type === "STATE_REPLACE")
    expect(stateReplaceCalls).toHaveLength(1)
    expect(stateReplaceCalls[0].state).toMatchObject({
      points: ctx.state.points,
      pointOrder: ctx.state.pointOrder,
    })
  })
})

// ─── deferred day creation (draft-only days) ─────────────────────────────────

describe("PointListPane — the leg on an expanded row", () => {
  // Edit mode was the one mode that withheld the figure, and it is the mode where
  // you act on it: the waypoint→stop toggle lives on this row. The point summary
  // card that already showed it renders in View mode only.
  const placed = (id: string, latitude: number, type: Point["type"], dayId: string): Point => ({
    id,
    type,
    latitude,
    longitude: 14,
    dayId,
  })

  const legState = {
    points: [
      placed("p1", 43.0, "stop", DAY1_ID),
      placed("p2", 43.5, "position", DAY1_ID),
      placed("p3", 44.0, "stop", DAY1_ID),
    ],
    pointOrder: POINT_ORDER,
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p3" })],
  }

  it("shows the distance from the last stop on the expanded position", () => {
    renderWithCtx(makeCtx({ state: legState, selectedPointId: "p2" }))

    const expected = legLabel(
      haversineNm({ latitude: 43.0, longitude: 14 }, { latitude: 43.5, longitude: 14 }),
      2.5,
      "nm",
    )
    expect(screen.getByTestId("point-row-leg")).toHaveTextContent(expected)
  })

  it("shows nothing for the point that opens the route", () => {
    renderWithCtx(makeCtx({ state: legState, selectedPointId: "p1" }))
    expect(screen.queryByTestId("point-row-leg")).not.toBeInTheDocument()
  })
})

describe("PointListPane — an itinerary that arrived without its Day 0", () => {
  // BOUNDARIES_APPLY parks unassigned points back in Day 0, so a save needs one.
  // Reading day0Id and bailing when it was null made Save days a button that did
  // nothing at all on a clone of a hand-built route — no request, no message.
  const draft: DraftBoundary[] = [{ dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null }]

  it("provisions the staging day and applies the boundaries into it", async () => {
    const dispatch = vi.fn()
    const resolveDay0Id = vi.fn(async () => "healed-day-0")
    renderWithCtx(makeCtx({ draft, dispatch, day0Id: null, resolveDay0Id }))

    await userEvent.click(screen.getByRole("button", { name: /save days/i }))

    expect(resolveDay0Id).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "BOUNDARIES_APPLY", day0Id: "healed-day-0" }),
    )
    expect(actions.applyBoundaries).toHaveBeenCalledWith(ITIN_ID, expect.any(Object))
  })

  it("saves nothing when the staging day cannot be provisioned, and keeps the draft", async () => {
    const dispatch = vi.fn()
    const setDraft = vi.fn()
    const resolveDay0Id = vi.fn(async () => null)
    renderWithCtx(makeCtx({ draft, dispatch, setDraft, day0Id: null, resolveDay0Id }))

    await userEvent.click(screen.getByRole("button", { name: /save days/i }))

    expect(actions.applyBoundaries).not.toHaveBeenCalled()
    expect(actions.createDay).not.toHaveBeenCalled()
    // The user's unsaved boundary work survives — clearing it would lose the edit
    // as well as the save.
    expect(setDraft).not.toHaveBeenCalledWith(null)
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "BOUNDARIES_APPLY" }))
  })
})

describe("PointListPane — deferred day creation", () => {
  it("Save days creates a real Day for a draft-only day before applying boundaries", async () => {
    const draftWithNewDay: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: null, date: null },
    ]
    renderWithCtx(makeCtx({ draft: draftWithNewDay }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(actions.createDay).toHaveBeenCalledWith(ITIN_ID, 1)
    expect(actions.applyBoundaries).toHaveBeenCalledWith(
      ITIN_ID,
      expect.objectContaining({
        boundaries: expect.arrayContaining([expect.objectContaining({ dayId: "new-day" })]),
      }),
    )
  })

  it("resolves multiple draft-only days in order before applying boundaries", async () => {
    const draftWithTwoNewDays: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: "p2", date: null },
      { dayId: "draft-2", dayNumber: 2, endPointId: null, date: null },
    ]
    vi.mocked(actions.createDay)
      .mockResolvedValueOnce({
        success: true,
        day: { id: "day-a", dayNumber: 1, itineraryId: ITIN_ID },
      })
      .mockResolvedValueOnce({
        success: true,
        day: { id: "day-b", dayNumber: 2, itineraryId: ITIN_ID },
      })
    renderWithCtx(makeCtx({ draft: draftWithTwoNewDays }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(actions.createDay).toHaveBeenNthCalledWith(1, ITIN_ID, 1)
    expect(actions.createDay).toHaveBeenNthCalledWith(2, ITIN_ID, 2)
    expect(actions.applyBoundaries).toHaveBeenCalledWith(
      ITIN_ID,
      expect.objectContaining({
        boundaries: [
          expect.objectContaining({ dayId: "day-a" }),
          expect.objectContaining({ dayId: "day-b" }),
        ],
      }),
    )
  })

  it("does not call createDay for a draft whose day is already real", async () => {
    const draftAllReal: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null },
    ]
    renderWithCtx(makeCtx({ draft: draftAllReal }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(actions.createDay).not.toHaveBeenCalled()
  })

  it("rolls back earlier-created days and aborts the save if a later createDay fails", async () => {
    const draftWithTwoNewDays: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: "p2", date: null },
      { dayId: "draft-2", dayNumber: 2, endPointId: null, date: null },
    ]
    vi.mocked(actions.createDay)
      .mockResolvedValueOnce({
        success: true,
        day: { id: "day-a", dayNumber: 1, itineraryId: ITIN_ID },
      })
      .mockResolvedValueOnce({ success: false, error: "Server error" })
    renderWithCtx(makeCtx({ draft: draftWithTwoNewDays }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(actions.deleteDay).toHaveBeenCalledWith("day-a")
    expect(actions.applyBoundaries).not.toHaveBeenCalled()
  })

  it("Discard never calls createDay or deleteDay for a draft-only day", async () => {
    const draftWithNewDay: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: null, date: null },
    ]
    renderWithCtx(makeCtx({ draft: draftWithNewDay }))
    await userEvent.click(screen.getByRole("button", { name: /discard/i }))
    expect(actions.createDay).not.toHaveBeenCalled()
    expect(actions.deleteDay).not.toHaveBeenCalled()
  })

  it("deleting a draft-only day drops it from the draft locally without calling deleteDay or touching removedRealDayIds", async () => {
    const setDraft = vi.fn()
    const setRemovedRealDayIds = vi.fn()
    const draftWithNewDay: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: "p2", date: null },
      { dayId: "draft-2", dayNumber: 2, endPointId: null, date: null },
    ]
    renderWithCtx(
      makeCtx({
        draft: draftWithNewDay,
        setDraft,
        setRemovedRealDayIds,
        state: {
          points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", "draft-2")],
          pointOrder: POINT_ORDER,
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p2" })],
        },
      }),
    )
    await userEvent.click(screen.getByRole("button", { name: /delete day 2/i }))
    expect(actions.deleteDay).not.toHaveBeenCalled()
    expect(setRemovedRealDayIds).not.toHaveBeenCalled()
    expect(setDraft).toHaveBeenCalledWith(removeDraftBoundary(draftWithNewDay, "draft-2"))
  })
})

// ─── delete day via boundary divider (real days) ─────────────────────────────

describe("PointListPane — delete day via boundary divider", () => {
  const stateWithDays = {
    points: [pt("p1", DAY1_ID), pt("p2", DAY2_ID)],
    pointOrder: ["p1", "p2"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [
      day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p1" }),
      day(DAY2_ID, 2, { startPointId: "p1", endPointId: "p2" }),
    ],
  }

  it("does not show a delete button when there are no days", () => {
    renderWithCtx(makeCtx())
    expect(screen.queryByRole("button", { name: /delete day/i })).not.toBeInTheDocument()
  })

  it("shows a delete button on the interactive divider even without an active draft", () => {
    renderWithCtx(makeCtx({ state: stateWithDays }))
    expect(screen.getByRole("button", { name: /delete day 2/i })).toBeInTheDocument()
  })

  it("clicking a divider's delete button on a real day materializes the draft, drops it locally, and records it in removedRealDayIds — no immediate server call", async () => {
    const setDraft = vi.fn()
    const setRemovedRealDayIds = vi.fn()
    const dispatch = vi.fn()
    renderWithCtx(makeCtx({ dispatch, state: stateWithDays, setDraft, setRemovedRealDayIds }))
    await userEvent.click(screen.getByRole("button", { name: /delete day 2/i }))
    expect(actions.deleteDay).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "DAY_REMOVE" }))
    const materialized = initDraftBoundaries(stateWithDays.days, stateWithDays.pointOrder)
    expect(setDraft).toHaveBeenCalledWith(removeDraftBoundary(materialized, DAY2_ID))
    expect(setRemovedRealDayIds).toHaveBeenCalledWith([DAY2_ID])
  })
})

// ─── Day 1 header ─────────────────────────────────────────────────────────────

describe("PointListPane — Day 1 header when a draft is active", () => {
  it("shows a Day 1 section header", () => {
    const draft = draftFromEndIndices(
      [
        { dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-01" },
        { dayId: DAY2_ID, dayNumber: 2, endIdx: 2, date: null },
      ],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft }))
    expect(screen.getByTestId("day-1-header")).toBeInTheDocument()
  })

  it("shows Day 1 header with the date picker pre-filled from the draft", () => {
    const draft = draftFromEndIndices(
      [
        { dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-01" },
        { dayId: DAY2_ID, dayNumber: 2, endIdx: 2, date: null },
      ],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft }))
    expect(screen.getByText("1 Jul 2026")).toBeInTheDocument()
  })
})

// ─── boundary date minDate wiring ─────────────────────────────────────────────

describe("PointListPane — boundary divider date minDate", () => {
  it("constrains a day's date picker to the nearest earlier dated day", async () => {
    const draft = draftFromEndIndices(
      [
        { dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-15" },
        { dayId: DAY2_ID, dayNumber: 2, endIdx: 2, date: "2026-07-25" },
      ],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft }))
    await userEvent.click(screen.getByRole("button", { name: /25 Jul 2026/i }))
    expect(screen.getByText("5").closest("button")).toBeDisabled()
  })

  it("does not allow a day to share the previous dated day's own date", async () => {
    const draft = draftFromEndIndices(
      [
        { dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-15" },
        { dayId: DAY2_ID, dayNumber: 2, endIdx: 2, date: "2026-07-25" },
      ],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft }))
    await userEvent.click(screen.getByRole("button", { name: /25 Jul 2026/i }))
    expect(screen.getByText("15").closest("button")).toBeDisabled()
    expect(screen.getByText("16").closest("button")).not.toBeDisabled()
  })

  it("falls back to the trip's own dateFrom when no earlier day is dated yet", async () => {
    const draft = draftFromEndIndices(
      [
        { dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: null },
        { dayId: DAY2_ID, dayNumber: 2, endIdx: 2, date: "2026-07-25" },
      ],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft, tripDateFrom: "2026-07-20" }))
    await userEvent.click(screen.getByRole("button", { name: /25 Jul 2026/i }))
    expect(screen.getByText("15").closest("button")).toBeDisabled()
  })

  it("bounds every day's date picker by the trip's own dateTo", async () => {
    const draft = draftFromEndIndices(
      [
        { dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-15" },
        { dayId: DAY2_ID, dayNumber: 2, endIdx: 2, date: "2026-07-20" },
      ],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft, tripDateTo: "2026-07-22" }))
    await userEvent.click(screen.getByRole("button", { name: /20 Jul 2026/i }))
    expect(screen.getByText("23").closest("button")).toBeDisabled()
  })

  it("does not offer to extend the trip start when an earlier day is already dated", async () => {
    const draft = draftFromEndIndices(
      [
        { dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-15" },
        { dayId: DAY2_ID, dayNumber: 2, endIdx: 2, date: "2026-07-25" },
      ],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft, tripId: "trip-1", tripDateFrom: "2026-07-01" }))
    await userEvent.click(screen.getByRole("button", { name: /25 Jul 2026/i }))
    expect(screen.queryByText(/need an earlier date/i)).not.toBeInTheDocument()
  })

  it("offers to extend the trip end date from the boundary divider's picker", async () => {
    const draft = draftFromEndIndices(
      [
        { dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-15" },
        { dayId: DAY2_ID, dayNumber: 2, endIdx: 2, date: "2026-07-20" },
      ],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft, tripId: "trip-1", tripDateTo: "2026-07-22" }))
    await userEvent.click(screen.getByRole("button", { name: /20 Jul 2026/i }))
    expect(screen.getByText(/need a later date/i)).toBeInTheDocument()
  })
})

describe("PointListPane — Day 1 date picker trip bounds", () => {
  it("bounds Day 1's date picker by the trip's own dateFrom and dateTo", async () => {
    const draft = draftFromEndIndices(
      [{ dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-15" }],
      POINT_ORDER,
    )
    renderWithCtx(makeCtx({ draft, tripDateFrom: "2026-07-10", tripDateTo: "2026-07-20" }))
    await userEvent.click(screen.getByRole("button", { name: /15 Jul 2026/i }))
    expect(screen.getByText("5").closest("button")).toBeDisabled()
    expect(screen.getByText("25").closest("button")).toBeDisabled()
  })

  it("offers both extend directions on Day 1 when both trip bounds are set", async () => {
    const draft = draftFromEndIndices(
      [{ dayId: DAY1_ID, dayNumber: 1, endIdx: 1, date: "2026-07-15" }],
      POINT_ORDER,
    )
    renderWithCtx(
      makeCtx({ draft, tripId: "trip-1", tripDateFrom: "2026-07-10", tripDateTo: "2026-07-20" }),
    )
    await userEvent.click(screen.getByRole("button", { name: /15 Jul 2026/i }))
    expect(screen.getByText(/need an earlier date/i)).toBeInTheDocument()
    expect(screen.getByText(/need a later date/i)).toBeInTheDocument()
  })
})

// ─── add day (collapse-and-drag, M14) ────────────────────────────────────────

describe("PointListPane — Add day (collapse-and-drag)", () => {
  it("clicking Add day in the zero-day bootstrap materializes the draft and creates day 1", async () => {
    const setDraft = vi.fn()
    renderWithCtx(makeCtx({ setDraft }))
    await userEvent.click(screen.getByRole("button", { name: /^add day$/i }))
    expect(setDraft).toHaveBeenCalledWith(
      appendDraftBoundary(initDraftBoundaries([], POINT_ORDER), POINT_ORDER),
    )
  })

  it("clicking the Day 1 header's add button when exactly one day exists appends day 2, collapsing day 1", async () => {
    const setDraft = vi.fn()
    const draft: DraftBoundary[] = [{ dayId: DAY1_ID, dayNumber: 1, endPointId: null, date: null }]
    renderWithCtx(makeCtx({ draft, setDraft }))
    await userEvent.click(screen.getByRole("button", { name: /add day after day 1/i }))
    expect(setDraft).toHaveBeenCalledWith(appendDraftBoundary(draft, POINT_ORDER))
  })

  it("renders the add-day button on the last divider only when multiple days exist", () => {
    const state4pts = {
      points: [pt("p1"), pt("p2"), pt("p3"), pt("p4")],
      pointOrder: ["p1", "p2", "p3", "p4"],
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [],
    }
    const draft: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: "p2", date: null },
      { dayId: DAY2_ID, dayNumber: 2, endPointId: "p3", date: null },
      { dayId: DAY3_ID, dayNumber: 3, endPointId: null, date: null },
    ]
    renderWithCtx(makeCtx({ state: state4pts, draft }))
    expect(screen.getByRole("button", { name: /add day after day 3/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /add day after day 2/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /add day after day 1/i })).not.toBeInTheDocument()
  })

  it("clicking the add button on the last divider appends a new day after it", async () => {
    const setDraft = vi.fn()
    const draft: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: "p2", date: null },
      { dayId: DAY2_ID, dayNumber: 2, endPointId: null, date: null },
    ]
    renderWithCtx(makeCtx({ draft, setDraft }))
    await userEvent.click(screen.getByRole("button", { name: /add day after day 2/i }))
    expect(setDraft).toHaveBeenCalledWith(appendDraftBoundary(draft, POINT_ORDER))
  })
})

// ─── materializing the draft (M14 §5 item 1) ─────────────────────────────────
//
// These use the stateful harness — the claim under test is a UI state
// transition (disabled → enabled), not just that a setter was invoked.

describe("PointListPane — materializing the draft on first gesture", () => {
  it("a date-change gesture on the Day 1 header materializes the draft and flips Save/Discard from disabled to enabled", async () => {
    const state: MapState = {
      points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY1_ID)],
      pointOrder: POINT_ORDER,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p3" })],
    }
    renderStateful({ state })
    expect(screen.getByRole("button", { name: /save days/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: /add date/i }))
    await userEvent.click(screen.getByText("20"))

    expect(screen.getByRole("button", { name: /save days/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeEnabled()
  })

  it("clicking Add day in the zero-day bootstrap flips Save/Discard from disabled to enabled", async () => {
    renderStateful()
    expect(screen.getByRole("button", { name: /save days/i })).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: /^add day$/i }))

    expect(screen.getByRole("button", { name: /save days/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeEnabled()
  })

  it("releasing a boundary-drag gesture (pointerdown → pointerup) materializes the draft and flips Save/Discard from disabled to enabled", async () => {
    const state: MapState = {
      points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY2_ID)],
      pointOrder: POINT_ORDER,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [
        day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p2" }),
        day(DAY2_ID, 2, { startPointId: "p2", endPointId: "p3" }),
      ],
    }
    renderStateful({ state })
    expect(screen.getByRole("button", { name: /save days/i })).toBeDisabled()

    // No pointermove: jsdom's polyfilled hasPointerCapture always reports
    // false (vitest.setup.ts), so the drag never repositions in tests — but
    // pointerup still fires the release handler with the unmoved anchor,
    // which is exactly the "first touch" this test is about.
    const grip = screen.getByTestId("boundary-grip")
    fireEvent.pointerDown(grip, { pointerId: 1, clientY: 0 })
    fireEvent.pointerUp(grip, { pointerId: 1 })

    expect(screen.getByRole("button", { name: /save days/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeEnabled()
  })
})

// ─── plus-button migration after Add day (M14 §5 item 2) ────────────────────

describe("PointListPane — plus-button migration after Add day", () => {
  it("after Add day, the plus button migrates to the new last handle and disappears from the previous holder", async () => {
    const state4pts: MapState = {
      points: [pt("p1"), pt("p2"), pt("p3"), pt("p4")],
      pointOrder: ["p1", "p2", "p3", "p4"],
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [],
    }
    const draft: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: "p2", date: null },
      { dayId: DAY2_ID, dayNumber: 2, endPointId: null, date: null },
    ]
    renderStateful({ state: state4pts, draft })
    expect(screen.getByRole("button", { name: /add day after day 2/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /add day after day 2/i }))

    expect(screen.queryByRole("button", { name: /add day after day 2/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /add day after day 3/i })).toBeInTheDocument()
  })
})

// ─── append/collapse semantics (M14 §5 item 3) ───────────────────────────────

describe("PointListPane — append/collapse semantics", () => {
  it("Add day collapses the old last day and gives the new day all its points — the two adjacent handles render back-to-back with no point rows between them", async () => {
    const state5: MapState = {
      points: [pt("pa"), pt("pb"), pt("pc"), pt("pd"), pt("pe")],
      pointOrder: ["pa", "pb", "pc", "pd", "pe"],
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [],
    }
    const draft: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: "pc", date: null },
      { dayId: DAY2_ID, dayNumber: 2, endPointId: "pe", date: null },
    ]
    renderStateful({ state: state5, draft })

    await userEvent.click(screen.getByRole("button", { name: /add day after day 2/i }))

    // Day 1 (unchanged) still owns pa..pc; the old day 2 (now zero-length,
    // anchored at pc) and the new day 3 (owning pc..pe) render as two
    // consecutive handles with no point row between them.
    const pane = screen.getByTestId("point-list-pane")
    const rows = Array.from(
      pane.querySelectorAll('[data-point-idx], [data-testid="boundary-drag-handle"]'),
    )
    const kinds = rows.map((el) => (el.hasAttribute("data-point-idx") ? "point" : "divider"))
    expect(kinds).toEqual(["point", "point", "point", "divider", "divider", "point", "point"])
  })
})

// ─── Save-only Day mutation ordering (M14 §5 item 4 — the core invariant) ────

describe("PointListPane — no server-side Day mutation before Save", () => {
  it("boundary edits, an Add day, and a real-day deletion during the draft never call createDay, deleteDay, or applyBoundaries", async () => {
    const state: MapState = {
      points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY2_ID)],
      pointOrder: POINT_ORDER,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [
        day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p2" }),
        day(DAY2_ID, 2, { startPointId: "p2", endPointId: "p3" }),
      ],
    }
    renderStateful({ state })

    // Date change (materializes the draft).
    await userEvent.click(
      within(screen.getByTestId("day-1-header")).getByRole("button", { name: /add date/i }),
    )
    await userEvent.click(screen.getByText("20"))

    // Add day (creates a draft-only day, collapses real day 2).
    await userEvent.click(screen.getByRole("button", { name: /add day after day 2/i }))

    // Delete the real day (day 2, now collapsed).
    await userEvent.click(screen.getByRole("button", { name: /delete day 2/i }))

    expect(actions.createDay).not.toHaveBeenCalled()
    expect(actions.deleteDay).not.toHaveBeenCalled()
    expect(actions.applyBoundaries).not.toHaveBeenCalled()
  })

  it("Save creates draft-only days before calling applyBoundaries, and deletes removed real days only after a successful apply", async () => {
    const draft: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: "p2", date: null },
      { dayId: DAY2_ID, dayNumber: 2, endPointId: null, date: null },
    ]
    renderWithCtx(makeCtx({ draft, removedRealDayIds: [DAY3_ID] }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))

    expect(actions.createDay).toHaveBeenCalled()
    expect(actions.applyBoundaries).toHaveBeenCalled()
    expect(actions.deleteDay).toHaveBeenCalledWith(DAY3_ID)

    const createOrder = vi.mocked(actions.createDay).mock.invocationCallOrder[0]
    const applyOrder = vi.mocked(actions.applyBoundaries).mock.invocationCallOrder[0]
    const deleteCallIdx = vi.mocked(actions.deleteDay).mock.calls.findIndex((c) => c[0] === DAY3_ID)
    const deleteOrder = vi.mocked(actions.deleteDay).mock.invocationCallOrder[deleteCallIdx]

    expect(createOrder).toBeLessThan(applyOrder)
    expect(applyOrder).toBeLessThan(deleteOrder)
  })
})

// ─── Discard invariants (M14 §5 item 5 — highest priority) ──────────────────

describe("PointListPane — Discard invariants", () => {
  it("Discard after boundary edits, an Add day, and a real-day deletion performs no server call, clears the draft, and restores the original day structure", async () => {
    const state: MapState = {
      points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY2_ID)],
      pointOrder: POINT_ORDER,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [
        day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p2" }),
        day(DAY2_ID, 2, { startPointId: "p2", endPointId: "p3" }),
      ],
    }
    renderStateful({ state })

    await userEvent.click(
      within(screen.getByTestId("day-1-header")).getByRole("button", { name: /add date/i }),
    )
    await userEvent.click(screen.getByText("20"))
    await userEvent.click(screen.getByRole("button", { name: /add day after day 2/i }))
    await userEvent.click(screen.getByRole("button", { name: /delete day 2/i }))

    await userEvent.click(screen.getByRole("button", { name: /discard/i }))

    expect(actions.createDay).not.toHaveBeenCalled()
    expect(actions.deleteDay).not.toHaveBeenCalled()
    expect(actions.applyBoundaries).not.toHaveBeenCalled()

    // The draft is gone.
    expect(screen.getByRole("button", { name: /save days/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled()

    // And removedRealDayIds is gone too: the original two-real-day structure
    // is back (one divider, day 2 still real and deletable/extendable).
    expect(screen.getAllByTestId("boundary-drag-handle")).toHaveLength(1)
    expect(screen.getByRole("button", { name: /delete day 2/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /add day after day 2/i })).toBeInTheDocument()
  })

  it("does not revert a point rename made while the draft was dirty — point edits save live and are not part of the draft", async () => {
    const state: MapState = {
      points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID)],
      pointOrder: ["p1", "p2"],
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p2" })],
    }
    renderStateful({ state, selectedPointId: "p1" })

    const nameInput = screen.getByPlaceholderText("Point name")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "Renamed camp")
    await userEvent.tab()
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()

    // Materialize and dirty the draft, then discard it.
    await userEvent.click(
      within(screen.getByTestId("day-1-header")).getByRole("button", { name: /add date/i }),
    )
    await userEvent.click(screen.getByText("20"))
    await userEvent.click(screen.getByRole("button", { name: /discard/i }))

    expect(screen.getByText("Renamed camp")).toBeInTheDocument()
  })
})

// ─── point-delete anchor patching (M14 §5 item 8) ────────────────────────────

describe("PointListPane — point-delete anchor patching", () => {
  const pts4: MapState = {
    points: [pt("pa"), pt("pb"), pt("pc"), pt("pd")],
    pointOrder: ["pa", "pb", "pc", "pd"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [],
  }

  it("deleting a point a draft boundary ends on re-anchors it to the predecessor, shrinking the day by one instead of collapsing it to zero length", async () => {
    const setDraft = vi.fn()
    const draft: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: "pa", date: null },
      { dayId: DAY2_ID, dayNumber: 2, endPointId: "pc", date: null },
      { dayId: DAY3_ID, dayNumber: 3, endPointId: null, date: null },
    ]
    renderWithCtx(makeCtx({ state: pts4, draft, setDraft, selectedPointId: "pc" }))
    await userEvent.click(screen.getByRole("button", { name: /delete point/i }))

    const expectedDraft = draft.map((b) => (b.endPointId === "pc" ? { ...b, endPointId: "pb" } : b))
    expect(setDraft).toHaveBeenCalledWith(expectedDraft)

    // Shrinks by one (day 2 still owns pb), not a collapse to zero-length.
    const resolved = resolveDraft(expectedDraft, ["pa", "pb", "pd"])
    expect(resolved[1]).toMatchObject({ startIdx: 0, endIdx: 1 })
  })

  it("deleting the first point (no predecessor) drops the boundary's anchor to null — the anchor-loss fallback then applies", async () => {
    const setDraft = vi.fn()
    const draft: DraftBoundary[] = [
      { dayId: DAY1_ID, dayNumber: 1, endPointId: "pa", date: null },
      { dayId: DAY2_ID, dayNumber: 2, endPointId: null, date: null },
    ]
    renderWithCtx(makeCtx({ state: pts4, draft, setDraft, selectedPointId: "pa" }))
    await userEvent.click(screen.getByRole("button", { name: /delete point/i }))

    const expectedDraft = draft.map((b) => (b.endPointId === "pa" ? { ...b, endPointId: null } : b))
    expect(setDraft).toHaveBeenCalledWith(expectedDraft)

    const resolved = resolveDraft(expectedDraft, ["pb", "pc", "pd"])
    expect(resolved[0]).toMatchObject({ startIdx: 0, endIdx: 0 })
  })
})
