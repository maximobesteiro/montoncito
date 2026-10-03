import { GameState } from "./state/types";

export interface SnapshotV2 {
  v: 2;
  payload: GameState;
}

export function serialize(state: GameState): string {
  assertSupportedStateVersions(state);
  const snap: SnapshotV2 = { v: 2, payload: state };
  return JSON.stringify(snap);
}

export function deserialize(s: string): GameState {
  const parsed = JSON.parse(s) as { v?: number; payload?: unknown };
  if (parsed?.v !== 2)
    throw new Error(`Unsupported snapshot version: ${parsed?.v}`);
  assertSupportedStateVersions(parsed.payload);
  return parsed.payload as GameState;
}

function assertSupportedStateVersions(payload: unknown): void {
  const state = payload as { version?: unknown; rulesetVersion?: unknown } | null;
  if (state?.version !== 2)
    throw new Error(`Unsupported game-state version: ${state?.version}`);
  if (state.rulesetVersion !== 1)
    throw new Error(`Unsupported ruleset version: ${state.rulesetVersion}`);
}
