import { z } from "zod"

export const ImageSchema = z.object({
  id: z.uuidv7().optional(),
  size: z.number(),
  // The original upload filename — metadata, never author-written. `caption` is the
  // author's own words and the only one that reaches a public surface.
  name: z.string(),
  location: z.string(),
  isPublic: z.boolean(),
  caption: z.string().nullish(),
})

export type Image = z.infer<typeof ImageSchema>
