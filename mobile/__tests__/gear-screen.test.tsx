import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import GearScreen from "../app/(app)/(drawer)/(gear)/gear/index"
import { loadGearCache, saveGearCache } from "../lib/db/gear-cache"
import {
  createItem,
  deleteItem,
  getItemCategories,
  getMyItems,
  setDefaultPack,
} from "../lib/inventory/actions"

jest.mock("../lib/inventory/actions", () => ({
  getMyItems: jest.fn(),
  getItemCategories: jest.fn(),
  createItem: jest.fn(),
  setDefaultPack: jest.fn(),
  deleteItem: jest.fn(),
}))
jest.mock("../lib/db/gear-cache", () => ({
  loadGearCache: jest.fn(),
  saveGearCache: jest.fn(),
}))
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))

const mockGetItems = getMyItems as jest.Mock
const mockGetCategories = getItemCategories as jest.Mock
const mockCreate = createItem as jest.Mock
const mockSetDefault = setDefaultPack as jest.Mock
const mockDelete = deleteItem as jest.Mock
const mockLoadGearCache = loadGearCache as jest.Mock
const mockSaveGearCache = saveGearCache as jest.Mock

const PADDLE = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01",
  name: "Werner Camano",
  defaultPack: true,
  category: { id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01", slug: "paddling", name: "Paddling" },
}
const TENT = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02",
  name: "Hilleberg Soulo",
  defaultPack: false,
  category: { id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02", slug: "camping", name: "Camping" },
}
const UNFILED = { id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03", name: "Spare cag", defaultPack: false }

const CATEGORIES = [PADDLE.category, TENT.category]

function confirmAlert(buttonText: string) {
  const spy = Alert.alert as unknown as jest.Mock
  const buttons = spy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[] | undefined
  const button = buttons?.find((entry) => entry.text === buttonText)
  if (!button) throw new Error(`no "${buttonText}" button in the last alert`)
  button.onPress?.()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetItems.mockResolvedValue([PADDLE, TENT, UNFILED])
  mockGetCategories.mockResolvedValue(CATEGORIES)
  mockLoadGearCache.mockResolvedValue([])
  mockSaveGearCache.mockResolvedValue(undefined)
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("GearScreen", () => {
  it("lists the paddler's own gear", async () => {
    const { findByText } = await render(<GearScreen />)

    expect(await findByText("Werner Camano")).toBeTruthy()
    expect(await findByText("Hilleberg Soulo")).toBeTruthy()
  })

  it("groups gear under its category", async () => {
    // By testID: each category name now appears twice — as a filter chip and as this
    // heading — so a by-text query matches two nodes.
    const { findByTestId } = await render(<GearScreen />)

    expect(await findByTestId("section-Paddling")).toBeTruthy()
    expect(await findByTestId("section-Camping")).toBeTruthy()
  })

  it("still shows an item that has no category", async () => {
    // Category is nullish on the DTO, and an uncategorised item silently vanishing
    // from the closet is worse than an "Uncategorised" heading.
    const { findByText } = await render(<GearScreen />)

    expect(await findByText("Spare cag")).toBeTruthy()
  })

  it("says the closet is empty rather than rendering nothing", async () => {
    mockGetItems.mockResolvedValue([])

    const { findByText } = await render(<GearScreen />)

    expect(await findByText(/no gear yet/i)).toBeTruthy()
  })

  it("shows the server's error and can retry", async () => {
    mockGetItems.mockRejectedValueOnce(new Error("Could not reach the server."))

    const { findByText, getByTestId } = await render(<GearScreen />)
    expect(await findByText("Could not reach the server.")).toBeTruthy()

    mockGetItems.mockResolvedValue([PADDLE])
    await fireEvent.press(getByTestId("gear-retry"))

    expect(await findByText("Werner Camano")).toBeTruthy()
  })

  describe("category filters", () => {
    it("offers a filter chip per category the closet actually uses", async () => {
      // Driven by the items on hand, not the full category list: a chip that filters
      // to an empty closet is a dead control.
      const { findByTestId } = await render(<GearScreen />)

      expect(await findByTestId(`filter-${PADDLE.category.slug}`)).toBeTruthy()
      expect(await findByTestId(`filter-${TENT.category.slug}`)).toBeTruthy()
    })

    it("offers a chip for uncategorised gear when there is some", async () => {
      const { findByTestId } = await render(<GearScreen />)

      expect(await findByTestId("filter-uncategorised")).toBeTruthy()
    })

    it("offers no uncategorised chip when everything is filed", async () => {
      mockGetItems.mockResolvedValue([PADDLE, TENT])

      const { queryByTestId, findByText } = await render(<GearScreen />)
      await findByText("Werner Camano")

      expect(queryByTestId("filter-uncategorised")).toBeNull()
    })

    it("shows only the chosen category once one is picked", async () => {
      const { findByTestId, queryByText, findByText } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId(`filter-${TENT.category.slug}`))

      expect(await findByText("Hilleberg Soulo")).toBeTruthy()
      expect(queryByText("Werner Camano")).toBeNull()
      expect(queryByText("Spare cag")).toBeNull()
    })

    it("adds to the selection rather than replacing it", async () => {
      // Multi-select, like Explore's seasons — "paddling and camping" is a real
      // question to ask of a kit list.
      const { findByTestId, findByText } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId(`filter-${TENT.category.slug}`))
      await fireEvent.press(await findByTestId(`filter-${PADDLE.category.slug}`))

      expect(await findByText("Hilleberg Soulo")).toBeTruthy()
      expect(await findByText("Werner Camano")).toBeTruthy()
    })

    it("clears the filter when the same chip is tapped again", async () => {
      const { findByTestId, findByText } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId(`filter-${TENT.category.slug}`))
      await fireEvent.press(await findByTestId(`filter-${TENT.category.slug}`))

      expect(await findByText("Werner Camano")).toBeTruthy()
      expect(await findByText("Spare cag")).toBeTruthy()
    })

    it("clears every filter from the All chip", async () => {
      const { findByTestId, findByText } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId(`filter-${TENT.category.slug}`))
      await fireEvent.press(await findByTestId("filter-all"))

      expect(await findByText("Werner Camano")).toBeTruthy()
      expect(await findByText("Spare cag")).toBeTruthy()
    })

    it("says so when a filter outlives the gear it matched", async () => {
      // The only way to an empty filtered list: the chips are derived from the gear on
      // hand, so a selected category always has something in it — until the last item
      // in it is deleted and the closet reloads with the filter still set. "No gear
      // yet" would be a lie there; the kit is present, the filter is hiding it.
      const { findByTestId, findByText } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId(`filter-${TENT.category.slug}`))
      await findByText("Hilleberg Soulo")

      mockDelete.mockResolvedValue(undefined)
      mockGetItems.mockResolvedValue([PADDLE, UNFILED])
      await fireEvent.press(await findByTestId(`delete-${TENT.id}`))
      confirmAlert("Delete")

      expect(await findByText(/nothing in those categories/i)).toBeTruthy()
    })
  })

  describe("adding gear", () => {
    it("creates an item with the chosen category", async () => {
      mockCreate.mockResolvedValue(undefined)

      const { findByTestId, getByTestId } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId("gear-add-open"))
      await fireEvent.changeText(getByTestId("gear-name"), "Drysuit")
      // By testID, not text: a category name is both a chip here and a section
      // heading in the list below, so a by-text query matches two nodes.
      await fireEvent.press(getByTestId(`gear-category-${TENT.category.slug}`))
      await fireEvent.press(getByTestId("gear-add-submit"))

      await waitFor(() =>
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Drysuit", categoryId: TENT.category.id }),
        ),
      )
    })

    it("will not create gear with no name", async () => {
      const { findByTestId, getByTestId } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId("gear-add-open"))
      await fireEvent.changeText(getByTestId("gear-name"), "   ")
      await fireEvent.press(getByTestId("gear-add-submit"))

      expect(mockCreate).not.toHaveBeenCalled()
    })

    it("reloads the closet so the new item appears without a manual refresh", async () => {
      mockCreate.mockResolvedValue(undefined)

      const { findByTestId, getByTestId } = await render(<GearScreen />)
      await waitFor(() => expect(mockGetItems).toHaveBeenCalledTimes(1))

      await fireEvent.press(await findByTestId("gear-add-open"))
      await fireEvent.changeText(getByTestId("gear-name"), "Drysuit")
      await fireEvent.press(getByTestId("gear-add-submit"))

      await waitFor(() => expect(mockGetItems).toHaveBeenCalledTimes(2))
    })
  })

  describe("default pack", () => {
    it("toggles an item onto future trips", async () => {
      mockSetDefault.mockResolvedValue(undefined)

      const { findByTestId } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId(`default-pack-${TENT.id}`))

      await waitFor(() => expect(mockSetDefault).toHaveBeenCalledWith(TENT.id, true))
    })

    it("toggles an already-default item back off", async () => {
      mockSetDefault.mockResolvedValue(undefined)

      const { findByTestId } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId(`default-pack-${PADDLE.id}`))

      await waitFor(() => expect(mockSetDefault).toHaveBeenCalledWith(PADDLE.id, false))
    })
  })

  describe("deleting gear", () => {
    it("asks before deleting", async () => {
      mockDelete.mockResolvedValue(undefined)

      const { findByTestId } = await render(<GearScreen />)
      await fireEvent.press(await findByTestId(`delete-${TENT.id}`))

      expect(mockDelete).not.toHaveBeenCalled()
      confirmAlert("Delete")
      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(TENT.id))
    })
  })
})

// M9c WP7 tier 3. This screen shipped with no offline handling at all: a failed
// fetch set an error string, even though `cached_gear` already existed and the
// Items screen was already reading it. "Did I pack the spare paddle" is asked at
// the put-in, which is exactly where there is no signal.
describe("GearScreen — offline", () => {
  const CACHED = [
    { id: PADDLE.id, name: "Werner Camano", status: "owned", categoryName: "Paddling", defaultPack: true },
    { id: TENT.id, name: "Hilleberg Soulo", status: "owned", categoryName: "Camping", defaultPack: false },
  ]

  it("falls back to the cached closet instead of an error", async () => {
    mockGetItems.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadGearCache.mockResolvedValue(CACHED)

    const { findByText, queryByText } = await render(<GearScreen />)

    expect(await findByText("Werner Camano")).toBeTruthy()
    expect(queryByText("Could not reach the server.")).toBeNull()
  })

  it("says the closet is cached, and how old it is", async () => {
    mockGetItems.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadGearCache.mockResolvedValue(CACHED)

    const { findByText } = await render(<GearScreen />)

    expect(await findByText(/Offline — showing your last synced gear/)).toBeTruthy()
    expect(await findByText(/Updated 2 days ago/)).toBeTruthy()
  })

  // The category grouping and the default-pack flag are why the cache grew two
  // columns at schema v9 — without them every item rendered as unfiled and
  // not-default, and for default-pack that misstates what the next trip packs.
  it("keeps the category grouping and the default-pack flag offline", async () => {
    mockGetItems.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadGearCache.mockResolvedValue(CACHED)

    const { findByTestId } = await render(<GearScreen />)

    expect(await findByTestId("section-Paddling")).toBeTruthy()
    expect(await findByTestId("section-Camping")).toBeTruthy()
    expect(await findByTestId(`default-pack-${PADDLE.id}`)).toBeTruthy()
  })

  it("disables every mutation while the closet is cached", async () => {
    mockGetItems.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadGearCache.mockResolvedValue(CACHED)

    const { findByText, getByTestId } = await render(<GearScreen />)
    await findByText("Werner Camano")

    // Adding, deleting and toggling default-pack all need a connection; a
    // control that looks live and then fails is worse than one that is plainly
    // unavailable.
    await fireEvent.press(getByTestId(`default-pack-${PADDLE.id}`))
    expect(mockSetDefault).not.toHaveBeenCalled()

    await fireEvent.press(getByTestId(`delete-${PADDLE.id}`))
    expect(Alert.alert).not.toHaveBeenCalled()
  })

  it("still surfaces the error when nothing was ever cached", async () => {
    mockGetItems.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadGearCache.mockResolvedValue([])

    const { findByText } = await render(<GearScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })

  it("saves a successful fetch to the cache so the next offline open has it", async () => {
    const { findByText } = await render(<GearScreen />)
    await findByText("Werner Camano")

    await waitFor(() => expect(mockSaveGearCache).toHaveBeenCalledWith([PADDLE, TENT, UNFILED]))
  })
})
