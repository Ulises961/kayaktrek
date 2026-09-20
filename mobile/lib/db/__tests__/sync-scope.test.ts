import { TRIP_STATE } from "@shared/dtos/trip"

import { STALENESS_BUDGET_MS, SYNC_TIER, planSweep } from "../sync-scope"

const NOW = new Date("2026-09-20T12:00:00.000Z")

function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function trip(overrides: Partial<Parameters<typeof planSweep>[0]["trips"][number]>) {
  return {
    id: "trip-1",
    state: TRIP_STATE.BUILDING,
    dateFrom: isoDaysFromNow(30),
    dateTo: isoDaysFromNow(33),
    ...overrides,
  }
}

describe("planSweep", () => {
  it("puts a happening trip in tier 1", () => {
    const sweep = planSweep({
      trips: [trip({ id: "t1", state: TRIP_STATE.HAPPENING })],
      freshness: {},
      now: NOW,
    })

    expect(sweep).toEqual([{ tripId: "t1", tier: SYNC_TIER.EXPEDITION }])
  })

  // Time to departure outranks state: a building trip leaving tomorrow needs
  // more than a building trip in November (docs/adr/mobile-offline.md).
  it("promotes a building trip departing inside the imminent window to tier 1", () => {
    const sweep = planSweep({
      trips: [trip({ id: "soon", dateFrom: isoDaysFromNow(1) })],
      freshness: {},
      now: NOW,
    })

    expect(sweep).toEqual([{ tripId: "soon", tier: SYNC_TIER.EXPEDITION }])
  })

  it("leaves a distant building trip in tier 2", () => {
    const sweep = planSweep({
      trips: [trip({ id: "later", dateFrom: isoDaysFromNow(30) })],
      freshness: {},
      now: NOW,
    })

    expect(sweep).toEqual([{ tripId: "later", tier: SYNC_TIER.PLANNED }])
  })

  // A cut, not a low tier: lowest-priority still means "runs eventually and
  // grows on the device forever" for a case nobody has had.
  it("never sweeps past trips", () => {
    const sweep = planSweep({
      trips: [trip({ id: "past", state: TRIP_STATE.PAST, dateFrom: isoDaysFromNow(-10) })],
      freshness: {},
      now: NOW,
    })

    expect(sweep).toEqual([])
  })

  // `archived` is outside TripState (the GDPR-erasure terminal state, never
  // frontend-set), so the trip-list cache normalises it to null on the way in
  // — which is the shape this actually has to reject. Anything unrecognised is
  // excluded rather than assumed syncable.
  it("never sweeps a trip whose state it cannot place, as an archived one reads", () => {
    const sweep = planSweep({
      trips: [trip({ id: "archived", state: null, dateFrom: isoDaysFromNow(-40) })],
      freshness: {},
      now: NOW,
    })

    expect(sweep).toEqual([])
  })

  it("orders tier 1 before tier 2, and soonest departure first within a tier", () => {
    const sweep = planSweep({
      trips: [
        trip({ id: "november", dateFrom: isoDaysFromNow(60) }),
        trip({ id: "next-week", dateFrom: isoDaysFromNow(7) }),
        trip({ id: "happening", state: TRIP_STATE.HAPPENING, dateFrom: isoDaysFromNow(-1) }),
        trip({ id: "tomorrow", dateFrom: isoDaysFromNow(1) }),
      ],
      freshness: {},
      now: NOW,
    })

    expect(sweep.map((item) => item.tripId)).toEqual([
      "happening",
      "tomorrow",
      "next-week",
      "november",
    ])
  })

  // Budgets decide what ENTERS a sweep; priority only orders work within one.
  // A strict priority queue would head-of-line block, so a failing tier 1 on a
  // marginal link must not starve everything below it.
  it("skips a trip refreshed inside its budget", () => {
    const justSynced = new Date(NOW.getTime() - 60 * 1000).toISOString()
    const sweep = planSweep({
      trips: [trip({ id: "fresh", state: TRIP_STATE.HAPPENING })],
      freshness: { fresh: justSynced },
      now: NOW,
    })

    expect(sweep).toEqual([])
  })

  it("includes a trip once it is past its budget", () => {
    const stale = new Date(
      NOW.getTime() - STALENESS_BUDGET_MS[SYNC_TIER.EXPEDITION] - 1000,
    ).toISOString()
    const sweep = planSweep({
      trips: [trip({ id: "stale", state: TRIP_STATE.HAPPENING })],
      freshness: { stale },
      now: NOW,
    })

    expect(sweep).toEqual([{ tripId: "stale", tier: SYNC_TIER.EXPEDITION }])
  })

  // The tier's budget applies, not one global number — a planned trip tolerates
  // an age that would be well past due on an expedition in progress.
  it("holds a tier 2 trip to a longer budget than a tier 1 one", () => {
    const age = STALENESS_BUDGET_MS[SYNC_TIER.EXPEDITION] + 1000
    const cachedAt = new Date(NOW.getTime() - age).toISOString()
    expect(age).toBeLessThan(STALENESS_BUDGET_MS[SYNC_TIER.PLANNED])

    const sweep = planSweep({
      trips: [
        trip({ id: "planned", dateFrom: isoDaysFromNow(30) }),
        trip({ id: "underway", state: TRIP_STATE.HAPPENING }),
      ],
      freshness: { planned: cachedAt, underway: cachedAt },
      now: NOW,
    })

    expect(sweep.map((item) => item.tripId)).toEqual(["underway"])
  })

  it("always sweeps a trip that has never been synced", () => {
    const sweep = planSweep({
      trips: [trip({ id: "never" })],
      freshness: {},
      now: NOW,
    })

    expect(sweep.map((item) => item.tripId)).toEqual(["never"])
  })

  // A trip with no dates can't be placed by departure, and guessing "imminent"
  // would put an undated draft ahead of a real expedition.
  it("treats a dateless building trip as tier 2, ordered last", () => {
    const sweep = planSweep({
      trips: [
        trip({ id: "undated", dateFrom: null, dateTo: null }),
        trip({ id: "dated", dateFrom: isoDaysFromNow(20) }),
      ],
      freshness: {},
      now: NOW,
    })

    expect(sweep).toEqual([
      { tripId: "dated", tier: SYNC_TIER.PLANNED },
      { tripId: "undated", tier: SYNC_TIER.PLANNED },
    ])
  })

  // A trip already under way but whose dateFrom has passed must not fall out of
  // the imminent window — `happening` alone earns tier 1 regardless of dates.
  it("keeps a happening trip in tier 1 even with a departure long past", () => {
    const sweep = planSweep({
      trips: [trip({ id: "underway", state: TRIP_STATE.HAPPENING, dateFrom: isoDaysFromNow(-9) })],
      freshness: {},
      now: NOW,
    })

    expect(sweep).toEqual([{ tripId: "underway", tier: SYNC_TIER.EXPEDITION }])
  })
})
