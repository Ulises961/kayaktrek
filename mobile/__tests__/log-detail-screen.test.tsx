import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import LogDetailScreen from "../app/(app)/(drawer)/(logs)/logs/[id]"
import { getSession } from "../lib/auth/session"
import { deleteLog, endorseLog, getLog, unendorseLog } from "../lib/logs/actions"

const mockBack = jest.fn()

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "log-1" }),
    useRouter: () => ({ back: mockBack }),
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

const mockGetLog = getLog as jest.Mock
const mockDeleteLog = deleteLog as jest.Mock
const mockGetSession = getSession as jest.Mock
const mockEndorseLog = endorseLog as jest.Mock
const mockUnendorseLog = unendorseLog as jest.Mock

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
})

describe("LogDetailScreen — owner", () => {
  it("asks for confirmation before deleting, then navigates back", async () => {
    mockGetLog.mockResolvedValue(OWN_LOG)
    mockDeleteLog.mockResolvedValue(undefined)

    const { findByText, getByText } = await render(<LogDetailScreen />)
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

    const { findByText, queryByText } = await render(<LogDetailScreen />)

    expect(await findByText("3.0h")).toBeTruthy()
    expect(queryByText("Delete log")).toBeNull()
    expect(queryByText("Endorse this log")).toBeTruthy()
  })
})
