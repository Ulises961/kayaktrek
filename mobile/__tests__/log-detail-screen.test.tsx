import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithOfflineBanner } from "../test-utils/with-offline-banner"
import { Alert } from "react-native"

import LogDetailScreen from "../app/(app)/(drawer)/(logs)/logs/[id]"
import { getSession } from "../lib/auth/session"
import { loadCachedLog } from "../lib/db/logs-cache"
import { deleteLog, endorseLog, getLog, unendorseLog } from "../lib/logs/actions"

const mockBack = jest.fn()

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "log-1" }),
    useRouter: () => ({ back: mockBack }),
    useIsFocused: () => true,
  }
})

jest.mock("../lib/logs/actions", () => ({
  getLog: jest.fn(),
  updateLog: jest.fn(),
  deleteLog: jest.fn(),
  endorseLog: jest.fn(),
  unendorseLog: jest.fn(),
}))
jest.mock("../lib/auth/session", () => ({
  getSession: jest.fn(),
}))
jest.mock("../lib/db/logs-cache", () => ({
  loadCachedLog: jest.fn(),
}))

// M9c WP7: every offline branch below now reads how old its cache is. The real
// lookup needs a database; the age itself is asserted as a relative offset so
// the expectation can't rot into an absolute date as the suite gets older.
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))

const mockGetLog = getLog as jest.Mock
const mockDeleteLog = deleteLog as jest.Mock
const mockGetSession = getSession as jest.Mock
const mockEndorseLog = endorseLog as jest.Mock
const mockUnendorseLog = unendorseLog as jest.Mock
const mockLoadCachedLog = loadCachedLog as jest.Mock

const ME = { userId: "01958f60-0000-7000-8000-00000000000a" }
const OWN_LOG = {
  id: "log-1",
  userId: ME.userId,
  date: "2026-06-01",
  hours: 3,
  distance: 12,
  avgSea: 2,
}
const OTHERS_LOG = {
  id: "log-1",
  userId: "someone-else-id",
  date: "2026-06-01",
  hours: 3,
  distance: 12,
  avgSea: 2,
  endorsers: [],
}

// Delete/block-style confirm via Alert.alert (M9k) — simulate the user tapping the
// non-Cancel button, same as real usage.
jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
  const confirmButton = buttons?.find((button) => button.text !== "Cancel")
  confirmButton?.onPress?.()
})

beforeEach(() => {
  mockGetLog.mockReset()
  mockDeleteLog.mockReset()
  mockGetSession.mockReset()
  mockEndorseLog.mockReset()
  mockUnendorseLog.mockReset()
  mockBack.mockReset()
  mockGetSession.mockResolvedValue(ME)
  mockLoadCachedLog.mockReset().mockResolvedValue(null)
})

describe("LogDetailScreen — owner", () => {
  it("asks for confirmation before deleting, then navigates back", async () => {
    mockGetLog.mockResolvedValue(OWN_LOG)
    mockDeleteLog.mockResolvedValue(undefined)

    const { findByText, getByText } = await render(<LogDetailScreen />, { wrapper: WithOfflineBanner })
    await findByText("Delete log")

    await fireEvent.press(getByText("Delete log"))

    expect(Alert.alert).toHaveBeenCalledWith(
      "Delete this log?",
      "This can't be undone.",
      expect.any(Array),
    )
    await waitFor(() => {
      expect(mockDeleteLog).toHaveBeenCalledWith("log-1")
    })
    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled()
    })
  })
})

describe("LogDetailScreen — someone else's log", () => {
  it("shows the icon meta row and an endorse toggle, no delete button", async () => {
    mockGetLog.mockResolvedValue(OTHERS_LOG)

    const { findByText, queryByText } = await render(<LogDetailScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("3.0h")).toBeTruthy()
    expect(queryByText("Delete log")).toBeNull()
    expect(queryByText("Endorse this log")).toBeTruthy()
  })
})

// The logs list caches but the detail screen did not, so offline you got a list
// of logs none of which would open. Everything on this screen mutates (edit,
// delete, endorse), so the cached view is read-only by definition — the cache
// also carries no notes or endorsers, which the banner says rather than showing
// their absence as fact.
describe("LogDetailScreen — offline", () => {
  beforeEach(() => {
    mockGetLog.mockRejectedValue(new Error("Could not reach the server."))
  })

  it("falls back to the cached summary instead of an error screen", async () => {
    mockLoadCachedLog.mockResolvedValue({
      id: "log-1",
      kind: "mine",
      date: "2026-06-01",
      hours: 3,
      distance: 12,
      avgSea: 2,
      endorsementCount: 1,
    })

    const { findByText, getByText, queryByText } = await render(<LogDetailScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("2026-06-01")).toBeTruthy()
    expect(getByText("3.0h")).toBeTruthy()
    expect(queryByText("Could not reach the server.")).toBeNull()
  })

  it("offers no mutation on a cached own log — editing and deleting need a connection", async () => {
    mockLoadCachedLog.mockResolvedValue({
      id: "log-1",
      kind: "mine",
      date: "2026-06-01",
      hours: 3,
      distance: null,
      avgSea: null,
      endorsementCount: null,
    })

    const { findByText, queryByText } = await render(<LogDetailScreen />, { wrapper: WithOfflineBanner })
    await findByText("2026-06-01")

    expect(queryByText("Delete log")).toBeNull()
    expect(queryByText("Save changes")).toBeNull()
    expect(await findByText(/Can't reach the server\./)).toBeTruthy()
    expect(await findByText(/Last synced 2 days ago/)).toBeTruthy()
  })

  it("offers no endorsement toggle on a cached log from the endorsed list", async () => {
    mockLoadCachedLog.mockResolvedValue({
      id: "log-1",
      kind: "endorsed",
      date: "2026-06-01",
      hours: 3,
      distance: null,
      avgSea: null,
      endorsementCount: null,
    })

    const { findByText, queryByText } = await render(<LogDetailScreen />, { wrapper: WithOfflineBanner })
    await findByText("2026-06-01")

    expect(queryByText("Endorse this log")).toBeNull()
    expect(queryByText("Withdraw endorsement")).toBeNull()
  })

  it("surfaces the error when the log was never cached", async () => {
    mockLoadCachedLog.mockResolvedValue(null)

    const { findByText } = await render(<LogDetailScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })
})
