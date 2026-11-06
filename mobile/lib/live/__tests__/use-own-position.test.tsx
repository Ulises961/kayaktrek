import { act, renderHook, waitFor } from "@testing-library/react-native"
import * as Location from "expo-location"

import { useOwnPosition } from "../use-own-position"

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}))

const location = jest.mocked(Location)
const remove = jest.fn()
let deliver: (fix: Location.LocationObject) => void = () => undefined

function fix(latitude: number, longitude: number, accuracy: number | null = 6): Location.LocationObject {
  return {
    coords: { latitude, longitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: 1,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  location.getForegroundPermissionsAsync.mockResolvedValue({ status: "granted" } as Location.LocationPermissionResponse)
  location.watchPositionAsync.mockImplementation(async (_options, callback) => {
    deliver = callback
    return { remove }
  })
})

describe("useOwnPosition", () => {
  it("watches nothing while it is not wanted", async () => {
    const { result } = await renderHook(() => useOwnPosition(false))

    expect(location.getForegroundPermissionsAsync).not.toHaveBeenCalled()
    expect(location.watchPositionAsync).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it("shows where the phone is from its own fixes, not from anything the server holds", async () => {
    const { result } = await renderHook(() => useOwnPosition(true))
    await waitFor(() => expect(location.watchPositionAsync).toHaveBeenCalledTimes(1))
    expect(result.current).toBeNull()

    await act(async () => deliver(fix(43.1, 13.2, 6)))
    expect(result.current).toEqual({ latitude: 43.1, longitude: 13.2, accuracyM: 6 })

    await act(async () => deliver(fix(43.2, 13.3, null)))
    expect(result.current).toEqual({ latitude: 43.2, longitude: 13.3, accuracyM: null })
  })

  it("never asks for the permission: sharing owns that prompt, and a map must not surprise anyone with one", async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue({ status: "undetermined" } as Location.LocationPermissionResponse)

    const { result } = await renderHook(() => useOwnPosition(true))
    await waitFor(() => expect(location.getForegroundPermissionsAsync).toHaveBeenCalled())

    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
    expect(location.watchPositionAsync).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it("stays without a position, and without an error, when the phone cannot give one", async () => {
    location.watchPositionAsync.mockRejectedValue(new Error("Location services are disabled"))

    const { result } = await renderHook(() => useOwnPosition(true))
    await waitFor(() => expect(location.watchPositionAsync).toHaveBeenCalled())

    expect(result.current).toBeNull()
  })

  it("stops watching, and forgets the position, when it is no longer wanted", async () => {
    const { result, rerender } = await renderHook((wanted: boolean) => useOwnPosition(wanted), { initialProps: true })
    await waitFor(() => expect(location.watchPositionAsync).toHaveBeenCalledTimes(1))
    await act(async () => deliver(fix(43.1, 13.2)))

    await rerender(false)

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
    expect(result.current).toBeNull()
  })

  it("lets go of a watch that finished starting only after the screen had gone", async () => {
    let finishStarting: (subscription: Location.LocationSubscription) => void = () => undefined
    location.watchPositionAsync.mockImplementation(
      () => new Promise<Location.LocationSubscription>((resolve) => (finishStarting = resolve)),
    )

    const { unmount } = await renderHook(() => useOwnPosition(true))
    await waitFor(() => expect(location.watchPositionAsync).toHaveBeenCalledTimes(1))
    await unmount()
    expect(remove).not.toHaveBeenCalled()

    await act(async () => finishStarting({ remove }))

    expect(remove).toHaveBeenCalledTimes(1)
  })
})
