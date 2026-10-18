import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trip-member/actions", () => ({
  setSatelliteTracking: vi.fn(),
}))

import { setSatelliteTracking } from "@/lib/trip-member/actions"
import { SatelliteTrackingSwitch } from "../satellite-tracking-switch"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const SWITCH_NAME = /share my inreach on this trip/i

function renderSwitch(
  overrides: Partial<React.ComponentProps<typeof SatelliteTrackingSwitch>> = {},
) {
  return render(<SatelliteTrackingSwitch tripId={TRIP_ID} enabled={false} hasFeed {...overrides} />)
}

beforeEach(() => {
  vi.mocked(setSatelliteTracking).mockReset().mockResolvedValue({ success: true })
})

describe("SatelliteTrackingSwitch — what it shows", () => {
  it("is off when sharing is not switched on for this trip", () => {
    renderSwitch({ enabled: false })

    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
      "aria-checked",
      "false",
    )
  })

  it("is on when sharing is switched on for this trip", () => {
    renderSwitch({ enabled: true })

    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
      "aria-checked",
      "true",
    )
  })

  it("says what switching it on does", () => {
    renderSwitch()

    expect(screen.getByText(/while the trip is under way/i)).toBeInTheDocument()
  })

  it("follows the server when the same member changes it elsewhere", () => {
    const { rerender } = renderSwitch({ enabled: false })

    rerender(<SatelliteTrackingSwitch tripId={TRIP_ID} enabled hasFeed />)

    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
      "aria-checked",
      "true",
    )
  })
})

describe("SatelliteTrackingSwitch — switching", () => {
  it("switches it on for this trip", async () => {
    const user = userEvent.setup()
    renderSwitch({ enabled: false })

    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }))

    expect(setSatelliteTracking).toHaveBeenCalledWith(TRIP_ID, true)
  })

  it("switches it off for this trip", async () => {
    const user = userEvent.setup()
    renderSwitch({ enabled: true })

    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }))

    expect(setSatelliteTracking).toHaveBeenCalledWith(TRIP_ID, false)
  })

  it("shows the new position straight away and locks the switch while the request is in flight", async () => {
    const user = userEvent.setup()
    let finish: (result: { success: true }) => void = () => {}
    vi.mocked(setSatelliteTracking).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    renderSwitch({ enabled: false })

    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }))

    const control = screen.getByRole("switch", { name: SWITCH_NAME })
    expect(control).toHaveAttribute("aria-checked", "true")
    expect(control).toBeDisabled()

    await user.click(control)
    expect(setSatelliteTracking).toHaveBeenCalledTimes(1)

    await act(async () => finish({ success: true }))
  })

  it("shows the server's reason and goes back to off when switching on is refused", async () => {
    const user = userEvent.setup()
    vi.mocked(setSatelliteTracking).mockResolvedValue({
      success: false,
      error: "This trip is over, so your inReach can no longer be shared on it.",
    })
    renderSwitch({ enabled: false })

    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }))

    expect(await screen.findByText(/this trip is over/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    )
  })

  it("goes back to on when switching off fails, so it never claims sharing stopped", async () => {
    const user = userEvent.setup()
    vi.mocked(setSatelliteTracking).mockResolvedValue({
      success: false,
      error: "Could not reach the server.",
    })
    renderSwitch({ enabled: true })

    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }))

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    )
  })

  it("clears an earlier failure when the next attempt starts", async () => {
    const user = userEvent.setup()
    vi.mocked(setSatelliteTracking).mockResolvedValueOnce({ success: false, error: "Try later." })
    renderSwitch({ enabled: false })

    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }))
    expect(await screen.findByText("Try later.")).toBeInTheDocument()

    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }))

    await waitFor(() => expect(screen.queryByText("Try later.")).not.toBeInTheDocument())
  })
})

describe("SatelliteTrackingSwitch — when no feed is registered", () => {
  it("cannot be switched on and points at Settings", () => {
    renderSwitch({ enabled: false, hasFeed: false })

    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeDisabled()
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings")
  })

  it("can still be switched off, for a feed removed after it was switched on", async () => {
    const user = userEvent.setup()
    renderSwitch({ enabled: true, hasFeed: false })

    const control = screen.getByRole("switch", { name: SWITCH_NAME })
    expect(control).toBeEnabled()
    await user.click(control)

    expect(setSatelliteTracking).toHaveBeenCalledWith(TRIP_ID, false)
  })

  it("does not send the paddler to Settings when a feed exists", () => {
    renderSwitch({ hasFeed: true })

    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument()
  })
})
