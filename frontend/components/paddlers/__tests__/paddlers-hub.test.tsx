import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/connections/actions", () => ({
  searchPaddlers: vi.fn(),
  acceptConnection: vi.fn(),
  removeConnection: vi.fn(),
}))
vi.mock("@/lib/blocks/actions", () => ({ unblockPaddler: vi.fn() }))

import { searchPaddlers } from "@/lib/connections/actions"
import { PaddlersHub } from "../paddlers-hub"
import type { Connection } from "@/lib/dtos/connection"
import type { Block } from "@/lib/dtos/block"
import type { PaddlerSearchResult, PaddlerSearchPage } from "@/lib/dtos/paddler-search"

const mockSearch = vi.mocked(searchPaddlers)

const ME = "01952f1a-0000-7000-8000-000000000001"
const ALICE = {
  id: "01952f1a-0000-7000-8000-00000000000a",
  username: "alice",
  name: "Alice",
  surname: null,
  avatarUrl: null,
}
const SELF = { id: ME, username: "me", name: "Me", surname: null, avatarUrl: null }

const CONNECTIONS: Connection[] = [
  {
    id: "01952f1a-0000-7000-8000-0000000000c1",
    status: "accepted",
    created: null,
    respondedAt: null,
    requester: ALICE,
    addressee: SELF,
  },
]

const BLOCKS: Block[] = [
  {
    id: "01952f1a-0000-7000-8000-0000000000b1",
    created: null,
    blocked: {
      id: "01952f1a-0000-7000-8000-00000000000d",
      username: "bob",
      name: "Bob",
      surname: null,
      avatarUrl: null,
    },
  },
]

function searchResult(overrides: Partial<PaddlerSearchResult> = {}): PaddlerSearchResult {
  return {
    id: "01952f1a-0000-7000-8000-00000000000e",
    username: "carasearch",
    name: "Cara",
    surname: null,
    avatarUrl: null,
    bio: null,
    homeLocation: null,
    certifications: [],
    relationship: "none",
    connectionId: null,
    ...overrides,
  }
}

function searchPage(items: PaddlerSearchResult[]): PaddlerSearchPage {
  return { items, total: items.length, page: 1, pages: 1 }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSearch.mockResolvedValue(searchPage([]))
})

describe("PaddlersHub", () => {
  it("renders the buddy list as the page body with no Find/Buddies tabs", () => {
    render(<PaddlersHub connections={CONNECTIONS} blocks={[]} currentUserId={ME} />)
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
  })

  it("filters the buddy list client-side with no network call", async () => {
    render(<PaddlersHub connections={CONNECTIONS} blocks={[]} currentUserId={ME} />)
    await userEvent.type(screen.getByLabelText(/search paddlers/i), "alice")
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("hides non-matching buddies once a term is typed", async () => {
    render(<PaddlersHub connections={CONNECTIONS} blocks={[]} currentUserId={ME} />)
    await userEvent.type(screen.getByLabelText(/search paddlers/i), "nomatch")
    expect(screen.queryByText("Alice")).not.toBeInTheDocument()
  })

  it("debounces a community search and renders results beneath the buddy list", async () => {
    mockSearch.mockResolvedValue(searchPage([searchResult()]))
    render(<PaddlersHub connections={CONNECTIONS} blocks={[]} currentUserId={ME} />)
    await userEvent.type(screen.getByLabelText(/search paddlers/i), "cara")
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("cara"))
    await waitFor(() => expect(screen.getByText(/search the community/i)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText("Cara")).toBeInTheDocument())
  })

  // The search ran while the request was still pending. The other side then accepted, and the page
  // re-rendered with the accepted connection. The result is search state the refresh does not
  // re-fetch, so it must follow the connections rather than keep saying "Pending".
  describe("a search result whose connection changes after the search ran", () => {
    const ND1_ID = "01952f1a-0000-7000-8000-0000000000aa"
    const ND1 = { id: ND1_ID, username: "nd1", name: "ND1", surname: null, avatarUrl: null }
    const connectionWith = (status: "pending" | "accepted"): Connection => ({
      id: "01952f1a-0000-7000-8000-0000000000c2",
      status,
      created: null,
      respondedAt: null,
      requester: SELF,
      addressee: ND1,
    })
    const foundWhilePending = searchResult({
      id: ND1_ID,
      username: "nd1",
      name: "ND1",
      relationship: "pending_outgoing",
      connectionId: "01952f1a-0000-7000-8000-0000000000c2",
    })

    async function searchForNd1(connections: Connection[]) {
      mockSearch.mockResolvedValue(searchPage([foundWhilePending]))
      const view = render(<PaddlersHub connections={connections} blocks={[]} currentUserId={ME} />)
      await userEvent.type(screen.getByLabelText(/search paddlers/i), "nd")
      await waitFor(() => expect(screen.getByRole("button", { name: /pending/i })).toBeVisible())
      return view
    }

    it("stops saying Pending once the connection is accepted", async () => {
      const view = await searchForNd1([connectionWith("pending")])

      view.rerender(
        <PaddlersHub connections={[connectionWith("accepted")]} blocks={[]} currentUserId={ME} />,
      )

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /already buddies/i })).toBeInTheDocument(),
      )
      expect(screen.queryByRole("button", { name: /^pending$/i })).not.toBeInTheDocument()
    })

    it("offers Add buddy again if the request is gone", async () => {
      const view = await searchForNd1([connectionWith("pending")])

      view.rerender(<PaddlersHub connections={[]} blocks={[]} currentUserId={ME} />)

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /add buddy/i })).toBeInTheDocument(),
      )
    })

    it("does not re-run the search, since the connections already say what changed", async () => {
      const view = await searchForNd1([connectionWith("pending")])
      mockSearch.mockClear()

      view.rerender(
        <PaddlersHub connections={[connectionWith("accepted")]} blocks={[]} currentUserId={ME} />,
      )

      expect(mockSearch).not.toHaveBeenCalled()
    })
  })

  it("does not show the community section when the search field is empty", () => {
    render(<PaddlersHub connections={CONNECTIONS} blocks={[]} currentUserId={ME} />)
    expect(screen.queryByText(/search the community/i)).not.toBeInTheDocument()
  })

  it("seeds the search field from initialQuery", () => {
    render(
      <PaddlersHub connections={CONNECTIONS} blocks={[]} currentUserId={ME} initialQuery="alice" />,
    )
    expect(screen.getByLabelText(/search paddlers/i)).toHaveValue("alice")
  })

  it("renders Blocked as a collapsed disclosure, not a co-equal tab", () => {
    render(<PaddlersHub connections={CONNECTIONS} blocks={BLOCKS} currentUserId={ME} />)
    expect(screen.queryByText("Bob")).not.toBeInTheDocument()
    expect(screen.getByText(/blocked/i)).toBeInTheDocument()
  })

  it("reveals blocked paddlers when the disclosure is opened", async () => {
    render(<PaddlersHub connections={CONNECTIONS} blocks={BLOCKS} currentUserId={ME} />)
    await userEvent.click(screen.getByText(/blocked/i))
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument())
  })

  it("shows 'No paddlers found' when search returns empty results", async () => {
    mockSearch.mockResolvedValue(searchPage([]))
    render(<PaddlersHub connections={CONNECTIONS} blocks={[]} currentUserId={ME} />)
    await userEvent.type(screen.getByLabelText(/search paddlers/i), "nomatch")

    await waitFor(() => expect(screen.getByText(/no paddlers found/i)).toBeInTheDocument())
  })
})
