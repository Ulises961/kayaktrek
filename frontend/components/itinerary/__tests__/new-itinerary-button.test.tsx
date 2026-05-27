import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockCreateItinerary, mockPush } = vi.hoisted(() => ({
  mockCreateItinerary: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock("@/lib/itinerary/actions", () => ({
  createItinerary: mockCreateItinerary,
}))

import { NewItineraryButton } from "../new-itinerary-button"

const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000002"

beforeEach(() => vi.clearAllMocks())

describe("NewItineraryButton", () => {
  it("renders the trigger button", () => {
    render(<NewItineraryButton />)
    expect(screen.getByRole("button", { name: /new itinerary/i })).toBeDefined()
  })

  it("opens the dialog when the trigger is clicked", async () => {
    render(<NewItineraryButton />)
    await userEvent.click(screen.getByRole("button", { name: /new itinerary/i }))
    expect(screen.getByRole("dialog")).toBeDefined()
    expect(screen.getByLabelText(/name/i)).toBeDefined()
  })

  it("submits with the entered name and redirects on success", async () => {
    mockCreateItinerary.mockResolvedValue({ success: true, itineraryId: ITINERARY_ID })
    render(<NewItineraryButton />)

    await userEvent.click(screen.getByRole("button", { name: /new itinerary/i }))
    await userEvent.type(screen.getByLabelText(/name/i), "Galicia Coast")
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))

    expect(mockCreateItinerary).toHaveBeenCalledWith({ name: "Galicia Coast" })
    expect(mockPush).toHaveBeenCalledWith(`/itinerary/${ITINERARY_ID}`)
  })

  it("shows a validation error when name is empty", async () => {
    render(<NewItineraryButton />)
    await userEvent.click(screen.getByRole("button", { name: /new itinerary/i }))
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))

    expect(screen.getByText(/name is required/i)).toBeDefined()
    expect(mockCreateItinerary).not.toHaveBeenCalled()
  })

  it("does not redirect when createItinerary returns failure", async () => {
    mockCreateItinerary.mockResolvedValue({ success: false, error: "Server error" })
    render(<NewItineraryButton />)

    await userEvent.click(screen.getByRole("button", { name: /new itinerary/i }))
    await userEvent.type(screen.getByLabelText(/name/i), "Some Route")
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))

    expect(mockPush).not.toHaveBeenCalled()
  })
})
