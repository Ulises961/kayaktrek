import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/logistics/actions", () => ({ upsertLogistics: vi.fn() }))

import { upsertLogistics } from "@/lib/logistics/actions"
import { EditLogisticsDialog } from "../edit-logistics-dialog"
import type { Logistics } from "@/lib/dtos/logistics"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const LOGISTICS: Logistics = {
  id: "01952f1a-0000-7000-8000-000000000002",
  tripId: TRIP_ID,
  shoreContactName: "Maria García",
  shoreContactEmail: "maria@example.com",
  shoreContactPhone: "+34600000000",
  shoreContactRelationship: "Partner",
  shuttleNotes: null,
  shuttleMeetingTime: null,
}

beforeEach(() => vi.clearAllMocks())

async function openDialog(logistics: Logistics | null = LOGISTICS) {
  render(<EditLogisticsDialog tripId={TRIP_ID} logistics={logistics} />)
  await userEvent.click(screen.getByRole("button", { name: /edit logistics/i }))
}

describe("EditLogisticsDialog", () => {
  it("renders a trigger button", () => {
    render(<EditLogisticsDialog tripId={TRIP_ID} logistics={null} />)
    expect(screen.getByRole("button", { name: /edit logistics/i })).toBeDefined()
  })

  it("opens the dialog on click", async () => {
    await openDialog()
    expect(screen.getByRole("dialog")).toBeDefined()
  })

  it("pre-fills shore contact name from existing logistics", async () => {
    await openDialog()
    const input = screen.getByPlaceholderText(/shore contact name/i)
    expect((input as HTMLInputElement).value).toBe("Maria García")
  })

  it("uses empty strings when logistics is null", async () => {
    await openDialog(null)
    const input = screen.getByPlaceholderText(/shore contact name/i)
    expect((input as HTMLInputElement).value).toBe("")
  })

  it("calls upsertLogistics on submit", async () => {
    vi.mocked(upsertLogistics).mockResolvedValue({ success: true })
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(upsertLogistics).toHaveBeenCalledWith(TRIP_ID, expect.any(Object)))
  })

  it("shows an error when upsertLogistics fails", async () => {
    vi.mocked(upsertLogistics).mockResolvedValue({ success: false, error: "Server error." })
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText("Server error.")).toBeDefined())
  })
})
