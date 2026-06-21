import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/components/inventory/requirements-checklist", () => ({
  RequirementsChecklist: ({ requirements }: { requirements: { id?: string; name?: string }[] }) => (
    <div data-testid="checklist">
      {requirements.map((r) => (
        <span key={r.id}>{r.name}</span>
      ))}
    </div>
  ),
}))

vi.mock("@/components/inventory/personal-packing", () => ({
  PersonalPacking: () => <div data-testid="personal-packing" />,
}))

import { ItemsTab } from "../items-tab"
import type { Inventory } from "@/lib/dtos/inventory"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000d01"

const INVENTORY: Inventory = {
  id: "01952f1a-0000-7000-8000-000000000c01",
  requirements: [
    {
      id: "01952f1a-0000-7000-8000-000000000b01",
      name: "Tow line",
      status: "needed",
    },
    {
      id: "01952f1a-0000-7000-8000-000000000b02",
      name: "Bilge pump",
      status: "covered",
    },
  ],
}

describe("ItemsTab", () => {
  it("renders the inventory's requirements (every trip auto-creates one)", () => {
    render(<ItemsTab tripId={TRIP_ID} inventory={INVENTORY} isLeader={false} />)
    expect(screen.getByTestId("checklist")).toBeTruthy()
    expect(screen.getByText("Tow line")).toBeTruthy()
    expect(screen.getByText("Bilge pump")).toBeTruthy()
  })

  it("shows a fallback message (and no create button) when the inventory is missing", () => {
    render(<ItemsTab tripId={TRIP_ID} inventory={null} isLeader={true} />)
    expect(screen.queryByTestId("checklist")).toBeNull()
    expect(screen.queryByRole("button", { name: /create trip inventory/i })).toBeNull()
    expect(screen.getByText(/inventory isn.t available yet/i)).toBeTruthy()
  })

  it("renders the private 'My kit' section only for members", () => {
    const { rerender } = render(
      <ItemsTab tripId={TRIP_ID} inventory={INVENTORY} isLeader={false} isMember={false} />,
    )
    expect(screen.queryByTestId("personal-packing")).toBeNull()

    rerender(<ItemsTab tripId={TRIP_ID} inventory={INVENTORY} isLeader={false} isMember={true} />)
    expect(screen.getByTestId("personal-packing")).toBeTruthy()
    expect(screen.getByText("My kit")).toBeTruthy()
  })
})
