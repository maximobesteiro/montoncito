import { z } from 'zod';

export const UpsertProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter a nickname.')
    .max(32, 'Use 32 characters or fewer.'),
});
export type UpsertProfileDto = z.infer<typeof UpsertProfileSchema>;
