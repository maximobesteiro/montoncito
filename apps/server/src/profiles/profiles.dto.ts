import { z } from 'zod';

export const UpsertProfileSchema = z.object({
  displayName: z.string().min(1).max(32),
});
export type UpsertProfileDto = z.infer<typeof UpsertProfileSchema>;
