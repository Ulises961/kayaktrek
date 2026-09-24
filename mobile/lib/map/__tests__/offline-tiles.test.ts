import { OfflineManager } from "@maplibre/maplibre-react-native"
import { File } from "expo-file-system"

import {
  TILE_PACK_KIND,
  ensureTripTiles,
  fitZoom,
  pruneTripTiles,
  tilePackRegion,
} from "../offline-tiles"
import { MAP_STYLE } from "../tiles"

jest.mock("@maplibre/maplibre-react-native", () => ({
  OfflineManager: {
    getPacks: jest.fn(),
    createPack: jest.fn(),
    deletePack: jest.fn(),
  },
}))
jest.mock("expo-file-system", () => {
  const written = new Map<string, string>()
  class MockFile {
    uri: string
    constructor(...parts: string[]) {
      const last = parts[parts.length - 1]
      this.uri = last.startsWith("file://") ? last : `file:///documents/${last}`
    }
    get exists() {
      return written.has(this.uri)
    }
    textSync() {
      return written.get(this.uri) ?? ""
    }
    write(content: string) {
      written.set(this.uri, content)
    }
  }
  return { File: MockFile, Paths: { document: "documents" }, __written: written }
})

const mockGetPacks = OfflineManager.getPacks as jest.Mock
const mockCreatePack = OfflineManager.createPack as jest.Mock
const mockDeletePack = OfflineManager.deletePack as jest.Mock

// A stretch of the Costa Brava a day or two's paddle long: [west, south, east, north].
const ROUTE: [number, number, number, number] = [3.1, 41.8, 3.3, 42.0]
const VIEWPORT = { width: 400, height: 800 }

function fakePack(id: string, metadata: Record<string, unknown>, state = "complete", percentage = 100) {
  return {
    id,
    metadata,
    status: jest.fn(async () => ({ state, percentage })),
    resume: jest.fn(async () => undefined),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPacks.mockResolvedValue([])
  mockCreatePack.mockImplementation(async () => fakePack("new-pack", {}))
  mockDeletePack.mockResolvedValue(undefined)
})

describe("fitZoom", () => {
  it("is the zoom at which the route's box just fits the viewport", () => {
    // 0.2° of longitude across 400px: 512·2^z·(0.2/360) = 400 → z ≈ 10.46. The
    // latitude span is taller in pixels relative to 800px, so it is the width that binds.
    expect(fitZoom(ROUTE, VIEWPORT)).toBeCloseTo(10.46, 1)
  })

  it("zooms further in for a smaller route", () => {
    const small: [number, number, number, number] = [3.1, 41.8, 3.15, 41.85]
    expect(fitZoom(small, VIEWPORT)).toBeGreaterThan(fitZoom(ROUTE, VIEWPORT))
  })
})

describe("tilePackRegion", () => {
  // The free tier caches the view the itinerary opens at, not the detail below it
  // (plans/M26.md M9g, "Zoom split").
  it("stops at the zoom the itinerary opens at", () => {
    const region = tilePackRegion(ROUTE, VIEWPORT)

    // The route itself, not the margin around it, decides the zoom — it is what the
    // itinerary's camera fits.
    expect(region.maxZoom).toBe(Math.ceil(fitZoom(ROUTE, VIEWPORT)))
    expect(region.minZoom).toBe(region.maxZoom - 4)
  })

  // The camera fits the route's binding dimension, so the screen shows more than
  // the route's box in the other one. A north-south route on a portrait phone fills
  // the height and leaves strips either side — visible at the opening zoom, and
  // blank offline unless downloaded too.
  it("covers the whole screen at the opening zoom, not just the route's box", () => {
    const northSouth: [number, number, number, number] = [3.2, 41.5, 3.21, 42.3]
    const zoom = fitZoom(northSouth, VIEWPORT)

    const [west, south, east, north] = tilePackRegion(northSouth, VIEWPORT).bounds

    const pixelsPerDegree = (512 * 2 ** zoom) / 360
    expect((east - west) * pixelsPerDegree).toBeGreaterThanOrEqual(VIEWPORT.width)
    const mercator = (latitude: number) => {
      const radians = (latitude * Math.PI) / 180
      return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
    }
    expect((mercator(south) - mercator(north)) * 512 * 2 ** zoom).toBeGreaterThanOrEqual(
      VIEWPORT.height,
    )
  })

  it("keeps the screen centred on the route, as the camera does", () => {
    const [west, , east] = tilePackRegion(ROUTE, VIEWPORT).bounds

    expect((west + east) / 2).toBeCloseTo((ROUTE[0] + ROUTE[2]) / 2, 6)
  })

  it("adds a margin around the route so its edges are not the edge of the map", () => {
    const [west, south, east, north] = tilePackRegion(ROUTE, VIEWPORT).bounds

    expect(west).toBeLessThan(ROUTE[0])
    expect(south).toBeLessThan(ROUTE[1])
    expect(east).toBeGreaterThan(ROUTE[2])
    expect(north).toBeGreaterThan(ROUTE[3])
  })
})

describe("ensureTripTiles", () => {
  it("downloads the trip's region from a style file that renders like the map", async () => {
    await ensureTripTiles("trip-1", ROUTE, VIEWPORT)

    expect(mockCreatePack).toHaveBeenCalledTimes(1)
    const [options] = mockCreatePack.mock.calls[0]
    const region = tilePackRegion(ROUTE, VIEWPORT)
    expect(options).toMatchObject({
      bounds: region.bounds,
      minZoom: region.minZoom,
      maxZoom: region.maxZoom,
      metadata: { kind: TILE_PACK_KIND, tripId: "trip-1" },
    })
    // A download needs a style URL, not an inline style. The file carries the same
    // style the map renders, so the tiles fetched are the ones the map asks for.
    expect(options.mapStyle).toMatch(/^file:\/\//)
    expect(JSON.parse(new File(options.mapStyle).textSync())).toEqual(MAP_STYLE)
  })

  it("leaves a finished download for the same route alone", async () => {
    await ensureTripTiles("trip-1", ROUTE, VIEWPORT)
    const metadata = mockCreatePack.mock.calls[0][0].metadata
    mockCreatePack.mockClear()
    mockGetPacks.mockResolvedValue([fakePack("p1", metadata)])

    await ensureTripTiles("trip-1", ROUTE, VIEWPORT)

    expect(mockCreatePack).not.toHaveBeenCalled()
    expect(mockDeletePack).not.toHaveBeenCalled()
  })

  // A download interrupted by losing signal or the app closing picks up where it
  // stopped rather than starting again.
  it("resumes an interrupted download for the same route", async () => {
    await ensureTripTiles("trip-1", ROUTE, VIEWPORT)
    const metadata = mockCreatePack.mock.calls[0][0].metadata
    mockCreatePack.mockClear()
    const interrupted = fakePack("p1", metadata, "inactive", 40)
    mockGetPacks.mockResolvedValue([interrupted])

    await ensureTripTiles("trip-1", ROUTE, VIEWPORT)

    expect(interrupted.resume).toHaveBeenCalled()
    expect(mockCreatePack).not.toHaveBeenCalled()
  })

  it("replaces the download when the route has moved", async () => {
    mockGetPacks.mockResolvedValue([
      fakePack("old", { kind: TILE_PACK_KIND, tripId: "trip-1", region: "somewhere-else" }),
    ])

    await ensureTripTiles("trip-1", ROUTE, VIEWPORT)

    expect(mockDeletePack).toHaveBeenCalledWith("old")
    expect(mockCreatePack).toHaveBeenCalledTimes(1)
  })

  it("does not touch another trip's download", async () => {
    mockGetPacks.mockResolvedValue([
      fakePack("other", { kind: TILE_PACK_KIND, tripId: "trip-2", region: "x" }),
    ])

    await ensureTripTiles("trip-1", ROUTE, VIEWPORT)

    expect(mockDeletePack).not.toHaveBeenCalled()
  })

  it("removes the download of a route that no longer has any points", async () => {
    mockGetPacks.mockResolvedValue([
      fakePack("old", { kind: TILE_PACK_KIND, tripId: "trip-1", region: "x" }),
    ])

    await ensureTripTiles("trip-1", null, VIEWPORT)

    expect(mockDeletePack).toHaveBeenCalledWith("old")
    expect(mockCreatePack).not.toHaveBeenCalled()
  })
})

describe("pruneTripTiles", () => {
  // Past and archived trips are not synced (docs/adr/mobile-offline.md), so their
  // maps stop being kept too.
  it("deletes the downloads of trips no longer synced, and only those", async () => {
    mockGetPacks.mockResolvedValue([
      fakePack("keep", { kind: TILE_PACK_KIND, tripId: "trip-1", region: "x" }),
      fakePack("drop", { kind: TILE_PACK_KIND, tripId: "trip-2", region: "x" }),
      fakePack("foreign", { kind: "something-else", tripId: "trip-3" }),
    ])

    await pruneTripTiles(new Set(["trip-1"]))

    expect(mockDeletePack).toHaveBeenCalledTimes(1)
    expect(mockDeletePack).toHaveBeenCalledWith("drop")
  })
})
