import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { LogisticsCard } from "../logistics-card"
import type { Logistics } from "@/lib/dtos/logistics"

const FULL_LOGISTICS: Logistics = {
  id: "01952f1a-0000-7000-8000-000000000001",
  tripId: "01952f1a-0000-7000-8000-000000000002",
  shoreContactName: "Maria García",
  shoreContactEmail: "maria@example.com",
  shoreContactPhone: "+34600000000",
  shoreContactRelationship: "Partner",
  shuttleNotes: null,
  shuttleMeetingTime: null,
}

describe("LogisticsCard", () => {
  it("shows a placeholder when logistics is null", () => {
    render(<LogisticsCard logistics={null} isLeader={false} />)
    expect(screen.getByText(/not yet set up/i)).toBeDefined()
  })

  it("shows shore contact name", () => {
    render(<LogisticsCard logistics={FULL_LOGISTICS} isLeader={false} />)
    expect(screen.getByText("Maria García")).toBeDefined()
  })

  it("shows shore contact email", () => {
    render(<LogisticsCard logistics={FULL_LOGISTICS} isLeader={false} />)
    expect(screen.getByText("maria@example.com")).toBeDefined()
  })

  it("shows shore contact phone", () => {
    render(<LogisticsCard logistics={FULL_LOGISTICS} isLeader={false} />)
    expect(screen.getByText("+34600000000")).toBeDefined()
  })

  it("shows shore contact relationship", () => {
    render(<LogisticsCard logistics={FULL_LOGISTICS} isLeader={false} />)
    expect(screen.getByText("Partner")).toBeDefined()
  })

  it("omits shore contact block when name is null", () => {
    const noContact: Logistics = {
      ...FULL_LOGISTICS,
      shoreContactName: null,
      shoreContactEmail: null,
      shoreContactPhone: null,
      shoreContactRelationship: null,
    }
    render(<LogisticsCard logistics={noContact} isLeader={false} />)
    expect(screen.queryByText("maria@example.com")).toBeNull()
  })

  it("renders the section heading", () => {
    render(<LogisticsCard logistics={FULL_LOGISTICS} isLeader={false} />)
    expect(screen.getByText(/logistics/i)).toBeDefined()
  })
})
