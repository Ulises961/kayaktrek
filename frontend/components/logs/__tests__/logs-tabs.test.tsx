import { describe, it, expect } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LogsTabs } from "../logs-tabs"
import type { Log } from "@/lib/dtos/log"

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

describe("LogsTabs", () => {
  it("shows my logs tab by default", () => {
    render(<LogsTabs myLogs={[LOG_A]} endorsedLogs={[]} />)
    expect(screen.getByText(/my logs/i)).toBeTruthy()
    expect(screen.getByText(/2026-07-01/)).toBeTruthy()
  })

  it("shows endorsed logs on tab switch", async () => {
    const user = userEvent.setup()
    render(<LogsTabs myLogs={[LOG_A]} endorsedLogs={[LOG_B]} />)
    await user.click(screen.getByRole("tab", { name: /endorsed/i }))
    await waitFor(() => expect(screen.getByText(/2026-07-02/)).toBeTruthy())
  })

  it("shows empty state on endorsed tab when none", async () => {
    const user = userEvent.setup()
    render(<LogsTabs myLogs={[]} endorsedLogs={[]} />)
    await user.click(screen.getByRole("tab", { name: /endorsed/i }))
    await waitFor(() => expect(screen.getByText(/no endorsed/i)).toBeTruthy())
  })

  it("shows empty state on my logs tab when none", () => {
    render(<LogsTabs myLogs={[]} endorsedLogs={[]} />)
    expect(screen.getByText(/no logs yet/i)).toBeTruthy()
  })
})
