import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"

import ProfileScreen from "../app/(app)/(drawer)/(profile)/profile/index"
import {
  loadLogStatsCache,
  loadMeCache,
  saveLogStatsCache,
  saveMeCache,
} from "../lib/db/profile-cache"
import { getLogStats } from "../lib/logs/actions"
import { useIsOffline } from "../lib/network/use-is-offline"
import { getMe, setProfileVisibility } from "../lib/profile/actions"

// A plain stub, not requireActual — see crew-screen.test.tsx: with Avatar in
// the module graph, the real expo-router's Image usage collides with
// react-native-css's wrapper at import time.
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
  useIsFocused: () => true,
}))
jest.mock("../lib/profile/actions", () => ({
  getMe: jest.fn(),
  setProfileVisibility: jest.fn(),
}))
jest.mock("../lib/logs/actions", () => ({ getLogStats: jest.fn() }))
jest.mock("../lib/db/profile-cache", () => ({
  loadMeCache: jest.fn(),
  saveMeCache: jest.fn(),
  loadLogStatsCache: jest.fn(),
  saveLogStatsCache: jest.fn(),
}))
jest.mock("../lib/network/use-is-offline", () => ({
  useIsOffline: jest.fn(() => false),
}))
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))

const mockGetMe = getMe as jest.Mock
const mockSetVisibility = setProfileVisibility as jest.Mock
const mockGetLogStats = getLogStats as jest.Mock
const mockLoadMeCache = loadMeCache as jest.Mock
const mockSaveMeCache = saveMeCache as jest.Mock
const mockLoadLogStatsCache = loadLogStatsCache as jest.Mock
const mockSaveLogStatsCache = saveLogStatsCache as jest.Mock
const mockUseIsOffline = useIsOffline as jest.Mock

const ME = {
  mail: "ana@example.com",
  username: "ana",
  name: "Ana",
  surname: "Ríos",
  bio: "Sea kayaker.",
  profileIsPublic: true,
}

const STATS = {
  totalDistance: 120,
  totalHours: 30,
  logCount: 9,
  tripCount: 3,
  endorsementsReceived: 2,
  conditionsDistribution: {},
  activityByMonth: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetMe.mockResolvedValue(ME)
  mockGetLogStats.mockResolvedValue(STATS)
  mockLoadMeCache.mockResolvedValue(null)
  mockLoadLogStatsCache.mockResolvedValue(null)
  mockSaveMeCache.mockResolvedValue(undefined)
  mockSaveLogStatsCache.mockResolvedValue(undefined)
  mockUseIsOffline.mockReturnValue(false)
})

describe("ProfileScreen", () => {
  it("shows the paddler's name, handle and stats", async () => {
    const { findByText, getByText } = await render(<ProfileScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("@ana")).toBeTruthy()
    expect(getByText("Sea kayaker.")).toBeTruthy()
    expect(getByText("Trips")).toBeTruthy()
    expect(getByText("Edit")).toBeTruthy()
  })

  it("changes the profile's visibility", async () => {
    mockSetVisibility.mockResolvedValue({ ...ME, profileIsPublic: false })

    const { findByRole } = await render(<ProfileScreen />, {
      wrapper: WithCachedSurfaces,
    })
    await fireEvent(await findByRole("switch"), "valueChange", false)

    await waitFor(() => expect(mockSetVisibility).toHaveBeenCalledWith(false))
  })

  it("saves a live load so the next offline open has it", async () => {
    await render(<ProfileScreen />, { wrapper: WithCachedSurfaces })

    await waitFor(() => expect(mockSaveMeCache).toHaveBeenCalledWith(ME))
    expect(mockSaveLogStatsCache).toHaveBeenCalledWith(STATS)
  })
})

// M9c WP7 tier 4: Profile read from the cache when /user/me can't be reached.
describe("ProfileScreen — offline", () => {
  beforeEach(() => {
    mockGetMe.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    mockGetLogStats.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
  })

  it("shows the cached profile and stats, with their age in the banner", async () => {
    mockLoadMeCache.mockResolvedValue(ME)
    mockLoadLogStatsCache.mockResolvedValue(STATS)

    const { findByText, getByText, queryByText } = await render(<ProfileScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("@ana")).toBeTruthy()
    expect(getByText("Trips")).toBeTruthy()
    expect(getByText("Last synced 2 days ago.")).toBeTruthy()
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
  })

  it("offers no editing while showing the cache", async () => {
    mockLoadMeCache.mockResolvedValue(ME)

    const { findByText, queryByText, getByRole } = await render(<ProfileScreen />, {
      wrapper: WithCachedSurfaces,
    })
    await findByText("@ana")

    expect(queryByText("Edit")).toBeNull()
    expect(getByRole("switch").props.disabled).toBe(true)
  })

  it("still shows the profile when only the stats were never cached", async () => {
    mockLoadMeCache.mockResolvedValue(ME)

    const { findByText, queryByText } = await render(<ProfileScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("@ana")).toBeTruthy()
    expect(queryByText("Trips")).toBeNull()
  })

  it("says Profile needs a connection when nothing was ever cached", async () => {
    const { findByText, queryByText } = await render(<ProfileScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("Profile needs a connection.")).toBeTruthy()
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
    expect(queryByText("Try again")).toBeNull()
  })

  it("locks editing when the device drops offline after a live load", async () => {
    mockGetMe.mockResolvedValue(ME)
    mockGetLogStats.mockResolvedValue(STATS)
    mockUseIsOffline.mockReturnValue(true)

    const { findByText, queryByText, getByRole } = await render(<ProfileScreen />, {
      wrapper: WithCachedSurfaces,
    })
    await findByText("@ana")

    expect(queryByText("Edit")).toBeNull()
    expect(getByRole("switch").props.disabled).toBe(true)
  })
})
