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
import { getDocuments, createDocument, updateDocument, deleteDocument } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const DOCUMENT_ID = "01952f1a-0000-7000-8000-000000000020"

const DOCUMENT_FIXTURE = {
  id: DOCUMENT_ID,
  tripId: TRIP_ID,
  ownerId: "01952f1a-0000-7000-8000-000000000030",
  type: "licence",
  name: "Sea kayak licence",
  expiryDate: "2027-01-01",
  notes: null,
}

beforeEach(() => vi.clearAllMocks())

describe("getDocuments", () => {
  it("fetches from the correct path", async () => {
    vi.mocked(apiGet).mockResolvedValue([DOCUMENT_FIXTURE])
    await getDocuments(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/document/${TRIP_ID}/all`)
  })

  it("returns an array of documents", async () => {
    vi.mocked(apiGet).mockResolvedValue([DOCUMENT_FIXTURE])
    const result = await getDocuments(TRIP_ID)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Sea kayak licence")
  })
})

describe("createDocument", () => {
  it("posts to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(DOCUMENT_FIXTURE)
    await createDocument(TRIP_ID, { type: "licence", name: "Sea kayak licence" })
    expect(apiPost).toHaveBeenCalledWith(`/api/document/${TRIP_ID}/create`, { type: "licence", name: "Sea kayak licence" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(DOCUMENT_FIXTURE)
    await createDocument(TRIP_ID, { type: "licence", name: "Licence" })
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(DOCUMENT_FIXTURE)
    const result = await createDocument(TRIP_ID, { type: "licence", name: "Licence" })
    expect(result).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("422"))
    const result = await createDocument(TRIP_ID, { type: "licence", name: "Licence" })
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("updateDocument", () => {
  it("patches the correct document", async () => {
    vi.mocked(apiPatch).mockResolvedValue(DOCUMENT_FIXTURE)
    await updateDocument(TRIP_ID, DOCUMENT_ID, { name: "Updated Licence" })
    expect(apiPatch).toHaveBeenCalledWith(`/api/document/${DOCUMENT_ID}`, { name: "Updated Licence" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(DOCUMENT_FIXTURE)
    await updateDocument(TRIP_ID, DOCUMENT_ID, { name: "Updated" })
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("403"))
    const result = await updateDocument(TRIP_ID, DOCUMENT_ID, {})
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("deleteDocument", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteDocument(TRIP_ID, DOCUMENT_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/document/${DOCUMENT_ID}`)
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteDocument(TRIP_ID, DOCUMENT_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    const result = await deleteDocument(TRIP_ID, DOCUMENT_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})
