import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiUpload: vi.fn(),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload } from "@/lib/api/client"
import {
  getTravelDocuments,
  createTravelDocument,
  updateTravelDocument,
  deleteTravelDocument,
  uploadTravelDocumentAttachment,
  deleteTravelDocumentAttachment,
  getTravelDocumentAttachmentUrl,
} from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const DOC_ID = "01952f1a-0000-7000-8000-000000000020"
const OWNER_ID = "01952f1a-0000-7000-8000-000000000030"

const DOC_FIXTURE = {
  id: DOC_ID,
  tripId: TRIP_ID,
  ownerId: OWNER_ID,
  type: "accommodation",
  name: "Hotel Cap de Creus",
  date: "2026-07-03",
  expiryDate: null,
  confirmationNumber: "CONF-1234",
  url: null,
  notes: null,
  attachmentPath: null,
}

beforeEach(() => vi.clearAllMocks())

describe("getTravelDocuments", () => {
  it("fetches from the correct path", async () => {
    vi.mocked(apiGet).mockResolvedValue([DOC_FIXTURE])
    await getTravelDocuments(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/travel-document/${TRIP_ID}/all`)
  })

  it("returns an array of documents", async () => {
    vi.mocked(apiGet).mockResolvedValue([DOC_FIXTURE])
    const result = await getTravelDocuments(TRIP_ID)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Hotel Cap de Creus")
  })
})

describe("createTravelDocument", () => {
  it("posts to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(DOC_FIXTURE)
    await createTravelDocument(TRIP_ID, { type: "accommodation", name: "Hotel" })
    expect(apiPost).toHaveBeenCalledWith(`/api/travel-document/${TRIP_ID}/create`, { type: "accommodation", name: "Hotel" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(DOC_FIXTURE)
    await createTravelDocument(TRIP_ID, { type: "accommodation", name: "Hotel" })
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true with document on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(DOC_FIXTURE)
    const result = await createTravelDocument(TRIP_ID, { type: "accommodation", name: "Hotel" })
    expect(result).toMatchObject({ success: true, document: expect.objectContaining({ name: "Hotel Cap de Creus" }) })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    const result = await createTravelDocument(TRIP_ID, { type: "accommodation", name: "Hotel" })
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("updateTravelDocument", () => {
  it("patches the correct document", async () => {
    vi.mocked(apiPatch).mockResolvedValue(DOC_FIXTURE)
    await updateTravelDocument(TRIP_ID, DOC_ID, { name: "Updated Hotel" })
    expect(apiPatch).toHaveBeenCalledWith(`/api/travel-document/${DOC_ID}`, { name: "Updated Hotel" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(DOC_FIXTURE)
    await updateTravelDocument(TRIP_ID, DOC_ID, {})
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("403"))
    const result = await updateTravelDocument(TRIP_ID, DOC_ID, {})
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("deleteTravelDocument", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteTravelDocument(TRIP_ID, DOC_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/travel-document/${DOC_ID}`)
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteTravelDocument(TRIP_ID, DOC_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    const result = await deleteTravelDocument(TRIP_ID, DOC_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("uploadTravelDocumentAttachment", () => {
  it("uploads to the correct path", async () => {
    vi.mocked(apiUpload).mockResolvedValue(DOC_FIXTURE)
    const formData = new FormData()
    await uploadTravelDocumentAttachment(TRIP_ID, DOC_ID, formData)
    expect(apiUpload).toHaveBeenCalledWith(`/api/travel-document/${DOC_ID}/attachment`, formData)
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiUpload).mockResolvedValue(DOC_FIXTURE)
    await uploadTravelDocumentAttachment(TRIP_ID, DOC_ID, new FormData())
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiUpload).mockRejectedValue(new Error("413"))
    const result = await uploadTravelDocumentAttachment(TRIP_ID, DOC_ID, new FormData())
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("deleteTravelDocumentAttachment", () => {
  it("sends DELETE to the attachment path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteTravelDocumentAttachment(TRIP_ID, DOC_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/travel-document/${DOC_ID}/attachment`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    const result = await deleteTravelDocumentAttachment(TRIP_ID, DOC_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("getTravelDocumentAttachmentUrl", () => {
  it("fetches the presigned URL", async () => {
    vi.mocked(apiGet).mockResolvedValue({ url: "https://minio.example.com/presigned" })
    const result = await getTravelDocumentAttachmentUrl(DOC_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/travel-document/${DOC_ID}/attachment`)
    expect(result).toEqual({ success: true, url: "https://minio.example.com/presigned" })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("404"))
    const result = await getTravelDocumentAttachmentUrl(DOC_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})
