import { describe, it, expect } from "vitest"
import { changesAffectPage } from "../change-relevance"
import { TRIP_CHANGE_OPERATION, type TripChange } from "../../dtos/trip-change"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const CREW_PAGE = `/trips/${TRIP_ID}/crew`
const ITEMS_PAGE = `/trips/${TRIP_ID}/items`
const LOGISTICS_PAGE = `/trips/${TRIP_ID}/logistics`
const BUILDER_PAGE = `/itinerary/${TRIP_ID}`
const FLOAT_PLAN_PAGE = `/trips/${TRIP_ID}/my-float-plan`

function change(table: string): TripChange {
  return { t: table, id: "x", op: TRIP_CHANGE_OPERATION.UPDATE }
}

describe("changesAffectPage", () => {
  it("treats a change of unknown extent as affecting every page", () => {
    for (const page of [CREW_PAGE, ITEMS_PAGE, LOGISTICS_PAGE, BUILDER_PAGE, FLOAT_PLAN_PAGE]) {
      expect(changesAffectPage(page, [])).toBe(true)
    }
  })

  it("leaves the crew, items and logistics pages alone while the route is being edited", () => {
    const routeEdit = [change("point"), change("day"), change("itinerary")]

    expect(changesAffectPage(CREW_PAGE, routeEdit)).toBe(false)
    expect(changesAffectPage(ITEMS_PAGE, routeEdit)).toBe(false)
    expect(changesAffectPage(LOGISTICS_PAGE, routeEdit)).toBe(false)
    expect(changesAffectPage(BUILDER_PAGE, routeEdit)).toBe(true)
  })

  it("leaves the route builder and the other tabs alone while gear is being packed", () => {
    const packing = [change("trip_requirement"), change("requirement_contribution")]

    expect(changesAffectPage(ITEMS_PAGE, packing)).toBe(true)
    expect(changesAffectPage(BUILDER_PAGE, packing)).toBe(false)
    expect(changesAffectPage(CREW_PAGE, packing)).toBe(false)
    expect(changesAffectPage(LOGISTICS_PAGE, packing)).toBe(false)
  })

  it("keeps a private packing list to the items page", () => {
    expect(changesAffectPage(ITEMS_PAGE, [change("personal_packing_item")])).toBe(true)
    expect(changesAffectPage(CREW_PAGE, [change("personal_packing_item")])).toBe(false)
  })

  it("shows invitations on the crew page only", () => {
    expect(changesAffectPage(CREW_PAGE, [change("invitation")])).toBe(true)
    expect(changesAffectPage(ITEMS_PAGE, [change("invitation")])).toBe(false)
    expect(changesAffectPage(BUILDER_PAGE, [change("invitation")])).toBe(false)
  })

  it("shows logistics on the logistics page only", () => {
    for (const table of ["logistics", "shuttle_vehicle", "shuttle_passenger", "travel_document"]) {
      expect(changesAffectPage(LOGISTICS_PAGE, [change(table)])).toBe(true)
      expect(changesAffectPage(CREW_PAGE, [change(table)])).toBe(false)
    }
  })

  it("lets the trip itself and its membership reach every page, since every header shows them", () => {
    for (const page of [CREW_PAGE, ITEMS_PAGE, LOGISTICS_PAGE, BUILDER_PAGE]) {
      expect(changesAffectPage(page, [change("trip")])).toBe(true)
      expect(changesAffectPage(page, [change("trip_member")])).toBe(true)
    }
  })

  it("reaches a page when any change in a batch is one it shows", () => {
    expect(
      changesAffectPage(CREW_PAGE, [change("point"), change("invitation"), change("day")]),
    ).toBe(true)
  })

  it("refreshes a page it has no list for, whatever changed", () => {
    expect(changesAffectPage(FLOAT_PLAN_PAGE, [change("point")])).toBe(true)
    expect(changesAffectPage(`/trips/${TRIP_ID}`, [change("point")])).toBe(true)
  })

  it("refreshes for a table it has never heard of, on every page", () => {
    for (const page of [CREW_PAGE, ITEMS_PAGE, LOGISTICS_PAGE, BUILDER_PAGE]) {
      expect(changesAffectPage(page, [change("a_table_added_later")])).toBe(true)
    }
  })

  it("matches a page however its path is written", () => {
    expect(changesAffectPage(`${CREW_PAGE}/`, [change("point")])).toBe(false)
    expect(changesAffectPage(`${BUILDER_PAGE}/`, [change("point")])).toBe(true)
  })
})
