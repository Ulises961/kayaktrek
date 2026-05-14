import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TravelDocumentsSection } from "../travel-documents-section"
import type { TravelDocument } from "@/lib/dtos/travel-document"

const TODAY = "2026-07-15"

const makeDoc = (overrides: Partial<TravelDocument> = {}): TravelDocument => ({
  id: "01952f1a-0000-7000-8000-000000000001",
  tripId: "01952f1a-0000-7000-8000-000000000002",
  ownerId: "01952f1a-0000-7000-8000-000000000003",
  type: "accommodation",
  name: "Hotel Cap de Creus",
  date: null,
  expiryDate: null,
  confirmationNumber: null,
  url: null,
  notes: null,
  attachmentPath: null,
  ...overrides,
})

describe("TravelDocumentsSection", () => {
  it("shows empty state when no documents", () => {
    render(<TravelDocumentsSection documents={[]} today={TODAY} />)
    expect(screen.getByText(/no travel documents/i)).toBeDefined()
  })

  it("renders document name", () => {
    render(<TravelDocumentsSection documents={[makeDoc()]} today={TODAY} />)
    expect(screen.getByText("Hotel Cap de Creus")).toBeDefined()
  })

  it("renders document type label", () => {
    render(<TravelDocumentsSection documents={[makeDoc({ type: "transport" })]} today={TODAY} />)
    expect(screen.getByText(/transport/i)).toBeDefined()
  })

  it("shows confirmation number when set", () => {
    render(<TravelDocumentsSection documents={[makeDoc({ confirmationNumber: "CONF-1234" })]} today={TODAY} />)
    expect(screen.getByText("CONF-1234")).toBeDefined()
  })

  it("shows overdue badge when date is before today", () => {
    render(<TravelDocumentsSection documents={[makeDoc({ date: "2026-07-10" })]} today={TODAY} />)
    expect(screen.getByText(/overdue/i)).toBeDefined()
  })

  it("shows expiring-soon badge when expiryDate is within 30 days", () => {
    render(<TravelDocumentsSection documents={[makeDoc({ expiryDate: "2026-08-01" })]} today={TODAY} />)
    expect(screen.getByText(/expir/i)).toBeDefined()
  })

  it("does not show a badge when date is in the future and expiry is far off", () => {
    render(<TravelDocumentsSection documents={[makeDoc({ date: "2026-08-15", expiryDate: "2027-01-01" })]} today={TODAY} />)
    expect(screen.queryByText(/overdue/i)).toBeNull()
    expect(screen.queryByText(/expir/i)).toBeNull()
  })

  it("shows a URL link when url is set", () => {
    render(<TravelDocumentsSection documents={[makeDoc({ url: "https://booking.example.com" })]} today={TODAY} />)
    const link = screen.getByRole("link")
    expect(link).toBeDefined()
  })

  it("shows a download button when attachmentPath is set", () => {
    render(<TravelDocumentsSection documents={[makeDoc({ attachmentPath: "trips/abc/doc1/voucher.pdf" })]} today={TODAY} />)
    expect(screen.getByText(/download/i)).toBeDefined()
  })

  it("groups documents by type — shows both type headings when both present", () => {
    const docs = [
      makeDoc({ id: "01952f1a-0000-7000-8000-000000000001", type: "accommodation", name: "Hotel" }),
      makeDoc({ id: "01952f1a-0000-7000-8000-000000000002", type: "transport", name: "Ferry" }),
    ]
    render(<TravelDocumentsSection documents={docs} today={TODAY} />)
    expect(screen.getByText("Hotel")).toBeDefined()
    expect(screen.getByText("Ferry")).toBeDefined()
  })
})
