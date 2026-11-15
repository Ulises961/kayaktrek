import * as LocalAuthentication from "expo-local-authentication"
import * as SecureStore from "expo-secure-store"

import {
  canUseBiometrics,
  clearBiometricCredentials,
  hasBiometricCredentials,
  readBiometricCredentials,
  saveBiometricCredentials,
} from "../biometric-store"

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}))
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

const mockHasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock
const mockIsEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock
const mockAuthenticate = LocalAuthentication.authenticateAsync as jest.Mock
const mockGet = SecureStore.getItemAsync as jest.Mock
const mockSet = SecureStore.setItemAsync as jest.Mock
const mockDelete = SecureStore.deleteItemAsync as jest.Mock

const CREDENTIALS = { mail: "paddler@example.com", password: "correct-horse" }

describe("biometric store", () => {
  beforeEach(() => {
    mockHasHardware.mockReset().mockResolvedValue(true)
    mockIsEnrolled.mockReset().mockResolvedValue(true)
    mockAuthenticate.mockReset().mockResolvedValue({ success: true })
    mockGet.mockReset()
    mockSet.mockReset().mockResolvedValue(undefined)
    mockDelete.mockReset().mockResolvedValue(undefined)
  })

  describe("canUseBiometrics", () => {
    it("is true when the phone has a sensor and a fingerprint is enrolled", async () => {
      expect(await canUseBiometrics()).toBe(true)
    })

    it("is false without a sensor", async () => {
      mockHasHardware.mockResolvedValue(false)

      expect(await canUseBiometrics()).toBe(false)
    })

    it("is false when no fingerprint is enrolled", async () => {
      mockIsEnrolled.mockResolvedValue(false)

      expect(await canUseBiometrics()).toBe(false)
    })

    it("is false rather than failing when the phone cannot say", async () => {
      mockHasHardware.mockRejectedValue(new Error("module unavailable"))

      expect(await canUseBiometrics()).toBe(false)
    })
  })

  describe("saveBiometricCredentials", () => {
    it("asks for the fingerprint, then stores the credentials and marks them present", async () => {
      expect(await saveBiometricCredentials(CREDENTIALS)).toBe(true)

      expect(mockAuthenticate).toHaveBeenCalledTimes(1)
      const [credentialCall, flagCall] = mockSet.mock.calls
      expect(JSON.parse(credentialCall[1])).toEqual(CREDENTIALS)
      // The flag is what lets the sign-in screen show the button without prompting, and it must
      // not hold the secret.
      expect(flagCall[1]).not.toContain(CREDENTIALS.password)
    })

    it("stores nothing when the fingerprint is not confirmed", async () => {
      mockAuthenticate.mockResolvedValue({ success: false, error: "user_cancel" })

      expect(await saveBiometricCredentials(CREDENTIALS)).toBe(false)

      expect(mockSet).not.toHaveBeenCalled()
    })

    it("stores nothing when the prompt itself fails", async () => {
      mockAuthenticate.mockRejectedValue(new Error("no activity"))

      expect(await saveBiometricCredentials(CREDENTIALS)).toBe(false)

      expect(mockSet).not.toHaveBeenCalled()
    })

    it("does not mark the credentials present when storing them failed", async () => {
      mockSet.mockRejectedValueOnce(new Error("keystore unavailable"))

      await expect(saveBiometricCredentials(CREDENTIALS)).rejects.toThrow("keystore unavailable")

      expect(mockSet).toHaveBeenCalledTimes(1)
    })
  })

  describe("hasBiometricCredentials", () => {
    it("knows the credentials are present from the flag, without a prompt", async () => {
      mockGet.mockResolvedValue("1")

      expect(await hasBiometricCredentials()).toBe(true)
      expect(mockAuthenticate).not.toHaveBeenCalled()
    })

    it("knows nothing is saved when the flag is absent", async () => {
      mockGet.mockResolvedValue(null)

      expect(await hasBiometricCredentials()).toBe(false)
    })
  })

  describe("readBiometricCredentials", () => {
    it("returns the credentials once the fingerprint is confirmed", async () => {
      mockGet.mockResolvedValue(JSON.stringify(CREDENTIALS))

      expect(await readBiometricCredentials()).toEqual(CREDENTIALS)
    })

    it("does not even read the credentials when the fingerprint is refused", async () => {
      mockAuthenticate.mockResolvedValue({ success: false, error: "user_cancel" })

      expect(await readBiometricCredentials()).toBeNull()

      expect(mockGet).not.toHaveBeenCalled()
    })

    it("returns null when the prompt fails outright", async () => {
      mockAuthenticate.mockRejectedValue(new Error("no activity"))

      expect(await readBiometricCredentials()).toBeNull()
    })

    it("returns null when the stored entry cannot be read", async () => {
      mockGet.mockRejectedValue(new Error("keystore unavailable"))

      expect(await readBiometricCredentials()).toBeNull()
    })

    it("returns null for an entry that is not the credentials it wrote", async () => {
      mockGet.mockResolvedValue("not json")
      expect(await readBiometricCredentials()).toBeNull()

      mockGet.mockResolvedValue(JSON.stringify({ mail: "paddler@example.com" }))
      expect(await readBiometricCredentials()).toBeNull()

      mockGet.mockResolvedValue(null)
      expect(await readBiometricCredentials()).toBeNull()
    })
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
