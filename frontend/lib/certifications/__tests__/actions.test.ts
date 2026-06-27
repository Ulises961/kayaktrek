import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  listCertifications,
  addCertification,
  updateCertification,
  deleteCertification,
} from "../actions"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"

const GET = apiGet as ReturnType<typeof vi.fn>
const POST = apiPost as ReturnType<typeof vi.fn>
const PATCH = apiPatch as ReturnType<typeof vi.fn>
const DELETE = apiDelete as ReturnType<typeof vi.fn>

const FIELDS = { organization: "British Canoeing", award: "Sea Kayak Leader" }
const ELEVATED = { "X-Elevated-Token": "tok" }

beforeEach(() => vi.clearAllMocks())

describe("listCertifications", () => {
  it("parses the response through the schema", async () => {
    GET.mockResolvedValue([{ organization: "RYA", award: "Day Skipper" }])
    const result = await listCertifications()
    expect(GET).toHaveBeenCalledWith("/api/user/me/certifications")
    expect(result).toMatchObject({ success: true })
    if (result.success) expect(result.certifications).toHaveLength(1)
  })

  it("returns an error when the fetch fails", async () => {
    GET.mockRejectedValue(new Error("500"))
    expect(await listCertifications()).toEqual({
      success: false,
      error: "Failed to load certifications.",
    })
  })
})

describe("addCertification", () => {
  it("posts with the elevated-token header and a null-coerced payload", async () => {
    POST.mockResolvedValue({})
    const result = await addCertification("tok", FIELDS)
    expect(POST).toHaveBeenCalledWith(
      "/api/user/me/certifications",
      {
        organization: "British Canoeing",
        award: "Sea Kayak Leader",
        membershipNumber: null,
        awardedAt: null,
        validUntil: null,
      },
      ELEVATED,
    )
    expect(result).toEqual({ success: true })
  })

  it("maps a 403 to a re-authenticate message", async () => {
    POST.mockRejectedValue(new Error("POST ... failed: 403"))
    expect(await addCertification("tok", FIELDS)).toEqual({
      success: false,
      error: "Session expired. Please re-authenticate.",
    })
  })
})

describe("updateCertification", () => {
  it("patches the cert by id with the elevated header", async () => {
    PATCH.mockResolvedValue({})
    const result = await updateCertification("tok", "cert-1", FIELDS)
    expect(PATCH).toHaveBeenCalledWith(
      "/api/user/me/certifications/cert-1",
      expect.objectContaining({ organization: "British Canoeing" }),
      ELEVATED,
    )
    expect(result).toEqual({ success: true })
  })
})

describe("deleteCertification", () => {
  it("deletes the cert by id with the elevated header", async () => {
    DELETE.mockResolvedValue(undefined)
    const result = await deleteCertification("tok", "cert-1")
    expect(DELETE).toHaveBeenCalledWith("/api/user/me/certifications/cert-1", ELEVATED)
    expect(result).toEqual({ success: true })
  })
})
