import NetInfo from "@react-native-community/netinfo"

import { recheckConnectivity } from "../use-is-offline"

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(),
  refresh: jest.fn(),
}))

const mockedRefresh = NetInfo.refresh as jest.Mock

describe("recheckConnectivity", () => {
  it("forces NetInfo to re-evaluate rather than waiting for its next passive event", async () => {
    mockedRefresh.mockResolvedValue({ isConnected: true })

    const result = await recheckConnectivity()

    expect(mockedRefresh).toHaveBeenCalled()
    expect(result).toEqual({ isConnected: true })
  })
})
