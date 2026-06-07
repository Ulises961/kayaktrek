import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockUpdateItinerary, mockRefresh, mockPush, mockCreateTripFromItinerary } = vi.hoisted(() => ({
  mockUpdateItinerary: vi.fn(),
  mockRefresh: vi.fn(),
  mockPush: vi.fn(),
  mockCreateTripFromItinerary: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}))

vi.mock("@/lib/itinerary/actions", () => ({
  updateItinerary: mockUpdateItinerary,
  createTripFromItinerary: mockCreateTripFromItinerary,
}))

import { ItineraryCard } from "../itinerary-card"
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

  it("renders the total distance in nm", () => {
    render(<ItineraryCard itinerary={BASE} />)
    expect(screen.getByText("42.3 nm")).toBeInTheDocument()
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

  it("calls updateItinerary with isPublic toggled to true", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={BASE} />)
    await userEvent.click(screen.getByRole("button", { name: /make public/i }))
    expect(mockUpdateItinerary).toHaveBeenCalledWith(BASE.id, { isPublic: true })
  })

  it("calls updateItinerary with isPublic toggled to false", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={{ ...BASE, isPublic: true }} />)
    await userEvent.click(screen.getByRole("button", { name: /make private/i }))
    expect(mockUpdateItinerary).toHaveBeenCalledWith(BASE.id, { isPublic: false })
  })

  it("calls router.refresh after toggle", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: true })
    render(<ItineraryCard itinerary={BASE} />)
    await userEvent.click(screen.getByRole("button", { name: /make public/i }))
    expect(mockRefresh).toHaveBeenCalled()
  })
})

describe("ItineraryCard — GPX download", () => {
  it("renders a GPX download link with the correct href", () => {
    render(<ItineraryCard itinerary={BASE} />)
    const link = screen.getByRole("link", { name: /gpx/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${BASE.id}/export`)
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
})
