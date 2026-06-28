import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

vi.mock("@/lib/logs/actions", () => ({ endorseLog: vi.fn() }))
vi.mock("@/lib/endorsement-requests/actions", () => ({ deleteEndorsementRequest: vi.fn() }))

import { endorseLog } from "@/lib/logs/actions"
import { deleteEndorsementRequest } from "@/lib/endorsement-requests/actions"
import { EndorsementInbox } from "../endorsement-inbox"
import type { EndorsementRequest } from "@/lib/dtos/endorsement-request"

const LOG_ID = "01952f1a-0000-7000-8000-0000000000e1"
const REQUEST: EndorsementRequest = {
  id: "01952f1a-0000-7000-8000-0000000000d1",
  status: "pending",
  created: null,
  respondedAt: null,
  requester: {
    id: "01952f1a-0000-7000-8000-00000000000a",
    username: "alice",
    name: "Alice",
    surname: "Adams",
    avatarUrl: null,
  },
  addressee: {
    id: "01952f1a-0000-7000-8000-000000000001",
    username: "me",
    name: "Me",
    surname: null,
    avatarUrl: null,
  },
  log: {
    id: LOG_ID,
    date: "2026-06-20",
    distance: 12,
    hours: 4,
    tripId: "01952f1a-0000-7000-8000-0000000000f1",
  },
}

beforeEach(() => vi.clearAllMocks())

describe("EndorsementInbox", () => {
  it("renders nothing when there are no requests", () => {
    const { container } = render(<EndorsementInbox requests={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("shows who asked and the paddle detail", () => {
    render(<EndorsementInbox requests={[REQUEST]} />)
    expect(screen.getByText(/asked to endorse \(1\)/i)).toBeDefined()
    expect(screen.getByText("Alice Adams")).toBeDefined()
    expect(screen.getByText(/2026-06-20 · 12 km · 4h/)).toBeDefined()
  })

  it("endorses via the log id (resolving the request server-side)", async () => {
    vi.mocked(endorseLog).mockResolvedValue({ success: true })
    render(<EndorsementInbox requests={[REQUEST]} />)

    await userEvent.click(screen.getByRole("button", { name: /endorse/i }))
    await waitFor(() => expect(endorseLog).toHaveBeenCalledWith(LOG_ID))
  })

  it("declines by deleting the request", async () => {
    vi.mocked(deleteEndorsementRequest).mockResolvedValue({ success: true })
    render(<EndorsementInbox requests={[REQUEST]} />)

    await userEvent.click(screen.getByRole("button", { name: /decline/i }))
    await waitFor(() =>
      expect(deleteEndorsementRequest).toHaveBeenCalledWith("01952f1a-0000-7000-8000-0000000000d1"),
    )
  })
})
