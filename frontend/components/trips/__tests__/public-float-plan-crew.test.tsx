import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import type { SnapshotCrewMember } from "@/lib/dtos/float-plan-snapshot"
import { formatDayDate } from "@/lib/utils/date"
import { CrewCard } from "../public-float-plan-crew"

const MEMBER: SnapshotCrewMember = {
  name: "Ada Lovelace",
  mail: "ada@example.com",
  role: "crew",
  vessel: { make: "Valley", model: "Etain" },
  emergencyContact: { name: "Jane", phone: "+441234" },
}

// M9d: the shore contact reads the public float plan. A paddler the leader recorded
// as having left the trip is not someone to look for on the water.
describe("CrewCard", () => {
  it("says a paddler has left the trip, when, and why", () => {
    const leftAt = "2026-10-02T09:30:00+00:00"

    render(<CrewCard member={{ ...MEMBER, leftAt, leftNote: "Evacuated" }} index={0} />)

    expect(screen.getByText(`Left the trip on ${formatDayDate(leftAt)}`)).toBeDefined()
    expect(screen.getByText("Evacuated")).toBeDefined()
  })

  it("says nothing about leaving for a paddler still on the trip", () => {
    render(<CrewCard member={MEMBER} index={0} />)

    expect(screen.queryByText(/Left the trip/)).toBeNull()
  })

  it("still shows the paddler's vessel and emergency contact", () => {
    render(<CrewCard member={MEMBER} index={0} />)

    expect(screen.getByText("Valley Etain")).toBeDefined()
    expect(screen.getByText("+441234")).toBeDefined()
  })
})
