import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Point } from "@/lib/dtos/point"

vi.mock("@/lib/itinerary/actions", () => ({
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
  setImagePublic: vi.fn(),
  uploadPointImage: vi.fn(),
  deletePointImage: vi.fn(),
}))

import { PointDetailModal } from "../point-detail-modal"
import * as actions from "@/lib/itinerary/actions"

const POINT: Point = {
  id: "p1",
  type: "stop",
  name: "Vikten Sea Caves",
  notes: "Only enter near slack water.",
  latitude: 68.071,
  longitude: 13.512,
  dayId: "day-1",
  images: [
    { id: "i1", location: "https://example.com/1.jpg", name: "one", size: 1000, isPublic: false },
    { id: "i2", location: "https://example.com/2.jpg", name: "two", size: 2000, isPublic: true },
  ],
}

const baseCtx: MapBuilderContextValue = {
  state: {
    points: [POINT],
    pointOrder: ["p1"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [],
  } as MapState,
  dispatch: vi.fn(),
  draft: null,
  setDraft: vi.fn(),
  removedRealDayIds: [],
  setRemovedRealDayIds: vi.fn(),
  tripId: null,
  tripName: "Test Trip",
  tripDateFrom: null,
  tripDateTo: null,
  itineraryId: "itin-1",
  distanceUnit: "nm",
  setDistanceUnit: vi.fn(),
  avgSpeedKnots: 2.5,
  setAvgSpeedKnots: vi.fn(),
  day0Id: "day-0",
  viewMode: true,
  setViewMode: vi.fn(),
  selectedDayId: "day-1",
  setSelectedDayId: vi.fn(),
  selectedPointId: "p1",
  setSelectedPointId: vi.fn(),
  tripState: null,
  isLeader: true,
  selectedHour: 12,
  setSelectedHour: vi.fn(),
  conditionsVersion: 0,
  bumpConditions: vi.fn(),
}

function renderModal(
  point: Point,
  canEdit = true,
  onClose = vi.fn(),
  ctxOverrides: Partial<MapBuilderContextValue> = {},
) {
  return render(
    createElement(
      MapBuilderContext.Provider,
      { value: { ...baseCtx, ...ctxOverrides } },
      createElement(PointDetailModal, { point, canEdit, onClose }),
    ),
  )
}

beforeEach(() => vi.clearAllMocks())

describe("PointDetailModal", () => {
  it("shows the point name, type and coordinates", () => {
    // Non-editable: the type renders as the static badge. Editable mode replaces it
    // with the interactive stop/position control, covered separately below.
    renderModal(POINT, false)
    expect(screen.getByText("Vikten Sea Caves")).toBeInTheDocument()
    expect(screen.getByText("stop")).toBeInTheDocument()
    expect(screen.getByText(/68\.071°N · 13\.512°E/)).toBeInTheDocument()
  })

  it("does not repeat the coordinates as both title and subtitle when the point has no name", () => {
    renderModal({ ...POINT, name: undefined }, false)
    expect(screen.getAllByText(/68\.071°N · 13\.512°E/)).toHaveLength(1)
  })

  it("shows the image carousel position", () => {
    renderModal(POINT)
    expect(screen.getByText("1 / 2")).toBeInTheDocument()
  })

  it("renders a private photo to the owner via its returned location, not just once made public", () => {
    // POINT.images[0] ("i1") is isPublic: false — the backend still returns a usable
    // (presigned) location for it, and the carousel must not gate the <img> on isPublic.
    renderModal(POINT)
    const img = screen.getByAltText("one") as HTMLImageElement
    expect(img.src).toBe(POINT.images![0].location)
  })

  it("advances the carousel with the next button", async () => {
    renderModal(POINT)
    await userEvent.click(screen.getByRole("button", { name: /next photo/i }))
    expect(screen.getByText("2 / 2")).toBeInTheDocument()
  })

  it("shows a 'No photos yet' empty state when there are no images and not editable", () => {
    renderModal({ ...POINT, images: [] }, false)
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
  })

  it("renders an editable notes field when editable and persists on blur", async () => {
    renderModal(POINT, true)
    const textarea = screen.getByPlaceholderText(/landing notes/i)
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "New note")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { notes: "New note" })
  })

  it("renders notes read-only when not editable", () => {
    renderModal(POINT, false)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.getByText("Only enter near slack water.")).toBeInTheDocument()
  })

  it("shows a Saving… then Saved status after the notes are blur-saved", async () => {
    renderModal(POINT, true)
    const textarea = screen.getByPlaceholderText(/landing notes/i)
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "New note")
    await userEvent.tab()
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
  })

  it("does not apply the notes change locally and does not show Saved when updatePoint fails", async () => {
    vi.mocked(actions.updatePoint).mockResolvedValueOnce({ success: false, error: "nope" })
    renderModal(POINT, true)
    const textarea = screen.getByPlaceholderText(/landing notes/i)
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "New note")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { notes: "New note" })
    expect(baseCtx.dispatch).not.toHaveBeenCalledWith({
      type: "POINT_UPDATE",
      id: "p1",
      fields: { notes: "New note" },
    })
    expect(screen.queryByText(/^saved$/i)).not.toBeInTheDocument()
  })

  it("saves notes on Ctrl+Enter without needing blur first", async () => {
    renderModal(POINT, true)
    const textarea = screen.getByPlaceholderText(/landing notes/i)
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "New note")
    await userEvent.keyboard("{Control>}{Enter}{/Control}")
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { notes: "New note" })
  })

  it("flushes unsaved notes when the modal is closed before blur", async () => {
    const onClose = vi.fn()
    renderModal(POINT, true, onClose)
    const textarea = screen.getByPlaceholderText(/landing notes/i)
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "New note")
    await userEvent.keyboard("{Escape}")
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { notes: "New note" })
    expect(onClose).toHaveBeenCalled()
  })

  it("shows an interactive stop/position control when editable, calling updatePoint on change", async () => {
    renderModal(POINT, true)
    await userEvent.click(screen.getByRole("button", { name: /^position$/i }))
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { type: "position" })
    expect(baseCtx.dispatch).toHaveBeenCalledWith({
      type: "POINT_UPDATE",
      id: "p1",
      fields: { type: "position" },
    })
  })

  it("does not dispatch the type change when updatePoint fails", async () => {
    vi.mocked(actions.updatePoint).mockResolvedValueOnce({ success: false, error: "nope" })
    renderModal(POINT, true)
    await userEvent.click(screen.getByRole("button", { name: /^position$/i }))
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { type: "position" })
    expect(baseCtx.dispatch).not.toHaveBeenCalled()
  })

  it("does not show a point-type control when not editable", () => {
    renderModal(POINT, false)
    expect(screen.queryByRole("button", { name: /^position$/i })).not.toBeInTheDocument()
  })

  it("disables the type control for a boundary point (day start/end must stay 'stop')", async () => {
    renderModal(POINT, true, vi.fn(), {
      state: {
        ...baseCtx.state,
        days: [{ id: "day-1", dayNumber: 1, itineraryId: "itin-1", startPointId: "p1" }],
      },
    })
    const positionButton = screen.getByRole("button", { name: /^position$/i })
    const stopButton = screen.getByRole("button", { name: /^stop$/i })
    expect(positionButton).toBeDisabled()
    expect(stopButton).toBeDisabled()
    await userEvent.click(positionButton)
    expect(actions.updatePoint).not.toHaveBeenCalled()
  })

  it("keeps the type control enabled for a non-boundary point", () => {
    renderModal(POINT, true, vi.fn(), {
      state: {
        ...baseCtx.state,
        days: [{ id: "day-1", dayNumber: 1, itineraryId: "itin-1", startPointId: "some-other-id" }],
      },
    })
    expect(screen.getByRole("button", { name: /^position$/i })).not.toBeDisabled()
  })

  it("renders an editable name field (as the dialog title) when editable and persists on blur", async () => {
    renderModal(POINT, true)
    const nameInput = screen.getByDisplayValue("Vikten Sea Caves")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { name: "New name" })
    expect(baseCtx.dispatch).toHaveBeenCalledWith({
      type: "POINT_UPDATE",
      id: "p1",
      fields: { name: "New name" },
    })
  })

  it("saves the name on Ctrl+Enter without needing blur first", async () => {
    renderModal(POINT, true)
    const nameInput = screen.getByDisplayValue("Vikten Sea Caves")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.keyboard("{Control>}{Enter}{/Control}")
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { name: "New name" })
  })

  it("flushes an unsaved name change when the modal is closed before blur", async () => {
    const onClose = vi.fn()
    renderModal(POINT, true, onClose)
    const nameInput = screen.getByDisplayValue("Vikten Sea Caves")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.keyboard("{Escape}")
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { name: "New name" })
    expect(onClose).toHaveBeenCalled()
  })

  it("still closes even when the flush-on-close save fails, and does not apply the change", async () => {
    vi.mocked(actions.updatePoint).mockResolvedValueOnce({ success: false, error: "nope" })
    const onClose = vi.fn()
    renderModal(POINT, true, onClose)
    const nameInput = screen.getByDisplayValue("Vikten Sea Caves")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
    expect(baseCtx.dispatch).not.toHaveBeenCalledWith({
      type: "POINT_UPDATE",
      id: "p1",
      fields: { name: "New name" },
    })
  })

  it("does not apply the name change locally when updatePoint fails", async () => {
    vi.mocked(actions.updatePoint).mockResolvedValueOnce({ success: false, error: "nope" })
    renderModal(POINT, true)
    const nameInput = screen.getByDisplayValue("Vikten Sea Caves")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { name: "New name" })
    expect(baseCtx.dispatch).not.toHaveBeenCalledWith({
      type: "POINT_UPDATE",
      id: "p1",
      fields: { name: "New name" },
    })
  })

  it("renders the name as static (non-editable) text, not an input, when not editable", () => {
    renderModal(POINT, false)
    expect(screen.getByText("Vikten Sea Caves")).toBeInTheDocument()
    expect(screen.queryByDisplayValue("Vikten Sea Caves")).not.toBeInTheDocument()
  })

  it("shows an explicit Save button next to the notes field when editable", () => {
    renderModal(POINT, true)
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument()
  })

  it("does not show a Save button when not editable", () => {
    renderModal(POINT, false)
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument()
  })

  it("clicking Save flushes a pending notes change without needing blur", async () => {
    renderModal(POINT, true)
    const notesArea = screen.getByPlaceholderText(/landing notes/i)
    await userEvent.clear(notesArea)
    await userEvent.type(notesArea, "New note")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { notes: "New note" })
  })

  it("Save is a no-op when there's nothing pending to save", async () => {
    renderModal(POINT, true)
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    expect(actions.updatePoint).not.toHaveBeenCalled()
  })

  it("shows a visibility toggle labelled for the current photo's state when editable", () => {
    renderModal(POINT, true)
    expect(screen.getByRole("button", { name: /make photo public/i })).toBeInTheDocument()
  })

  it("does not show a visibility toggle when not editable", () => {
    renderModal(POINT, false)
    expect(
      screen.queryByRole("button", { name: /make photo (public|private)/i }),
    ).not.toBeInTheDocument()
  })

  it("does not show a visibility toggle when there are no photos", () => {
    renderModal({ ...POINT, images: [] }, true)
    expect(
      screen.queryByRole("button", { name: /make photo (public|private)/i }),
    ).not.toBeInTheDocument()
  })

  it("toggles the current photo's visibility and updates it via dispatch", async () => {
    const updatedImage = { ...POINT.images![0], isPublic: true }
    vi.mocked(actions.setImagePublic).mockResolvedValue({ success: true, image: updatedImage })
    renderModal(POINT, true)
    await userEvent.click(screen.getByRole("button", { name: /make photo public/i }))
    expect(actions.setImagePublic).toHaveBeenCalledWith("p1", "i1", true)
    expect(baseCtx.dispatch).toHaveBeenCalledWith({
      type: "POINT_UPDATE",
      id: "p1",
      fields: { images: [updatedImage, POINT.images![1]] },
    })
  })

  it("does not dispatch when the visibility toggle fails", async () => {
    vi.mocked(actions.setImagePublic).mockResolvedValue({ success: false, error: "nope" })
    renderModal(POINT, true)
    await userEvent.click(screen.getByRole("button", { name: /make photo public/i }))
    expect(baseCtx.dispatch).not.toHaveBeenCalled()
  })

  it("advancing the carousel updates the toggle label to match the next photo", async () => {
    renderModal(POINT, true)
    await userEvent.click(screen.getByRole("button", { name: /next photo/i }))
    expect(screen.getByRole("button", { name: /make photo private/i })).toBeInTheDocument()
  })

  it("shows an 'Add a photo' invitation on the empty state when editable", () => {
    renderModal({ ...POINT, images: [] }, true)
    expect(screen.getByRole("button", { name: /add a photo/i })).toBeInTheDocument()
  })

  it("does not show 'Add a photo' on the empty state when not editable", () => {
    renderModal({ ...POINT, images: [] }, false)
    expect(screen.queryByRole("button", { name: /add a photo/i })).not.toBeInTheDocument()
  })

  it("shows an add-photo control alongside existing photos when editable", () => {
    renderModal(POINT, true)
    expect(screen.getByRole("button", { name: /add photo/i })).toBeInTheDocument()
  })

  it("uploads the selected file and appends it to the point via dispatch", async () => {
    const newImage = {
      id: "i3",
      location: "https://example.com/3.jpg",
      name: "three",
      size: 500,
      isPublic: false,
    }
    vi.mocked(actions.uploadPointImage).mockResolvedValue({ success: true, image: newImage })
    renderModal(POINT, true)
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" })
    await userEvent.upload(screen.getByTestId("photo-file-input"), file)
    expect(actions.uploadPointImage).toHaveBeenCalledWith("p1", expect.any(FormData))
    expect(baseCtx.dispatch).toHaveBeenCalledWith({
      type: "POINT_UPDATE",
      id: "p1",
      fields: { images: [...POINT.images!, newImage] },
    })
  })

  it("does not dispatch when the upload fails", async () => {
    vi.mocked(actions.uploadPointImage).mockResolvedValue({ success: false, error: "nope" })
    renderModal(POINT, true)
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" })
    await userEvent.upload(screen.getByTestId("photo-file-input"), file)
    expect(baseCtx.dispatch).not.toHaveBeenCalled()
  })

  it("deletes the current photo and removes it from the point", async () => {
    vi.mocked(actions.deletePointImage).mockResolvedValue({ success: true })
    renderModal(POINT, true)
    await userEvent.click(screen.getByRole("button", { name: /delete photo/i }))
    expect(actions.deletePointImage).toHaveBeenCalledWith("p1", "i1")
    expect(baseCtx.dispatch).toHaveBeenCalledWith({
      type: "POINT_UPDATE",
      id: "p1",
      fields: { images: [POINT.images![1]] },
    })
  })

  it("does not dispatch when photo deletion fails", async () => {
    vi.mocked(actions.deletePointImage).mockResolvedValue({ success: false, error: "nope" })
    renderModal(POINT, true)
    await userEvent.click(screen.getByRole("button", { name: /delete photo/i }))
    expect(baseCtx.dispatch).not.toHaveBeenCalled()
  })

  it("does not show add/delete photo controls when not editable", () => {
    renderModal(POINT, false)
    expect(screen.queryByRole("button", { name: /add photo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /delete photo/i })).not.toBeInTheDocument()
  })
})
