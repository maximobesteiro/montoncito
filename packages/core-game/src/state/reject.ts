import { ApplyResult, GameState, RuleReason } from "./types";

export function rejectMove(
  state: GameState,
  reason: RuleReason,
): Extract<ApplyResult, { accepted: false }> {
  return {
    accepted: false,
    state,
    reason,
    events: [{ type: "InvalidMove", payload: { reason } }],
  };
}
