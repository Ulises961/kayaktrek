import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { getReservations, createReservation, updateReservation, deleteReservation } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const RESERVATION_ID = "01952f1a-0000-7000-8000-000000000020"

const RESERVATION_FIXTURE = {
  id: RESERVATION_ID,
  tripId: TRIP_ID,
  ownerId: "01952f1a-0000-7000-8000-000000000030",
  type: "accommodation",
  name: "Hotel Cap de Creus",
  date: "2026-07-03",
  confirmationNumber: null,
  notes: null,
  url: null,
}

beforeEach(() => vi.clearAllMocks())

describe("getReservations", () => {
  it("fetches from the correct path", async () => {
    vi.mocked(apiGet).mockResolvedValue([RESERVATION_FIXTURE])
    await getReservations(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/reservation/${TRIP_ID}/all`)
  })

  it("returns an array of reservations", async () => {
    vi.mocked(apiGet).mockResolvedValue([RESERVATION_FIXTURE])
    const result = await getReservations(TRIP_ID)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Hotel Cap de Creus")
  })
})

describe("createReservation", () => {
  it("posts to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(RESERVATION_FIXTURE)
    await createReservation(TRIP_ID, { type: "accommodation", name: "Hotel" })
    expect(apiPost).toHaveBeenCalledWith(`/api/reservation/${TRIP_ID}/create`, { type: "accommodation", name: "Hotel" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(RESERVATION_FIXTURE)
    await createReservation(TRIP_ID, { type: "accommodation", name: "Hotel" })
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(RESERVATION_FIXTURE)
    const result = await createReservation(TRIP_ID, { type: "accommodation", name: "Hotel" })
    expect(result).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("422"))
    const result = await createReservation(TRIP_ID, { type: "accommodation", name: "Hotel" })
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("updateReservation", () => {
  it("patches the correct reservation", async () => {
    vi.mocked(apiPatch).mockResolvedValue(RESERVATION_FIXTURE)
    await updateReservation(TRIP_ID, RESERVATION_ID, { name: "Updated Hotel" })
    expect(apiPatch).toHaveBeenCalledWith(`/api/reservation/${RESERVATION_ID}`, { name: "Updated Hotel" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(RESERVATION_FIXTURE)
    await updateReservation(TRIP_ID, RESERVATION_ID, { name: "Updated" })
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("403"))
    const result = await updateReservation(TRIP_ID, RESERVATION_ID, {})
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("deleteReservation", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteReservation(TRIP_ID, RESERVATION_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/reservation/${RESERVATION_ID}`)
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteReservation(TRIP_ID, RESERVATION_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    const result = await deleteReservation(TRIP_ID, RESERVATION_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})
