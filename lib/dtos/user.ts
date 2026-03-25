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
  mail: z.string().email(),
  username: z.string(),
  name: z.string(),
  surname: z.string().optional(),
  phone: z.string(),
  admin: z.boolean().optional(),
  image: ImageSchema.optional(),
});

// Full user as returned by /api/user/:id
export const UserSchema = z.object({
  id: z.uuidv7().optional(),
  mail: z.string().email(),
  username: z.string(),
  name: z.string(),
  surname: z.string().optional(),
  phone: z.string(),
  admin: z.boolean().optional(),
  image: ImageSchema.optional(),
  itineraries: ItinerariesSchema.optional(),
  inventories: InventoriesSchema.optional(),
  items: ItemsSchema.optional(),
  endorsedLogs: LogsSchema.optional(),
  logs: LogsSchema.optional(),
});

export type Traveller = z.infer<typeof TravellerSchema>;
export type User = z.infer<typeof UserSchema>;
export const UsersSchema = z.array(UserSchema);
