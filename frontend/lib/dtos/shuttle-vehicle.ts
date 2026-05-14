import { z } from "zod"
import { noHtmlTags } from "../validators"
import { ShuttlePassengerSchema } from "./shuttle-passenger"

export const ShuttleVehicleSchema = z.object({
  id: z.uuidv7().optional(),
  tripId: z.uuidv7().optional(),
  arrangedById: z.uuidv7().optional(),
  driverId: z.uuidv7().nullish(),
  driverName: z.string().nullish(),
  driverContact: z.string().nullish(),
  seatsAvailable: z.number().int().nullish(),
  kayakSpots: z.number().int().nullish(),
  vehicleDescription: z.string().nullish(),
  pickupPoint: z.string().nullish(),
  passengers: z.array(ShuttlePassengerSchema).default([]),
})

export const ShuttleVehicleFieldsSchema = z.object({
  driverId: z.uuidv7().nullish(),
  driverName: z.string().max(200).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  driverContact: z.string().max(200).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  seatsAvailable: z.number().int().min(0, "Seats cannot be negative.").nullish(),
  kayakSpots: z.number().int().min(0, "Kayak spots cannot be negative.").nullish(),
  vehicleDescription: z.string().max(200).refine(noHtmlTags.check, noHtmlTags.message).optional(),
  pickupPoint: z.string().max(200).refine(noHtmlTags.check, noHtmlTags.message).optional(),
})

export type ShuttleVehicle = z.infer<typeof ShuttleVehicleSchema>
export type ShuttleVehicleFields = z.infer<typeof ShuttleVehicleFieldsSchema>
