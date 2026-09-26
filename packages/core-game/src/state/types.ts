// --- IDs & basics ------------------------------------------------------------
export type PlayerId = string;

/** Ace=1 ... King=13 (montoncito ignores suits mechanically but we keep them for UI). */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type Suit = "Clubs" | "Diamonds" | "Hearts" | "Spades";

/** Card model: standard cards + Jokers. Every King and Joker is wild. */
export type Card =
  | { kind: "standard"; id: string; rank: Rank; suit: Suit }
  | { kind: "joker"; id: string };

// --- Deck / board ------------------------------------------------------------
export interface Deck {
  drawPile: Card[]; // face-down
  recyclePile: Card[];
}

/** Retained state for deterministic random operations. */
export interface RandomGeneratorState {
  algorithm: "mulberry32-v1";
  seed: number;
  cursor: number;
}

/** Shared Build piles ascend from 1 through 12. */
export interface BuildPile {
  id: string;
  cards: Card[]; // convention: index 0 = top (consistent across engine)
  /** Next required rank; null means pile just completed. */
  nextRank: Rank | null;
}

export type BuildPileTarget = string | "new";

// --- Player zones ------------------------------------------------------------
/** Goal pile; top is last element for easy peek/pop. */
export interface Stock {
  faceDown: Card[];
}

/** Unordered multiset. */
export interface Hand {
  cards: Card[];
}

/** Configurable number of personal discards; top = last element. */
export type DiscardArea = Card[][];

export interface PlayerState {
  id: PlayerId;
  name?: string;
  hand: Hand;
  discards: DiscardArea; // length == rules.discardPiles
  stock: Stock;
}

// --- Rules & turn ------------------------------------------------------------
export interface Turn {
  number: number;
  activePlayer: PlayerId;
  hasDiscarded: boolean;
}

export type Phase = "lobby" | "turn" | "gameover";

export interface RulesConfig {
  /** Commonly: handSize=5, stockSize≈20, discardPiles=3 */
  handSize: number;
  stockSize: number;
  discardPiles: number;
}

// --- Full game state ---------------------------------------------------------
export interface GameState {
  version: 1;
  /** Fixed gameplay policy, independent of state and transport versions. */
  rulesetVersion: 1;
  id: string;

  phase: Phase;
  turn: Turn;

  players: PlayerId[]; // turn order
  byId: Record<PlayerId, PlayerState>; // per-player state

  deck: Deck; // remaining draw pile
  center: { buildPiles: BuildPile[] }; // shared piles
  nextBuildPileId: number;

  winner?: PlayerId | null;
  rng: RandomGeneratorState;
  rules: RulesConfig;

  data?: Record<string, unknown>; // extension hook
}

// --- Moves (player intents) --------------------------------------------------
export type Move =
  | { kind: "START_GAME" }
  | { kind: "DRAW_TO_HAND" } // up to rules.handSize
  | { kind: "END_TURN" }
  | { kind: "PLAY_HAND_TO_BUILD"; cardId: string; target: BuildPileTarget }
  | { kind: "PLAY_STOCK_TO_BUILD"; target: BuildPileTarget }
  | { kind: "PLAY_DISCARD_TO_BUILD"; pileIndex: number; target: BuildPileTarget }
  | { kind: "DISCARD_FROM_HAND"; cardId: string; pileIndex: number }; // ends turn

export type MoveKind = Move["kind"];

// --- Events (engine outputs) -------------------------------------------------
export type GameEventType =
  | "GameStarted"
  | "DrewToHand"
  | "PlayedToBuild"
  | "BuildCompleted"
  | "BuildCleared"
  | "Discarded"
  | "TurnEnded"
  | "InvalidMove"
  | "GameOver";

export interface GameEvent {
  type: GameEventType;
  payload?: Record<string, unknown>;
}

// --- Apply result ------------------------------------------------------------
export type RuleReason =
  | "Game already started"
  | "Need at least two players"
  | "Not your turn"
  | "Hand already full"
  | "Hand is not empty"
  | "Hand can still be refilled"
  | "A legal placement remains"
  | "Card not in hand"
  | "Wild cards cannot be discarded"
  | "Card does not match build requirement"
  | "No stock card to play"
  | "Stock card does not match build requirement"
  | "Invalid discard pile index"
  | "Discard pile is empty"
  | "Discard card does not match build requirement"
  | "Unknown move";

export type ApplyResult =
  | { accepted: true; state: GameState; events: GameEvent[] }
  | {
      accepted: false;
      state: GameState;
      reason: RuleReason;
      /** Legacy notification; callers must use `accepted` and `reason`. */
      events: GameEvent[];
    };
