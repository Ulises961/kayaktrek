import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }))

const { mockImportGpx } = vi.hoisted(() => ({
  mockImportGpx: vi.fn(),
}))
vi.mock("@/lib/itinerary/actions", () => ({ importGpx: mockImportGpx }))

import { ImportGpxButton } from "../import-gpx-button"

beforeEach(() => vi.clearAllMocks())

describe("ImportGpxButton — dialog open/close", () => {
  it("renders the trigger button", () => {
    render(<ImportGpxButton />)
    expect(screen.getByRole("button", { name: /import gpx/i })).toBeInTheDocument()
  })

  it("opens the dialog when trigger is clicked", async () => {
    render(<ImportGpxButton />)
    await userEvent.click(screen.getByRole("button", { name: /import gpx/i }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("closes the dialog when Cancel is clicked", async () => {
    render(<ImportGpxButton />)
    await userEvent.click(screen.getByRole("button", { name: /import gpx/i }))
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("ImportGpxButton — dialog contents", () => {
  it("shows a file input that accepts only .gpx files", async () => {
    render(<ImportGpxButton />)
    await userEvent.click(screen.getByRole("button", { name: /import gpx/i }))
    const fileInput = screen.getByLabelText("GPX file")
    expect(fileInput).toBeInTheDocument()
    expect(fileInput).toHaveAttribute("accept", ".gpx")
  })

  it("shows the epsilon slider with default value 0.0001", async () => {
    render(<ImportGpxButton />)
    await userEvent.click(screen.getByRole("button", { name: /import gpx/i }))
    const slider = screen.getByRole("slider")
    expect(slider).toHaveValue("0.0001")
  })

  it("shows a note about track simplification", async () => {
    render(<ImportGpxButton />)
    await userEvent.click(screen.getByRole("button", { name: /import gpx/i }))
    expect(screen.getByText(/only applies to.*track/i)).toBeInTheDocument()
  })
})

describe("ImportGpxButton — form submission", () => {
  it("calls importGpx with a FormData containing the file and epsilon", async () => {
    mockImportGpx.mockResolvedValue({ success: true, itineraryId: "new-id" })
    render(<ImportGpxButton />)
    await userEvent.click(screen.getByRole("button", { name: /import gpx/i }))

    const file = new File(["<gpx/>"], "route.gpx", { type: "application/gpx+xml" })
    const fileInput = screen.getByLabelText("GPX file")
    await userEvent.upload(fileInput, file)

    await userEvent.click(screen.getByRole("button", { name: /^import$/i }))

    expect(mockImportGpx).toHaveBeenCalledOnce()
    const formData: FormData = mockImportGpx.mock.calls[0][0]
    expect(formData.get("file")).toBe(file)
    expect(formData.get("epsilon")).toBe("0.0001")
  })

  it("navigates to the new itinerary on success", async () => {
    mockImportGpx.mockResolvedValue({ success: true, itineraryId: "new-id" })
    render(<ImportGpxButton />)
    await userEvent.click(screen.getByRole("button", { name: /import gpx/i }))
    const file = new File(["<gpx/>"], "route.gpx", { type: "application/gpx+xml" })
    await userEvent.upload(screen.getByLabelText("GPX file"), file)
    await userEvent.click(screen.getByRole("button", { name: /^import$/i }))
    expect(mockPush).toHaveBeenCalledWith("/itinerary/new-id")
  })

  it("shows an error message on failure", async () => {
    mockImportGpx.mockResolvedValue({ success: false, error: "Invalid GPX file." })
    render(<ImportGpxButton />)
    await userEvent.click(screen.getByRole("button", { name: /import gpx/i }))
    const file = new File(["bad"], "route.gpx", { type: "application/gpx+xml" })
    await userEvent.upload(screen.getByLabelText("GPX file"), file)
    await userEvent.click(screen.getByRole("button", { name: /^import$/i }))
    expect(await screen.findByText("Invalid GPX file.")).toBeInTheDocument()
  })
})
