import { describe, it, expect } from "vitest"
import { ShuttleAssignmentSchema, ShuttleAssignmentFieldsSchema, SHUTTLE_ROLES } from "../shuttle-assignment"

const VALID_ASSIGNMENT = {
  id: "01952f1a-0000-7000-8000-000000000001",
  logisticsId: "01952f1a-0000-7000-8000-000000000002",
  tripMemberId: "01952f1a-0000-7000-8000-000000000003",
  role: "driver",
  vehicleDescription: "Red VW Golf",
  pickupPoint: "Trailhead parking",
}

describe("ShuttleAssignmentSchema", () => {
  it("parses a valid assignment", () => {
    const result = ShuttleAssignmentSchema.safeParse(VALID_ASSIGNMENT)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe("driver")
      expect(result.data.vehicleDescription).toBe("Red VW Golf")
    }
  })

  it("accepts passenger role", () => {
    const result = ShuttleAssignmentSchema.safeParse({ ...VALID_ASSIGNMENT, role: "passenger" })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown role", () => {
    const result = ShuttleAssignmentSchema.safeParse({ ...VALID_ASSIGNMENT, role: "conductor" })
    expect(result.success).toBe(false)
  })

  it("accepts null optional fields", () => {
    const result = ShuttleAssignmentSchema.safeParse({
      ...VALID_ASSIGNMENT,
      vehicleDescription: null,
      pickupPoint: null,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.vehicleDescription).toBeNull()
  })

  it("accepts missing optional fields", () => {
    const { vehicleDescription: _, pickupPoint: __, ...minimal } = VALID_ASSIGNMENT
    const result = ShuttleAssignmentSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })
})

describe("ShuttleAssignmentFieldsSchema", () => {
  it("accepts valid form data", () => {
    const result = ShuttleAssignmentFieldsSchema.safeParse({
      tripMemberId: "01952f1a-0000-7000-8000-000000000003",
      role: "driver",
      vehicleDescription: "Blue Toyota",
      pickupPoint: "Ferry terminal",
    })
    expect(result.success).toBe(true)
  })

  it("requires tripMemberId", () => {
    const result = ShuttleAssignmentFieldsSchema.safeParse({ role: "driver" })
    expect(result.success).toBe(false)
  })

  it("requires role", () => {
    const result = ShuttleAssignmentFieldsSchema.safeParse({
      tripMemberId: "01952f1a-0000-7000-8000-000000000003",
    })
    expect(result.success).toBe(false)
  })
})

describe("SHUTTLE_ROLES", () => {
  it("contains driver and passenger", () => {
    expect(SHUTTLE_ROLES).toContain("driver")
    expect(SHUTTLE_ROLES).toContain("passenger")
  })
})
