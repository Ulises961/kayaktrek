import { describe, it, expect } from "vitest"

import { OSM_TILE_URL, SEAMARK_TILE_URL, OSM_ATTRIBUTION, SEAMARK_ATTRIBUTION } from "../tiles"

describe("tile URLs", () => {
  it("route both layers through the backend proxy, not the upstream tile hosts", () => {
    expect(OSM_TILE_URL).toMatch(
      /^http:\/\/localhost:5000\/api\/v1\/tiles\/osm\/\{z\}\/\{x\}\/\{y\}\.png$/,
    )
    expect(SEAMARK_TILE_URL).toMatch(
      /^http:\/\/localhost:5000\/api\/v1\/tiles\/seamark\/\{z\}\/\{x\}\/\{y\}\.png$/,
    )
  })

  it("drop the {s} subdomain placeholder", () => {
    expect(OSM_TILE_URL).not.toContain("{s}")
    expect(SEAMARK_TILE_URL).not.toContain("{s}")
  })

  it("do not point at the upstream tile hosts directly", () => {
    expect(OSM_TILE_URL).not.toContain("tile.openstreetmap.org")
    expect(SEAMARK_TILE_URL).not.toContain("tiles.openseamap.org")
  })

  it("keep provider attribution strings", () => {
    expect(OSM_ATTRIBUTION).toContain("OpenStreetMap")
    expect(SEAMARK_ATTRIBUTION).toContain("OpenSeaMap")
  })
})
