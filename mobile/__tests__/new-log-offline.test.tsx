import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"

import NewLogScreen from "../app/(app)/(drawer)/(logs)/logs/new"
import { upsertCachedLog } from "../lib/db/logs-cache"
import { enqueueMutation } from "../lib/db/mutation-queue"
import { createLog } from "../lib/logs/actions"

const mockBack = jest.fn()
jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useRouter: () => ({ back: mockBack }),
    useIsFocused: () => true,
  }
})
jest.mock("../lib/logs/actions", () => ({ createLog: jest.fn() }))
jest.mock("../lib/db/logs-cache", () => ({ upsertCachedLog: jest.fn(async () => undefined) }))
jest.mock("../lib/db/mutation-queue", () => ({
  ...jest.requireActual("../lib/db/mutation-queue"),
  enqueueMutation: jest.fn(async () => "mutation-1"),
  pushQueuedMutations: jest.fn(async () => ({ applied: 0, rejected: 0, kept: 1 })),
}))

const mockCreateLog = createLog as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// M9d WP8: a log written at camp with no signal is kept, not lost to an error.
describe("NewLogScreen — no signal", () => {
  it("queues the log, shows it in the list, and leaves without an error", async () => {
    mockCreateLog.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    const { getByText, queryByText } = await render(<NewLogScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(getByText("Create log"))

    await waitFor(() => expect(mockBack).toHaveBeenCalled())
    expect(enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ entityType: "log", operation: "create" }))
    expect(upsertCachedLog).toHaveBeenCalledWith(expect.anything(), "mine")
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
  })

  it("still shows a refusal from the server", async () => {
    mockCreateLog.mockRejectedValue(new Error("hours: Max 24 hours"))
    const { getByText, findByText } = await render(<NewLogScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(getByText("Create log"))

    expect(await findByText("hours: Max 24 hours")).toBeTruthy()
    expect(enqueueMutation).not.toHaveBeenCalled()
  })
})
