import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ShuttleSection } from "../shuttle-section"
import type { ShuttleVehicle } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"
import type { Logistics } from "@/lib/dtos/logistics"

const MEMBER_A_ID = "01952f1a-0000-7000-8000-000000000010"
const MEMBER_B_ID = "01952f1a-0000-7000-8000-000000000020"
const VEHICLE_ID  = "01952f1a-0000-7000-8000-000000000030"

const MEMBERS: TripMember[] = [
  {
    id: MEMBER_A_ID,
    role: "leader",
    user: { id: "01952f1a-0000-7000-8000-000000000011", mail: "ana@example.com", username: "ana", name: "Ana", surname: "Font" },
  },
  {
    id: MEMBER_B_ID,
    role: "crew",
    user: { id: "01952f1a-0000-7000-8000-000000000021", mail: "joan@example.com", username: "joan", name: "Joan", surname: "Miró" },
  },
]

const VEHICLE: ShuttleVehicle = {
  id: VEHICLE_ID,
  tripId: "01952f1a-0000-7000-8000-000000000001",
  arrangedById: MEMBER_A_ID,
  driverId: MEMBER_A_ID,
  driverName: null,
  driverContact: null,
  seatsAvailable: 4,
  kayakSpots: 2,
  vehicleDescription: "White Toyota Land Cruiser",
  pickupPoint: "Harbour road",
  passengers: [
    { id: "01952f1a-0000-7000-8000-000000000040", vehicleId: VEHICLE_ID, tripMemberId: MEMBER_A_ID },
  ],
}

const LOGISTICS_WITH_TIME: Logistics = {
  id: "01952f1a-0000-7000-8000-000000000050",
  tripId: "01952f1a-0000-7000-8000-000000000001",
  departurePoint: null,
  arrivalPoint: null,
  travelNotes: null,
  shoreContactName: null,
  shoreContactEmail: null,
  shoreContactPhone: null,
  shoreContactRelationship: null,
  shuttleNotes: "Meet at the car park entrance",
  shuttleMeetingTime: "09:00",
}

describe("ShuttleSection", () => {
  it("shows empty state when no vehicles exist", () => {
    render(<ShuttleSection logistics={null} vehicles={[]} members={MEMBERS} />)
    expect(screen.getByText(/no vehicles/i)).toBeDefined()
  })

  it("shows meeting time when set in logistics", () => {
    render(<ShuttleSection logistics={LOGISTICS_WITH_TIME} vehicles={[]} members={MEMBERS} />)
    expect(screen.getByText("09:00")).toBeDefined()
  })

  it("shows shuttle notes when set", () => {
    render(<ShuttleSection logistics={LOGISTICS_WITH_TIME} vehicles={[]} members={MEMBERS} />)
    expect(screen.getByText("Meet at the car park entrance")).toBeDefined()
  })

  it("renders vehicle description for each vehicle", () => {
    render(<ShuttleSection logistics={null} vehicles={[VEHICLE]} members={MEMBERS} />)
    expect(screen.getByText("White Toyota Land Cruiser")).toBeDefined()
  })

  it("shows the pickup point for a vehicle", () => {
    render(<ShuttleSection logistics={null} vehicles={[VEHICLE]} members={MEMBERS} />)
    expect(screen.getByText("Harbour road")).toBeDefined()
  })

  it("shows the driver's name by looking up the member", () => {
    render(<ShuttleSection logistics={null} vehicles={[VEHICLE]} members={MEMBERS} />)
    expect(screen.getAllByText(/Ana Font/).length).toBeGreaterThan(0)
  })

  it("shows external driver name when driverId is null", () => {
    const externalVehicle: ShuttleVehicle = {
      ...VEHICLE,
      driverId: null,
      driverName: "External Driver",
    }
    render(<ShuttleSection logistics={null} vehicles={[externalVehicle]} members={MEMBERS} />)
    expect(screen.getByText("External Driver")).toBeDefined()
  })

  it("shows unassigned members — those not in any vehicle", () => {
    render(<ShuttleSection logistics={null} vehicles={[VEHICLE]} members={MEMBERS} />)
    // MEMBER_B (Joan Miró) is not a passenger in any vehicle
    expect(screen.getByText(/Joan Miró/)).toBeDefined()
  })

  it("shows seats available", () => {
    render(<ShuttleSection logistics={null} vehicles={[VEHICLE]} members={MEMBERS} />)
    expect(screen.getByText(/4/)).toBeDefined()
  })
})
