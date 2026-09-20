import { numberedDays } from "../numbered-days"

describe("numberedDays", () => {
  it("drops the day 0 staging area", () => {
    // Day 0 is where a newly dropped point lands before a boundary owns it
    // (frontend/lib/itinerary/actions.ts's ensureDayZero). It is storage, not an
    // itinerary day, so it must never reach a day strip or a route.
    const days = [
      { dayNumber: 0, id: "staging" },
      { dayNumber: 1, id: "d1" },
      { dayNumber: 2, id: "d2" },
    ]

    expect(numberedDays(days).map((day) => day.id)).toEqual(["d1", "d2"])
  })

  it("keeps the days in order", () => {
    const days = [
      { dayNumber: 2, id: "d2" },
      { dayNumber: 0, id: "staging" },
      { dayNumber: 1, id: "d1" },
    ]

    expect(numberedDays(days).map((day) => day.dayNumber)).toEqual([1, 2])
  })

  it("returns nothing when an itinerary holds only a staging day", () => {
    // A trip whose points have all been dropped but never assigned. The screen has to
    // render an empty itinerary, not a "Day 0" tab.
    expect(numberedDays([{ dayNumber: 0, id: "staging" }])).toEqual([])
  })

  it("leaves an already-clean list untouched", () => {
    const days = [
      { dayNumber: 1, id: "d1" },
      { dayNumber: 2, id: "d2" },
    ]

    expect(numberedDays(days)).toEqual(days)
  })

  it("drops a negative day number too", () => {
    // Not reachable through the API (day_number is validated 1..365, and Day 0 is
    // written directly), but the guard is "is this a real itinerary day", not
    // "is this exactly zero".
    expect(numberedDays([{ dayNumber: -1, id: "odd" }, { dayNumber: 1, id: "d1" }])).toEqual([
      { dayNumber: 1, id: "d1" },
    ])
  })
})
