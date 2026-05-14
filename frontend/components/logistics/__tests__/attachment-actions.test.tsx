import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AttachmentActions } from "../attachment-actions"

vi.mock("@/lib/travel-documents/actions", () => ({
  uploadTravelDocumentAttachment: vi.fn(),
  deleteTravelDocumentAttachment: vi.fn(),
  getTravelDocumentAttachmentUrl: vi.fn(),
}))

import {
  uploadTravelDocumentAttachment,
  deleteTravelDocumentAttachment,
  getTravelDocumentAttachmentUrl,
} from "@/lib/travel-documents/actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const DOC_ID  = "01952f1a-0000-7000-8000-000000000002"

describe("AttachmentActions — no attachment, can edit", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renders an upload button when no attachment and canEdit", () => {
    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath={null}
        canEdit={true}
      />
    )
    expect(screen.getByRole("button", { name: /upload/i })).toBeDefined()
  })

  it("does not render upload when canEdit is false and no attachment", () => {
    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath={null}
        canEdit={false}
      />
    )
    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull()
  })

  it("calls uploadTravelDocumentAttachment when a file is selected", async () => {
    vi.mocked(uploadTravelDocumentAttachment).mockResolvedValue({ success: true })

    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath={null}
        canEdit={true}
      />
    )

    const file = new File(["content"], "voucher.pdf", { type: "application/pdf" })
    const input = document.querySelector("input[type=file]") as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => {
      expect(uploadTravelDocumentAttachment).toHaveBeenCalledWith(
        TRIP_ID,
        DOC_ID,
        expect.any(FormData)
      )
    })
  })
})

describe("AttachmentActions — attachment exists", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renders a download button when attachment exists", () => {
    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath="trips/abc/doc/voucher.pdf"
        canEdit={false}
      />
    )
    expect(screen.getByRole("button", { name: /download/i })).toBeDefined()
  })

  it("calls getTravelDocumentAttachmentUrl when download is clicked", async () => {
    vi.mocked(getTravelDocumentAttachmentUrl).mockResolvedValue({ success: true, url: "https://example.com/voucher.pdf" })
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath="trips/abc/doc/voucher.pdf"
        canEdit={false}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /download/i }))

    await waitFor(() => {
      expect(getTravelDocumentAttachmentUrl).toHaveBeenCalledWith(DOC_ID)
      expect(openSpy).toHaveBeenCalledWith("https://example.com/voucher.pdf", "_blank")
    })
    openSpy.mockRestore()
  })

  it("renders a remove button when attachment exists and canEdit", () => {
    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath="trips/abc/doc/voucher.pdf"
        canEdit={true}
      />
    )
    expect(screen.getByRole("button", { name: /remove/i })).toBeDefined()
  })

  it("does not render remove button when canEdit is false", () => {
    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath="trips/abc/doc/voucher.pdf"
        canEdit={false}
      />
    )
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull()
  })

  it("calls deleteTravelDocumentAttachment when remove is confirmed", async () => {
    vi.mocked(deleteTravelDocumentAttachment).mockResolvedValue({ success: true })

    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath="trips/abc/doc/voucher.pdf"
        canEdit={true}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /remove/i }))
    // AlertDialog confirmation
    const confirmBtn = await screen.findByRole("button", { name: /remove/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(deleteTravelDocumentAttachment).toHaveBeenCalledWith(TRIP_ID, DOC_ID)
    })
  })
})

describe("AttachmentActions — drag and drop", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows a drag zone when no attachment and canEdit", () => {
    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath={null}
        canEdit={true}
      />
    )
    expect(screen.getByTestId("drop-zone")).toBeDefined()
  })

  it("handles dragOver and drop events without throwing", () => {
    vi.mocked(uploadTravelDocumentAttachment).mockResolvedValue({ success: true })

    render(
      <AttachmentActions
        tripId={TRIP_ID}
        documentId={DOC_ID}
        attachmentPath={null}
        canEdit={true}
      />
    )

    const zone = screen.getByTestId("drop-zone")
    fireEvent.dragOver(zone)
    expect(zone).toBeDefined()
  })
})
