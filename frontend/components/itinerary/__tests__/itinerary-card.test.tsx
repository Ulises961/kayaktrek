import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const {
  mockUpdateItinerary,
  mockRefresh,
  mockPush,
  mockCreateTripFromItinerary,
  mockDeleteItinerary,
  mockToastError,
} = vi.hoisted(() => ({
  mockUpdateItinerary: vi.fn(),
  mockRefresh: vi.fn(),
  mockPush: vi.fn(),
  mockCreateTripFromItinerary: vi.fn(),
  mockDeleteItinerary: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}))

vi.mock("@/lib/itinerary/actions", () => ({
  updateItinerary: mockUpdateItinerary,
  createTripFromItinerary: mockCreateTripFromItinerary,
  deleteItinerary: mockDeleteItinerary,
  generateStoryShare: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { error: mockToastError } }))

import { ItineraryCard } from "../itinerary-card"
import { DISTANCE_UNIT, formatDistance } from "@/lib/itinerary/distance"
import type { Itinerary } from "@/lib/dtos/itinerary"

const BASE: Itinerary = {
  id: "01952f1a-0000-7000-8000-000000000001",
  name: "Galicia Coast",
  isPublic: false,
  avgSpeedKnots: 2.5,
  totalMiles: 42.3,
  days: [],
}

beforeEach(() => vi.clearAllMocks())

describe("ItineraryCard — content", () => {
  it("renders the itinerary name", () => {
    render(<ItineraryCard itinerary={BASE} />)
    expect(screen.getByText("Galicia Coast")).toBeInTheDocument()
  })

  it("falls back to 'Unnamed itinerary' when name is absent", () => {
    render(<ItineraryCard itinerary={{ ...BASE, name: null }} />)
    expect(screen.getByText("Unnamed itinerary")).toBeInTheDocument()
  })

  it("shows the Public badge when isPublic is true", () => {
    render(<ItineraryCard itinerary={{ ...BASE, isPublic: true }} />)
    expect(screen.getByText("Public")).toBeInTheDocument()
  })

  it("hides the Public badge when isPublic is false", () => {
    render(<ItineraryCard itinerary={BASE} />)
    expect(screen.queryByText("Public")).not.toBeInTheDocument()
  })

  it("renders day count when days are present", () => {
    const days = [
      { id: "d1", dayNumber: 1, itineraryId: BASE.id! },
      { id: "d2", dayNumber: 2, itineraryId: BASE.id! },
    ]
    render(<ItineraryCard itinerary={{ ...BASE, days }} />)
    expect(screen.getByText("2 days")).toBeInTheDocument()
  })

  it("renders singular 'day' for a single day", () => {
    const days = [{ id: "d1", dayNumber: 1, itineraryId: BASE.id! }]
    render(<ItineraryCard itinerary={{ ...BASE, days }} />)
    expect(screen.getByText("1 day")).toBeInTheDocument()
  })

  it("renders the total distance in nm by default", () => {
    render(<ItineraryCard itinerary={BASE} />)
    expect(screen.getByText("42.3 nm")).toBeInTheDocument()
  })

  it("converts the total distance to km when unit is km", () => {
    render(<ItineraryCard itinerary={BASE} unit={DISTANCE_UNIT.KM} />)
    expect(screen.getByText(`${formatDistance(42.3, DISTANCE_UNIT.KM)} km`)).toBeInTheDocument()
    expect(screen.queryByText(/42\.3 nm/)).not.toBeInTheDocument()
  })

  it("links to the itinerary builder", () => {
    render(<ItineraryCard itinerary={BASE} />)
    const link = screen.getByRole("link", { name: /galicia coast/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${BASE.id}`)
  })
})

describe("ItineraryCard — public toggle", () => {
  it("shows 'Make public' when itinerary is private", () => {
    render(<ItineraryCard itinerary={BASE} />)
    expect(screen.getByRole("button", { name: /make public/i })).toBeInTheDocument()
  })

  it("shows 'Make private' when itinerary is public", () => {
    render(<ItineraryCard itinerary={{ ...BASE, isPublic: true }} />)
    expect(screen.getByRole("button", { name: /make private/i })).toBeInTheDocument()
  })

  it("asks for the pitch instead of publishing straight away (M19 §1)", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={BASE} />)
    await userEvent.click(screen.getByRole("button", { name: /make public/i }))

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    // Nothing is published until the author submits — the click alone must not
    // make the route public with no description on it.
    expect(mockUpdateItinerary).not.toHaveBeenCalled()
  })

  it("publishes with the pitch when the dialog is submitted", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={BASE} />)
    await userEvent.click(screen.getByRole("button", { name: /make public/i }))
    await userEvent.type(await screen.findByLabelText(/description/i), "Two sheltered days.")
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }))

    await waitFor(() =>
      expect(mockUpdateItinerary).toHaveBeenCalledWith(BASE.id, {
        name: BASE.name,
        description: "Two sheltered days.",
        difficulty: null,
        isPublic: true,
      }),
    )
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("lets an already-public route's pitch be edited without republishing", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={{ ...BASE, isPublic: true, description: "Old pitch." }} />)
    await userEvent.click(screen.getByRole("button", { name: /edit pitch/i }))

    const field = await screen.findByLabelText(/description/i)
    expect(field).toHaveValue("Old pitch.")
    await userEvent.clear(field)
    await userEvent.type(field, "Better pitch.")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() =>
      expect(mockUpdateItinerary).toHaveBeenCalledWith(BASE.id, {
        name: BASE.name,
        description: "Better pitch.",
        difficulty: null,
      }),
    )
  })

  it("offers no pitch editing while the route is private", () => {
    render(<ItineraryCard itinerary={BASE} />)
    expect(screen.queryByRole("button", { name: /edit pitch/i })).not.toBeInTheDocument()
  })

  it("calls updateItinerary with isPublic toggled to false", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={{ ...BASE, isPublic: true }} />)
    await userEvent.click(screen.getByRole("button", { name: /make private/i }))
    expect(mockUpdateItinerary).toHaveBeenCalledWith(BASE.id, { isPublic: false })
  })

  it("calls router.refresh after unpublishing", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={{ ...BASE, isPublic: true }} />)
    await userEvent.click(screen.getByRole("button", { name: /make private/i }))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("shows an error toast and does not refresh when unpublishing fails", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: false, error: "Could not update itinerary." })
    render(<ItineraryCard itinerary={{ ...BASE, isPublic: true }} />)
    await userEvent.click(screen.getByRole("button", { name: /make private/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Could not update itinerary."))
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe("ItineraryCard — GPX download", () => {
  it("renders a GPX download link with the correct href", () => {
    render(<ItineraryCard itinerary={BASE} />)
    const link = screen.getByRole("link", { name: /gpx/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${BASE.id}/export`)
  })
})

describe("ItineraryCard — story share", () => {
  it("renders the Share story action", () => {
    render(<ItineraryCard itinerary={BASE} />)
    expect(screen.getByRole("button", { name: /share story/i })).toBeInTheDocument()
  })
})

describe("ItineraryCard — create trip", () => {
  const TRIP_ID = "01952f1a-0000-7000-8000-000000000099"

  it("shows 'Create trip' button when itinerary has no trip linked", () => {
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    expect(screen.getByRole("button", { name: /create trip/i })).toBeInTheDocument()
  })

  it("hides 'Create trip' button when itinerary already has a trip", () => {
    render(<ItineraryCard itinerary={{ ...BASE, tripId: TRIP_ID }} />)
    expect(screen.queryByRole("button", { name: /create trip/i })).not.toBeInTheDocument()
  })

  it("opens a dialog with the itinerary name pre-filled when 'Create trip' is clicked", async () => {
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }))
    const input = screen.getByRole("textbox")
    expect((input as HTMLInputElement).value).toBe("Galicia Coast")
  })

  it("calls createTripFromItinerary with the itinerary id and edited name on submit", async () => {
    mockCreateTripFromItinerary.mockResolvedValue({ success: true, tripId: TRIP_ID })
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }))
    const input = screen.getByRole("textbox")
    await userEvent.clear(input)
    await userEvent.type(input, "Rías Baixas")
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))
    expect(mockCreateTripFromItinerary).toHaveBeenCalledWith(BASE.id, "Rías Baixas")
  })

  it("navigates to the new trip page on success", async () => {
    mockCreateTripFromItinerary.mockResolvedValue({ success: true, tripId: TRIP_ID })
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }))
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))
    expect(mockPush).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("submit button is disabled when name is empty", async () => {
    render(<ItineraryCard itinerary={{ ...BASE, name: null, tripId: undefined }} />)
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }))
    const submitBtn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it("shows an error toast and keeps the dialog open when create fails", async () => {
    mockCreateTripFromItinerary.mockResolvedValue({
      success: false,
      error: "Could not create trip.",
    })
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }))
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Could not create trip."))
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})

describe("ItineraryCard — delete", () => {
  const TRIP_ID = "01952f1a-0000-7000-8000-000000000099"

  it("shows the Delete trigger for a standalone itinerary", () => {
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument()
  })

  it("hides the Delete trigger for a trip-linked itinerary", () => {
    render(<ItineraryCard itinerary={{ ...BASE, tripId: TRIP_ID }} />)
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument()
  })

  it("deletes and refreshes after confirming in the dialog", async () => {
    mockDeleteItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    // Confirm via the destructive action inside the alert dialog (the trigger also
    // reads "Delete", so scope to the dialog).
    const dialog = screen.getByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }))
    expect(mockDeleteItinerary).toHaveBeenCalledWith(BASE.id)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("does not delete when the dialog is cancelled", async () => {
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    const dialog = screen.getByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /cancel/i }))
    expect(mockDeleteItinerary).not.toHaveBeenCalled()
  })

  it("shows an error toast and does not refresh when delete fails", async () => {
    mockDeleteItinerary.mockResolvedValue({ success: false, error: "Could not delete itinerary." })
    render(<ItineraryCard itinerary={{ ...BASE, tripId: undefined }} />)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    const dialog = screen.getByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Could not delete itinerary."))
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
