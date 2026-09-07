import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { notFound } from "next/navigation"

const { fetchStoryByToken, getViewer } = vi.hoisted(() => ({
  fetchStoryByToken: vi.fn(),
  getViewer: vi.fn(),
}))
vi.mock("@/lib/itinerary/actions", () => ({ fetchStoryByToken }))
vi.mock("@/lib/user/me", () => ({ getViewer }))
vi.mock("@/components/map/map-loader", () => ({ default: () => <div data-testid="static-map" /> }))
vi.mock("@/components/story/live-story-map", () => ({
  LiveStoryMap: () => <div data-testid="live-map" />,
}))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

import StoryPage, { metadata } from "../page"

const DETAIL = {
  id: "01952f1a-0000-7000-8000-000000000r01",
  name: "Aegean loop",
  isPublic: true,
  totalMiles: 42.5,
  days: [],
}

describe("StoryPage", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("is not indexed — unlisted-by-design, not unlisted-by-hope", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("renders the live map while the trip is happening", async () => {
    fetchStoryByToken.mockResolvedValue({ ...DETAIL, tripState: "happening" })
    getViewer.mockResolvedValue(null)

    const jsx = await StoryPage({ params: Promise.resolve({ token: "tok123" }) })
    render(jsx)

    expect(screen.getByTestId("live-map")).toBeInTheDocument()
    expect(screen.queryByTestId("static-map")).not.toBeInTheDocument()
  })

  it("renders the plain static map for a past trip", async () => {
    fetchStoryByToken.mockResolvedValue({ ...DETAIL, tripState: "past" })
    getViewer.mockResolvedValue(null)

    const jsx = await StoryPage({ params: Promise.resolve({ token: "tok123" }) })
    render(jsx)

    expect(screen.getByTestId("static-map")).toBeInTheDocument()
    expect(screen.queryByTestId("live-map")).not.toBeInTheDocument()
  })

  it("renders the plain static map when the trip has no state (standalone itinerary)", async () => {
    fetchStoryByToken.mockResolvedValue({ ...DETAIL, tripState: null })
    getViewer.mockResolvedValue(null)

    const jsx = await StoryPage({ params: Promise.resolve({ token: "tok123" }) })
    render(jsx)

    expect(screen.getByTestId("static-map")).toBeInTheDocument()
  })

  it("calls notFound when the token resolves to nothing", async () => {
    fetchStoryByToken.mockResolvedValue(null)
    getViewer.mockResolvedValue(null)

    await expect(StoryPage({ params: Promise.resolve({ token: "bad-token" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    )
    expect(notFound).toHaveBeenCalled()
  })
})
