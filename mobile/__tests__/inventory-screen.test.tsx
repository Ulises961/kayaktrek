import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { Alert } from "react-native"

import InventoryScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/items"
import { getSession } from "../lib/auth/session"
import {
  addRequirement,
  contributeItem,
  getMyItems,
  removeRequirement,
  unclaimRequirement,
} from "../lib/inventory/actions"
import {
  addPackingItem,
  getPackingItems,
  removePackingItem,
  togglePackingItem,
} from "../lib/inventory/personal-packing-actions"
import { getTrip } from "../lib/trips/actions"
import { loadGearCache } from "../lib/db/gear-cache"
import { loadKitCache } from "../lib/db/kit-cache"
import { loadRequirementsCache } from "../lib/db/requirements-cache"
import { useIsOffline } from "../lib/network/use-is-offline"

// Extends jest.setup.ts's global Stack.Screen stub rather than replacing the module —
// this screen also needs useLocalSearchParams, which no other screen test has needed
// yet (M9b's map/float-plan screens have no tests, per CLAUDE.md's M9b entry).
jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "trip-1" }),
    useIsFocused: () => true,
  }
})
jest.mock("../lib/trips/actions", () => ({
  getTrip: jest.fn(),
}))
jest.mock("../lib/inventory/actions", () => ({
  getMyItems: jest.fn(),
  addRequirement: jest.fn(),
  removeRequirement: jest.fn(),
  contributeItem: jest.fn(),
  unclaimRequirement: jest.fn(),
}))
jest.mock("../lib/inventory/personal-packing-actions", () => ({
  getPackingItems: jest.fn(),
  addPackingItem: jest.fn(),
  togglePackingItem: jest.fn(),
  removePackingItem: jest.fn(),
}))
jest.mock("../lib/auth/session", () => ({
  getSession: jest.fn(),
}))
// The save* mocks must RESOLVE, not return undefined: the real functions are
// async and both useLiveCache and the screen call `.catch()` on what they
// return. A bare jest.fn() returns undefined, so `.catch` throws a TypeError
// inside the fetch path and the screen silently takes its offline branch —
// a mock faithful enough to typecheck but not to behave.
jest.mock("../lib/db/requirements-cache", () => ({
  loadRequirementsCache: jest.fn(),
  saveRequirementsCache: jest.fn(() => Promise.resolve()),
}))
jest.mock("../lib/db/gear-cache", () => ({
  loadGearCache: jest.fn(),
  saveGearCache: jest.fn(() => Promise.resolve()),
}))
jest.mock("../lib/db/kit-cache", () => ({
  loadKitCache: jest.fn(),
  saveKitCache: jest.fn(() => Promise.resolve()),
}))

// M9c WP7: every offline branch below now reads how old its cache is. The real
// lookup needs a database; the age itself is asserted as a relative offset so
// the expectation can't rot into an absolute date as the suite gets older.
jest.mock("../lib/network/use-is-offline", () => ({ useIsOffline: jest.fn(() => false) }))
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))

const mockGetTrip = getTrip as jest.Mock
const mockGetMyItems = getMyItems as jest.Mock
const mockAddRequirement = addRequirement as jest.Mock
const mockRemoveRequirement = removeRequirement as jest.Mock
const mockContributeItem = contributeItem as jest.Mock
const mockUnclaimRequirement = unclaimRequirement as jest.Mock
const mockGetPackingItems = getPackingItems as jest.Mock
const mockAddPackingItem = addPackingItem as jest.Mock
const mockTogglePackingItem = togglePackingItem as jest.Mock
const mockRemovePackingItem = removePackingItem as jest.Mock
const mockGetSession = getSession as jest.Mock
const mockLoadRequirementsCache = loadRequirementsCache as jest.Mock
const mockLoadGearCache = loadGearCache as jest.Mock
const mockLoadKitCache = loadKitCache as jest.Mock
const mockUseIsOffline = useIsOffline as jest.Mock

const ME = { userId: "me-id", email: "me@example.com" }
const MY_ITEM = { id: "item-1", name: "Spare paddle", status: "owned" }

const NEEDED_REQUIREMENT = {
  id: "req-1",
  name: "First aid kit",
  status: "needed",
  proposedBy: { id: "member-me", user: { id: ME.userId, username: "me" } },
  contributions: [],
}
const COVERED_BY_ME = {
  id: "req-2",
  name: "Spare paddle",
  status: "covered",
  proposedBy: { id: "member-other", user: { id: "other-id", username: "ada" } },
  contributions: [
    {
      id: "contrib-1",
      member: { id: "member-me", user: { id: ME.userId, username: "me" } },
      item: { id: "item-1", name: "Spare paddle" },
    },
  ],
}

// Remove confirms via Alert.alert (M9k) — simulate the user tapping the non-Cancel
// button, same as real usage.
jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
  const confirmButton = buttons?.find((button) => button.text !== "Cancel")
  confirmButton?.onPress?.()
})

beforeEach(() => {
  mockGetTrip.mockReset()
  mockGetMyItems.mockReset()
  mockAddRequirement.mockReset()
  mockRemoveRequirement.mockReset()
  mockContributeItem.mockReset()
  mockUnclaimRequirement.mockReset()
  mockGetPackingItems.mockReset()
  mockAddPackingItem.mockReset()
  mockTogglePackingItem.mockReset()
  mockRemovePackingItem.mockReset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(ME)
  mockGetMyItems.mockResolvedValue([MY_ITEM])
  mockGetPackingItems.mockResolvedValue([])
  mockLoadRequirementsCache.mockReset().mockResolvedValue([])
  mockLoadGearCache.mockReset().mockResolvedValue([])
  mockLoadKitCache.mockReset().mockResolvedValue([])
  mockUseIsOffline.mockReturnValue(false)
})

// Same bug the Gear screen had: only loading from the cache disabled the
// controls, so a screen opened with signal kept every action live after the
// device lost it, and each one could only fail.
describe("InventoryScreen — device drops offline after a live load", () => {
  beforeEach(() => {
    mockUseIsOffline.mockReturnValue(true)
  })

  it("disables every Group action", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      inventory: { id: "inv-1", requirements: [NEEDED_REQUIREMENT, COVERED_BY_ME] },
    })

    const { findByText, getByText, getByPlaceholderText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await findByText("First aid kit")

    expect(getByText("Add")).toBeDisabled()
    expect(getByPlaceholderText("Add a requirement").props.editable).toBe(false)
    expect(getByText("Remove")).toBeDisabled()
    expect(getByText("Cover")).toBeDisabled()
    expect(getByText("Withdraw")).toBeDisabled()
  })

  it("disables every kit action, including adding from gear", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", inventory: { id: "inv-1", requirements: [] } })
    mockGetPackingItems.mockResolvedValue([
      { id: "entry-1", item: { id: "item-2", name: "Bilge pump" }, checked: false },
    ])

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))
    await findByText("Bilge pump")

    expect(getByText("Pack")).toBeDisabled()
    expect(getByText("Remove")).toBeDisabled()
    expect(getByText("Add Spare paddle")).toBeDisabled()
  })

  // The notice is about the data, not the signal: what is on screen here was
  // fetched live, so claiming it is "your last synced" copy would misreport it.
  // Connectivity itself is the app-wide banner's job.
  it("does not claim live data came from the cache", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      inventory: { id: "inv-1", requirements: [NEEDED_REQUIREMENT] },
    })

    const { findByText, queryByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await findByText("First aid kit")

    expect(queryByText(/Last synced/)).toBeNull()
  })
})

describe("InventoryScreen — group requirements", () => {
  it("shows a needed requirement with a Remove button for its own proposer", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      inventory: { id: "inv-1", requirements: [NEEDED_REQUIREMENT] },
    })

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("First aid kit")).toBeTruthy()
    expect(getByText("Needed")).toBeTruthy()
    expect(getByText("Remove")).toBeTruthy()
  })

  it("removing a requirement calls removeRequirement and drops it from the list", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      inventory: { id: "inv-1", requirements: [NEEDED_REQUIREMENT] },
    })
    mockRemoveRequirement.mockResolvedValue(undefined)

    const { findByText, getByText, queryByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await findByText("First aid kit")

    await fireEvent.press(getByText("Remove"))

    expect(Alert.alert).toHaveBeenCalledWith(
      "Remove this requirement?",
      expect.any(String),
      expect.any(Array),
    )
    await waitFor(() => {
      expect(mockRemoveRequirement).toHaveBeenCalledWith("inv-1", "req-1")
    })
    await waitFor(() => {
      expect(queryByText("First aid kit")).toBeNull()
    })
  })

  it("covering a requirement lists owned items and contributes the tapped one", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      inventory: { id: "inv-1", requirements: [NEEDED_REQUIREMENT] },
    })
    mockContributeItem.mockResolvedValue({ ...NEEDED_REQUIREMENT, status: "covered" })

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await findByText("First aid kit")

    await fireEvent.press(getByText("Cover"))
    expect(await findByText("Spare paddle")).toBeTruthy()

    await fireEvent.press(getByText("Spare paddle"))

    await waitFor(() => {
      expect(mockContributeItem).toHaveBeenCalledWith("inv-1", "req-1", "item-1")
    })
  })

  it("shows Withdraw instead of Cover when the caller already contributed", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      inventory: { id: "inv-1", requirements: [COVERED_BY_ME] },
    })

    const { findByText, queryByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Withdraw")).toBeTruthy()
    expect(queryByText("Cover")).toBeNull()
  })

  it("falls back to the cached requirements and disables mutation when the fetch fails", async () => {
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadRequirementsCache.mockResolvedValue([{ id: "req-1", name: "First aid kit", status: "needed" }])

    const { findByText, getByText, getByPlaceholderText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("First aid kit")).toBeTruthy()
    expect(getByText(/Can't reach the server\./)).toBeTruthy()
    expect(getByText(/Last synced 2 days ago/)).toBeTruthy()
    expect(getByText("Add")).toBeDisabled()
    expect(getByText("Cover")).toBeDisabled()
    expect(getByPlaceholderText("Add a requirement").props.editable).toBe(false)
  })

  it("shows the generic error when the fetch fails and nothing is cached", async () => {
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadRequirementsCache.mockResolvedValue([])

    const { findByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })
})

describe("InventoryScreen — my kit", () => {
  // The kit reads the way the Group checklist does: the state is a labelled
  // badge, and the action is a separate button. It used to be carried only by
  // the item name's button variant, which said nothing a reader could name.
  it("says an unpacked item is still to pack, and packs it", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", inventory: { id: "inv-1", requirements: [] } })
    mockGetPackingItems.mockResolvedValueOnce([
      { id: "entry-1", item: MY_ITEM, checked: false },
    ])
    mockTogglePackingItem.mockResolvedValue({ id: "entry-1", item: MY_ITEM, checked: true })

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))

    expect(await findByText("Spare paddle")).toBeTruthy()
    expect(getByText("To pack")).toBeTruthy()

    await fireEvent.press(getByText("Pack"))

    await waitFor(() => {
      expect(mockTogglePackingItem).toHaveBeenCalledWith("entry-1", true)
    })
    expect(await findByText("Packed")).toBeTruthy()
  })

  it("says a packed item is packed, and unpacks it", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", inventory: { id: "inv-1", requirements: [] } })
    mockGetPackingItems.mockResolvedValueOnce([{ id: "entry-1", item: MY_ITEM, checked: true }])
    mockTogglePackingItem.mockResolvedValue({ id: "entry-1", item: MY_ITEM, checked: false })

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))

    expect(await findByText("Packed")).toBeTruthy()

    await fireEvent.press(getByText("Unpack"))

    await waitFor(() => {
      expect(mockTogglePackingItem).toHaveBeenCalledWith("entry-1", false)
    })
  })

  it("removing a kit entry asks for confirmation before calling removePackingItem", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", inventory: { id: "inv-1", requirements: [] } })
    mockGetPackingItems.mockResolvedValueOnce([
      { id: "entry-1", item: MY_ITEM, checked: false },
    ])
    mockRemovePackingItem.mockResolvedValue(undefined)

    const { findByText, getByText, queryByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))
    await findByText("Spare paddle")

    await fireEvent.press(getByText("Remove"))

    expect(Alert.alert).toHaveBeenCalledWith("Remove from your kit?", undefined, expect.any(Array))
    await waitFor(() => {
      expect(mockRemovePackingItem).toHaveBeenCalledWith("entry-1")
    })
    await waitFor(() => {
      expect(queryByText("Spare paddle")).toBeNull()
    })
  })

  it("adds an owned item to the kit", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", inventory: { id: "inv-1", requirements: [] } })
    mockGetPackingItems.mockResolvedValueOnce([])
    mockAddPackingItem.mockResolvedValue({ id: "entry-1", item: MY_ITEM, checked: false })

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))

    expect(await findByText("Add Spare paddle")).toBeTruthy()
    await fireEvent.press(getByText("Add Spare paddle"))

    await waitFor(() => {
      expect(mockAddPackingItem).toHaveBeenCalledWith("trip-1", "item-1")
    })
  })

  // The kit was fetched only when its tab was tapped, so a device that never
  // opened the tab while connected cached nothing — the lazy load made the
  // cache lazy too. Loading on mount is what gives the cache anything to hold.
  it("loads the kit on mount so it is cached even if the tab is never opened", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", inventory: { id: "inv-1", requirements: [] } })

    await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })

    await waitFor(() => expect(mockGetPackingItems).toHaveBeenCalledWith("trip-1"))
  })
})

describe("InventoryScreen — offline kit and gear", () => {
  beforeEach(() => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", inventory: { id: "inv-1", requirements: [] } })
    mockGetPackingItems.mockRejectedValue(new Error("Could not reach the server."))
  })

  it("falls back to the cached kit, keeping the packed state", async () => {
    mockLoadKitCache.mockResolvedValue([
      { id: "entry-1", itemId: "item-1", itemName: "Spare paddle", checked: true },
    ])

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))

    expect(await findByText("Spare paddle")).toBeTruthy()
    expect(getByText("Packed")).toBeTruthy()
    expect(getByText(/Can't reach the server\./)).toBeTruthy()
    expect(getByText(/Last synced 2 days ago/)).toBeTruthy()
  })

  it("disables every kit mutation offline", async () => {
    mockLoadKitCache.mockResolvedValue([
      { id: "entry-1", itemId: "item-1", itemName: "Spare paddle", checked: false },
    ])

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))
    await findByText("Spare paddle")

    expect(getByText("Pack")).toBeDisabled()
    expect(getByText("Remove")).toBeDisabled()
  })

  // Offline, gear is read-only: it answers "what do I own that is not in this
  // trip's kit" — the spare-paddle question asked at a put-in — while adding
  // it still needs a connection.
  it("still lists unpacked gear from the cache, disabled", async () => {
    mockGetMyItems.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadKitCache.mockResolvedValue([])
    mockLoadGearCache.mockResolvedValue([{ id: "item-1", name: "Spare paddle", status: "owned" }])

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))

    expect(await findByText("Add Spare paddle")).toBeTruthy()
    expect(getByText("Add Spare paddle")).toBeDisabled()
  })

  it("surfaces the error when the kit fetch fails and nothing is cached", async () => {
    mockLoadKitCache.mockResolvedValue([])

    const { findByText, getByText } = await render(<InventoryScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(getByText("My kit"))

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })
})
