import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/sessions/actions", () => ({ revokeSession: vi.fn() }))
const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

import { revokeSession } from "@/lib/sessions/actions"
import { DeviceSessions } from "../device-sessions"
import { formatTimeAgo } from "@/lib/utils/date"
import type { Session } from "@/lib/dtos/session"

const NOW = new Date("2026-08-02T12:00:00Z")

const thisDevice: Session = {
  id: "019fc2d4-0a26-7878-a312-4464805b9ac5",
  deviceLabel: "Firefox on Linux",
  locationLabel: "Genoa, Liguria, Italy",
  created: "2026-08-01T10:00:00Z",
  lastUsedAt: "2026-08-02T11:55:00Z",
  expiresAt: "2026-08-31T10:00:00Z",
  isCurrent: true,
}

const otherDevice: Session = {
  id: "019fc2d4-0a26-7878-a312-4464805b9ac6",
  deviceLabel: "iPhone",
  locationLabel: null,
  created: "2026-07-20T10:00:00Z",
  lastUsedAt: "2026-07-31T12:00:00Z",
  expiresAt: "2026-08-19T10:00:00Z",
  isCurrent: false,
}

function row(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement
}

beforeEach(() => vi.clearAllMocks())

describe("DeviceSessions", () => {
  it("lists each device with its location and last activity", () => {
    render(<DeviceSessions sessions={[thisDevice, otherDevice]} now={NOW} />)

    expect(screen.getByText("Firefox on Linux")).toBeDefined()
    // Presented as approximate — the lookup is a rough guess, not a fact.
    expect(screen.getByText(/~Genoa, Liguria, Italy/)).toBeDefined()
    expect(screen.getByText(new RegExp(formatTimeAgo(otherDevice.lastUsedAt, NOW)))).toBeDefined()
  })

  it("marks the current device and offers no way to sign it out from the list", () => {
    render(<DeviceSessions sessions={[thisDevice, otherDevice]} now={NOW} />)

    expect(within(row("Firefox on Linux")).getByText(/this device/i)).toBeDefined()
    expect(within(row("Firefox on Linux")).queryByRole("button")).toBeNull()
    expect(within(row("iPhone")).getByRole("button", { name: /sign out/i })).toBeDefined()
  })

  it("falls back to honest placeholders when a label is unknown", () => {
    render(<DeviceSessions sessions={[otherDevice]} now={NOW} />)
    expect(screen.getByText(/unknown location/i)).toBeDefined()
  })

  it("revokes the chosen device", async () => {
    vi.mocked(revokeSession).mockResolvedValue({ success: true })
    render(<DeviceSessions sessions={[thisDevice, otherDevice]} now={NOW} />)

    await userEvent.click(within(row("iPhone")).getByRole("button", { name: /sign out/i }))

    expect(revokeSession).toHaveBeenCalledWith(otherDevice.id)
  })

  it("surfaces a failure instead of pretending the device was signed out", async () => {
    vi.mocked(revokeSession).mockResolvedValue({ success: false, error: "Could not sign out." })
    render(<DeviceSessions sessions={[thisDevice, otherDevice]} now={NOW} />)

    await userEvent.click(within(row("iPhone")).getByRole("button", { name: /sign out/i }))

    await waitFor(() => expect(screen.getByText("Could not sign out.")).toBeDefined())
    // The device must still be listed as signed in, and its button must return to
    // "Sign out" (not remain stuck on "Signing out…") — a failed revoke that looks
    // like a stuck or vanished device is as dangerous as one that looks successful.
    expect(within(row("iPhone")).getByRole("button", { name: /^sign out$/i })).toBeEnabled()
    expect(screen.getByText("iPhone")).toBeInTheDocument()
  })

  it("does not call router.refresh when the revoke fails", async () => {
    vi.mocked(revokeSession).mockResolvedValue({ success: false, error: "Could not sign out." })
    render(<DeviceSessions sessions={[thisDevice, otherDevice]} now={NOW} />)

    await userEvent.click(within(row("iPhone")).getByRole("button", { name: /sign out/i }))
    await waitFor(() => expect(screen.getByText("Could not sign out.")).toBeDefined())

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("calls router.refresh (to re-fetch the session list) on a successful revoke", async () => {
    vi.mocked(revokeSession).mockResolvedValue({ success: true })
    render(<DeviceSessions sessions={[thisDevice, otherDevice]} now={NOW} />)

    await userEvent.click(within(row("iPhone")).getByRole("button", { name: /sign out/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(screen.queryByText("Could not sign out.")).not.toBeInTheDocument()
  })

  it("explains the empty case rather than rendering a bare list", () => {
    render(<DeviceSessions sessions={[]} now={NOW} />)
    expect(screen.getByText(/no devices to show/i)).toBeDefined()
  })

  it("says the list could not be loaded instead of claiming there are no devices", () => {
    // The caller is signed in, so their own session is always in the list — reporting
    // an empty list as "no devices" would state the opposite of what a failure means.
    render(<DeviceSessions sessions={[]} loadError="Failed to load your devices." now={NOW} />)
    expect(screen.getByText("Failed to load your devices.")).toBeDefined()
    expect(screen.queryByText(/no devices to show/i)).toBeNull()
  })
})
