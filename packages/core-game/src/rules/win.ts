import { GameState } from "../state/types";

export function checkGameOver(state: GameState): string | null {
  for (const pid of state.players) {
    const ps = state.byId[pid];
    if (ps && ps.stock.faceDown.length === 0) return pid;
  }
  return null;
}
