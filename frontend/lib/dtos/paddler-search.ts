import { z } from "zod"
import { PublicUserSchema } from "./public-profile"
import { RelationshipSchema } from "./connection"

// A single paddler-search result: the public profile projection plus the caller's
// relationship annotation and (when one exists) the connection id, so the UI can
// render the right action without a second fetch. Mirrors UserService.search_paddlers
// — which dumps PublicUserSchema *without* the aggregate `stats` (those are attached
// only on the full-profile path), so we drop stats here.
export const PaddlerSearchResultSchema = PublicUserSchema.omit({ stats: true }).extend({
  id: z.uuidv7(),
  relationship: RelationshipSchema,
  connectionId: z.uuidv7().nullish(),
})

// Paginated envelope returned by GET /api/user/search/paddlers.
export const PaddlerSearchPageSchema = z.object({
  items: z.array(PaddlerSearchResultSchema),
  total: z.number().int(),
  page: z.number().int(),
  pages: z.number().int(),
})

export type PaddlerSearchResult = z.infer<typeof PaddlerSearchResultSchema>
export type PaddlerSearchPage = z.infer<typeof PaddlerSearchPageSchema>
