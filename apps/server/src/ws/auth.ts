import { z } from 'zod';

export const WsJoinClaims = z.object({
  roomId: z.string().min(1),
  playerId: z.string().min(1),
  // we’ll also have iat/exp from JWT; we validate those with jwt.verify()
});
export type WsJoinClaims = z.infer<typeof WsJoinClaims>;
