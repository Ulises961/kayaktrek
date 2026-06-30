import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/connections/actions", () => ({
  getRelationship: vi.fn(),
  requestConnection: vi.fn(),
  acceptConnection: vi.fn(),
}))
vi.mock("@/lib/blocks/actions", () => ({ blockPaddler: vi.fn() }))

import { getRelationship, requestConnection } from "@/lib/connections/actions"
import { blockPaddler } from "@/lib/blocks/actions"
import { ProfileRelationshipControls } from "../profile-relationship-controls"

beforeEach(() => vi.clearAllMocks())

describe("ProfileRelationshipControls", () => {
  it("renders nothing when there is no actionable relationship (self/blocked/not found)", async () => {
    vi.mocked(getRelationship).mockResolvedValue(null)
    const { container } = render(<ProfileRelationshipControls username="seapaddler" />)

    await waitFor(() => expect(getRelationship).toHaveBeenCalledWith("seapaddler"))
    expect(container.querySelector("button")).toBeNull()
  })

  it("offers Add buddy and Block once the relationship resolves", async () => {
    vi.mocked(getRelationship).mockResolvedValue({
      relationship: "none",
      connectionId: null,
      userId: "01952f1a-0000-7000-8000-000000000003",
    })
    vi.mocked(requestConnection).mockResolvedValue({ success: true })
    render(<ProfileRelationshipControls username="seapaddler" />)

    const addBuddy = await screen.findByRole("button", { name: /add buddy/i })
    expect(screen.getByRole("button", { name: /block/i })).toBeDefined()

    await userEvent.click(addBuddy)
    await waitFor(() => expect(requestConnection).toHaveBeenCalledWith({ username: "seapaddler" }))
  })

  it("blocks from the header", async () => {
    vi.mocked(getRelationship).mockResolvedValue({
      relationship: "buddy",
      connectionId: "01952f1a-0000-7000-8000-0000000000aa",
      userId: "01952f1a-0000-7000-8000-000000000003",
    })
    vi.mocked(blockPaddler).mockResolvedValue({ success: true })
    render(<ProfileRelationshipControls username="seapaddler" />)

    const blockButton = await screen.findByRole("button", { name: /block/i })
    await userEvent.click(blockButton)
    await waitFor(() => expect(blockPaddler).toHaveBeenCalledWith({ username: "seapaddler" }))
  })
})
