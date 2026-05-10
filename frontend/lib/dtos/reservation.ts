import { z } from "zod"
import { noHtmlTags, isoDateField } from "../validators"

export const RESERVATION_TYPES = ["accommodation", "transport", "permit", "other"] as const
export type ReservationType = (typeof RESERVATION_TYPES)[number]

export const ReservationSchema = z.object({
  id: z.uuidv7().optional(),
  tripId: z.uuidv7().optional(),
  ownerId: z.uuidv7().optional(),
  type: z.enum(RESERVATION_TYPES),
  name: z.string(),
  date: z.string().nullish(),
  confirmationNumber: z.string().nullish(),
  notes: z.string().nullish(),
  url: z.string().nullish(),
})

export const ReservationFieldsSchema = z.object({
  type: z.enum(RESERVATION_TYPES, { message: "Select a valid reservation type." }),
  name: z
    .string()
    .min(1, "Name is required.")
    .refine((v) => v.trim().length > 0, "Name cannot be blank.")
    .refine(noHtmlTags.check, noHtmlTags.message),
  date: isoDateField,
  confirmationNumber: z.string().max(100).optional(),
  notes: z.string().max(2000).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  url: z.string().max(500).optional(),
})

export type Reservation = z.infer<typeof ReservationSchema>
export type ReservationFields = z.infer<typeof ReservationFieldsSchema>
