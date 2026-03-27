import { z } from "zod";
import { ImageSchema } from "./image";

export const PointTypeSchema = z.enum(["stop", "position", "interest"]);
export type PointType = z.infer<typeof PointTypeSchema>;

// Point is self-referencing (next: Point), so the type and schema are defined
// separately with z.lazy() to break the recursion.
export type Point = {
  id?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  type: PointType;
  dayId?: string;
  next?: Point;
  images?: z.infer<typeof ImageSchema>[];
};

export const PointSchema: z.ZodType<Point> = z.lazy(() =>
  z.object({
    id: z.uuidv7().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    notes: z.string().optional(),
    type: PointTypeSchema,
    dayId: z.uuidv7().optional(),
    next: PointSchema.optional(),
    images: z.array(ImageSchema).optional(),
  })
);

export const PointsSchema = z.array(PointSchema);
