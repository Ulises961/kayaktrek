import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/logs/actions", () => ({
  listMyLogs: vi.fn(),
  listEndorsedLogs: vi.fn(),
}))

import { LogsTabs } from "../logs-tabs"
import type { Log, LogPage } from "@/lib/dtos/log"

const LOG_A: Log = {
  id: "01952f1a-0000-7000-8000-000000000020",
  date: "2026-07-01",
  hours: 5,
}

const LOG_B: Log = {
  id: "01952f1a-0000-7000-8000-000000000021",
  date: "2026-07-02",
  hours: 3,
}

function page(items: Log[], overrides: Partial<LogPage> = {}): LogPage {
  return { items, total: items.length, page: 1, pages: 1, ...overrides }
}

describe("LogsTabs", () => {
  it("shows my logs tab by default", () => {
    render(<LogsTabs initialMine={page([LOG_A])} initialEndorsed={page([])} />)
    expect(screen.getByText(/my logs/i)).toBeTruthy()
    expect(screen.getByText(/2026-07-01/)).toBeTruthy()
  })

  it("shows endorsed logs on tab switch", async () => {
    const user = userEvent.setup()
    render(<LogsTabs initialMine={page([LOG_A])} initialEndorsed={page([LOG_B])} />)
    await user.click(screen.getByRole("tab", { name: /endorsed/i }))
    await waitFor(() => expect(screen.getByText(/2026-07-02/)).toBeTruthy())
  })

  it("shows empty state on endorsed tab when none", async () => {
    const user = userEvent.setup()
    render(<LogsTabs initialMine={page([])} initialEndorsed={page([])} />)
    await user.click(screen.getByRole("tab", { name: /endorsed/i }))
    await waitFor(() => expect(screen.getByText(/no endorsed/i)).toBeTruthy())
  })

  it("shows empty state on my logs tab when none", () => {
    render(<LogsTabs initialMine={page([])} initialEndorsed={page([])} />)
    expect(screen.getByText(/no logs yet/i)).toBeTruthy()
  })

  it("labels tabs from total, not items.length — the exact bug this phase guards against", () => {
    // Only 1 item shipped in this "page", but total says there are 5 — the tab
    // label must reflect the real count, not the partial page's array length.
    render(
      <LogsTabs
        initialMine={page([LOG_A], { total: 5, pages: 3 })}
        initialEndorsed={page([], { total: 2, pages: 1 })}
      />,
    )
    expect(screen.getByRole("tab", { name: /my logs \(5\)/i })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /endorsed \(2\)/i })).toBeTruthy()
  })
})
