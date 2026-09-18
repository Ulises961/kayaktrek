import { formatDistanceForInput } from "@shared/itinerary/distance"

import { toFormValues } from "../log-form"

// The form holds every field as a string and converts at submit (see log-form.tsx).
// That made `distance` the one field where the stored value reaches the input
// unformatted: a log auto-generated from an expedition carries the haversine sum's
// full float, and it rendered on a real device as "0.6568740073199207".
describe("toFormValues", () => {
  it("trims a computed distance to something a person can read and correct", () => {
    expect(toFormValues({ distance: 0.6568740073199207 }).distance).toBe(
      formatDistanceForInput(0.6568740073199207),
    )
  })

  it("leaves a distance that is already short alone", () => {
    expect(toFormValues({ distance: 12 }).distance).toBe("12")
    expect(toFormValues({ distance: 6.1 }).distance).toBe("6.1")
  })

  it("keeps a zero distance rather than blanking the field", () => {
    expect(toFormValues({ distance: 0 }).distance).toBe("0")
  })

  it("renders a missing distance as an empty field, not as 'undefined'", () => {
    expect(toFormValues({}).distance).toBe("")
    expect(toFormValues().distance).toBe("")
  })

  it("carries the other fields through unchanged", () => {
    const values = toFormValues({
      date: "2026-07-25",
      hours: 3.5,
      avgSea: 4,
      notes: "Choppy on the return.",
    })

    expect(values).toMatchObject({
      date: "2026-07-25",
      hours: "3.5",
      avgSea: "4",
      notes: "Choppy on the return.",
    })
  })
})
