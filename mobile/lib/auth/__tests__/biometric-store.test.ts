import * as SecureStore from "expo-secure-store"

import {
  canUseBiometrics,
  clearBiometricCredentials,
  hasBiometricCredentials,
  readBiometricCredentials,
  saveBiometricCredentials,
} from "../biometric-store"

jest.mock("expo-secure-store", () => ({
  canUseBiometricAuthentication: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

const mockGet = SecureStore.getItemAsync as jest.Mock
const mockSet = SecureStore.setItemAsync as jest.Mock
const mockDelete = SecureStore.deleteItemAsync as jest.Mock
const mockCanUse = SecureStore.canUseBiometricAuthentication as jest.Mock

const CREDENTIALS = { mail: "paddler@example.com", password: "correct-horse" }

describe("biometric store", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset().mockResolvedValue(undefined)
    mockDelete.mockReset().mockResolvedValue(undefined)
    mockCanUse.mockReset()
  })

  it("reports whether the phone can gate a secret behind a biometric", () => {
    mockCanUse.mockReturnValue(true)
    expect(canUseBiometrics()).toBe(true)

    mockCanUse.mockReturnValue(false)
    expect(canUseBiometrics()).toBe(false)
  })

  it("stores the credentials behind the biometric, and marks them as present without it", async () => {
    await saveBiometricCredentials(CREDENTIALS)

    const [credentialCall, flagCall] = mockSet.mock.calls
    expect(JSON.parse(credentialCall[1])).toEqual(CREDENTIALS)
    expect(credentialCall[2]).toMatchObject({ requireAuthentication: true })
    // The flag is what lets the sign-in screen show the button without prompting, so it must
    // be readable without the sensor and must not hold the secret.
    expect(flagCall[2]).toBeUndefined()
    expect(flagCall[1]).not.toContain(CREDENTIALS.password)
  })

  it("does not mark the credentials present when storing them failed", async () => {
    mockSet.mockRejectedValueOnce(new Error("keystore unavailable"))

    await expect(saveBiometricCredentials(CREDENTIALS)).rejects.toThrow("keystore unavailable")

    expect(mockSet).toHaveBeenCalledTimes(1)
  })

  it("knows the credentials are present from the ungated flag, without a prompt", async () => {
    mockGet.mockResolvedValue("1")

    expect(await hasBiometricCredentials()).toBe(true)
    expect(mockGet.mock.calls[0][1]).toBeUndefined()
  })

  it("knows nothing is saved when the flag is absent", async () => {
    mockGet.mockResolvedValue(null)

    expect(await hasBiometricCredentials()).toBe(false)
  })

  it("returns the credentials the biometric unlocks", async () => {
    mockGet.mockResolvedValue(JSON.stringify(CREDENTIALS))

    expect(await readBiometricCredentials()).toEqual(CREDENTIALS)
    expect(mockGet.mock.calls[0][1]).toMatchObject({ requireAuthentication: true })
  })

  it("returns null when the user cancels or the sensor fails", async () => {
    mockGet.mockRejectedValue(new Error("user canceled"))

    expect(await readBiometricCredentials()).toBeNull()
  })

  it("returns null when the key was invalidated by a changed fingerprint", async () => {
    mockGet.mockResolvedValue(null)

    expect(await readBiometricCredentials()).toBeNull()
  })

  it("returns null for an entry that is not the credentials it wrote", async () => {
    mockGet.mockResolvedValue("not json")
    expect(await readBiometricCredentials()).toBeNull()

    mockGet.mockResolvedValue(JSON.stringify({ mail: "paddler@example.com" }))
    expect(await readBiometricCredentials()).toBeNull()
  })

  it("clears both the credentials and the flag", async () => {
    await clearBiometricCredentials()

    expect(mockDelete).toHaveBeenCalledTimes(2)
    expect(mockDelete.mock.calls.map(([key]) => key).sort()).toEqual([
      "kayaktrek.biometric_credentials",
      "kayaktrek.biometric_enrolled",
    ])
  })
})
