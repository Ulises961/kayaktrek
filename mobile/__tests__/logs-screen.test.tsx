import { fireEvent, render, waitFor } from "@testing-library/react-native"

import LogsScreen from "../app/(app)/(drawer)/(logs)/index"
import { deleteEndorsementRequest, listEndorsementRequests } from "../lib/endorsement-requests/actions"
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

const mockGetLogs = getLogs as jest.Mock
const mockGetEndorsedLogs = getEndorsedLogs as jest.Mock
const mockGetLogStats = getLogStats as jest.Mock
const mockEndorseLog = endorseLog as jest.Mock
const mockListRequests = listEndorsementRequests as jest.Mock
const mockDeleteRequest = deleteEndorsementRequest as jest.Mock

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
})

describe("LogsScreen", () => {
  it("renders each own log's formatted date once the fetch resolves", async () => {
    mockGetLogs.mockResolvedValue({
      items: [{ id: "log-1", date: "2026-06-01", hours: 3 }],
      total: 1,
      page: 1,
      pages: 1,
    })

    const { findByText } = await render(<LogsScreen />)

    expect(await findByText("1 Jun 2026")).toBeTruthy()
  })

  it("shows an empty state, not a blank list, when there are no logs", async () => {
    mockGetLogs.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })

    const { findByText } = await render(<LogsScreen />)

    expect(await findByText("No logs yet.")).toBeTruthy()
  })

  it("surfaces the thrown error message and offers a retry that re-fetches", async () => {
    mockGetLogs.mockRejectedValueOnce(new Error("Could not reach the server."))
    mockGetLogs.mockResolvedValueOnce({ items: [], total: 0, page: 1, pages: 1 })

    const { findByText, getByText } = await render(<LogsScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()

    await fireEvent.press(getByText("Try again"))

    await waitFor(() => {
      expect(mockGetLogs).toHaveBeenCalledTimes(2)
    })
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

    const { findByText, getByText, queryByText } = await render(<LogsScreen />)

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

    const { findByText, getByText, queryByText } = await render(<LogsScreen />)

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
