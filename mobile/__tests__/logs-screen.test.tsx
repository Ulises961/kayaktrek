import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithOfflineBanner } from "../test-utils/with-offline-banner"

import LogsScreen from "../app/(app)/(drawer)/(logs)/logs/index"
import { deleteEndorsementRequest, listEndorsementRequests } from "../lib/endorsement-requests/actions"
import { loadLogsCache } from "../lib/db/logs-cache"
import { endorseLog, getEndorsedLogs, getLogs, getLogStats } from "../lib/logs/actions"

jest.mock("../lib/logs/actions", () => ({
  getLogs: jest.fn(),
  getEndorsedLogs: jest.fn(),
  getLogStats: jest.fn(),
  endorseLog: jest.fn(),
}))
jest.mock("../lib/endorsement-requests/actions", () => ({
  listEndorsementRequests: jest.fn(),
  deleteEndorsementRequest: jest.fn(),
}))
jest.mock("../lib/db/logs-cache", () => ({
  loadLogsCache: jest.fn(),
  saveLogsCache: jest.fn(),
}))

// M9c WP7: every offline branch below now reads how old its cache is. The real
// lookup needs a database; the age itself is asserted as a relative offset so
// the expectation can't rot into an absolute date as the suite gets older.
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))

const mockGetLogs = getLogs as jest.Mock
const mockGetEndorsedLogs = getEndorsedLogs as jest.Mock
const mockGetLogStats = getLogStats as jest.Mock
const mockEndorseLog = endorseLog as jest.Mock
const mockListRequests = listEndorsementRequests as jest.Mock
const mockDeleteRequest = deleteEndorsementRequest as jest.Mock
const mockLoadLogsCache = loadLogsCache as jest.Mock

const EMPTY_STATS = {
  totalDistance: 0,
  totalHours: 0,
  logCount: 0,
  tripCount: 0,
  endorsementsReceived: 0,
  conditionsDistribution: {},
  activityByMonth: [],
}

beforeEach(() => {
  mockGetLogs.mockReset()
  mockGetEndorsedLogs.mockReset()
  mockGetLogStats.mockReset()
  mockEndorseLog.mockReset()
  mockListRequests.mockReset()
  mockDeleteRequest.mockReset()
  mockGetEndorsedLogs.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })
  mockGetLogStats.mockResolvedValue(EMPTY_STATS)
  mockListRequests.mockResolvedValue([])
  mockLoadLogsCache.mockReset().mockResolvedValue([])
})

describe("LogsScreen", () => {
  it("renders each own log's formatted date once the fetch resolves", async () => {
    mockGetLogs.mockResolvedValue({
      items: [{ id: "log-1", date: "2026-06-01", hours: 3 }],
      total: 1,
      page: 1,
      pages: 1,
    })

    const { findByText } = await render(<LogsScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("1 Jun 2026")).toBeTruthy()
  })

  it("shows an empty state, not a blank list, when there are no logs", async () => {
    mockGetLogs.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })

    const { findByText } = await render(<LogsScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("No logs yet")).toBeTruthy()
  })

  it("surfaces the thrown error message and offers a retry that re-fetches", async () => {
    mockGetLogs.mockRejectedValueOnce(new Error("Could not reach the server."))
    mockGetLogs.mockResolvedValueOnce({ items: [], total: 0, page: 1, pages: 1 })

    const { findByText, getByText } = await render(<LogsScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("Could not reach the server.")).toBeTruthy()

    await fireEvent.press(getByText("Try again"))

    await waitFor(() => {
      expect(mockGetLogs).toHaveBeenCalledTimes(2)
    })
  })

  it("falls back to cached logs when offline, disabling + New", async () => {
    mockGetLogs.mockRejectedValue(new Error("Could not reach the server."))
    mockGetEndorsedLogs.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadLogsCache.mockImplementation((kind: string) =>
      Promise.resolve(kind === "mine" ? [{ id: "log-1", date: "2026-06-01", hours: 3 }] : []),
    )

    const { findByText, getByText } = await render(<LogsScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("1 Jun 2026")).toBeTruthy()
    expect(getByText(/Can't reach the server\./)).toBeTruthy()
    expect(getByText(/Last synced 2 days ago/)).toBeTruthy()
  })

  it("shows an incoming endorsement request and removes it locally once accepted", async () => {
    mockGetLogs.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })
    mockListRequests.mockResolvedValueOnce([
      {
        id: "req-1",
        status: "pending",
        requester: { id: "u2", username: "ada", name: "Ada" },
        addressee: { id: "u1", username: "me", name: "Me" },
        log: { id: "log-2", date: "2026-06-02" },
      },
    ])
    mockListRequests.mockResolvedValue([])
    mockEndorseLog.mockResolvedValue(undefined)

    const { findByText, getByText, queryByText } = await render(<LogsScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText(/asked you to endorse/)).toBeTruthy()

    await fireEvent.press(getByText("Endorse"))

    await waitFor(() => {
      expect(mockEndorseLog).toHaveBeenCalledWith("log-2")
    })
    await waitFor(() => {
      expect(queryByText(/asked you to endorse/)).toBeNull()
    })
  })

  it("removes a request locally on decline, without endorsing the log", async () => {
    mockGetLogs.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })
    mockListRequests.mockResolvedValue([
      {
        id: "req-1",
        status: "pending",
        requester: { id: "u2", username: "ada", name: "Ada" },
        addressee: { id: "u1", username: "me", name: "Me" },
        log: { id: "log-2", date: "2026-06-02" },
      },
    ])
    mockDeleteRequest.mockResolvedValue(undefined)

    const { findByText, getByText, queryByText } = await render(<LogsScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText(/asked you to endorse/)).toBeTruthy()

    await fireEvent.press(getByText("Decline"))

    await waitFor(() => {
      expect(mockDeleteRequest).toHaveBeenCalledWith("req-1")
    })
    expect(mockEndorseLog).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(queryByText(/asked you to endorse/)).toBeNull()
    })
  })
})
