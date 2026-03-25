import { z } from "zod";

export const LogSchema = z.object({
  id: z.uuidv7().optional(),
  hours: z.number().optional(),
  avgSea: z.number().optional(),
  userId: z.uuidv7(),
});

export type Log = z.infer<typeof LogSchema>;
export const LogsSchema = z.array(LogSchema);
