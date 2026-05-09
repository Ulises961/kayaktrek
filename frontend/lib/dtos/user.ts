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
  avatarUrl: z.string().url().nullish(),
});

// Full user as returned by /api/user/:id or /api/user/me
export const UserSchema = z.object({
  id: z.uuidv7().optional(),
  mail: z.email(),
  username: z.string(),
  name: z.string(),
  surname: z.string().nullish(),
  phone: z.string().nullish(),
  admin: z.boolean().nullish(),
  image: ImageSchema.nullish(),
  avatarUrl: z.string().url().nullish(),
  itineraries: ItinerariesSchema.nullish(),
  inventories: InventoriesSchema.nullish(),
  items: ItemsSchema.nullish(),
  endorsedLogs: LogsSchema.nullish(),
  logs: LogsSchema.nullish(),
  // Float plan defaults (M3d)
  vesselMake: z.string().nullish(),
  vesselModel: z.string().nullish(),
  vesselLengthCm: z.number().int().nullish(),
  vesselColorPrimary: z.string().nullish(),
  vesselColorSecondary: z.string().nullish(),
  emergencyContactName: z.string().nullish(),
  emergencyContactPhone: z.string().nullish(),
  emergencyContactRelationship: z.string().nullish(),
  // Consent + GDPR timestamps (ISO strings, never raw medical notes)
  medicalNotesConsentAt: z.string().nullish(),
  deletionRequestedAt: z.string().nullish(),
});

export type Traveller = z.infer<typeof TravellerSchema>;
export type User = z.infer<typeof UserSchema>;
export const UsersSchema = z.array(UserSchema);

// Form validation schema for the edit-profile page
export const ProfileFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  surname: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  username: z
    .string()
    .min(3, "At least 3 characters")
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, _ and - only"),
  vesselMake: z.string().max(100).optional(),
  vesselModel: z.string().max(100).optional(),
  vesselLengthCm: z.string().optional().refine(
    (val) => !val || /^\d+$/.test(val),
    "Must be a positive integer"
  ),
  vesselColorPrimary: z.string().max(50).optional(),
  vesselColorSecondary: z.string().max(50).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyContactRelationship: z.string().max(100).optional(),
});

export type ProfileFormValues = z.infer<typeof ProfileFormSchema>;

// Form validation schema for the change-password page
export const ChangePasswordSchema = z
  .object({
    currentPwd: z.string().min(1, "Current password is required"),
    newPwd: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[a-zA-Z]/, "Must contain at least one letter")
      .regex(/[0-9]/, "Must contain at least one number")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Must contain at least one special character"),
    confirmPwd: z.string(),
  })
  .refine((data) => data.newPwd === data.confirmPwd, {
    message: "Passwords do not match",
    path: ["confirmPwd"],
  });

export type ChangePasswordValues = z.infer<typeof ChangePasswordSchema>;
