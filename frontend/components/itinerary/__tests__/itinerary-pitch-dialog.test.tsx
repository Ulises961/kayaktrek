import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockUpdateItinerary, mockToastError } = vi.hoisted(() => ({
  mockUpdateItinerary: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock("@/lib/itinerary/actions", () => ({ updateItinerary: mockUpdateItinerary }))
vi.mock("sonner", () => ({ toast: { error: mockToastError, success: vi.fn() } }))

import { ItineraryPitchDialog } from "../itinerary-pitch-dialog"
import { DIFFICULTY, DIFFICULTY_LABELS } from "@/lib/dtos/difficulty"

const ITINERARY_ID = "0197c3aa-0000-7000-8000-000000000001"

function renderDialog(props: Partial<React.ComponentProps<typeof ItineraryPitchDialog>> = {}) {
  const onOpenChange = vi.fn()
  const onSaved = vi.fn()
  render(
    <ItineraryPitchDialog
      itineraryId={ITINERARY_ID}
      open
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      publishOnSave={false}
      {...props}
    />,
  )
  return { onOpenChange, onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateItinerary.mockResolvedValue({ success: true, itinerary: { id: ITINERARY_ID } })
})

describe("ItineraryPitchDialog", () => {
  it("prefills the pitch and grade it was given", () => {
    renderDialog({
      description: "Sheltered coast hop.",
      difficulty: DIFFICULTY.MODERATE,
    })
    expect(screen.getByLabelText(/description/i)).toHaveValue("Sheltered coast hop.")
    expect(screen.getByLabelText(/difficulty/i)).toHaveValue(DIFFICULTY.MODERATE)
  })

  it("saves the pitch and grade without publishing when publishOnSave is false", async () => {
    const user = userEvent.setup()
    renderDialog({ description: "Old pitch." })

    const field = screen.getByLabelText(/description/i)
    await user.clear(field)
    await user.type(field, "A committing outer passage.")
    await user.selectOptions(screen.getByLabelText(/difficulty/i), DIFFICULTY.EXPERT)
    await user.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() =>
      expect(mockUpdateItinerary).toHaveBeenCalledWith(ITINERARY_ID, {
        description: "A committing outer passage.",
        difficulty: DIFFICULTY.EXPERT,
      }),
    )
  })

  it("publishes in the same call when publishOnSave is true", async () => {
    const user = userEvent.setup()
    renderDialog({ publishOnSave: true })

    await user.type(screen.getByLabelText(/description/i), "Two easy days.")
    await user.click(screen.getByRole("button", { name: /publish/i }))

    // One request, not a publish followed by a separate pitch save — a route must
    // never be briefly public with no pitch on it.
    await waitFor(() => expect(mockUpdateItinerary).toHaveBeenCalledTimes(1))
    expect(mockUpdateItinerary).toHaveBeenCalledWith(ITINERARY_ID, {
      description: "Two easy days.",
      difficulty: null,
      isPublic: true,
    })
  })

  it("publishes without a pitch when the author leaves it blank", async () => {
    const user = userEvent.setup()
    renderDialog({ publishOnSave: true })
    await user.click(screen.getByRole("button", { name: /publish/i }))

    await waitFor(() =>
      expect(mockUpdateItinerary).toHaveBeenCalledWith(ITINERARY_ID, {
        description: null,
        difficulty: null,
        isPublic: true,
      }),
    )
  })

  it("closes and reports success to its parent once saved", async () => {
    const user = userEvent.setup()
    const { onOpenChange, onSaved } = renderDialog()
    await user.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("shows the failure to the user and stays open when the save fails", async () => {
    mockUpdateItinerary.mockResolvedValue({ success: false, error: "Conflict" })
    const user = userEvent.setup()
    const { onOpenChange, onSaved } = renderDialog()
    await user.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Conflict"))
    // A dialog that closed on failure would discard what the author just wrote.
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("rejects a pitch over 2000 characters without calling the server", async () => {
    // delay: null — the default per-keystroke wait would make 2001 characters glacial.
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.type(screen.getByLabelText(/description/i), "x".repeat(2001))
    await user.click(screen.getByRole("button", { name: /save/i }))

    expect(await screen.findByText(/at most 2000 characters/i)).toBeInTheDocument()
    expect(mockUpdateItinerary).not.toHaveBeenCalled()
  })

  it("offers every difficulty by its label", () => {
    renderDialog()
    const select = screen.getByLabelText(/difficulty/i)
    for (const label of Object.values(DIFFICULTY_LABELS)) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument()
    }
    expect(select).toBeInTheDocument()
  })
})
