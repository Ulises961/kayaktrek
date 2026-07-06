import "server-only"
import { apiGet } from "@/lib/api/client"

// Backend list endpoints cap per_page at 100 (Resources/*, `min(..., 100)`).
const PER_PAGE = 100

type PageEnvelope<T> = { items: T[]; total: number; page: number; pages: number }

type PageParser<T> = { parse: (raw: unknown) => PageEnvelope<T> }

/**
 * Exhaustively fetch a paginated `{items, total, page, pages}` endpoint so a
 * listing never silently drops rows past the backend's page size. Remaining
 * pages are fetched in parallel once the first response reveals `pages`.
 */
export async function apiGetAllPages<T>(
  path: string,
  schema: PageParser<T>,
): Promise<{ items: T[]; total: number }> {
  const sep = path.includes("?") ? "&" : "?"
  const first = schema.parse(await apiGet(`${path}${sep}per_page=${PER_PAGE}`))
  if (first.pages <= 1) return { items: first.items, total: first.total }

  const rest = await Promise.all(
    Array.from({ length: first.pages - 1 }, (_, index) =>
      apiGet(`${path}${sep}per_page=${PER_PAGE}&page=${index + 2}`).then((raw) =>
        schema.parse(raw),
      ),
    ),
  )
  return {
    items: [...first.items, ...rest.flatMap((page) => page.items)],
    total: first.total,
  }
}
