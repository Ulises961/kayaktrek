import { fireEvent, render, waitFor } from "@testing-library/react-native"

import {
  canUseBiometrics,
  clearBiometricCredentials,
  hasBiometricCredentials,
  saveBiometricCredentials,
} from "../../../lib/auth/biometric-store"
import { reAuthenticate } from "../../../lib/profile/actions"
import { FingerprintSection } from "../fingerprint-section"

jest.mock("../../../lib/auth/biometric-store", () => ({
  canUseBiometrics: jest.fn(),
  hasBiometricCredentials: jest.fn(),
  saveBiometricCredentials: jest.fn(),
  clearBiometricCredentials: jest.fn(),
}))
jest.mock("../../../lib/profile/actions", () => ({
  reAuthenticate: jest.fn(),
}))

const mockCanUse = canUseBiometrics as jest.Mock
const mockHasSaved = hasBiometricCredentials as jest.Mock
const mockSave = saveBiometricCredentials as jest.Mock
const mockClear = clearBiometricCredentials as jest.Mock
const mockReAuth = reAuthenticate as jest.Mock

const MAIL = "paddler@example.com"

async function renderSection() {
  return render(<FingerprintSection mail={MAIL} />)
}

type Section = Awaited<ReturnType<typeof renderSection>>

// The switch only appears once the phone and the store have answered.
async function switchOf(section: Section) {
  return section.findByTestId("fingerprint-switch")
}

async function turnOn(section: Section, password: string) {
  await fireEvent(await switchOf(section), "valueChange", true)
  await fireEvent.changeText(await section.findByTestId("fingerprint-password"), password)
  await fireEvent.press(section.getByTestId("fingerprint-confirm"))
}

describe("FingerprintSection", () => {
  beforeEach(() => {
    mockCanUse.mockReset().mockResolvedValue(true)
    mockHasSaved.mockReset().mockResolvedValue(false)
    mockSave.mockReset().mockResolvedValue(true)
    mockClear.mockReset().mockResolvedValue(undefined)
    mockReAuth.mockReset().mockResolvedValue("elevated-token")
  })

  it("shows the switch off when no fingerprint sign-in has been set up", async () => {
    const section = await renderSection()

    expect((await switchOf(section)).props.value).toBe(false)
  })

  it("shows the switch on when a fingerprint sign-in is already set up", async () => {
    mockHasSaved.mockResolvedValue(true)
    const section = await renderSection()

    await waitFor(async () => expect((await switchOf(section)).props.value).toBe(true))
  })

  it("says what to do instead of offering a switch when the phone has no fingerprint enrolled", async () => {
    mockCanUse.mockResolvedValue(false)
    const section = await renderSection()

    expect(await section.findByText(/set up a fingerprint in your phone/i)).toBeTruthy()
    expect(section.queryByTestId("fingerprint-switch")).toBeNull()
  })

  it("keeps a set-up shortcut switchable off even if the phone no longer reports a fingerprint", async () => {
    // Fingerprints removed in the phone's settings: the stored password must still be erasable.
    mockCanUse.mockResolvedValue(false)
    mockHasSaved.mockResolvedValue(true)
    const section = await renderSection()

    await fireEvent(await switchOf(section), "valueChange", false)

    await waitFor(() => expect(mockClear).toHaveBeenCalled())
  })

  it("asks for the password before turning on, and stores nothing yet", async () => {
    const section = await renderSection()

    await fireEvent(await switchOf(section), "valueChange", true)

    expect(await section.findByTestId("fingerprint-password")).toBeTruthy()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it("checks the password, then stores the account's address and that password", async () => {
    const section = await renderSection()

    await turnOn(section, "correct-horse")

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith({ mail: MAIL, password: "correct-horse" })
    })
    expect(mockReAuth).toHaveBeenCalledWith("correct-horse")
    await waitFor(async () => expect((await switchOf(section)).props.value).toBe(true))
    expect(section.queryByTestId("fingerprint-password")).toBeNull()
  })

  it("shows the server's message and stores nothing when the password is wrong", async () => {
    mockReAuth.mockRejectedValue(new Error("Invalid password."))
    const section = await renderSection()

    await turnOn(section, "wrong")

    expect(await section.findByText("Invalid password.")).toBeTruthy()
    expect(mockSave).not.toHaveBeenCalled()
    expect((await switchOf(section)).props.value).toBe(false)
  })

  it("stays off and says why when the fingerprint is not confirmed", async () => {
    mockSave.mockResolvedValue(false)
    const section = await renderSection()

    await turnOn(section, "correct-horse")

    expect(await section.findByText(/fingerprint was not confirmed/i)).toBeTruthy()
    expect((await switchOf(section)).props.value).toBe(false)
  })

  it("closes the password form on cancel without storing anything", async () => {
    const section = await renderSection()
    await fireEvent(await switchOf(section), "valueChange", true)

    await fireEvent.press(await section.findByTestId("fingerprint-cancel"))

    expect(section.queryByTestId("fingerprint-password")).toBeNull()
    expect(mockReAuth).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it("erases the stored password when switched off", async () => {
    mockHasSaved.mockResolvedValue(true)
    const section = await renderSection()
    await waitFor(async () => expect((await switchOf(section)).props.value).toBe(true))

    await fireEvent(await switchOf(section), "valueChange", false)

    await waitFor(() => expect(mockClear).toHaveBeenCalled())
    await waitFor(async () => expect((await switchOf(section)).props.value).toBe(false))
  })
})
