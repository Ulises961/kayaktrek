import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/logs/actions", () => ({
  listMyLogs: vi.fn(),
  listEndorsedLogs: vi.fn(),
}))

import { listMyLogs, listEndorsedLogs } from "@/lib/logs/actions"
import { LogsList } from "../logs-list"
import { LOG_SORT, type Log, type LogPage } from "@/lib/dtos/log"
import { formatDayDate } from "@/lib/utils/date"

const mockMyLogs = vi.mocked(listMyLogs)
const mockEndorsedLogs = vi.mocked(listEndorsedLogs)

// LogCard renders `date` through formatDayDate (no notes field is displayed at all),
// so distinct dates are what distinguish fixtures in the rendered DOM.
function log(overrides: Partial<Log> = {}): Log {
  return {
    id: "01952f1a-0000-7000-8000-000000000020",
    date: "2026-07-01",
    hours: 4,
    avgSea: 3,
    distance: 12,
    ...overrides,
  }
}

function page(items: Log[], overrides: Partial<LogPage> = {}): LogPage {
  return { items, total: items.length, page: 1, pages: 1, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMyLogs.mockResolvedValue(page([]))
  mockEndorsedLogs.mockResolvedValue(page([]))
})

describe("LogsList", () => {
  it("renders the initial logs without re-querying", () => {
    render(<LogsList initial={page([log()])} kind="mine" />)
    expect(screen.getByText(formatDayDate("2026-07-01"))).toBeInTheDocument()
    expect(mockMyLogs).not.toHaveBeenCalled()
  })

  it("shows the mine empty state when there are no logs", () => {
    render(<LogsList initial={page([])} kind="mine" />)
    expect(screen.getByText(/no logs yet/i)).toBeInTheDocument()
  })

  it("shows the endorsed empty state when there are no logs", () => {
    render(<LogsList initial={page([])} kind="endorsed" />)
    expect(screen.getByText(/no endorsed logs yet/i)).toBeInTheDocument()
  })

  it("re-queries page 1 with the new sort and replaces items", async () => {
    mockMyLogs.mockResolvedValue(page([log({ id: "new", date: "2026-01-01" })]))
    render(<LogsList initial={page([log()])} kind="mine" />)
    await userEvent.selectOptions(screen.getByLabelText(/sort my logs/i), LOG_SORT.OLDEST)
    await waitFor(() => expect(mockMyLogs).toHaveBeenCalledWith(1, LOG_SORT.OLDEST))
    await waitFor(() => expect(screen.getByText(formatDayDate("2026-01-01"))).toBeInTheDocument())
    expect(screen.queryByText(formatDayDate("2026-07-01"))).not.toBeInTheDocument()
  })

  it("calls listEndorsedLogs when kind is endorsed", async () => {
    mockEndorsedLogs.mockResolvedValue(page([]))
    render(<LogsList initial={page([log()])} kind="endorsed" />)
    await userEvent.selectOptions(screen.getByLabelText(/sort endorsed logs/i), LOG_SORT.OLDEST)
    await waitFor(() => expect(mockEndorsedLogs).toHaveBeenCalledWith(1, LOG_SORT.OLDEST))
  })

  it("appends the next page on Load more, preserving prior items", async () => {
    mockMyLogs.mockResolvedValue(page([log({ id: "next", date: "2026-08-01" })], { page: 2 }))
    render(<LogsList initial={page([log()], { pages: 2, total: 2 })} kind="mine" />)
    await userEvent.click(screen.getByRole("button", { name: /load more/i }))
    await waitFor(() => expect(screen.getByText(formatDayDate("2026-08-01"))).toBeInTheDocument())
    expect(screen.getByText(formatDayDate("2026-07-01"))).toBeInTheDocument()
  })

  it("does not show Load more once all pages are loaded", () => {
    render(<LogsList initial={page([log()], { page: 1, pages: 1 })} kind="mine" />)
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument()
  })

  it("resyncs to a fresh initial prop after a server revalidation re-render (e.g. post-delete)", () => {
    const { rerender } = render(<LogsList initial={page([log()])} kind="mine" />)
    expect(screen.getByText(formatDayDate("2026-07-01"))).toBeInTheDocument()

    // Simulates the RSC tree re-rendering with fresh server data after a mutation's
    // revalidatePath — same component instance, new `initial` object identity.
    rerender(<LogsList initial={page([log({ id: "kept", date: "2026-09-09" })])} kind="mine" />)
    expect(screen.getByText(formatDayDate("2026-09-09"))).toBeInTheDocument()
    expect(screen.queryByText(formatDayDate("2026-07-01"))).not.toBeInTheDocument()
  })

  it("discards a stale response that resolves after a later sort change", async () => {
    let resolveFirst!: (value: LogPage) => void
    mockMyLogs.mockImplementationOnce(
      () => new Promise<LogPage>((resolve) => (resolveFirst = resolve)),
    )
    render(<LogsList initial={page([log()])} kind="mine" />)

    await userEvent.selectOptions(screen.getByLabelText(/sort my logs/i), LOG_SORT.OLDEST)
    mockMyLogs.mockResolvedValueOnce(page([log({ id: "second", date: "2026-02-02" })]))
    await userEvent.selectOptions(screen.getByLabelText(/sort my logs/i), LOG_SORT.NEWEST)
    await waitFor(() => expect(screen.getByText(formatDayDate("2026-02-02"))).toBeInTheDocument())

    // The first (stale) request resolves after the second — must not overwrite it.
    resolveFirst(page([log({ id: "stale", date: "2026-03-03" })]))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(formatDayDate("2026-03-03"))).not.toBeInTheDocument()
    expect(screen.getByText(formatDayDate("2026-02-02"))).toBeInTheDocument()
  })
})
