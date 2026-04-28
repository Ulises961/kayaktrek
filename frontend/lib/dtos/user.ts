import { z } from "zod";
import { ImageSchema } from "./image";
import { ItinerariesSchema } from "./itinerary";
import { InventoriesSchema } from "./inventory";
import { ItemsSchema } from "./item";
import { LogsSchema } from "./log";

// Shallow user representation used when a user is embedded inside a Trip
// (travellers, pendingTravellers). Excludes nested collections to avoid
// circular schema dependencies.
export const TravellerSchema = z.object({
  id: z.uuidv7().optional(),
  mail: z.email(),
  username: z.string(),
  name: z.string(),
  surname: z.string().nullish(),
  phone: z.string().nullish(),
  admin: z.boolean().nullish(),
  image: ImageSchema.nullish(),
});

// Full user as returned by /api/user/:id
export const UserSchema = z.object({
  id: z.uuidv7().optional(),
  mail: z.email(),
  username: z.string(),
  name: z.string(),
  surname: z.string().nullish(),
  phone: z.string().nullish(),
  admin: z.boolean().nullish(),
  image: ImageSchema.nullish(),
  itineraries: ItinerariesSchema.nullish(),
  inventories: InventoriesSchema.nullish(),
  items: ItemsSchema.nullish(),
  endorsedLogs: LogsSchema.nullish(),
  logs: LogsSchema.nullish(),
});

export type Traveller = z.infer<typeof TravellerSchema>;
export type User = z.infer<typeof UserSchema>;
export const UsersSchema = z.array(UserSchema);
