import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({ createTrip: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))

import { createTrip } from "@/lib/trips/actions"
import { useRouter } from "next/navigation"
import { NewTripDialog } from "../new-trip-dialog"

const mockPush = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any)
})

async function openDialog() {
  render(<NewTripDialog />)
  await userEvent.click(screen.getByRole("button", { name: /new trip/i }))
}

describe("NewTripDialog", () => {
  it("renders a trigger button", () => {
    render(<NewTripDialog />)
    expect(screen.getByRole("button", { name: /new trip/i })).toBeDefined()
  })

  it("opens the dialog on click", async () => {
    await openDialog()
    expect(screen.getByRole("dialog")).toBeDefined()
  })

  it("has destination, dateFrom, and dateTo fields", async () => {
    await openDialog()
    expect(screen.getByPlaceholderText(/destination/i)).toBeDefined()
    expect(screen.getByLabelText(/from/i)).toBeDefined()
    expect(screen.getByLabelText(/to/i)).toBeDefined()
  })

  describe("start date", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 15, 10, 0) })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    async function openFromCalendar() {
      await openDialog()
      await userEvent.click(screen.getByLabelText(/from/i))
    }

    it("allows starting today", async () => {
      await openFromCalendar()
      expect(screen.getByRole("button", { name: /15th/ })).toBeEnabled()
    })

    it("disables every day before today", async () => {
      await openFromCalendar()
      expect(screen.getByRole("button", { name: /14th/ })).toBeDisabled()
      expect(screen.getByRole("button", { name: /September 1st,/ })).toBeDisabled()
    })
  })

  describe("end date", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 15, 10, 0) })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it("cannot be before today while no start date is chosen", async () => {
      await openDialog()
      await userEvent.click(screen.getByLabelText(/to/i))
      expect(screen.getByRole("button", { name: /September 14th,/ })).toBeDisabled()
      expect(screen.getByRole("button", { name: /September 15th,/ })).toBeEnabled()
    })

    it("cannot be before the chosen start date", async () => {
      await openDialog()
      await userEvent.click(screen.getByLabelText(/from/i))
      await userEvent.click(screen.getByRole("button", { name: /September 20th,/ }))
      await userEvent.click(screen.getByLabelText(/to/i))
      expect(screen.getByRole("button", { name: /September 19th,/ })).toBeDisabled()
      expect(screen.getByRole("button", { name: /September 20th,/ })).toBeEnabled()
    })
  })

  it("calls createTrip with the entered values on submit", async () => {
    vi.mocked(createTrip).mockResolvedValue({ success: true, tripId: "new-id" })
    await openDialog()

    await userEvent.type(screen.getByPlaceholderText(/destination/i), "Costa Brava")
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))

    await waitFor(() => {
      expect(createTrip).toHaveBeenCalledWith(
        expect.objectContaining({ destination: "Costa Brava" }),
      )
    })
  })

  it("redirects to the new trip on success", async () => {
    vi.mocked(createTrip).mockResolvedValue({ success: true, tripId: "new-id" })
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/trips/new-id"))
  })

  it("shows an error when createTrip fails", async () => {
    vi.mocked(createTrip).mockResolvedValue({ success: false, error: "Server error." })
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))

    await waitFor(() => expect(screen.getByText("Server error.")).toBeDefined())
    // Not rolled forward on failure — no navigation, and the dialog (with the
    // typed data still in it) stays open for the user to retry.
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})
