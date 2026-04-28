import { z } from "zod";

export const LogSchema = z.object({
  id: z.uuidv7().optional(),
  hours: z.number().nullish(),
  avgSea: z.number().nullish(),
  userId: z.uuidv7().nullish(),
});

export type Log = z.infer<typeof LogSchema>;
export const LogsSchema = z.array(LogSchema);
