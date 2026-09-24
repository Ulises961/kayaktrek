import { describe, it, expect, vi, beforeEach } from "vitest"
import { searchPublicItineraries } from "@/lib/itinerary/actions"
import { siteUrl } from "@/lib/seo/robots"
import sitemap from "@/app/sitemap"

vi.mock("@/lib/itinerary/actions", () => ({ searchPublicItineraries: vi.fn() }))

const mockSearch = vi.mocked(searchPublicItineraries)

// Matches the real ExplorePage shape — the action parses through ExplorePageSchema, so a
// mock missing `pages` would encode a pagination bug as expected behaviour, and one
// missing the required count fields would assert against a shape the API never returns.
function page(ids: string[], pages = 1, pageNumber = 1) {
  return {
    items: ids.map((id) => ({
      id,
      dayCount: 0,
      previewPositions: [],
      pointCount: 0,
      placeCount: 0,
      photoCount: 0,
    })),
    total: ids.length,
    page: pageNumber,
    pages,
  } satisfies Awaited<ReturnType<typeof searchPublicItineraries>>
}

beforeEach(() => vi.clearAllMocks())

describe("sitemap", () => {
  it("lists the static public pages even when the library is empty", async () => {
    mockSearch.mockResolvedValue(page([]))

    const entries = await sitemap()

    expect(entries.map((e) => e.url)).toEqual([
      siteUrl("/"),
      siteUrl("/about"),
      siteUrl("/terms"),
      siteUrl("/privacy"),
    ])
  })

  it("appends every public route as an absolute /routes/<id> URL", async () => {
    mockSearch.mockResolvedValue(page(["route-a", "route-b"]))

    const urls = (await sitemap()).map((e) => e.url)

    expect(urls).toContain(siteUrl("/routes/route-a"))
    expect(urls).toContain(siteUrl("/routes/route-b"))
  })

  it("walks every page rather than truncating at the first", async () => {
    mockSearch
      .mockResolvedValueOnce(page(["a"], 3, 1))
      .mockResolvedValueOnce(page(["b"], 3, 2))
      .mockResolvedValueOnce(page(["c"], 3, 3))

    const urls = (await sitemap()).map((e) => e.url)

    expect(mockSearch).toHaveBeenCalledTimes(3)
    expect(urls).toContain(siteUrl("/routes/a"))
    expect(urls).toContain(siteUrl("/routes/b"))
    expect(urls).toContain(siteUrl("/routes/c"))
  })

  // searchPublicItineraries swallows its own errors and returns an empty page, so the
  // consequence to assert is that the sitemap still renders the static half rather than
  // throwing and failing the route.
  it("still yields the static pages when the backend returns nothing", async () => {
    mockSearch.mockResolvedValue(page([], 1))

    const entries = await sitemap()

    expect(entries).toHaveLength(4)
    expect(entries.every((e) => e.url.startsWith("http"))).toBe(true)
  })
})
