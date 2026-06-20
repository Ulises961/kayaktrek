import { z } from "zod"
import { noHtmlTags, isoDateField } from "../validators"

export const TRAVEL_DOCUMENT_TYPES = [
  "accommodation",
  "transport",
  "insurance",
  "permit",
  "other",
] as const
export type TravelDocumentType = (typeof TRAVEL_DOCUMENT_TYPES)[number]

export const TravelDocumentSchema = z.object({
  id: z.uuidv7().optional(),
  tripId: z.uuidv7().optional(),
  ownerId: z.uuidv7().optional(),
  type: z.enum(TRAVEL_DOCUMENT_TYPES),
  name: z.string(),
  date: z.string().nullish(),
  expiryDate: z.string().nullish(),
  confirmationNumber: z.string().nullish(),
  url: z.string().nullish(),
  notes: z.string().nullish(),
  attachmentPath: z.string().nullish(),
})

export const TravelDocumentFieldsSchema = z
  .object({
    type: z.enum(TRAVEL_DOCUMENT_TYPES, { message: "Select a valid document type." }),
    name: z
      .string()
      .min(1, "Name is required.")
      .refine((v) => v.trim().length > 0, "Name cannot be blank.")
      .refine(noHtmlTags.check, noHtmlTags.message),
    date: isoDateField,
    expiryDate: isoDateField,
    confirmationNumber: z.string().max(100).refine(noHtmlTags.check, noHtmlTags.message).optional(),
    url: z.string().max(500).optional(),
    notes: z.string().max(2000).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  })
  .refine(
    (d) => {
      if (d.date && d.expiryDate) return d.date <= d.expiryDate
      return true
    },
    { message: "Expiry date must be on or after the document date.", path: ["expiryDate"] },
  )

export type TravelDocument = z.infer<typeof TravelDocumentSchema>
export type TravelDocumentFields = z.infer<typeof TravelDocumentFieldsSchema>
