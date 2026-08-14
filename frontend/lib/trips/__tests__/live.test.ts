import { describe, it, expect } from "vitest"
import { liveMapHref } from "../live"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"

const ITINERARY_ID = "019f7ef9-0000-7000-8000-00000000e001"

function trip(state: Trip["state"], itineraryId?: string): Pick<Trip, "state" | "itinerary"> {
  return { state, itinerary: itineraryId ? ({ id: itineraryId } as Trip["itinerary"]) : undefined }
}

describe("liveMapHref", () => {
  it("deep-links the itinerary into Navigate mode", () => {
    // `navigate=1` is the flag map-builder.tsx reads on mount to turn Navigate on. The
    // literal is asserted here on purpose: this is the contract between the two files,
    // and it is the whole reason the helper exists.
    expect(liveMapHref(trip(TRIP_STATE.HAPPENING, ITINERARY_ID))).toBe(
      `/itinerary/${ITINERARY_ID}?navigate=1`,
    )
  })

  it("is null for a trip that is not under way", () => {
    // There is nothing live about a plan, and the button should not render at all.
    expect(liveMapHref(trip(TRIP_STATE.BUILDING, ITINERARY_ID))).toBeNull()
    expect(liveMapHref(trip(TRIP_STATE.PAST, ITINERARY_ID))).toBeNull()
  })

  it("is null when the trip has no itinerary to navigate", () => {
    // Otherwise the link would be `/itinerary/undefined?navigate=1`, a 404 dressed as a
    // working button.
    expect(liveMapHref(trip(TRIP_STATE.HAPPENING))).toBeNull()
  })
})
