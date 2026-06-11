import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CrewList } from "../crew-list"
import type { TripMember } from "@/lib/dtos/trip-member"

const MEMBERS: TripMember[] = [
  {
    id: "01952f1a-0000-7000-8000-000000000001",
    role: "leader",
    user: {
      id: "01952f1a-0000-7000-8000-000000000002",
      mail: "ada@example.com",
      username: "ada",
      name: "Ada",
      surname: "Lovelace",
      phone: "+34600000001",
    },
  },
  {
    id: "01952f1a-0000-7000-8000-000000000003",
    role: "crew",
    user: {
      id: "01952f1a-0000-7000-8000-000000000004",
      mail: "bob@example.com",
      username: "bob",
      name: "Bob",
      surname: "Sparrow",
      phone: "+34600000002",
    },
  },
]

describe("CrewList", () => {
  it("renders each member's name", () => {
    render(<CrewList members={MEMBERS} />)
    expect(screen.getByText("Ada Lovelace")).toBeDefined()
    expect(screen.getByText("Bob Sparrow")).toBeDefined()
  })

  it("renders the leader role chip", () => {
    render(<CrewList members={MEMBERS} />)
    expect(screen.getByText("Leader")).toBeDefined()
  })

  it("renders the crew role chip", () => {
    render(<CrewList members={MEMBERS} />)
    expect(screen.getByText("Crew")).toBeDefined()
  })

  it("renders a username as fallback when surname is absent", () => {
    const noSurname: TripMember[] = [
      { ...MEMBERS[0], user: { ...MEMBERS[0].user, surname: undefined } },
    ]
    render(<CrewList members={noSurname} />)
    expect(screen.getByText("Ada")).toBeDefined()
  })

  it("renders nothing when the list is empty", () => {
    const { container } = render(<CrewList members={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
