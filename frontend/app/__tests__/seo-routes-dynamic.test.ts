import { describe, it, expect } from "vitest"
import * as robots from "@/app/robots"
import * as sitemap from "@/app/sitemap"

// Next prerenders a metadata route at build unless it opts out, and the build has no
// FRONTEND_URL — so a static robots.txt/sitemap.xml serves `localhost:3000` in production
// whatever the container is configured with. The opt-out is the whole fix; nothing else here
// would notice it being dropped.
describe("robots.txt and sitemap.xml", () => {
  it.each([
    ["robots", robots],
    ["sitemap", sitemap],
  ])("%s is rendered per request, so it sees the runtime FRONTEND_URL", (_name, route) => {
    expect(route.dynamic).toBe("force-dynamic")
  })
})
