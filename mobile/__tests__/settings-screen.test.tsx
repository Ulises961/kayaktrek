import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert, Linking } from "react-native"

import { DISTANCE_UNIT } from "@shared/itinerary/distance"

import SettingsScreen from "../app/(app)/(drawer)/(settings)/settings/index"
import { logoutEverywhere } from "../lib/auth/actions"
import {
  changePassword,
  getMe,
  reAuthenticate,
  requestAccountDeletion,
  requestDataExport,
  requestEmailChange,
  setPhone,
  setUnitPreference,
} from "../lib/profile/actions"
import { listSessions, revokeSession } from "../lib/sessions/actions"

jest.mock("../lib/profile/actions", () => ({
  getMe: jest.fn(),
  setUnitPreference: jest.fn(),
  setPhone: jest.fn(),
  changePassword: jest.fn(),
  reAuthenticate: jest.fn(),
  requestEmailChange: jest.fn(),
  requestDataExport: jest.fn(),
  requestAccountDeletion: jest.fn(),
}))
jest.mock("../lib/sessions/actions", () => ({
  listSessions: jest.fn(),
  revokeSession: jest.fn(),
}))
jest.mock("../lib/auth/actions", () => ({
  logoutEverywhere: jest.fn(),
}))

const mockGetMe = getMe as jest.Mock
const mockSetUnit = setUnitPreference as jest.Mock
const mockSetPhone = setPhone as jest.Mock
const mockChangePassword = changePassword as jest.Mock
const mockReAuth = reAuthenticate as jest.Mock
const mockEmailChange = requestEmailChange as jest.Mock
const mockDataExport = requestDataExport as jest.Mock
const mockDeletion = requestAccountDeletion as jest.Mock
const mockListSessions = listSessions as jest.Mock
const mockRevokeSession = revokeSession as jest.Mock
const mockLogoutEverywhere = logoutEverywhere as jest.Mock

const ME = {
  mail: "paddler@example.com",
  username: "paddler",
  name: "Paddler",
  phone: "+44 7700 900000",
  unitPreference: DISTANCE_UNIT.NM,
}

const THIS_DEVICE = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  deviceLabel: "Pixel 8",
  locationLabel: "Edinburgh, GB",
  created: "2026-09-01T10:00:00Z",
  lastUsedAt: "2026-09-20T10:00:00Z",
  expiresAt: "2026-10-20T10:00:00Z",
  isCurrent: true,
}

const OTHER_DEVICE = { ...THIS_DEVICE, id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c", deviceLabel: "Firefox on Linux", isCurrent: false }

// Every destructive action goes through Alert.alert per the mobile dialog convention,
// so the tests drive the confirm button out of the spy rather than the screen.
function confirmAlert(buttonText: string) {
  const spy = Alert.alert as unknown as jest.Mock
  const call = spy.mock.calls.at(-1)
  const buttons = call?.[2] as { text: string; onPress?: () => void }[] | undefined
  const button = buttons?.find((entry) => entry.text === buttonText)
  if (!button) throw new Error(`no "${buttonText}" button in the last alert`)
  button.onPress?.()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetMe.mockResolvedValue(ME)
  mockListSessions.mockResolvedValue([THIS_DEVICE, OTHER_DEVICE])
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("SettingsScreen", () => {
  it("shows the signed-in address", async () => {
    const { findByText } = await render(<SettingsScreen />)

    expect(await findByText("paddler@example.com")).toBeTruthy()
  })

  describe("preferences", () => {
    it("changes the unit preference", async () => {
      mockSetUnit.mockResolvedValue({ ...ME, unitPreference: DISTANCE_UNIT.KM })

      const { findByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId(`unit-${DISTANCE_UNIT.KM}`))

      await waitFor(() => expect(mockSetUnit).toHaveBeenCalledWith(DISTANCE_UNIT.KM))
    })
  })

  describe("account", () => {
    it("saves a changed phone number", async () => {
      mockSetPhone.mockResolvedValue(ME)

      const { findByTestId, getByTestId } = await render(<SettingsScreen />)
      await fireEvent.changeText(await findByTestId("phone-input"), "+44 7700 900111")
      await fireEvent.press(getByTestId("phone-save"))

      await waitFor(() => expect(mockSetPhone).toHaveBeenCalledWith("+44 7700 900111"))
    })

    it("changes the password", async () => {
      mockChangePassword.mockResolvedValue(undefined)

      const { findByTestId, getByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId("password-open"))
      await fireEvent.changeText(getByTestId("password-current"), "old-one")
      await fireEvent.changeText(getByTestId("password-new"), "new-one-long")
      await fireEvent.changeText(getByTestId("password-confirm"), "new-one-long")
      await fireEvent.press(getByTestId("password-submit"))

      await waitFor(() =>
        expect(mockChangePassword).toHaveBeenCalledWith("old-one", "new-one-long"),
      )
    })

    it("refuses a password change whose confirmation does not match", async () => {
      const { findByTestId, getByTestId, findByText } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId("password-open"))
      await fireEvent.changeText(getByTestId("password-current"), "old-one")
      await fireEvent.changeText(getByTestId("password-new"), "new-one-long")
      await fireEvent.changeText(getByTestId("password-confirm"), "different")
      await fireEvent.press(getByTestId("password-submit"))

      expect(await findByText(/do not match/i)).toBeTruthy()
      expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it("re-authenticates before requesting an email change", async () => {
      // The endpoint wants an elevated token, so the password is exchanged first and the
      // change is never attempted without one.
      mockReAuth.mockResolvedValue("elevated-abc")
      mockEmailChange.mockResolvedValue(undefined)

      const { findByTestId, getByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId("email-open"))
      await fireEvent.changeText(getByTestId("email-new"), "new@example.com")
      await fireEvent.changeText(getByTestId("email-password"), "correct-horse")
      await fireEvent.press(getByTestId("email-submit"))

      await waitFor(() => expect(mockReAuth).toHaveBeenCalledWith("correct-horse"))
      expect(mockEmailChange).toHaveBeenCalledWith("elevated-abc", "new@example.com")
    })

    it("does not attempt the email change when the password is wrong", async () => {
      mockReAuth.mockRejectedValue(new Error("Password incorrect."))

      const { findByTestId, getByTestId, findByText } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId("email-open"))
      await fireEvent.changeText(getByTestId("email-new"), "new@example.com")
      await fireEvent.changeText(getByTestId("email-password"), "wrong")
      await fireEvent.press(getByTestId("email-submit"))

      expect(await findByText("Password incorrect.")).toBeTruthy()
      expect(mockEmailChange).not.toHaveBeenCalled()
    })
  })

  describe("security", () => {
    it("lists the signed-in devices", async () => {
      const { findByText } = await render(<SettingsScreen />)

      expect(await findByText(/Pixel 8/)).toBeTruthy()
      expect(await findByText(/Firefox on Linux/)).toBeTruthy()
    })

    it("marks which device is this one", async () => {
      const { findByText } = await render(<SettingsScreen />)

      expect(await findByText(/this device/i)).toBeTruthy()
    })

    it("degrades to a message rather than taking the screen down when devices fail to load", async () => {
      mockListSessions.mockRejectedValue(new Error("nope"))

      const { findByText } = await render(<SettingsScreen />)

      expect(await findByText(/could not load your devices/i)).toBeTruthy()
      // The rest of the screen still rendered.
      expect(await findByText("paddler@example.com")).toBeTruthy()
    })

    it("revokes another device after confirmation", async () => {
      mockRevokeSession.mockResolvedValue(undefined)

      const { findByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId(`revoke-${OTHER_DEVICE.id}`))
      confirmAlert("Sign out")

      await waitFor(() => expect(mockRevokeSession).toHaveBeenCalledWith(OTHER_DEVICE.id))
    })

    it("does not revoke when the confirmation is dismissed", async () => {
      const { findByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId(`revoke-${OTHER_DEVICE.id}`))

      expect(mockRevokeSession).not.toHaveBeenCalled()
    })

    it("signs out everywhere after confirmation", async () => {
      mockLogoutEverywhere.mockResolvedValue(undefined)

      const { findByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId("sign-out-everywhere"))
      confirmAlert("Sign out everywhere")

      await waitFor(() => expect(mockLogoutEverywhere).toHaveBeenCalled())
    })
  })

  describe("privacy and data", () => {
    it("requests a data export", async () => {
      mockDataExport.mockResolvedValue(undefined)

      const { findByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId("data-export"))

      await waitFor(() => expect(mockDataExport).toHaveBeenCalled())
    })

    it("requires confirmation before requesting account deletion", async () => {
      mockDeletion.mockResolvedValue(undefined)

      const { findByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId("delete-account"))

      expect(mockDeletion).not.toHaveBeenCalled()
      confirmAlert("Delete account")
      await waitFor(() => expect(mockDeletion).toHaveBeenCalled())
    })
  })

  describe("legal", () => {
    it("opens the hosted terms rather than shipping a copy of them", async () => {
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)

      const { findByTestId } = await render(<SettingsScreen />)
      await fireEvent.press(await findByTestId("legal-terms"))

      expect(openURL).toHaveBeenCalledWith(expect.stringContaining("/terms"))
    })
  })
})
