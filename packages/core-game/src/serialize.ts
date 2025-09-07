import { GameState } from "./state/types";

export interface SnapshotV1 {
  v: 1;
  payload: GameState;
}

export function serialize(state: GameState): string {
  const snap: SnapshotV1 = { v: 1, payload: state };
  return JSON.stringify(snap);
}

export function deserialize(s: string): GameState {
  const parsed = JSON.parse(s) as { v?: number; payload?: unknown };
  if (parsed?.v !== 1)
    throw new Error(`Unsupported snapshot version: ${parsed?.v}`);
  return parsed.payload as GameState;
}
