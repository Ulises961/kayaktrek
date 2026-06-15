import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/logistics/actions", () => ({
  upsertLogistics: vi.fn(),
}))

import { upsertLogistics } from "@/lib/logistics/actions"
import { ShoreContactForm } from "../float-plan-shore-contact-form"
import type { Logistics } from "@/lib/dtos/logistics"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const LOGISTICS: Logistics = {
  id: "01952f1a-0000-7000-8000-000000000002",
  tripId: TRIP_ID,
  shoreContactName: "Jane Doe",
  shoreContactPhone: "+1234567890",
  shoreContactRelationship: "Partner",
  shoreContactEmail: null,
  shuttleNotes: null,
  shuttleMeetingTime: null,
}

beforeEach(() => vi.clearAllMocks())

describe("ShoreContactForm — viewing state", () => {
  it("shows read-only values and no form inputs by default", () => {
    render(<ShoreContactForm tripId={TRIP_ID} logistics={LOGISTICS} />)
    expect(screen.getByText("Jane Doe")).toBeDefined()
    expect(screen.queryByLabelText(/^name$/i)).toBeNull()
  })

  it("shows a placeholder when logistics is null", () => {
    render(<ShoreContactForm tripId={TRIP_ID} logistics={null} />)
    expect(screen.getByText(/no shore contact/i)).toBeDefined()
  })

  it("shows an Edit button", () => {
    render(<ShoreContactForm tripId={TRIP_ID} logistics={LOGISTICS} />)
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
  })
})

describe("ShoreContactForm — editing state", () => {
  it("shows form fields after clicking Edit", async () => {
    render(<ShoreContactForm tripId={TRIP_ID} logistics={LOGISTICS} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(screen.getByLabelText(/^name$/i)).toBeDefined()
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe("Jane Doe")
  })

  it("returns to read-only on Cancel", async () => {
    render(<ShoreContactForm tripId={TRIP_ID} logistics={LOGISTICS} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(screen.queryByLabelText(/^name$/i)).toBeNull()
    expect(screen.getByText("Jane Doe")).toBeDefined()
  })

  it("calls upsertLogistics and returns to read-only on Save", async () => {
    vi.mocked(upsertLogistics).mockResolvedValue({ success: true })
    render(<ShoreContactForm tripId={TRIP_ID} logistics={LOGISTICS} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() =>
      expect(upsertLogistics).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ shoreContactName: "Jane Doe" }),
      ),
    )
    await waitFor(() => expect(screen.queryByLabelText(/^name$/i)).toBeNull())
  })

  it("shows error and stays in editing on failure", async () => {
    vi.mocked(upsertLogistics).mockResolvedValue({
      success: false,
      error: "Failed to save logistics.",
    })
    render(<ShoreContactForm tripId={TRIP_ID} logistics={LOGISTICS} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText("Failed to save logistics.")).toBeDefined())
    expect(screen.getByLabelText(/^name$/i)).toBeDefined()
  })
})
