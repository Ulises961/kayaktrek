import { AppState } from "react-native"
import NetInfo from "@react-native-community/netinfo"

import { createStreamingGate } from "../trip-changes-lifecycle"

jest.mock("@react-native-community/netinfo", () => ({ addEventListener: jest.fn() }))

const mockedNetInfoAddEventListener = NetInfo.addEventListener as jest.Mock

describe("createStreamingGate", () => {
  let appStateListener: (state: string) => void
  let netInfoListener: (state: { isConnected: boolean | null }) => void
  const removeAppState = jest.fn()
  const removeNetInfo = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void
      return { remove: removeAppState }
    })
    mockedNetInfoAddEventListener.mockImplementation((listener) => {
      netInfoListener = listener
      return removeNetInfo
    })
    Object.defineProperty(AppState, "currentState", { value: "active", configurable: true })
  })

  it("streams while the app is foregrounded and reachable", () => {
    const setStreaming = jest.fn()
    createStreamingGate(setStreaming)
    netInfoListener({ isConnected: true })
    expect(setStreaming).toHaveBeenLastCalledWith(true)
  })

  it("stops when the app is backgrounded and resumes on return", () => {
    const setStreaming = jest.fn()
    createStreamingGate(setStreaming)
    netInfoListener({ isConnected: true })

    appStateListener("background")
    expect(setStreaming).toHaveBeenLastCalledWith(false)

    appStateListener("active")
    expect(setStreaming).toHaveBeenLastCalledWith(true)
  })

  it("stops while offline and resumes on reconnect", () => {
    const setStreaming = jest.fn()
    createStreamingGate(setStreaming)

    netInfoListener({ isConnected: false })
    expect(setStreaming).toHaveBeenLastCalledWith(false)

    netInfoListener({ isConnected: true })
    expect(setStreaming).toHaveBeenLastCalledWith(true)
  })

  it("treats an unresolved connectivity state as reachable, like the offline banner", () => {
    const setStreaming = jest.fn()
    createStreamingGate(setStreaming)
    netInfoListener({ isConnected: null })
    expect(setStreaming).toHaveBeenLastCalledWith(true)
  })

  it("removes both listeners when stopped", () => {
    const stop = createStreamingGate(jest.fn())
    stop()
    expect(removeAppState).toHaveBeenCalled()
    expect(removeNetInfo).toHaveBeenCalled()
  })
})
