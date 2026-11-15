import * as SecureStore from "expo-secure-store"

import { readRememberedMail, rememberMail } from "../remembered-mail"

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}))

const mockGet = SecureStore.getItemAsync as jest.Mock
const mockSet = SecureStore.setItemAsync as jest.Mock

describe("remembered mail", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset().mockResolvedValue(undefined)
  })

  it("returns the address that was stored", async () => {
    mockGet.mockResolvedValue("paddler@example.com")

    expect(await readRememberedMail()).toBe("paddler@example.com")
  })

  it("returns an empty string when nothing was stored", async () => {
    mockGet.mockResolvedValue(null)

    expect(await readRememberedMail()).toBe("")
  })

  it("returns an empty string rather than failing when the store cannot be read", async () => {
    mockGet.mockRejectedValue(new Error("keystore unavailable"))

    expect(await readRememberedMail()).toBe("")
  })

  it("stores the address it is given", async () => {
    await rememberMail("paddler@example.com")

    expect(mockSet).toHaveBeenCalledWith(expect.any(String), "paddler@example.com")
  })

  it("does not let a failed write surface to the sign-in that triggered it", async () => {
    mockSet.mockRejectedValue(new Error("keystore unavailable"))

    await expect(rememberMail("paddler@example.com")).resolves.toBeUndefined()
  })
})
