import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/itinerary/actions", () => ({
  generateStoryShare: vi.fn(),
}))

import { generateStoryShare } from "@/lib/itinerary/actions"
import { StoryShareButton } from "../story-share-button"
import type { Itinerary } from "@/lib/dtos/itinerary"

const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000001"

const NO_TOKEN: Itinerary = {
  id: ITINERARY_ID,
  name: "Galicia Coast",
  isPublic: false,
  days: [],
  storyShareToken: null,
}

const WITH_TOKEN: Itinerary = {
  ...NO_TOKEN,
  storyShareToken: "tok_abc123",
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe("StoryShareButton — no token yet", () => {
  it("renders a 'Share story' trigger", () => {
    render(<StoryShareButton itinerary={NO_TOKEN} />)
    expect(screen.getByRole("button", { name: /share story/i })).toBeInTheDocument()
  })

  // Making a story public is its own act: opening the dialog only offers it.
  it("opens the dialog without creating a link", async () => {
    render(<StoryShareButton itinerary={NO_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))

    expect(await screen.findByRole("dialog", { name: /share trip story/i })).toBeInTheDocument()
    expect(generateStoryShare).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /create link/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /copy link/i })).toBeDisabled()
  })

  it("creates the link on request and shows it", async () => {
    vi.mocked(generateStoryShare).mockResolvedValue({
      success: true,
      itinerary: WITH_TOKEN,
    })
    render(<StoryShareButton itinerary={NO_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    await userEvent.click(screen.getByRole("button", { name: /create link/i }))

    await waitFor(() => expect(generateStoryShare).toHaveBeenCalledWith(ITINERARY_ID))
    await waitFor(() => expect(screen.getByText(/tok_abc123/)).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /create link/i })).not.toBeInTheDocument()
  })

  it("shows an error when generation fails", async () => {
    vi.mocked(generateStoryShare).mockResolvedValue({ success: false, error: "Server error." })
    render(<StoryShareButton itinerary={NO_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    await userEvent.click(screen.getByRole("button", { name: /create link/i }))
    await waitFor(() => expect(screen.getByText("Server error.")).toBeInTheDocument())
  })
})

describe("StoryShareButton — token already exists", () => {
  it("opens the dialog directly without regenerating", async () => {
    render(<StoryShareButton itinerary={WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    expect(screen.getByText(/tok_abc123/)).toBeInTheDocument()
    expect(generateStoryShare).not.toHaveBeenCalled()
  })

  it("copies the link to the clipboard", async () => {
    render(<StoryShareButton itinerary={WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    await userEvent.click(screen.getByRole("button", { name: /copy link/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/story/tok_abc123"),
    )
    await waitFor(() => expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument())
  })

  it("leaves the label unchanged when clipboard access is denied", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    })
    render(<StoryShareButton itinerary={WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    await userEvent.click(screen.getByRole("button", { name: /copy link/i }))
    expect(await screen.findByRole("button", { name: /copy link/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /copied/i })).not.toBeInTheDocument()
  })
})

describe("StoryShareButton — regenerate flow", () => {
  it("opens a confirmation dialog when Regenerate is clicked", async () => {
    render(<StoryShareButton itinerary={WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    expect(screen.getByText(/regenerate story link\?/i)).toBeInTheDocument()
  })

  it("does not regenerate when cancelled", async () => {
    render(<StoryShareButton itinerary={WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(generateStoryShare).not.toHaveBeenCalled()
  })

  it("regenerates and shows the new link on confirm", async () => {
    vi.mocked(generateStoryShare).mockResolvedValue({
      success: true,
      itinerary: { ...WITH_TOKEN, storyShareToken: "tok_newtoken456" },
    })
    render(<StoryShareButton itinerary={WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }))
    await waitFor(() => expect(generateStoryShare).toHaveBeenCalledWith(ITINERARY_ID))
    await waitFor(() => expect(screen.getByText(/tok_newtoken456/)).toBeInTheDocument())
  })

  it("shows an error and keeps the old link when regeneration fails", async () => {
    vi.mocked(generateStoryShare).mockResolvedValue({ success: false, error: "Regen failed." })
    render(<StoryShareButton itinerary={WITH_TOKEN} />)
    await userEvent.click(screen.getByRole("button", { name: /share story/i }))
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }))
    await waitFor(() => expect(screen.getByText("Regen failed.")).toBeInTheDocument())
    expect(screen.getByText(/tok_abc123/)).toBeInTheDocument()
  })
})
