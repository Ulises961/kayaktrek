import { act, fireEvent, render } from "@testing-library/react-native"
import NetInfo from "@react-native-community/netinfo"

import { WithCachedSurfaces } from "../../../test-utils/cached-surfaces"
import { Screen } from "../layout"
import { Text } from "../text"

jest.mock("@react-native-community/netinfo", () => ({ addEventListener: jest.fn() }))

const mockedAddEventListener = NetInfo.addEventListener as jest.Mock

async function goOffline() {
  for (const [handler] of mockedAddEventListener.mock.calls as [
    (state: { isConnected: boolean | null }) => void,
  ][]) {
    await act(async () => handler({ isConnected: false }))
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedAddEventListener.mockReturnValue(jest.fn())
})

// The offline banner used to float from the app root over the native header,
// and once it carried the cache age it covered the drawer's menu button (found
// on a device). Screen now renders it in flow, above the content and below the
// header — so these assert Screen owns it, not the root.
describe("Screen — offline banner", () => {
  it("renders the offline banner itself, alongside its content", async () => {
    const { findByText, getByText } = await render(
      <Screen>
        <Text>Trip list</Text>
      </Screen>,
      { wrapper: WithCachedSurfaces },
    )
    await goOffline()

    expect(await findByText("No internet connection.")).toBeTruthy()
    expect(getByText("Trip list")).toBeTruthy()
  })

  // Every Screen has its own banner, so a dismissal held per banner would come
  // straight back on the next navigation.
  it("keeps a dismissal across screens", async () => {
    const { findByText, getByLabelText, queryByText, rerender } = await render(
      <Screen>
        <Text>First</Text>
      </Screen>,
      { wrapper: WithCachedSurfaces },
    )
    await goOffline()
    await findByText("No internet connection.")

    await fireEvent.press(getByLabelText("Dismiss"))

    await rerender(
      <Screen key="second">
        <Text>Second</Text>
      </Screen>,
    )
    await goOffline()

    expect(await findByText("Second")).toBeTruthy()
    expect(queryByText("No internet connection.")).toBeNull()
    expect(getByLabelText(/No internet connection\. Tap to expand\./)).toBeTruthy()
  })
})
