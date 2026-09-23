import { render } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import LogDetailScreen from "../app/(app)/(drawer)/(logs)/logs/[id]"
import NewLogScreen from "../app/(app)/(drawer)/(logs)/logs/new"
import { getSession } from "../lib/auth/session"
import { loadCachedLog } from "../lib/db/logs-cache"
import { getLog } from "../lib/logs/actions"

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "log-1" }),
    useRouter: () => ({ back: jest.fn() }),
  }
})
jest.mock("../lib/logs/actions", () => ({
  getLog: jest.fn(),
  updateLog: jest.fn(),
  deleteLog: jest.fn(),
  endorseLog: jest.fn(),
  unendorseLog: jest.fn(),
  createLog: jest.fn(),
}))

// M9c WP7: every offline branch below now reads how old its cache is. The real
// lookup needs a database; the age itself is asserted as a relative offset so
// the expectation can't rot into an absolute date as the suite gets older.
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))
jest.mock("../lib/auth/session", () => ({ getSession: jest.fn() }))
jest.mock("../lib/db/logs-cache", () => ({ loadCachedLog: jest.fn() }))

const ME = { userId: "me-id" }

beforeEach(() => {
  ;(getSession as jest.Mock).mockReset().mockResolvedValue(ME)
  ;(loadCachedLog as jest.Mock).mockReset().mockResolvedValue(null)
  ;(getLog as jest.Mock).mockReset().mockResolvedValue({
    id: "log-1",
    userId: ME.userId,
    date: "2026-07-25",
    hours: 3,
    distance: 12,
    avgSea: 2,
  })
})

// The form is five fields, a four-line notes box and one or two full-width
// buttons. In a fixed Screen with the keyboard up, the notes field and the
// submit sit under the keyboard with no way to reach them — the form cannot be
// completed on a phone. Nobody had seen the edit screen to notice: /logs/[id]
// pointed at a route that did not exist until PR #265.
describe("log form screens scroll", () => {
  it("lets the owner reach the submit on the edit screen", async () => {
    const { findByTestId } = await render(<LogDetailScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByTestId("log-form-scroll")).toBeTruthy()
  })

  it("lets the submit be reached on the new-log screen", async () => {
    const { findByTestId } = await render(<NewLogScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByTestId("log-form-scroll")).toBeTruthy()
  })

  it("still renders the form itself, not just the container", async () => {
    const { findByText } = await render(<NewLogScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Create log")).toBeTruthy()
  })
})
