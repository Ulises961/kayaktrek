import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({ deleteTripForEveryone: vi.fn() }))

import { DeleteTripDialog } from "../delete-trip-dialog"
import { deleteTripForEveryone } from "@/lib/trips/actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

function renderDialog({
  destination = "Cinque Terre",
  open = true,
}: { destination?: string | null; open?: boolean } = {}) {
  const onOpenChange = vi.fn()
  render(
    <DeleteTripDialog
      tripId={TRIP_ID}
      destination={destination}
      open={open}
      onOpenChange={onOpenChange}
    />,
  )
  return { onOpenChange }
}

beforeEach(() => vi.clearAllMocks())

describe("DeleteTripDialog", () => {
  it("renders nothing while closed", () => {
    renderDialog({ open: false })
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("names the trip being deleted and says it cannot be undone", () => {
    renderDialog()
    expect(screen.getByText("Delete Cinque Terre?")).toBeInTheDocument()
    expect(screen.getByText(/this cannot be undone/i)).toBeInTheDocument()
  })

  it("falls back to 'this trip' when the trip has no destination", () => {
    renderDialog({ destination: null })
    expect(screen.getByText("Delete this trip?")).toBeInTheDocument()
  })

  it("deletes the trip for everyone when confirmed, and closes", async () => {
    const { onOpenChange } = renderDialog()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(deleteTripForEveryone).toHaveBeenCalledWith(TRIP_ID)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("deletes nothing when cancelled", async () => {
    const { onOpenChange } = renderDialog()
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(deleteTripForEveryone).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
