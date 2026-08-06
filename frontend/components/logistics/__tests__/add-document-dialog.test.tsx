import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/travel-documents/actions", () => ({
  createTravelDocument: vi.fn(),
  updateTravelDocument: vi.fn(),
  uploadTravelDocumentAttachment: vi.fn(),
}))

import {
  createTravelDocument,
  updateTravelDocument,
  uploadTravelDocumentAttachment,
} from "@/lib/travel-documents/actions"
import { AddDocumentDialog } from "../add-document-dialog"
import { EditDocumentDialog } from "../edit-document-dialog"
import type { TravelDocument } from "@/lib/dtos/travel-document"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const DOC_ID = "01952f1a-0000-7000-8000-000000000002"

const DOCUMENT: TravelDocument = {
  id: DOC_ID,
  tripId: TRIP_ID,
  ownerId: "01952f1a-0000-7000-8000-000000000003",
  type: "transport",
  name: "Ferry La Escala",
  date: "2026-07-01",
  expiryDate: null,
  confirmationNumber: "FER-001",
  url: null,
  notes: null,
  attachmentPath: null,
}

beforeEach(() => vi.clearAllMocks())

describe("AddDocumentDialog", () => {
  it("renders an 'Add document' trigger button", () => {
    render(<AddDocumentDialog tripId={TRIP_ID} />)
    expect(screen.getByRole("button", { name: /add document/i })).toBeDefined()
  })

  it("opens the dialog on click", async () => {
    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    expect(screen.getByRole("dialog")).toBeDefined()
  })

  it("has name and type fields", async () => {
    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    expect(screen.getByPlaceholderText(/document name/i)).toBeDefined()
  })

  it("has a file picker", async () => {
    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    expect(screen.getByRole("button", { name: /choose file/i })).toBeDefined()
  })

  it("calls createTravelDocument on submit with name and type", async () => {
    vi.mocked(createTravelDocument).mockResolvedValue({ success: true, document: DOCUMENT })
    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    await userEvent.type(screen.getByPlaceholderText(/document name/i), "Ferry La Escala")
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() =>
      expect(createTravelDocument).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ name: "Ferry La Escala" }),
      ),
    )
  })

  it("uploads the file after creating the document when a file is selected", async () => {
    vi.mocked(createTravelDocument).mockResolvedValue({ success: true, document: DOCUMENT })
    vi.mocked(uploadTravelDocumentAttachment).mockResolvedValue({ success: true })

    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    await userEvent.type(screen.getByPlaceholderText(/document name/i), "Ferry La Escala")

    const file = new File(["content"], "ticket.pdf", { type: "application/pdf" })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)

    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() => {
      expect(createTravelDocument).toHaveBeenCalled()
      expect(uploadTravelDocumentAttachment).toHaveBeenCalledWith(
        TRIP_ID,
        DOC_ID,
        expect.any(FormData),
      )
    })
  })

  it("skips upload when no file is selected", async () => {
    vi.mocked(createTravelDocument).mockResolvedValue({ success: true, document: DOCUMENT })

    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    await userEvent.type(screen.getByPlaceholderText(/document name/i), "Ferry La Escala")
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))

    await waitFor(() => expect(createTravelDocument).toHaveBeenCalled())
    expect(uploadTravelDocumentAttachment).not.toHaveBeenCalled()
  })

  it("shows an error when createTravelDocument fails", async () => {
    vi.mocked(createTravelDocument).mockResolvedValue({ success: false, error: "Not a member." })
    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    await userEvent.type(screen.getByPlaceholderText(/document name/i), "Hotel")
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() => expect(screen.getByText("Not a member.")).toBeDefined())
  })

  it("closes and resets after successful add", async () => {
    vi.mocked(createTravelDocument).mockResolvedValue({ success: true, document: DOCUMENT })
    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    await userEvent.type(screen.getByPlaceholderText(/document name/i), "Hotel")
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("shows error when uploadTravelDocumentAttachment fails after document creation", async () => {
    vi.mocked(createTravelDocument).mockResolvedValue({ success: true, document: DOCUMENT })
    vi.mocked(uploadTravelDocumentAttachment).mockResolvedValue({
      success: false,
      error: "File is too large.",
    })

    render(<AddDocumentDialog tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /add document/i }))
    await userEvent.type(screen.getByPlaceholderText(/document name/i), "Ferry La Escala")

    const file = new File(["content"], "ticket.pdf", { type: "application/pdf" })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)

    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    // Dialog stays open so error is visible and can be read
    await waitFor(() =>
      expect(screen.getByText(/Document saved, but the file could not be uploaded/)).toBeDefined(),
    )
    // Dialog should still be visible
    expect(screen.getByRole("dialog")).toBeDefined()
  })
})

describe("EditDocumentDialog", () => {
  it("pre-fills the document name", async () => {
    render(<EditDocumentDialog tripId={TRIP_ID} document={DOCUMENT} open onOpenChange={vi.fn()} />)
    const input = screen.getByPlaceholderText(/document name/i)
    expect((input as HTMLInputElement).value).toBe("Ferry La Escala")
  })

  it("calls updateTravelDocument on submit", async () => {
    vi.mocked(updateTravelDocument).mockResolvedValue({ success: true })
    const onOpenChange = vi.fn()
    render(
      <EditDocumentDialog tripId={TRIP_ID} document={DOCUMENT} open onOpenChange={onOpenChange} />,
    )
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() =>
      expect(updateTravelDocument).toHaveBeenCalledWith(TRIP_ID, DOC_ID, expect.any(Object)),
    )
  })

  it("shows an error when updateTravelDocument fails", async () => {
    vi.mocked(updateTravelDocument).mockResolvedValue({ success: false, error: "Expired." })
    render(<EditDocumentDialog tripId={TRIP_ID} document={DOCUMENT} open onOpenChange={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText("Expired.")).toBeDefined())
  })
})
