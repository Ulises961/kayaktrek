import { describe, it, expect, vi, afterEach } from "vitest"

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/client")>()),
  apiGet,
}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("@/lib/auth/actions", () => ({ refreshSession: vi.fn() }))

import { ApiError } from "@/lib/api/client"
import { getTripCore } from "../core"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

describe("getTripCore", () => {
  afterEach(() => vi.clearAllMocks())

  it("returns the parsed trip", async () => {
    apiGet.mockResolvedValue({ id: TRIP_ID, destination: "Garda" })

    await expect(getTripCore(TRIP_ID)).resolves.toMatchObject({ destination: "Garda" })
  })

  it.each([403, 404])(
    "returns null for a %i, which the caller renders as not-found",
    async (status) => {
      apiGet.mockRejectedValue(new ApiError("nope", status))

      await expect(getTripCore(TRIP_ID)).resolves.toBeNull()
    },
  )

  it.each([500, 503])(
    "rethrows a %i instead of pretending the trip does not exist",
    async (status) => {
      const failure = new ApiError("backend down", status)
      apiGet.mockRejectedValue(failure)

      await expect(getTripCore(TRIP_ID)).rejects.toBe(failure)
    },
  )

  it("rethrows a timeout instead of pretending the trip does not exist", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError")
    apiGet.mockRejectedValue(timeout)

    await expect(getTripCore(TRIP_ID)).rejects.toBe(timeout)
  })

  it("rethrows a response that fails the schema — our bug, not a missing trip", async () => {
    apiGet.mockResolvedValue({ id: "not-a-uuid" })

    await expect(getTripCore(TRIP_ID)).rejects.toMatchObject({ name: "ZodError" })
  })
})
