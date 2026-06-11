import { z } from "zod"

export const ImageSchema = z.object({
  id: z.uuidv7().optional(),
  size: z.number(),
  name: z.string(),
  location: z.string(),
})

export type Image = z.infer<typeof ImageSchema>
