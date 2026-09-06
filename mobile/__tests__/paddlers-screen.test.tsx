import { fireEvent, render, waitFor } from "@testing-library/react-native"

import PaddlersScreen from "../app/(app)/(drawer)/(paddlers)/index"
import { blockPaddler, listBlocks, unblockPaddler } from "../lib/blocks/actions"
import { getSession } from "../lib/auth/session"
import {
  acceptConnection,
  listConnections,
  removeConnection,
  requestConnection,
  searchPaddlers,
} from "../lib/connections/actions"

jest.mock("../lib/connections/actions", () => ({
  searchPaddlers: jest.fn(),
  listConnections: jest.fn(),
  requestConnection: jest.fn(),
  acceptConnection: jest.fn(),
  removeConnection: jest.fn(),
}))
jest.mock("../lib/blocks/actions", () => ({
  listBlocks: jest.fn(),
  blockPaddler: jest.fn(),
  unblockPaddler: jest.fn(),
}))
jest.mock("../lib/auth/session", () => ({
  getSession: jest.fn(),
}))

const mockSearchPaddlers = searchPaddlers as jest.Mock
const mockListConnections = listConnections as jest.Mock
const mockRequestConnection = requestConnection as jest.Mock
const mockAcceptConnection = acceptConnection as jest.Mock
const mockRemoveConnection = removeConnection as jest.Mock
const mockListBlocks = listBlocks as jest.Mock
const mockBlockPaddler = blockPaddler as jest.Mock
const mockUnblockPaddler = unblockPaddler as jest.Mock
const mockGetSession = getSession as jest.Mock

const ME = { userId: "01958f60-0000-7000-8000-00000000000a", email: "me@example.com" }

const INCOMING = {
  id: "conn-incoming",
  status: "pending",
  requester: { id: "ada-id", username: "ada", name: "Ada" },
  addressee: { id: ME.userId, username: "me", name: "Me" },
}
const OUTGOING = {
  id: "conn-outgoing",
  status: "pending",
  requester: { id: ME.userId, username: "me", name: "Me" },
  addressee: { id: "bo-id", username: "bo", name: "Bo" },
}
const ACCEPTED = {
  id: "conn-accepted",
  status: "accepted",
  requester: { id: ME.userId, username: "me", name: "Me" },
  addressee: { id: "cy-id", username: "cy", name: "Cy" },
}

beforeEach(() => {
  mockSearchPaddlers.mockReset()
  mockListConnections.mockReset()
  mockRequestConnection.mockReset()
  mockAcceptConnection.mockReset()
  mockRemoveConnection.mockReset()
  mockListBlocks.mockReset()
  mockBlockPaddler.mockReset()
  mockUnblockPaddler.mockReset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(ME)
  mockListConnections.mockResolvedValue([])
  mockListBlocks.mockResolvedValue([])
})

describe("PaddlersScreen — search", () => {
  it("searches and shows a Connect button for a paddler with no relationship", async () => {
    mockSearchPaddlers.mockResolvedValue({
      items: [{ id: "ada-id", username: "ada", name: "Ada", relationship: "none" }],
      total: 1,
      page: 1,
      pages: 1,
    })

    const { getByPlaceholderText, findByText, getByText } = await render(<PaddlersScreen />)

    await fireEvent.changeText(getByPlaceholderText("Search paddlers"), "ada")
    await fireEvent(getByPlaceholderText("Search paddlers"), "submitEditing")

    expect(await findByText("@ada")).toBeTruthy()
    expect(getByText("Connect")).toBeTruthy()
  })

  it("sends a connection request and shows Requested instead of Connect", async () => {
    mockSearchPaddlers.mockResolvedValue({
      items: [{ id: "ada-id", username: "ada", name: "Ada", relationship: "none" }],
      total: 1,
      page: 1,
      pages: 1,
    })
    mockRequestConnection.mockResolvedValue({
      id: "new-conn",
      status: "pending",
      requester: ME,
      addressee: { id: "ada-id", username: "ada", name: "Ada" },
    })

    const { getByPlaceholderText, findByText, getByText } = await render(<PaddlersScreen />)

    await fireEvent.changeText(getByPlaceholderText("Search paddlers"), "ada")
    await fireEvent(getByPlaceholderText("Search paddlers"), "submitEditing")
    await findByText("@ada")

    await fireEvent.press(getByText("Connect"))

    expect(mockRequestConnection).toHaveBeenCalledWith({ username: "ada", userId: "ada-id" })
    expect(await findByText("Requested")).toBeTruthy()
  })

  it("cancels a pending outgoing request and reverts the button to Connect", async () => {
    mockSearchPaddlers.mockResolvedValue({
      items: [
        {
          id: "ada-id",
          username: "ada",
          name: "Ada",
          relationship: "pending_outgoing",
          connectionId: "conn-outgoing",
        },
      ],
      total: 1,
      page: 1,
      pages: 1,
    })
    mockRemoveConnection.mockResolvedValue(undefined)

    const { getByPlaceholderText, findByText, getByText } = await render(<PaddlersScreen />)

    await fireEvent.changeText(getByPlaceholderText("Search paddlers"), "ada")
    await fireEvent(getByPlaceholderText("Search paddlers"), "submitEditing")
    await findByText("Requested")

    await fireEvent.press(getByText("Requested"))

    expect(mockRemoveConnection).toHaveBeenCalledWith("conn-outgoing")
    expect(await findByText("Connect")).toBeTruthy()
  })

  it("surfaces a thrown search error", async () => {
    mockSearchPaddlers.mockRejectedValue(new Error("Could not reach the server."))

    const { getByPlaceholderText, findByText } = await render(<PaddlersScreen />)

    await fireEvent.changeText(getByPlaceholderText("Search paddlers"), "ada")
    await fireEvent(getByPlaceholderText("Search paddlers"), "submitEditing")

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })
})

describe("PaddlersScreen — buddies tab", () => {
  it("shows an incoming request with Accept, and accepting removes it from the list", async () => {
    mockListConnections.mockResolvedValueOnce([INCOMING])
    mockAcceptConnection.mockResolvedValue({ ...INCOMING, status: "accepted" })

    const { findByText, getByText, queryByText } = await render(<PaddlersScreen />)
    await fireEvent.press(getByText("Buddies"))

    expect(await findByText("@ada")).toBeTruthy()

    mockListConnections.mockResolvedValueOnce([])
    await fireEvent.press(getByText("Accept"))

    await waitFor(() => {
      expect(mockAcceptConnection).toHaveBeenCalledWith("conn-incoming")
    })
    await waitFor(() => {
      expect(queryByText("@ada")).toBeNull()
    })
  })

  it("shows an accepted buddy with Remove and Block", async () => {
    mockListConnections.mockResolvedValueOnce([ACCEPTED])

    const { findByText, getByText } = await render(<PaddlersScreen />)
    await fireEvent.press(getByText("Buddies"))

    expect(await findByText("@cy")).toBeTruthy()
    expect(getByText("Remove")).toBeTruthy()
    expect(getByText("Block")).toBeTruthy()
  })

  it("blocking a buddy calls blockPaddler and removes the row locally", async () => {
    mockListConnections.mockResolvedValueOnce([ACCEPTED])
    mockBlockPaddler.mockResolvedValue({ id: "block-1", blocked: { username: "cy", name: "Cy" } })

    const { findByText, getByText, queryByText } = await render(<PaddlersScreen />)
    await fireEvent.press(getByText("Buddies"))
    await findByText("@cy")

    await fireEvent.press(getByText("Block"))

    await waitFor(() => {
      expect(mockBlockPaddler).toHaveBeenCalledWith({ username: "cy", userId: "cy-id" })
    })
    await waitFor(() => {
      expect(queryByText("@cy")).toBeNull()
    })
  })

  it("shows Cancel for an outgoing request, not Accept", async () => {
    mockListConnections.mockResolvedValueOnce([OUTGOING])

    const { findByText, getByText, queryByText } = await render(<PaddlersScreen />)
    await fireEvent.press(getByText("Buddies"))

    expect(await findByText("@bo")).toBeTruthy()
    expect(getByText("Cancel")).toBeTruthy()
    expect(queryByText("Accept")).toBeNull()
  })
})

describe("PaddlersScreen — blocked tab", () => {
  it("shows a blocked paddler and unblocks on press", async () => {
    mockListBlocks.mockResolvedValueOnce([
      { id: "block-1", blocked: { username: "troll", name: "Troll" } },
    ])
    mockUnblockPaddler.mockResolvedValue(undefined)

    const { findByText, getByText, queryByText } = await render(<PaddlersScreen />)
    await fireEvent.press(getByText("Blocked"))

    expect(await findByText("@troll")).toBeTruthy()

    mockListBlocks.mockResolvedValueOnce([])
    await fireEvent.press(getByText("Unblock"))

    await waitFor(() => {
      expect(mockUnblockPaddler).toHaveBeenCalledWith("block-1")
    })
    await waitFor(() => {
      expect(queryByText("@troll")).toBeNull()
    })
  })
})
