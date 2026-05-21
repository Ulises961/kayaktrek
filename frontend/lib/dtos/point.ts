import { z } from "zod";
import { ImageSchema } from "./image";
import { noHtmlTags } from "../validators";

export const PointTypeSchema = z.enum(["stop", "position", "interest"]);
export type PointType = z.infer<typeof PointTypeSchema>;

// Point is self-referencing (next: Point), so the type and schema are defined
// separately with z.lazy() to break the recursion.
export type Point = {
  id?: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  name?: string | null;
  type: PointType;
  dayId?: string | null;
  next?: Point | null;
  images?: z.infer<typeof ImageSchema>[] | null;
};

export const PointSchema: z.ZodType<Point> = z.lazy(() =>
  z.object({
    id: z.uuidv7().optional(),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    notes: z.string().max(1000, "Notes must be at most 1000 characters.").refine(noHtmlTags.check, noHtmlTags.message).nullish(),
    name: z.string().max(200, "Name must be at most 200 characters.").refine(noHtmlTags.check, noHtmlTags.message).nullish(),
    type: PointTypeSchema,
    dayId: z.uuidv7().nullish(),
    next: PointSchema.nullish(),
    images: z.array(ImageSchema).nullish(),
  })
);

export const PointsSchema = z.array(PointSchema);
