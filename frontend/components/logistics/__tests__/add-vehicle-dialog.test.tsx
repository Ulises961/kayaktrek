import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/shuttle/actions", () => ({
  createShuttleVehicle: vi.fn(),
  updateShuttleVehicle: vi.fn(),
}))

import { createShuttleVehicle, updateShuttleVehicle } from "@/lib/shuttle/actions"
import { AddVehicleDialog } from "../add-vehicle-dialog"
import { EditVehicleDialog } from "../edit-vehicle-dialog"
import type { ShuttleVehicle } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"

const TRIP_ID   = "01952f1a-0000-7000-8000-000000000001"
const VEHICLE_ID = "01952f1a-0000-7000-8000-000000000010"
const MEMBER_ID  = "01952f1a-0000-7000-8000-000000000020"

const MEMBERS: TripMember[] = [
  {
    id: MEMBER_ID,
    role: "leader",
    user: { id: "01952f1a-0000-7000-8000-000000000021", mail: "ana@example.com", username: "ana", name: "Ana", surname: "Font" },
  },
]

const VEHICLE: ShuttleVehicle = {
  id: VEHICLE_ID,
  tripId: TRIP_ID,
  arrangedById: MEMBER_ID,
  driverId: MEMBER_ID,
  driverName: null,
  driverContact: null,
  seatsAvailable: 4,
  kayakSpots: 2,
  vehicleDescription: "White Toyota",
  pickupPoint: "Harbour road",
  passengers: [],
}

beforeEach(() => vi.clearAllMocks())

describe("AddVehicleDialog", () => {
  it("renders an 'Add vehicle' trigger button", () => {
    render(<AddVehicleDialog tripId={TRIP_ID} members={MEMBERS} />)
    expect(screen.getByRole("button", { name: /add vehicle/i })).toBeDefined()
  })

  it("opens the dialog on click", async () => {
    render(<AddVehicleDialog tripId={TRIP_ID} members={MEMBERS} />)
    await userEvent.click(screen.getByRole("button", { name: /add vehicle/i }))
    expect(screen.getByRole("dialog")).toBeDefined()
  })

  it("has a vehicle description field", async () => {
    render(<AddVehicleDialog tripId={TRIP_ID} members={MEMBERS} />)
    await userEvent.click(screen.getByRole("button", { name: /add vehicle/i }))
    expect(screen.getByPlaceholderText(/vehicle description/i)).toBeDefined()
  })

  it("calls createShuttleVehicle on submit", async () => {
    vi.mocked(createShuttleVehicle).mockResolvedValue({ success: true })
    render(<AddVehicleDialog tripId={TRIP_ID} members={MEMBERS} />)
    await userEvent.click(screen.getByRole("button", { name: /add vehicle/i }))
    await userEvent.type(screen.getByPlaceholderText(/vehicle description/i), "Blue VW")
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() =>
      expect(createShuttleVehicle).toHaveBeenCalledWith(TRIP_ID, expect.any(Object))
    )
  })

  it("shows error when createShuttleVehicle fails", async () => {
    vi.mocked(createShuttleVehicle).mockResolvedValue({ success: false, error: "Not a member." })
    render(<AddVehicleDialog tripId={TRIP_ID} members={MEMBERS} />)
    await userEvent.click(screen.getByRole("button", { name: /add vehicle/i }))
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() => expect(screen.getByText("Not a member.")).toBeDefined())
  })
})

describe("EditVehicleDialog", () => {
  it("pre-fills vehicle description", async () => {
    render(<EditVehicleDialog tripId={TRIP_ID} vehicle={VEHICLE} members={MEMBERS} open onOpenChange={vi.fn()} />)
    const input = screen.getByPlaceholderText(/vehicle description/i)
    expect((input as HTMLInputElement).value).toBe("White Toyota")
  })

  it("calls updateShuttleVehicle on submit", async () => {
    vi.mocked(updateShuttleVehicle).mockResolvedValue({ success: true })
    render(<EditVehicleDialog tripId={TRIP_ID} vehicle={VEHICLE} members={MEMBERS} open onOpenChange={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() =>
      expect(updateShuttleVehicle).toHaveBeenCalledWith(TRIP_ID, VEHICLE_ID, expect.any(Object))
    )
  })

  it("shows error when updateShuttleVehicle fails", async () => {
    vi.mocked(updateShuttleVehicle).mockResolvedValue({ success: false, error: "Trip is over." })
    render(<EditVehicleDialog tripId={TRIP_ID} vehicle={VEHICLE} members={MEMBERS} open onOpenChange={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText("Trip is over.")).toBeDefined())
  })
})
