import { describe, it, expect } from "vitest"
import { ShuttleVehicleSchema, ShuttleVehicleFieldsSchema } from "../shuttle-vehicle"

const MEMBER_A = "01952f1a-0000-7000-8000-000000000010"
const MEMBER_B = "01952f1a-0000-7000-8000-000000000011"

const VALID_VEHICLE = {
  id: "01952f1a-0000-7000-8000-000000000001",
  tripId: "01952f1a-0000-7000-8000-000000000002",
  arrangedById: MEMBER_A,
  driverId: MEMBER_A,
  driverName: null,
  driverContact: null,
  seatsAvailable: 4,
  kayakSpots: 2,
  vehicleDescription: "White Toyota Land Cruiser",
  pickupPoint: "Harbour road",
  passengers: [
    {
      id: "01952f1a-0000-7000-8000-000000000020",
      vehicleId: "01952f1a-0000-7000-8000-000000000001",
      tripMemberId: MEMBER_B,
    },
  ],
}

describe("ShuttleVehicleSchema", () => {
  it("parses a fully populated vehicle", () => {
    const result = ShuttleVehicleSchema.safeParse(VALID_VEHICLE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.seatsAvailable).toBe(4)
      expect(result.data.passengers).toHaveLength(1)
    }
  })

  it("defaults passengers to empty array when absent", () => {
    const { passengers: _, ...noPassengers } = VALID_VEHICLE
    const result = ShuttleVehicleSchema.safeParse(noPassengers)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.passengers).toEqual([])
  })

  it("accepts an external driver (driverId null, driverName set)", () => {
    const result = ShuttleVehicleSchema.safeParse({
      ...VALID_VEHICLE,
      driverId: null,
      driverName: "Joan Miró",
      driverContact: "+34600000000",
    })
    expect(result.success).toBe(true)
  })

  it("accepts null for all optional fields", () => {
    const result = ShuttleVehicleSchema.safeParse({
      ...VALID_VEHICLE,
      driverId: null,
      seatsAvailable: null,
      kayakSpots: null,
      vehicleDescription: null,
      pickupPoint: null,
    })
    expect(result.success).toBe(true)
  })
})

describe("ShuttleVehicleFieldsSchema", () => {
  it("accepts a valid update payload", () => {
    const result = ShuttleVehicleFieldsSchema.safeParse({
      driverId: MEMBER_A,
      seatsAvailable: 3,
      kayakSpots: 1,
      vehicleDescription: "Blue VW Transporter",
      pickupPoint: "Train station",
    })
    expect(result.success).toBe(true)
  })

  it("accepts an empty object (all fields optional)", () => {
    const result = ShuttleVehicleFieldsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("rejects negative seatsAvailable", () => {
    const result = ShuttleVehicleFieldsSchema.safeParse({ seatsAvailable: -1 })
    expect(result.success).toBe(false)
  })

  it("rejects negative kayakSpots", () => {
    const result = ShuttleVehicleFieldsSchema.safeParse({ kayakSpots: -1 })
    expect(result.success).toBe(false)
  })
})
