import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"
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
import { canUseBiometrics, hasBiometricCredentials } from "../lib/auth/biometric-store"
import { listSatelliteFeeds } from "../lib/satellite-feeds/actions"
import { listSessions, revokeSession } from "../lib/sessions/actions"
import { loadMeCache, saveMeCache } from "../lib/db/profile-cache"
import { useIsOffline } from "../lib/network/use-is-offline"

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
jest.mock("../lib/satellite-feeds/actions", () => ({
  listSatelliteFeeds: jest.fn(),
  saveSatelliteFeed: jest.fn(),
  deleteSatelliteFeed: jest.fn(),
}))
jest.mock("../lib/auth/actions", () => ({
  logoutEverywhere: jest.fn(),
}))
jest.mock("../lib/auth/biometric-store", () => ({
  canUseBiometrics: jest.fn(),
  hasBiometricCredentials: jest.fn(),
  saveBiometricCredentials: jest.fn(),
  clearBiometricCredentials: jest.fn(),
}))
jest.mock("../lib/db/profile-cache", () => ({
  loadMeCache: jest.fn(),
  saveMeCache: jest.fn(),
}))
jest.mock("../lib/network/use-is-offline", () => ({ useIsOffline: jest.fn(() => false) }))
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
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
const mockListFeeds = listSatelliteFeeds as jest.Mock
const mockRevokeSession = revokeSession as jest.Mock
const mockLogoutEverywhere = logoutEverywhere as jest.Mock
const mockLoadMeCache = loadMeCache as jest.Mock
const mockSaveMeCache = saveMeCache as jest.Mock
const mockUseIsOffline = useIsOffline as jest.Mock

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
  ;(canUseBiometrics as jest.Mock).mockResolvedValue(true)
  ;(hasBiometricCredentials as jest.Mock).mockResolvedValue(false)
  mockGetMe.mockResolvedValue(ME)
  mockListSessions.mockResolvedValue([THIS_DEVICE, OTHER_DEVICE])
  mockListFeeds.mockResolvedValue([])
  mockLoadMeCache.mockResolvedValue(null)
  mockSaveMeCache.mockResolvedValue(undefined)
  mockUseIsOffline.mockReturnValue(false)
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("SettingsScreen", () => {
  it("shows the signed-in address", async () => {
    const { findByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("paddler@example.com")).toBeTruthy()
  })

  describe("preferences", () => {
    it("changes the unit preference", async () => {
      mockSetUnit.mockResolvedValue({ ...ME, unitPreference: DISTANCE_UNIT.KM })

      const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.press(await findByTestId(`unit-${DISTANCE_UNIT.KM}`))

      await waitFor(() => expect(mockSetUnit).toHaveBeenCalledWith(DISTANCE_UNIT.KM))
    })
  })

  describe("account", () => {
    it("saves a changed phone number", async () => {
      mockSetPhone.mockResolvedValue(ME)

      const { findByTestId, getByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.changeText(await findByTestId("phone-input"), "+44 7700 900111")
      await fireEvent.press(getByTestId("phone-save"))

      await waitFor(() => expect(mockSetPhone).toHaveBeenCalledWith("+44 7700 900111"))
    })

    it("changes the password", async () => {
      mockChangePassword.mockResolvedValue(undefined)

      const { findByTestId, getByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
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
      const { findByTestId, getByTestId, findByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
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

      const { findByTestId, getByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.press(await findByTestId("email-open"))
      await fireEvent.changeText(getByTestId("email-new"), "new@example.com")
      await fireEvent.changeText(getByTestId("email-password"), "correct-horse")
      await fireEvent.press(getByTestId("email-submit"))

      await waitFor(() => expect(mockReAuth).toHaveBeenCalledWith("correct-horse"))
      expect(mockEmailChange).toHaveBeenCalledWith("elevated-abc", "new@example.com")
    })

    it("does not attempt the email change when the password is wrong", async () => {
      mockReAuth.mockRejectedValue(new Error("Password incorrect."))

      const { findByTestId, getByTestId, findByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
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
      const { findByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByText(/Pixel 8/)).toBeTruthy()
      expect(await findByText(/Firefox on Linux/)).toBeTruthy()
    })

    it("says when a session began, not only when it was last used", async () => {
      // Without it, two sessions from the same phone in the same place are the same row,
      // and the only moving part is "last used" — which cannot tell you whether a session
      // is one you opened months ago or one that appeared today.
      const { findAllByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

      // Anchored on the separator so the card's own "Where your account is signed in"
      // blurb does not count. Both rows, not just one: the date is what tells two
      // otherwise-identical sessions apart, so a row without it is one you cannot judge.
      expect(await findAllByText(/· signed in \d/i)).toHaveLength(2)
    })

    it("marks which device is this one", async () => {
      const { findByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByText(/this device/i)).toBeTruthy()
    })

    it("degrades to a message rather than taking the screen down when devices fail to load", async () => {
      mockListSessions.mockRejectedValue(new Error("nope"))

      const { findByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByText(/could not load your devices/i)).toBeTruthy()
      // The rest of the screen still rendered.
      expect(await findByText("paddler@example.com")).toBeTruthy()
    })

    it("revokes another device after confirmation", async () => {
      mockRevokeSession.mockResolvedValue(undefined)

      const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.press(await findByTestId(`revoke-${OTHER_DEVICE.id}`))
      confirmAlert("Sign out")

      await waitFor(() => expect(mockRevokeSession).toHaveBeenCalledWith(OTHER_DEVICE.id))
    })

    it("does not revoke when the confirmation is dismissed", async () => {
      const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.press(await findByTestId(`revoke-${OTHER_DEVICE.id}`))

      expect(mockRevokeSession).not.toHaveBeenCalled()
    })

    it("signs out everywhere after confirmation", async () => {
      mockLogoutEverywhere.mockResolvedValue(undefined)

      const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.press(await findByTestId("sign-out-everywhere"))
      confirmAlert("Sign out everywhere")

      await waitFor(() => expect(mockLogoutEverywhere).toHaveBeenCalled())
    })
  })

  describe("fingerprint sign-in", () => {
    it("has its own entry, so it can be turned on without waiting for the sign-in offer", async () => {
      const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByTestId("fingerprint-switch")).toBeTruthy()
    })
  })

  describe("satellite tracking", () => {
    it("offers to register a feed", async () => {
      const { findByText, findByTestId } = await render(<SettingsScreen />, {
        wrapper: WithCachedSurfaces,
      })

      expect(await findByText("Satellite tracking")).toBeTruthy()
      expect(await findByTestId("satellite-add")).toBeTruthy()
    })

    it("shows a registered feed", async () => {
      mockListFeeds.mockResolvedValue([
        {
          id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d",
          provider: "inreach_mapshare",
          feedUrl: "https://share.garmin.com/feed/Share/paddler",
          feedUsername: null,
          hasPassword: false,
          needsReauth: false,
          lastPolledAt: null,
          lastIngestedAt: null,
          created: null,
        },
      ])

      const { findByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByText("https://share.garmin.com/feed/Share/paddler")).toBeTruthy()
    })

    it("does not take the screen down when the feed lookup fails", async () => {
      mockListFeeds.mockRejectedValue(new Error("500 Internal Server Error"))

      const { findByText } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByText("Could not load your satellite feed.")).toBeTruthy()
      expect(await findByText("paddler@example.com")).toBeTruthy()
    })
  })

  describe("privacy and data", () => {
    it("requests a data export", async () => {
      mockDataExport.mockResolvedValue(undefined)

      const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.press(await findByTestId("data-export"))

      await waitFor(() => expect(mockDataExport).toHaveBeenCalled())
    })

    it("requires confirmation before requesting account deletion", async () => {
      mockDeletion.mockResolvedValue(undefined)

      const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.press(await findByTestId("delete-account"))

      expect(mockDeletion).not.toHaveBeenCalled()
      confirmAlert("Delete account")
      await waitFor(() => expect(mockDeletion).toHaveBeenCalled())
    })
  })

  describe("legal", () => {
    it("opens the hosted terms rather than shipping a copy of them", async () => {
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)

      const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
      await fireEvent.press(await findByTestId("legal-terms"))

      expect(openURL).toHaveBeenCalledWith(expect.stringContaining("/terms"))
    })
  })
})

// M9c WP7 tier 4: the account record is cached, so offline Settings reads it
// back instead of going blank. Everything that changes something stays out of
// reach, and the cards that could only fail (devices, data export) stay hidden.
describe("SettingsScreen — offline", () => {
  beforeEach(() => {
    mockGetMe.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    mockListSessions.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
  })

  it("shows the cached account, with its age in the banner", async () => {
    mockLoadMeCache.mockResolvedValue(ME)

    const { findByText, getByText, queryByText } = await render(<SettingsScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("paddler@example.com")).toBeTruthy()
    expect(getByText("Last synced 2 days ago.")).toBeTruthy()
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
  })

  it("offers no way to change anything while showing the cache", async () => {
    mockLoadMeCache.mockResolvedValue(ME)

    const { findByText, getByTestId, queryByTestId } = await render(<SettingsScreen />, {
      wrapper: WithCachedSurfaces,
    })
    await findByText("paddler@example.com")

    for (const id of [
      "email-open",
      "phone-save",
      "password-open",
      "sign-out-everywhere",
      "data-export",
      "satellite-add",
      "fingerprint-switch",
    ]) {
      expect(queryByTestId(id)).toBeNull()
    }
    await fireEvent.press(getByTestId(`unit-${DISTANCE_UNIT.KM}`))
    expect(mockSetUnit).not.toHaveBeenCalled()
  })

  it("shows the phone number as text rather than an editable field", async () => {
    mockLoadMeCache.mockResolvedValue(ME)

    const { findByText, queryByTestId } = await render(<SettingsScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("+44 7700 900000")).toBeTruthy()
    expect(queryByTestId("phone-input")).toBeNull()
  })

  it("says Settings need a connection when nothing was ever cached", async () => {
    mockLoadMeCache.mockResolvedValue(null)

    const { findByText, queryByText } = await render(<SettingsScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("Settings need a connection.")).toBeTruthy()
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
    expect(queryByText(/Could not load your devices/)).toBeNull()
  })

  it("locks the controls when the device drops offline after a live load", async () => {
    mockGetMe.mockResolvedValue(ME)
    mockUseIsOffline.mockReturnValue(true)

    const { findByText, getByTestId, queryByTestId } = await render(<SettingsScreen />, {
      wrapper: WithCachedSurfaces,
    })
    await findByText("paddler@example.com")

    expect(queryByTestId("phone-save")).toBeNull()
    expect(queryByTestId("satellite-add")).toBeNull()
    await fireEvent.press(getByTestId(`unit-${DISTANCE_UNIT.KM}`))
    expect(mockSetUnit).not.toHaveBeenCalled()
  })
})

describe("SettingsScreen — cache", () => {
  it("saves a live load so the next offline open has it", async () => {
    await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })

    await waitFor(() => expect(mockSaveMeCache).toHaveBeenCalledWith(ME))
  })

  // Otherwise a unit changed online reads back as the old one offline, until
  // the sweep's day-long budget runs out.
  it("saves the record a change returns", async () => {
    const updated = { ...ME, unitPreference: DISTANCE_UNIT.KM }
    mockSetUnit.mockResolvedValue(updated)

    const { findByTestId } = await render(<SettingsScreen />, { wrapper: WithCachedSurfaces })
    await fireEvent.press(await findByTestId(`unit-${DISTANCE_UNIT.KM}`))

    await waitFor(() => expect(mockSaveMeCache).toHaveBeenCalledWith(updated))
  })
})
