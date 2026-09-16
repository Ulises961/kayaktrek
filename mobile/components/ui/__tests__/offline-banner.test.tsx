import { fireEvent, render, waitFor } from "@testing-library/react-native"
import NetInfo from "@react-native-community/netinfo"

import { OfflineBanner } from "../offline-banner"

jest.mock("@react-native-community/netinfo", () => ({ addEventListener: jest.fn() }))

const mockedAddEventListener = NetInfo.addEventListener as jest.Mock

function connectivityHandler(): (state: { isConnected: boolean | null }) => void {
  return mockedAddEventListener.mock.calls[0][0] as (state: { isConnected: boolean | null }) => void
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedAddEventListener.mockReturnValue(jest.fn())
})

describe("OfflineBanner", () => {
  it("renders nothing while online", async () => {
    const { queryByText } = await render(<OfflineBanner />)
    expect(queryByText(/no internet connection/i)).toBeNull()
  })

  it("shows the full banner once the device goes offline", async () => {
    const { getByText } = await render(<OfflineBanner />)
    const handler = connectivityHandler()

    handler({ isConnected: false })

    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
  })

  it("dismissing collapses the banner to an icon pill, not to nothing", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<OfflineBanner />)
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())

    await fireEvent.press(getByLabelText("Dismiss"))

    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())
    expect(getByLabelText(/no internet connection.*tap to expand/i)).toBeTruthy()
  })

  it("tapping the collapsed pill re-expands the full banner", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<OfflineBanner />)
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
    await fireEvent.press(getByLabelText("Dismiss"))
    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())

    await fireEvent.press(getByLabelText(/no internet connection.*tap to expand/i))

    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
  })

  it("clears entirely once connectivity returns, even if it had been dismissed", async () => {
    const { getByText, getByLabelText, queryByText, queryByLabelText } = await render(<OfflineBanner />)
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
    await fireEvent.press(getByLabelText("Dismiss"))
    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())

    handler({ isConnected: true })

    await waitFor(() => expect(queryByLabelText(/no internet connection.*tap to expand/i)).toBeNull())
    expect(queryByText(/no internet connection/i)).toBeNull()
  })

  it("shows the full banner again (not still collapsed) on the next disconnect", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<OfflineBanner />)
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
    await fireEvent.press(getByLabelText("Dismiss"))
    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())
    handler({ isConnected: true })
    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())

    handler({ isConnected: false })

    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
  })
})
