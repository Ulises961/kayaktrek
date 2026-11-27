import { act, fireEvent, render } from "@testing-library/react-native"
import { Pressable, Text } from "react-native"

import {
  TripHeaderEditProvider,
  usePublishTripEdit,
  useTripHeaderEdit,
} from "../trip-header-edit"

function Header() {
  const { action } = useTripHeaderEdit()
  return <Text testID="header">{action ? (action.editing ? "editing" : "can edit") : "none"}</Text>
}

function Screen({ canEdit, editing }: { canEdit: boolean; editing: boolean }) {
  usePublishTripEdit({ canEdit, editing, onToggle: jest.fn() })
  return null
}

function renderBoth(screen: React.ReactElement) {
  return render(
    <TripHeaderEditProvider>
      <Header />
      {screen}
    </TripHeaderEditProvider>,
  )
}

describe("trip header edit action", () => {
  it("reaches the header once the screen says the paddler can edit", async () => {
    const { getByTestId } = await renderBoth(<Screen canEdit editing={false} />)

    expect(getByTestId("header").props.children).toBe("can edit")
  })

  it("follows the screen into edit mode", async () => {
    const { getByTestId, rerender } = await renderBoth(<Screen canEdit editing={false} />)

    await rerender(
      <TripHeaderEditProvider>
        <Header />
        <Screen canEdit editing />
      </TripHeaderEditProvider>,
    )

    expect(getByTestId("header").props.children).toBe("editing")
  })

  it("offers nothing to someone who cannot edit", async () => {
    const { getByTestId } = await renderBoth(<Screen canEdit={false} editing={false} />)

    expect(getByTestId("header").props.children).toBe("none")
  })

  it("takes the action back when the screen goes away", async () => {
    const { getByTestId, rerender } = await renderBoth(<Screen canEdit editing={false} />)

    await act(async () => {
      rerender(
        <TripHeaderEditProvider>
          <Header />
        </TripHeaderEditProvider>,
      )
    })

    expect(getByTestId("header").props.children).toBe("none")
  })

  it("calls the screen's latest toggle, not the one it first published", async () => {
    const first = jest.fn()
    const second = jest.fn()
    // Stands in for the header's button, which calls whatever the provider holds.
    function HeaderButton() {
      const { action } = useTripHeaderEdit()
      return <Pressable testID="toggle" onPress={() => action?.onToggle()} />
    }
    function Publisher({ onToggle }: { onToggle: () => void }) {
      usePublishTripEdit({ canEdit: true, editing: false, onToggle })
      return null
    }
    const { rerender, getByTestId } = await render(
      <TripHeaderEditProvider>
        <HeaderButton />
        <Publisher onToggle={first} />
      </TripHeaderEditProvider>,
    )
    await rerender(
      <TripHeaderEditProvider>
        <HeaderButton />
        <Publisher onToggle={second} />
      </TripHeaderEditProvider>,
    )

    await fireEvent.press(getByTestId("toggle"))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
