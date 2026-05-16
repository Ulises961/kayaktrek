import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/logistics/actions", () => ({
  generateFloatPlanShare: vi.fn(),
  sendFloatPlanShareEmail: vi.fn(),
}))

import { generateFloatPlanShare, sendFloatPlanShareEmail } from "@/lib/logistics/actions"
import { FloatPlanShareSection } from "../float-plan-share-section"
import type { Logistics } from "@/lib/dtos/logistics"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const LOGISTICS_NO_TOKEN: Logistics = {
  id: "01952f1a-0000-7000-8000-000000000002",
  tripId: TRIP_ID,
  shoreContactName: "Alice Shore",
  shoreContactPhone: null,
  shoreContactRelationship: null,
  shoreContactEmail: "alice@example.com",
  shuttleNotes: null,
  shuttleMeetingTime: null,
  shareToken: null,
  snapshotGeneratedAt: null,
}

const LOGISTICS_WITH_TOKEN: Logistics = {
  ...LOGISTICS_NO_TOKEN,
  shareToken: "tok_abc123xyz",
  snapshotGeneratedAt: "2026-05-01T10:00:00Z",
}

const LOGISTICS_NO_EMAIL: Logistics = {
  ...LOGISTICS_WITH_TOKEN,
  shoreContactEmail: null,
}

beforeEach(() => vi.clearAllMocks())

describe("FloatPlanShareSection — no token state", () => {
  it("shows generate button when no token exists", () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_NO_TOKEN} />)
    expect(screen.getByRole("button", { name: /generate float plan link/i })).toBeDefined()
  })

  it("does not show Copy/Email/Regenerate when no token", () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_NO_TOKEN} />)
    expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /email shore contact/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /regenerate/i })).toBeNull()
  })

  it("shows generate button when logistics is null", () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={null} />)
    expect(screen.getByRole("button", { name: /generate float plan link/i })).toBeDefined()
  })

  it("calls generateFloatPlanShare on click and shows token controls on success", async () => {
    vi.mocked(generateFloatPlanShare).mockResolvedValue({
      success: true,
      logistics: LOGISTICS_WITH_TOKEN,
    })
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_NO_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /generate float plan link/i }))
    await waitFor(() => expect(generateFloatPlanShare).toHaveBeenCalledWith(TRIP_ID))
    await waitFor(() => expect(screen.getByRole("button", { name: /copy link/i })).toBeDefined())
  })

  it("shows error message when generation fails", async () => {
    vi.mocked(generateFloatPlanShare).mockResolvedValue({ success: false, error: "Server error." })
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_NO_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /generate float plan link/i }))
    await waitFor(() => expect(screen.getByText("Server error.")).toBeDefined())
  })
})

describe("FloatPlanShareSection — token exists state", () => {
  it("shows Copy, Email, and Regenerate buttons when token is set", () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    expect(screen.getByRole("button", { name: /copy link/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /email shore contact/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeDefined()
  })

  it("shows last-generated timestamp", () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    expect(screen.getByText(/last generated/i)).toBeDefined()
  })

  it("email button is disabled when shoreContactEmail is missing", () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_NO_EMAIL} />)
    const emailBtn = screen.getByRole("button", { name: /email shore contact/i })
    expect((emailBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it("email button is enabled when shoreContactEmail is present", () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    const emailBtn = screen.getByRole("button", { name: /email shore contact/i })
    expect((emailBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it("calls sendFloatPlanShareEmail and shows Sent! feedback on success", async () => {
    vi.mocked(sendFloatPlanShareEmail).mockResolvedValue({ success: true })
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /email shore contact/i }))
    await waitFor(() => expect(sendFloatPlanShareEmail).toHaveBeenCalledWith(TRIP_ID))
    await waitFor(() => expect(screen.getByRole("button", { name: /sent!/i })).toBeDefined())
  })

  it("shows error on email send failure", async () => {
    vi.mocked(sendFloatPlanShareEmail).mockResolvedValue({ success: false, error: "Email failed." })
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /email shore contact/i }))
    await waitFor(() => expect(screen.getByText("Email failed.")).toBeDefined())
  })
})

describe("FloatPlanShareSection — regenerate flow", () => {
  it("opens confirmation dialog when Regenerate is clicked", async () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    expect(screen.getByText(/regenerate float plan link\?/i)).toBeDefined()
  })

  it("closes dialog on Cancel without calling the action", async () => {
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByText(/regenerate float plan link\?/i)).toBeNull())
    expect(generateFloatPlanShare).not.toHaveBeenCalled()
  })

  it("calls generateFloatPlanShare and shows invalidation banner on confirm", async () => {
    const newLogistics = { ...LOGISTICS_WITH_TOKEN, shareToken: "tok_newtoken456" }
    vi.mocked(generateFloatPlanShare).mockResolvedValue({ success: true, logistics: newLogistics })
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }))
    await waitFor(() => expect(generateFloatPlanShare).toHaveBeenCalledWith(TRIP_ID))
    await waitFor(() => expect(screen.getByText(/previous link invalidated/i)).toBeDefined())
  })

  it("dismisses invalidation banner when X is clicked", async () => {
    const newLogistics = { ...LOGISTICS_WITH_TOKEN, shareToken: "tok_newtoken456" }
    vi.mocked(generateFloatPlanShare).mockResolvedValue({ success: true, logistics: newLogistics })
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }))
    await waitFor(() => screen.getByText(/previous link invalidated/i))
    const closeBtn = screen.getByRole("button", { name: "" })
    await userEvent.click(closeBtn)
    await waitFor(() => expect(screen.queryByText(/previous link invalidated/i)).toBeNull())
  })

  it("shows error and stays on token view when regeneration fails", async () => {
    vi.mocked(generateFloatPlanShare).mockResolvedValue({ success: false, error: "Regeneration failed." })
    render(<FloatPlanShareSection tripId={TRIP_ID} logistics={LOGISTICS_WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }))
    await waitFor(() => expect(screen.getByText("Regeneration failed.")).toBeDefined())
    expect(screen.getByRole("button", { name: /copy link/i })).toBeDefined()
  })
})
