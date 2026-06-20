import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockCreateInventory, mockRefresh } = vi.hoisted(() => ({
  mockCreateInventory: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("@/lib/inventory/actions", () => ({
  createInventory: mockCreateInventory,
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
      checked: false,
    },
    {
      id: "01952f1a-0000-7000-8000-000000000b02",
      name: "Bilge pump",
      status: "covered",
      checked: false,
    },
  ],
}

describe("ItemsTab", () => {
  beforeEach(() => {
    mockCreateInventory.mockReset()
    mockRefresh.mockReset()
    mockCreateInventory.mockResolvedValue({ success: true })
  })

  it("offers a create-inventory action to the leader when there is no inventory", () => {
    render(<ItemsTab tripId={TRIP_ID} inventory={null} isLeader={true} />)
    expect(screen.getByRole("button", { name: /create trip inventory/i })).toBeTruthy()
  })

  it("does not offer create-inventory to a non-leader when there is no inventory", () => {
    render(<ItemsTab tripId={TRIP_ID} inventory={null} isLeader={false} />)
    expect(screen.queryByRole("button", { name: /create trip inventory/i })).toBeNull()
  })

  it("creates the trip inventory when the leader clicks the button", async () => {
    const user = userEvent.setup()
    render(<ItemsTab tripId={TRIP_ID} inventory={null} isLeader={true} />)

    await user.click(screen.getByRole("button", { name: /create trip inventory/i }))

    expect(mockCreateInventory).toHaveBeenCalledWith(TRIP_ID)
  })

  it("shows the linked inventory's requirements when one exists", () => {
    render(<ItemsTab tripId={TRIP_ID} inventory={INVENTORY} isLeader={false} />)
    expect(screen.getByText("Tow line")).toBeTruthy()
    expect(screen.getByText("Bilge pump")).toBeTruthy()
  })
})
