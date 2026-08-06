import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import {
  getShuttleVehicles,
  createShuttleVehicle,
  updateShuttleVehicle,
  deleteShuttleVehicle,
  addShuttlePassenger,
  removeShuttlePassenger,
} from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const VEHICLE_ID = "01952f1a-0000-7000-8000-000000000020"
const MEMBER_ID = "01952f1a-0000-7000-8000-000000000030"

const VEHICLE_FIXTURE = {
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

describe("getShuttleVehicles", () => {
  it("fetches from the correct path", async () => {
    vi.mocked(apiGet).mockResolvedValue([VEHICLE_FIXTURE])
    await getShuttleVehicles(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/shuttle/${TRIP_ID}/all`)
  })

  it("returns an array of vehicles with passengers", async () => {
    vi.mocked(apiGet).mockResolvedValue([VEHICLE_FIXTURE])
    const result = await getShuttleVehicles(TRIP_ID)
    expect(result).toHaveLength(1)
    expect(result[0].seatsAvailable).toBe(4)
    expect(result[0].passengers).toEqual([])
  })

  it("throws on API failure", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("Forbidden"))
    await expect(getShuttleVehicles(TRIP_ID)).rejects.toThrow("Forbidden")
  })
})

describe("createShuttleVehicle", () => {
  it("posts to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(VEHICLE_FIXTURE)
    await createShuttleVehicle(TRIP_ID, { seatsAvailable: 4, kayakSpots: 2 })
    expect(apiPost).toHaveBeenCalledWith(`/api/shuttle/${TRIP_ID}/create`, {
      seatsAvailable: 4,
      kayakSpots: 2,
    })
  })

  it("revalidates the logistics segment on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(VEHICLE_FIXTURE)
    await createShuttleVehicle(TRIP_ID, {})
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/logistics`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(VEHICLE_FIXTURE)
    const result = await createShuttleVehicle(TRIP_ID, {})
    expect(result).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    const result = await createShuttleVehicle(TRIP_ID, {})
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("updateShuttleVehicle", () => {
  it("patches the correct vehicle", async () => {
    vi.mocked(apiPatch).mockResolvedValue(VEHICLE_FIXTURE)
    await updateShuttleVehicle(TRIP_ID, VEHICLE_ID, { vehicleDescription: "Blue VW" })
    expect(apiPatch).toHaveBeenCalledWith(`/api/shuttle/vehicle/${VEHICLE_ID}`, {
      vehicleDescription: "Blue VW",
    })
  })

  it("revalidates the logistics segment on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(VEHICLE_FIXTURE)
    await updateShuttleVehicle(TRIP_ID, VEHICLE_ID, {})
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/logistics`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("403"))
    const result = await updateShuttleVehicle(TRIP_ID, VEHICLE_ID, {})
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("deleteShuttleVehicle", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteShuttleVehicle(TRIP_ID, VEHICLE_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/shuttle/vehicle/${VEHICLE_ID}`)
  })

  it("revalidates the logistics segment on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteShuttleVehicle(TRIP_ID, VEHICLE_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/logistics`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    const result = await deleteShuttleVehicle(TRIP_ID, VEHICLE_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("addShuttlePassenger", () => {
  it("posts to the correct path with tripMemberId", async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    await addShuttlePassenger(TRIP_ID, VEHICLE_ID, MEMBER_ID)
    expect(apiPost).toHaveBeenCalledWith(`/api/shuttle/vehicle/${VEHICLE_ID}/passenger`, {
      tripMemberId: MEMBER_ID,
    })
  })

  it("revalidates the logistics segment on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    await addShuttlePassenger(TRIP_ID, VEHICLE_ID, MEMBER_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/logistics`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    const result = await addShuttlePassenger(TRIP_ID, VEHICLE_ID, MEMBER_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("removeShuttlePassenger", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await removeShuttlePassenger(TRIP_ID, VEHICLE_ID, MEMBER_ID)
    expect(apiDelete).toHaveBeenCalledWith(
      `/api/shuttle/vehicle/${VEHICLE_ID}/passenger/${MEMBER_ID}`,
    )
  })

  it("revalidates the logistics segment on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await removeShuttlePassenger(TRIP_ID, VEHICLE_ID, MEMBER_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/logistics`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    const result = await removeShuttlePassenger(TRIP_ID, VEHICLE_ID, MEMBER_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})
