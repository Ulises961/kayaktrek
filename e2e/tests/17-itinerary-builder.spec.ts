import { test, expect, type Page, type Locator } from "@playwright/test"
import { API_URL } from "../playwright.config"
import { LEADER } from "../fixtures/auth"
import { apiGetAccessToken, apiDeleteTrip } from "../fixtures/trips"
import {
  apiSeedEditableItinerary,
  apiGetItinerary,
  type EditablePointSpec,
} from "../fixtures/itinerary"

// M14 — flat itinerary-edit surface. Closes the gap flagged in
// plans/M14-flat-itinerary-edit.md §7: none of the other 16 specs in this
// directory has ever driven the itinerary builder's own editing UI (dragging
// a day boundary, saving/discarding a draft, dropping a point on the map).
// That surface is the actual product, and its M14 regressions (the implicit
// draft, ID-anchored boundaries, deferred day deletion, "add day" migrating
// to the last handle) were only ever caught by hand. These six tests drive
// it through a real browser against the real backend — see the plan's §7
// for the full rationale and the exact scenarios this covers.
//
// Requires the full docker-compose stack + a frontend dev server on :3002 —
// run via `e2e/run-live-stack.sh 17-itinerary-builder` from the repo root
// (M14 is frontend-only, so the shared backend containers need no rebuild).

// A 5-point, 2-day route: p0..p2 = day 1 (Launch → Turn), p2..p4 = day 2
// (Turn → Camp) — the shared boundary stop at index 2 belongs to both days,
// same "overnight stop" convention the builder itself uses. Seeded via
// apiSeedEditableItinerary, which builds it the same way a real Save would
// (real Point.next_id chain + one apply-boundaries call), not a synthetic
// shortcut the builder never actually produces.
const BUILDER_POINTS: EditablePointSpec[] = [
  { latitude: 44.0, longitude: 8.9, type: "stop", name: "Launch" },
  { latitude: 44.01, longitude: 8.91, type: "position" },
  { latitude: 44.02, longitude: 8.92, type: "stop", name: "Turn" },
  { latitude: 44.03, longitude: 8.93, type: "position" },
  { latitude: 44.04, longitude: 8.94, type: "stop", name: "Camp" },
]
const DAY_END_INDICES = [2, 4]

async function enterEdit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByTestId("point-list-pane")).toBeVisible()
}

async function gotoAndEnterEdit(page: Page, itineraryId: string): Promise<void> {
  await page.goto(`/itinerary/${itineraryId}`)
  await enterEdit(page)
}

// Boundary drag is a pointer-capture gesture (setPointerCapture on the grip,
// boundary-divider.tsx) — a Playwright dragTo doesn't reliably drive that, so
// this drives raw mouse events instead, moving in multiple steps so
// intermediate pointermove events actually fire (single jump start->end
// would deliver only one pointermove, which is enough to compute a target
// row, but stepping mirrors a real drag and exercises the auto-scroll path
// too).
async function dragBoundaryToRow(page: Page, grip: Locator, targetRowIdx: number): Promise<void> {
  const gripBox = await grip.boundingBox()
  const targetBox = await page.locator(`[data-point-idx="${targetRowIdx}"]`).boundingBox()
  if (!gripBox || !targetBox) throw new Error("dragBoundaryToRow: missing bounding box")

  const startX = gripBox.x + gripBox.width / 2
  const startY = gripBox.y + gripBox.height / 2
  const endY = targetBox.y + targetBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  const STEPS = 6
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(startX, startY + ((endY - startY) * i) / STEPS)
  }
  await page.mouse.up()
}

// The point row immediately before a boundary divider in DOM order is the
// row for its current endIdx (buildRenderList in point-list-pane.tsx emits
// dividers right after the point row they end on) — reading it back is a
// name-independent way to assert exactly where a boundary sits.
async function boundaryPrecedingPointIdx(handle: Locator): Promise<string | null> {
  return handle.evaluate((el) => el.previousElementSibling?.getAttribute("data-point-idx") ?? null)
}

test.describe("Itinerary builder — Edit mode (M14 flat draft surface)", () => {
  let leaderToken: string

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
  })

  test("dragging a boundary with no Edit-days ceremony enables Save/Discard", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Builder No Ceremony ${Date.now()}`,
      points: BUILDER_POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await gotoAndEnterEdit(page, seeded.itineraryId)

      // The flattened M14 model has no "Edit days" entry gesture at all —
      // the interactive dividers and the Save/Discard chip are already there.
      await expect(page.getByRole("button", { name: /edit days/i })).toHaveCount(0)

      const saveButton = page.getByRole("button", { name: "Save days" })
      const discardButton = page.getByRole("button", { name: "Discard" })
      await expect(saveButton).toBeDisabled()
      await expect(discardButton).toBeDisabled()

      const grip = page.getByTestId("boundary-grip")
      await expect(grip).toHaveCount(1)
      await dragBoundaryToRow(page, grip, 1)

      // This is the core M14 claim: disabled -> enabled, no appearance step.
      await expect(saveButton).toBeEnabled()
      await expect(discardButton).toBeEnabled()
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("saving a boundary drag persists across reload", async ({ page, request }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Builder Save Persist ${Date.now()}`,
      points: BUILDER_POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await gotoAndEnterEdit(page, seeded.itineraryId)

      const grip = page.getByTestId("boundary-grip")
      await dragBoundaryToRow(page, grip, 1)
      await expect(page.getByRole("button", { name: "Save days" })).toBeEnabled()

      await page.getByRole("button", { name: "Save days" }).click()

      // Poll the backend directly rather than reload-racing the Save click —
      // handleSaveDays can fire more than one sequential server action
      // (createDay*, then applyBoundaries), so there's no single POST whose
      // response reliably means "fully persisted" to wait on. This is also
      // the assertion no unit test (mocked server actions) can make: it
      // proves the batch apply actually landed against a real backend.
      const expectedEndPointId = seeded.pointIds[1]
      await expect
        .poll(
          async () => {
            const itinerary = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
            return itinerary.days.find((d) => d.dayNumber === 1)?.endPointId
          },
          { timeout: 20_000, message: "waiting for day 1's boundary to persist" },
        )
        .toBe(expectedEndPointId)

      await page.reload()
      await enterEdit(page)

      const handle = page.getByTestId("boundary-drag-handle")
      await expect(handle).toHaveCount(1)
      expect(await boundaryPrecedingPointIdx(handle)).toBe("1")
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("discard reverts boundary/day changes with no orphaned day server-side", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Builder Discard ${Date.now()}`,
      points: BUILDER_POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await gotoAndEnterEdit(page, seeded.itineraryId)

      const grip = page.getByTestId("boundary-grip")
      await dragBoundaryToRow(page, grip, 1)
      await expect(page.getByRole("button", { name: "Save days" })).toBeEnabled()

      await page.getByRole("button", { name: "Add day after day 2" }).click()
      await expect(page.getByTestId("boundary-drag-handle")).toHaveCount(2)

      await page.getByRole("button", { name: "Discard" }).click()
      await expect(page.getByRole("button", { name: "Save days" })).toBeDisabled()
      await expect(page.getByRole("button", { name: "Discard" })).toBeDisabled()

      // Nothing was ever sent to the server for this draft — no "Save" was
      // clicked. Confirm directly against the DB: this is the M12/M14
      // orphan-leak invariant (a day materialized client-side must never
      // exist server-side before a real Save) this test exists to guard.
      const afterDiscard = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
      expect(afterDiscard.days.filter((d) => d.dayNumber > 0)).toHaveLength(2)

      await page.reload()
      await enterEdit(page)

      const handle = page.getByTestId("boundary-drag-handle")
      await expect(handle).toHaveCount(1)
      expect(await boundaryPrecedingPointIdx(handle)).toBe("2")

      const afterReload = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
      expect(afterReload.days.filter((d) => d.dayNumber > 0)).toHaveLength(2)
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("add day from the last handle collapses the old day and round-trips through Save", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Builder Add Day ${Date.now()}`,
      points: BUILDER_POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await gotoAndEnterEdit(page, seeded.itineraryId)

      // With exactly 2 days there's exactly one divider, and it is trivially
      // the last one — it carries the plus.
      await expect(page.getByTestId("boundary-drag-handle")).toHaveCount(1)
      const addButton = page.getByRole("button", { name: "Add day after day 2" })
      await expect(addButton).toBeVisible()

      await addButton.click()

      const handles = page.getByTestId("boundary-drag-handle")
      await expect(handles).toHaveCount(2)
      // The new handle renders immediately below the one that created it —
      // no point rows in between (design decision 3b).
      const secondPrev = await handles
        .nth(1)
        .evaluate((el) => el.previousElementSibling?.getAttribute("data-testid"))
      expect(secondPrev).toBe("boundary-drag-handle")

      // The plus migrated to the new (now last) handle.
      await expect(page.getByRole("button", { name: "Add day after day 2" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Add day after day 3" })).toBeVisible()

      await page.getByRole("button", { name: "Save days" }).click()

      const [p0, p2, p4] = [seeded.pointIds[0], seeded.pointIds[2], seeded.pointIds[4]]
      await expect
        .poll(
          async () => {
            const itinerary = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
            return itinerary.days
              .filter((d) => d.dayNumber > 0)
              .sort((a, b) => a.dayNumber - b.dayNumber)
              .map((d) => ({ n: d.dayNumber, s: d.startPointId, e: d.endPointId }))
          },
          { timeout: 20_000, message: "waiting for the 3-day split to persist" },
        )
        .toEqual([
          { n: 1, s: p0, e: p2 },
          // Day 2 collapsed to zero length, anchored at the stop it shares
          // with day 1 — a start==end boundary item the backend accepts
          // without complaint (verified in the plan against apply_boundaries).
          { n: 2, s: p2, e: p2 },
          { n: 3, s: p2, e: p4 },
        ])

      await page.reload()
      await enterEdit(page)

      const handlesAfter = page.getByTestId("boundary-drag-handle")
      await expect(handlesAfter).toHaveCount(2)
      const secondPrevAfter = await handlesAfter
        .nth(1)
        .evaluate((el) => el.previousElementSibling?.getAttribute("data-testid"))
      expect(secondPrevAfter).toBe("boundary-drag-handle")
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("deleting a real day is deferred to Save — discard leaves it intact, Save actually removes it", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Builder Deferred Delete ${Date.now()}`,
      points: BUILDER_POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await gotoAndEnterEdit(page, seeded.itineraryId)

      await page.getByRole("button", { name: "Delete day 2" }).click()
      await expect(page.getByTestId("boundary-drag-handle")).toHaveCount(0)
      await expect(page.getByTestId("day-1-header")).toBeVisible()
      await expect(page.getByRole("button", { name: "Save days" })).toBeEnabled()

      // Not saved — reload, and the real day must still be there server-side
      // (proves deletion is genuinely deferred, not fired immediately).
      await page.reload()
      await enterEdit(page)
      await expect(page.getByTestId("boundary-drag-handle")).toHaveCount(1)

      const stillThere = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
      expect(stillThere.days.filter((d) => d.dayNumber > 0)).toHaveLength(2)

      // Repeat the same delete and actually save this time.
      await page.getByRole("button", { name: "Delete day 2" }).click()
      await expect(page.getByRole("button", { name: "Save days" })).toBeEnabled()
      await page.getByRole("button", { name: "Save days" }).click()

      await expect
        .poll(
          async () => {
            const itinerary = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
            return itinerary.days.filter((d) => d.dayNumber > 0).length
          },
          { timeout: 20_000, message: "waiting for day 2 to actually be deleted" },
        )
        .toBe(1)

      await page.reload()
      await enterEdit(page)
      await expect(page.getByTestId("boundary-drag-handle")).toHaveCount(0)
      await expect(page.getByTestId("day-1-header")).toBeVisible()
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("dropping a point during a dirty boundary draft persists and the draft survives", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Builder Drop Mid Draft ${Date.now()}`,
      points: BUILDER_POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await gotoAndEnterEdit(page, seeded.itineraryId)

      const grip = page.getByTestId("boundary-grip")
      await dragBoundaryToRow(page, grip, 1)
      const saveButton = page.getByRole("button", { name: "Save days" })
      await expect(saveButton).toBeEnabled()

      await expect(page.getByTestId("point-row")).toHaveCount(5)

      // Point drop is a click on the Leaflet map surface — bottom-center-ish
      // to stay clear of the zoom control (top-left) and the Overlays / "+
      // Add" controls (top-right), per map-core.tsx's control layout.
      const mapBox = await page.locator(".leaflet-container").boundingBox()
      if (!mapBox) throw new Error("map container not found")
      await page.mouse.click(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.85)

      await expect(page.getByTestId("point-row")).toHaveCount(6)
      // The point drop is an immediate, independent save — it must not
      // disturb the still-unsaved boundary draft. This is the exact
      // scenario the old index-frozen draft model could not express (M14's
      // ID-anchoring payoff): a point mutation mid-draft used to be
      // undefined behavior.
      await expect(saveButton).toBeEnabled()

      await expect
        .poll(
          async () => {
            const itinerary = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
            return itinerary.days.flatMap((d) => d.points).length
          },
          { timeout: 20_000, message: "waiting for the dropped point to persist" },
        )
        .toBe(6)

      await page.reload()
      await enterEdit(page)
      await expect(page.getByTestId("point-row")).toHaveCount(6)
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  // M20 §4 — a point dropped on a leg goes between the two points it was dropped
  // between. Before this, create could only append: next_id was dump_only on both
  // point schemas and create_point always took the itinerary-wide tail.
  test("dropping a point on a leg inserts it there, not at the end of the route", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Builder Insert On Leg ${Date.now()}`,
      points: BUILDER_POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await gotoAndEnterEdit(page, seeded.itineraryId)
      await expect(page.getByTestId("point-row")).toHaveCount(5)

      // The leg is only reachable through the map, so its position has to be read
      // off the rendered markers rather than computed from lat/lng — the midpoint
      // between the first two markers lies on the first leg's hit line.
      const markers = page.locator(".leaflet-marker-icon")
      const [first, second] = await Promise.all([
        markers.nth(0).boundingBox(),
        markers.nth(1).boundingBox(),
      ])
      if (!first || !second) throw new Error("route markers are not on the map")
      await page.mouse.click(
        (first.x + first.width / 2 + second.x + second.width / 2) / 2,
        (first.y + first.height / 2 + second.y + second.height / 2) / 2,
      )

      await expect(page.getByTestId("point-row")).toHaveCount(6)
      // The clinching assertion: an appended point would be the last row. "Camp"
      // still being last is what says it was spliced in.
      await expect(page.getByTestId("point-row").nth(5)).toContainText("Camp")
      await expect(page.getByTestId("point-row").nth(1)).not.toContainText("Turn")

      await expect
        .poll(
          async () => {
            const itinerary = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
            return itinerary.days.flatMap((d) => d.points).length
          },
          { timeout: 20_000, message: "waiting for the inserted point to persist" },
        )
        .toBe(6)

      // And it survives a round trip — the chain the server holds is the one the
      // list was showing, not creation order.
      await page.reload()
      await enterEdit(page)
      await expect(page.getByTestId("point-row")).toHaveCount(6)
      await expect(page.getByTestId("point-row").nth(5)).toContainText("Camp")
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  // M20 §1 — an itinerary with no Day 0 used to swallow every dropped point and
  // every day save, with no toast, no console line and no request. A clone of a
  // hand-built route arrived exactly like this.
  test("an itinerary with no staging day heals itself instead of swallowing the point", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Builder No Staging Day ${Date.now()}`,
      points: BUILDER_POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      // Boundaries are already applied, so Day 0 is empty and dropping it takes no
      // route points with it — the shape a fork of a hand-built route arrived in.
      const before = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
      const dayZero = before.days.find((d) => d.dayNumber === 0)
      expect(dayZero, "the seeded itinerary should have a Day 0 to remove").toBeTruthy()
      const removed = await request.delete(`${API_URL}/api/v1/day/${dayZero!.id}`, {
        headers: { Authorization: `Bearer ${leaderToken}` },
      })
      expect(removed.ok()).toBeTruthy()

      await gotoAndEnterEdit(page, seeded.itineraryId)
      await expect(page.getByTestId("point-row")).toHaveCount(5)

      const mapBox = await page.locator(".leaflet-container").boundingBox()
      if (!mapBox) throw new Error("map container not found")
      await page.mouse.click(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.85)

      await expect(page.getByTestId("point-row")).toHaveCount(6)
      await expect
        .poll(
          async () => {
            const itinerary = await apiGetItinerary(request, leaderToken, seeded.itineraryId)
            return {
              points: itinerary.days.flatMap((d) => d.points).length,
              stagingDays: itinerary.days.filter((d) => d.dayNumber === 0).length,
            }
          },
          { timeout: 20_000, message: "waiting for the staging day and the point" },
        )
        .toEqual({ points: 6, stagingDays: 1 })
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })
})
