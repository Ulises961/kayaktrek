import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

vi.mock("@/lib/connections/actions", () => ({
  requestConnection: vi.fn(),
  acceptConnection: vi.fn(),
}))
vi.mock("@/lib/blocks/actions", () => ({ blockPaddler: vi.fn() }))

import { requestConnection, acceptConnection } from "@/lib/connections/actions"
import { blockPaddler } from "@/lib/blocks/actions"
import { PaddlerResultCard } from "../paddler-result-card"
import type { PaddlerSearchResult } from "@/lib/dtos/paddler-search"

const BASE: PaddlerSearchResult = {
  id: "01952f1a-0000-7000-8000-000000000003",
  username: "seapaddler",
  name: "Maren",
  surname: "Vik",
  avatarUrl: null,
  bio: null,
  homeLocation: null,
  certifications: [],
  relationship: "none",
  connectionId: null,
}

beforeEach(() => vi.clearAllMocks())

describe("PaddlerResultCard", () => {
  it("renders Add buddy for an unconnected paddler and sends a request", async () => {
    vi.mocked(requestConnection).mockResolvedValue({ success: true })
    render(<PaddlerResultCard paddler={BASE} />)

    await userEvent.click(screen.getByRole("button", { name: /add buddy/i }))
    await waitFor(() => expect(requestConnection).toHaveBeenCalledWith({ username: "seapaddler" }))
    // The action flips locally to Pending without needing a re-search.
    expect(await screen.findByRole("button", { name: /pending/i })).toBeDefined()
  })

  it("renders a disabled Pending button for an outgoing request", () => {
    render(<PaddlerResultCard paddler={{ ...BASE, relationship: "pending_outgoing" }} />)
    const button = screen.getByRole("button", { name: /pending/i })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it("renders Accept for an incoming request and accepts by connection id", async () => {
    vi.mocked(acceptConnection).mockResolvedValue({ success: true })
    render(
      <PaddlerResultCard
        paddler={{
          ...BASE,
          relationship: "pending_incoming",
          connectionId: "01952f1a-0000-7000-8000-0000000000aa",
        }}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /accept/i }))
    await waitFor(() =>
      expect(acceptConnection).toHaveBeenCalledWith("01952f1a-0000-7000-8000-0000000000aa"),
    )
  })

  it("renders a Buddies indicator for an accepted connection", () => {
    render(<PaddlerResultCard paddler={{ ...BASE, relationship: "buddy" }} />)
    expect(screen.getByRole("button", { name: /buddies/i })).toBeDefined()
  })

  it("blocks the paddler from the overflow menu", async () => {
    vi.mocked(blockPaddler).mockResolvedValue({ success: true })
    const { container } = render(<PaddlerResultCard paddler={BASE} />)
    await userEvent.click(screen.getByRole("button", { name: /more actions/i }))
    await userEvent.click(await screen.findByText(/block/i))
    await waitFor(() => expect(blockPaddler).toHaveBeenCalledWith({ username: "seapaddler" }))
    // A successful block hides the card entirely.
    await waitFor(() => expect(container.querySelector("div")).toBeNull())
  })
})
