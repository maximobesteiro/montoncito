import { z } from 'zod';

export const UpsertProfileSchema = z.object({
  base: z
    .object({
      generation: z.string().uuid(),
      revision: z.number().int().nonnegative(),
    })
    .optional(),
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter a nickname.')
    .max(32, 'Use 32 characters or fewer.'),
});
export type UpsertProfileDto = z.infer<typeof UpsertProfileSchema>;
