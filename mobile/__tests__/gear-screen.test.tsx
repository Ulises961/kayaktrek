import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import GearScreen from "../app/(app)/(drawer)/(gear)/gear/index"
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

const mockGetItems = getMyItems as jest.Mock
const mockGetCategories = getItemCategories as jest.Mock
const mockCreate = createItem as jest.Mock
const mockSetDefault = setDefaultPack as jest.Mock
const mockDelete = deleteItem as jest.Mock

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
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("GearScreen", () => {
  it("lists the paddler's own gear", async () => {
    const { findByText } = await render(<GearScreen />)

    expect(await findByText("Werner Camano")).toBeTruthy()
    expect(await findByText("Hilleberg Soulo")).toBeTruthy()
  })

  it("groups gear under its category", async () => {
    const { findByText } = await render(<GearScreen />)

    expect(await findByText("Paddling")).toBeTruthy()
    expect(await findByText("Camping")).toBeTruthy()
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
