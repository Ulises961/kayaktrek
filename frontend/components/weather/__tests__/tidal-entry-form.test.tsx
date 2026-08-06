import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TidalEntryForm } from "../tidal-entry-form"

vi.mock("@/lib/weather/actions", () => ({
  updateDaySea: vi.fn(),
}))

import { updateDaySea } from "@/lib/weather/actions"
const UPDATE = updateDaySea as ReturnType<typeof vi.fn>

const DAY_ID = "01900000-0000-7000-8000-000000000001"

beforeEach(() => {
  vi.clearAllMocks()
  UPDATE.mockResolvedValue({ success: true, data: { dayId: DAY_ID } })
})

describe("TidalEntryForm — crew", () => {
  it("renders read-only values and no inputs", () => {
    render(
      <TidalEntryForm
        dayId={DAY_ID}
        sea={{ dayId: DAY_ID, highTide: "09:42", lowTide: "03:10", tidalRangeM: 5.5 }}
        isLeader={false}
        onSaved={vi.fn()}
      />,
    )
    expect(screen.getByTestId("tidal-readonly")).toBeInTheDocument()
    expect(screen.getByText("09:42")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("shows an empty state (not a form) when no tidal data exists", () => {
    render(<TidalEntryForm dayId={DAY_ID} sea={null} isLeader={false} onSaved={vi.fn()} />)
    expect(screen.getByTestId("tidal-empty")).toBeInTheDocument()
    expect(screen.queryByTestId("tidal-readonly")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })
})

describe("TidalEntryForm — leader", () => {
  it("saves quick entry with manual source", async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<TidalEntryForm dayId={DAY_ID} sea={null} isLeader onSaved={onSaved} />)

    await user.type(screen.getByLabelText("High water"), "09:42")
    await user.type(screen.getByLabelText("Low water"), "03:10")
    await user.type(screen.getByLabelText("Range (m)"), "5.5")
    await user.click(screen.getByRole("button", { name: /save tidal data/i }))

    await waitFor(() => expect(UPDATE).toHaveBeenCalledTimes(1))
    const [, fields] = UPDATE.mock.calls[0]
    expect(fields).toMatchObject({
      highTide: "09:42",
      lowTide: "03:10",
      tidalRangeM: 5.5,
      tidalSource: "manual",
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  })

  it("derives corrected HW/LW/range and applies them to the quick fields", async () => {
    const user = userEvent.setup()
    render(<TidalEntryForm dayId={DAY_ID} sea={null} isLeader onSaved={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /port-referenced correction/i }))

    await user.type(screen.getByLabelText("Std HW time"), "09:42")
    await user.type(screen.getByLabelText("HW offset (min)"), "35")
    await user.type(screen.getByLabelText("Std LW time"), "03:10")
    await user.type(screen.getByLabelText("LW offset (min)"), "28")
    await user.type(screen.getByLabelText("Std HW height (m)"), "7.2")
    await user.type(screen.getByLabelText("HW height ratio"), "0.92")
    await user.type(screen.getByLabelText("Std LW height (m)"), "1.1")
    await user.type(screen.getByLabelText("LW height ratio"), "1.05")

    const derived = screen.getByTestId("derived-tide")
    expect(within(derived).getByText(/HW 10:17 · LW 03:38 · range 5.47 m/)).toBeInTheDocument()

    await user.click(within(derived).getByRole("button", { name: /apply/i }))
    expect(screen.getByLabelText("High water")).toHaveValue("10:17")
    expect(screen.getByLabelText("Range (m)")).toHaveValue(5.47)

    await user.click(screen.getByRole("button", { name: /save tidal data/i }))
    await waitFor(() => expect(UPDATE).toHaveBeenCalled())
    const [, fields] = UPDATE.mock.calls[0]
    expect(fields).toMatchObject({ tidalSource: "manual_corrected", hwTimeOffsetMinutes: 35 })
  })

  it("no longer renders the stream-data section (moved to the diamond popup)", () => {
    render(<TidalEntryForm dayId={DAY_ID} sea={null} isLeader onSaved={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /stream data/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Flood dir (°)")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Max spring (kn)")).not.toBeInTheDocument()
  })

  it("omits stream fields from the save payload", async () => {
    const user = userEvent.setup()
    render(<TidalEntryForm dayId={DAY_ID} sea={null} isLeader onSaved={vi.fn()} />)

    await user.type(screen.getByLabelText("High water"), "09:42")
    await user.click(screen.getByRole("button", { name: /save tidal data/i }))

    await waitFor(() => expect(UPDATE).toHaveBeenCalled())
    const [, fields] = UPDATE.mock.calls[0]
    expect(fields).not.toHaveProperty("floodDirectionDegrees")
    expect(fields).not.toHaveProperty("maxSpringRateKnots")
  })

  it("shows error when updateDaySea fails", async () => {
    const user = userEvent.setup()
    UPDATE.mockResolvedValue({ success: false, error: "Server error during save." })

    render(<TidalEntryForm dayId={DAY_ID} sea={null} isLeader onSaved={vi.fn()} />)

    await user.type(screen.getByLabelText("High water"), "09:42")
    await user.type(screen.getByLabelText("Low water"), "03:10")
    await user.click(screen.getByRole("button", { name: /save tidal data/i }))

    await waitFor(() => expect(screen.getByText("Server error during save.")).toBeInTheDocument())
  })
})
