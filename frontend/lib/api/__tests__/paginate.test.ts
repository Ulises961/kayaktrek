import { describe, it, expect, vi, beforeEach } from "vitest"
import { z } from "zod"
import { apiGetAllPages } from "../paginate"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
}))

import { apiGet } from "@/lib/api/client"

const GET = apiGet as ReturnType<typeof vi.fn>

const ItemPageSchema = z.object({
  items: z.array(z.object({ id: z.string() })),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
})

function pageOf(ids: string[], page: number, pages: number, total: number) {
  return { items: ids.map((id) => ({ id })), total, page, pages }
}

beforeEach(() => vi.clearAllMocks())

describe("apiGetAllPages", () => {
  it("fetches a single page once at the per_page cap", async () => {
    GET.mockResolvedValue(pageOf(["a", "b"], 1, 1, 2))

    const result = await apiGetAllPages("/api/log/all", ItemPageSchema)

    expect(GET).toHaveBeenCalledTimes(1)
    expect(GET).toHaveBeenCalledWith("/api/log/all?per_page=100")
    expect(result).toEqual({ items: [{ id: "a" }, { id: "b" }], total: 2 })
  })

  it("fetches every remaining page and concatenates items in page order", async () => {
    GET.mockImplementation((path: string) => {
      if (path.endsWith("page=2")) return Promise.resolve(pageOf(["c", "d"], 2, 3, 5))
      if (path.endsWith("page=3")) return Promise.resolve(pageOf(["e"], 3, 3, 5))
      return Promise.resolve(pageOf(["a", "b"], 1, 3, 5))
    })

    const result = await apiGetAllPages("/api/log/all", ItemPageSchema)

    expect(GET).toHaveBeenCalledTimes(3)
    expect(GET).toHaveBeenCalledWith("/api/log/all?per_page=100&page=2")
    expect(GET).toHaveBeenCalledWith("/api/log/all?per_page=100&page=3")
    expect(result.items.map((i) => i.id)).toEqual(["a", "b", "c", "d", "e"])
    expect(result.total).toBe(5)
  })

  it("appends with & when the path already has a query string", async () => {
    GET.mockResolvedValue(pageOf(["a"], 1, 1, 1))

    await apiGetAllPages("/api/log/all?sort=date", ItemPageSchema)

    expect(GET).toHaveBeenCalledWith("/api/log/all?sort=date&per_page=100")
  })

  it("rejects when a page fails schema validation", async () => {
    GET.mockResolvedValue({ nope: true })

    await expect(apiGetAllPages("/api/log/all", ItemPageSchema)).rejects.toThrow()
  })
})
