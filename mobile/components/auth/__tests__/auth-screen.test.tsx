import { render, within } from "@testing-library/react-native"
import { Text } from "react-native"

import { WithCachedSurfaces } from "../../../test-utils/cached-surfaces"
import { AuthScreen } from "../auth-screen"

async function renderAuthScreen() {
  return render(
    <AuthScreen>
      <Text>form</Text>
    </AuthScreen>,
    { wrapper: WithCachedSurfaces },
  )
}

describe("AuthScreen", () => {
  // What the keyboard does to the avoiding view (its `padding` behaviour) is not visible to a
  // test — the prop never reaches a host element — so that part is checked on a device. These
  // pin the structure it depends on: the form sits inside the avoiding view and scrolls.
  it("scrolls the form and keeps the first tap for the button, not the keyboard", async () => {
    const { getByTestId } = await renderAuthScreen()

    expect(getByTestId("auth-scroll").props.keyboardShouldPersistTaps).toBe("handled")
  })

  it("renders its form inside the scroll view, within the avoiding view", async () => {
    const { getByTestId } = await renderAuthScreen()

    const avoiding = within(getByTestId("auth-keyboard-view"))
    expect(avoiding.getByTestId("auth-scroll")).toBeTruthy()
    expect(within(getByTestId("auth-scroll")).getByText("form")).toBeTruthy()
  })
})
