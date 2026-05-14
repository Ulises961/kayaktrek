import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPut } from "@/lib/api/client"
import { getLogistics, upsertLogistics } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"

const LOGISTICS_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000001",
  tripId: TRIP_ID,
  shoreContactName: "Maria",
  shoreContactEmail: "maria@example.com",
  shoreContactPhone: null,
  shoreContactRelationship: null,
  shuttleNotes: null,
  shuttleMeetingTime: null,
}

beforeEach(() => vi.clearAllMocks())

describe("getLogistics", () => {
  it("fetches from the correct path", async () => {
    vi.mocked(apiGet).mockResolvedValue(LOGISTICS_FIXTURE)
    await getLogistics(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/logistics/${TRIP_ID}`)
  })

  it("returns parsed logistics on success", async () => {
    vi.mocked(apiGet).mockResolvedValue(LOGISTICS_FIXTURE)
    const result = await getLogistics(TRIP_ID)
    expect(result).toMatchObject({ shoreContactName: "Maria" })
  })

  it("returns null when the API returns an empty object (not yet created)", async () => {
    vi.mocked(apiGet).mockResolvedValue({})
    const result = await getLogistics(TRIP_ID)
    expect(result).toBeNull()
  })
})

describe("upsertLogistics", () => {
  it("PUTs to the correct path", async () => {
    vi.mocked(apiPut).mockResolvedValue(LOGISTICS_FIXTURE)
    await upsertLogistics(TRIP_ID, { shoreContactName: "Maria" })
    expect(apiPut).toHaveBeenCalledWith(`/api/logistics/${TRIP_ID}`, { shoreContactName: "Maria" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPut).mockResolvedValue(LOGISTICS_FIXTURE)
    await upsertLogistics(TRIP_ID, {})
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPut).mockResolvedValue(LOGISTICS_FIXTURE)
    const result = await upsertLogistics(TRIP_ID, {})
    expect(result).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPut).mockRejectedValue(new Error("403"))
    const result = await upsertLogistics(TRIP_ID, {})
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})
