import { BuildPile, GameState, PlayerId, PlayerState, Rank } from "./types";
import { must } from "../utils/guards";

export function getActivePlayer(state: GameState): PlayerState {
  const p = state.byId[state.turn.activePlayer];
  return must(p, "Active player not found");
}

export function firstPlayerId(state: GameState): PlayerId {
  const pid = state.players[0] ?? state.turn.activePlayer;
  return must(pid, "No players in game");
}

export function nextPlayerId(state: GameState): PlayerId {
  const n = state.players.length;
  if (n === 0) throw new Error("No players in game");
  const idx = state.players.indexOf(state.turn.activePlayer);
  const next = state.players[(idx + 1) % n];
  return must(next, "Next player not found");
}

export function getBuildPile(state: GameState, buildId: string): BuildPile {
  const bp = state.center.buildPiles.find((b) => b.id === buildId);
  return must(bp, `Build pile ${buildId} not found`);
}

export function topBuildCard(pile: BuildPile) {
  return pile.cards[0];
}

export function computeNextRankAfterPlace(
  currentRequired: Rank | null,
  placedRankOrNull: Rank | null,
  maxRank: Rank
): Rank | null {
  if (currentRequired === null) return null; // pile already complete
  const r = placedRankOrNull ?? currentRequired;
  if (r === maxRank) return null; // just completed
  return (r + 1) as Rank;
}
