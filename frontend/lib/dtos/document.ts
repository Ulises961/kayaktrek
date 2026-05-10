import { z } from "zod"
import { noHtmlTags, isoDateField } from "../validators"

export const DOCUMENT_TYPES = ["permit", "licence", "insurance", "other"] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DocumentSchema = z.object({
  id: z.uuidv7().optional(),
  tripId: z.uuidv7().optional(),
  ownerId: z.uuidv7().optional(),
  type: z.enum(DOCUMENT_TYPES),
  name: z.string(),
  expiryDate: z.string().nullish(),
  notes: z.string().nullish(),
})

export const DocumentFieldsSchema = z.object({
  type: z.enum(DOCUMENT_TYPES, { message: "Select a valid document type." }),
  name: z
    .string()
    .min(1, "Name is required.")
    .refine((v) => v.trim().length > 0, "Name cannot be blank.")
    .refine(noHtmlTags.check, noHtmlTags.message),
  expiryDate: isoDateField,
  notes: z.string().max(2000).refine(noHtmlTags.check, noHtmlTags.message).optional(),
})

export type Document = z.infer<typeof DocumentSchema>
export type DocumentFields = z.infer<typeof DocumentFieldsSchema>
