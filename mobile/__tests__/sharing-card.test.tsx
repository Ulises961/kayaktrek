import { fireEvent, render, screen } from "@testing-library/react-native"

import { SharingCard } from "@mobile/components/live/sharing-card"
import { describeStatus, type SharingStatus } from "@mobile/lib/live/position/sharing-status"
import { useSharing } from "@mobile/lib/live/position/use-sharing"

jest.mock("@mobile/lib/live/position/use-sharing", () => ({ useSharing: jest.fn() }))

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0)
const start = jest.fn()
const stop = jest.fn()

function showing(status: SharingStatus, error: string | null = null) {
  jest.mocked(useSharing).mockReturnValue({ status, now: NOW, error, start, stop })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("SharingCard", () => {
  it("offers to start when nothing is shared, and starts for its trip", async () => {
    showing({ kind: "off" })
    await render(<SharingCard tripId="trip-1" />)
    expect(screen.getByText(describeStatus({ kind: "off" }, NOW))).toBeTruthy()
    await fireEvent.press(screen.getByText("Start sharing"))
    expect(useSharing).toHaveBeenCalledWith("trip-1")
    expect(start).toHaveBeenCalledTimes(1)
  })

  it("offers to stop while sharing, and says how long ago the last position went out", async () => {
    const status: SharingStatus = { kind: "sharing", lastSentAt: NOW - 120_000 }
    showing(status)
    await render(<SharingCard tripId="trip-1" />)
    expect(screen.getByText(describeStatus(status, NOW))).toBeTruthy()
    await fireEvent.press(screen.getByText("Stop sharing"))
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it("says plainly that nothing is being shared when the system location switch is off", async () => {
    showing({ kind: "location-off" })
    await render(<SharingCard tripId="trip-1" />)
    expect(screen.getByText(describeStatus({ kind: "location-off" }, NOW))).toBeTruthy()
    expect(screen.getByText("Stop sharing")).toBeTruthy()
  })

  it("offers to start again after a share that ended by itself", async () => {
    showing({ kind: "ended", reason: "trip-not-live" })
    await render(<SharingCard tripId="trip-1" />)
    expect(screen.getByText("Start sharing")).toBeTruthy()
  })

  it("shows why starting failed", async () => {
    showing({ kind: "off" }, "Location is switched off on this phone.")
    await render(<SharingCard tripId="trip-1" />)
    expect(screen.getByText("Location is switched off on this phone.")).toBeTruthy()
  })
})
