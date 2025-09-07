// --- IDs & basics ------------------------------------------------------------
export type PlayerId = string;

/** Ace=1 ... King=13 (montoncito ignores suits mechanically but we keep them for UI). */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type Suit = "Clubs" | "Diamonds" | "Hearts" | "Spades";

/** Card model: standard cards + Jokers. Wildness is decided by rules + optional per-card flag. */
export type Card =
  | { kind: "standard"; id: string; rank: Rank; suit: Suit; baseWild?: boolean }
  | { kind: "joker"; id: string; baseWild?: boolean };

// --- Deck / board ------------------------------------------------------------
export interface Deck {
  drawPile: Card[]; // face-down
  discard?: Card[]; // optional global trash/burn (usually unused)
}

/** Shared build piles ascend from 1 to maxBuildRank (usually 13). */
export interface BuildPile {
  id: string;
  cards: Card[]; // convention: index 0 = top (consistent across engine)
  /** Next required rank; null means pile just completed. */
  nextRank: Rank | null;
}

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
  hasDiscarded: boolean; // must discard to end turn
}

export type Phase = "lobby" | "turn" | "gameover";

export interface RulesConfig {
  /** Commonly: handSize=5, stockSize≈20, buildPiles=4, maxBuildRank=13, discardPiles=3 */
  handSize: number;
  stockSize: number;
  buildPiles: number;
  maxBuildRank: Rank;
  discardPiles: number;

  // ---- Wildness policy (hybrid: rules + optional per-card flag) -------------
  /** Include jokers in deck construction. */
  useJokers?: boolean;
  /** If true (default when jokers are used), jokers behave as wild. */
  jokersAreWild?: boolean;
  /** Treat Kings (rank=13) as wild. */
  kingsAreWild?: boolean;
  /** Additional ranks that are wild (e.g., [2] if deuces-wild). */
  additionalWildRanks?: Rank[];
  /** Respect per-card `baseWild` flags (useful for custom decks). */
  enableCardWildFlag?: boolean;

  /** Clear a center build pile automatically when it reaches maxBuildRank. */
  autoClearCompleteBuild?: boolean;
}

// --- Full game state ---------------------------------------------------------
export interface GameState {
  version: 1;
  id: string;

  phase: Phase;
  turn: Turn;

  players: PlayerId[]; // turn order
  byId: Record<PlayerId, PlayerState>; // per-player state

  deck: Deck; // remaining draw pile
  center: { buildPiles: BuildPile[] }; // shared piles

  winner?: PlayerId | null;
  rngSeed: number;
  rules: RulesConfig;

  data?: Record<string, unknown>; // extension hook
}

// --- Moves (player intents) --------------------------------------------------
export type Move =
  | { kind: "START_GAME" }
  | { kind: "DRAW_TO_HAND" } // up to rules.handSize
  | { kind: "PLAY_HAND_TO_BUILD"; cardId: string; buildId: string }
  | { kind: "PLAY_STOCK_TO_BUILD"; buildId: string }
  | { kind: "PLAY_DISCARD_TO_BUILD"; pileIndex: number; buildId: string }
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
export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
