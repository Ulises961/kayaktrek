import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/travel-documents/actions", () => ({ deleteTravelDocument: vi.fn() }))
vi.mock("@/lib/shuttle/actions", () => ({ deleteShuttleVehicle: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

import { deleteTravelDocument } from "@/lib/travel-documents/actions"
import { deleteShuttleVehicle } from "@/lib/shuttle/actions"
import { toast } from "sonner"
import { DeleteDocumentButton } from "../delete-document-button"
import { DeleteVehicleButton } from "../delete-vehicle-button"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const DOCUMENT_ID = "01952f1a-0000-7000-8000-000000000002"
const VEHICLE_ID = "01952f1a-0000-7000-8000-000000000003"

beforeEach(() => vi.clearAllMocks())

async function confirmDelete() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button"))
  await user.click(await screen.findByRole("button", { name: "Delete" }))
}

describe("DeleteDocumentButton", () => {
  it("deletes the document on confirmation", async () => {
    vi.mocked(deleteTravelDocument).mockResolvedValue({ success: true })
    render(
      <DeleteDocumentButton
        tripId={TRIP_ID}
        documentId={DOCUMENT_ID}
        documentName="Ferry booking"
      />,
    )
    await confirmDelete()
    await waitFor(() => expect(deleteTravelDocument).toHaveBeenCalledWith(TRIP_ID, DOCUMENT_ID))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("surfaces a refused delete instead of closing as if it worked", async () => {
    // The backend refuses a delete on a completed trip. Discarding this result
    // is indistinguishable from success at the UI: the dialog shuts, the row
    // stays, and nothing says why.
    vi.mocked(deleteTravelDocument).mockResolvedValue({
      success: false,
      error: "This document cannot be changed on a completed trip",
    })
    render(
      <DeleteDocumentButton
        tripId={TRIP_ID}
        documentId={DOCUMENT_ID}
        documentName="Ferry booking"
      />,
    )
    await confirmDelete()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This document cannot be changed on a completed trip",
      ),
    )
  })
})

describe("DeleteVehicleButton", () => {
  it("deletes the vehicle on confirmation", async () => {
    vi.mocked(deleteShuttleVehicle).mockResolvedValue({ success: true })
    render(
      <DeleteVehicleButton
        tripId={TRIP_ID}
        vehicleId={VEHICLE_ID}
        vehicleDescription="Blue Subaru"
      />,
    )
    await confirmDelete()
    await waitFor(() => expect(deleteShuttleVehicle).toHaveBeenCalledWith(TRIP_ID, VEHICLE_ID))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("surfaces a refused delete instead of closing as if it worked", async () => {
    vi.mocked(deleteShuttleVehicle).mockResolvedValue({
      success: false,
      error: "Only the arranger or trip leader can remove this vehicle",
    })
    render(
      <DeleteVehicleButton
        tripId={TRIP_ID}
        vehicleId={VEHICLE_ID}
        vehicleDescription="Blue Subaru"
      />,
    )
    await confirmDelete()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Only the arranger or trip leader can remove this vehicle",
      ),
    )
  })
})
