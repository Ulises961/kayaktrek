import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/connections/actions", () => ({ searchPaddlers: vi.fn() }))
vi.mock("@/lib/blocks/actions", () => ({ blockPaddler: vi.fn() }))

import { searchPaddlers } from "@/lib/connections/actions"
import { PaddlerFinder } from "../paddler-finder"
import type { PaddlerSearchResult } from "@/lib/dtos/paddler-search"

const RESULT: PaddlerSearchResult = {
  id: "01952f1a-0000-7000-8000-000000000003",
  username: "seapaddler",
  name: "Maren",
  surname: "Vik",
  avatarUrl: null,
  bio: null,
  homeLocation: null,
  certifications: [],
  stats: {
    totalDistance: 0,
    totalHours: 0,
    logCount: 0,
    tripCount: 0,
    endorsementsReceived: 0,
    conditionsDistribution: {},
    activityByMonth: [],
  },
  relationship: "none",
  connectionId: null,
}

beforeEach(() => vi.clearAllMocks())

describe("PaddlerFinder", () => {
  it("does not search until the user types", () => {
    render(<PaddlerFinder />)
    expect(searchPaddlers).not.toHaveBeenCalled()
  })

  it("debounces the term and renders matching results", async () => {
    vi.mocked(searchPaddlers).mockResolvedValue({ items: [RESULT], total: 1, page: 1, pages: 1 })
    render(<PaddlerFinder />)

    await userEvent.type(screen.getByRole("textbox", { name: /search paddlers/i }), "maren")

    await waitFor(() => expect(searchPaddlers).toHaveBeenCalledWith("maren"))
    expect(await screen.findByText("Maren Vik")).toBeDefined()
  })

  it("shows an empty state when nothing matches", async () => {
    vi.mocked(searchPaddlers).mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })
    render(<PaddlerFinder />)

    await userEvent.type(screen.getByRole("textbox", { name: /search paddlers/i }), "zzz")
    expect(await screen.findByText(/no paddlers found/i)).toBeDefined()
  })
})
