import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  createInitialState,
  applyMove as coreApplyMove,
  type GameState,
  type Move,
  type Card,
  type RulesConfig,
} from '@mont/core-game';

export type GameId = string;

export type GameMeta = {
  id: GameId;
  roomId: string;
  players: string[]; // ordered clientIds
  startedAt: string;
  finishedAt?: string;
  winnerId?: string | null;
};

export type StoredGame = {
  meta: GameMeta;
  state: GameState;
};

@Injectable()
export class GameService {
  private readonly games = new Map<GameId, StoredGame>();

  public create(params: {
    roomId: string;
    players: string[];
    config: Partial<{
      discardPiles: number;
      handSize: number;
      stockSize: number;
      buildPiles: number;
      maxBuildRank: number; // will be coerced to RulesConfig['maxBuildRank']
      useJokers: boolean;
      jokersAreWild: boolean;
      kingsAreWild: boolean;
      additionalWildRanks: number[]; // will be coerced to Rank[]
      enableCardWildFlag: boolean;
      autoClearCompleteBuild: boolean;
      seed: number;
    }>;
  }): StoredGame {
    const id = randomUUID();

    // 1) Deck typed explicitly
    const deck: Card[] = [];

    // 2) Build engine opts safely and only when defined
    const opts: Partial<RulesConfig> & { seed?: number; id?: string } = {};
    const cfg = params.config ?? {};

    if (cfg.discardPiles !== undefined) opts.discardPiles = cfg.discardPiles;
    if (cfg.handSize !== undefined) opts.handSize = cfg.handSize;
    if (cfg.stockSize !== undefined) opts.stockSize = cfg.stockSize;
    if (cfg.buildPiles !== undefined) opts.buildPiles = cfg.buildPiles;

    if (cfg.maxBuildRank !== undefined) {
      const clamped =
        cfg.maxBuildRank < 1
          ? 1
          : cfg.maxBuildRank > 13
            ? 13
            : cfg.maxBuildRank;
      // Coerce to engine's 'Rank' union type
      opts.maxBuildRank = clamped as unknown as RulesConfig['maxBuildRank'];
    }

    if (cfg.useJokers !== undefined) opts.useJokers = cfg.useJokers;
    if (cfg.jokersAreWild !== undefined) opts.jokersAreWild = cfg.jokersAreWild;
    if (cfg.kingsAreWild !== undefined) opts.kingsAreWild = cfg.kingsAreWild;

    if (cfg.additionalWildRanks !== undefined) {
      const ranks = cfg.additionalWildRanks
        .map((n) => (n < 1 ? 1 : n > 13 ? 13 : n))
        // Coerce each to Rank
        .map((n) => n as unknown as RulesConfig['maxBuildRank']);
      // TS: RulesConfig likely defines Rank[]; we reuse the same Rank type via maxBuildRank
      opts.additionalWildRanks =
        ranks as unknown as RulesConfig['additionalWildRanks'];
    }

    if (cfg.enableCardWildFlag !== undefined)
      opts.enableCardWildFlag = cfg.enableCardWildFlag;
    if (cfg.autoClearCompleteBuild !== undefined)
      opts.autoClearCompleteBuild = cfg.autoClearCompleteBuild;

    opts.seed = cfg.seed ?? Date.now();
    opts.id = id;

    const state = createInitialState(
      params.players.map((pid) => ({ id: pid })), // names optional
      deck,
      opts,
    );

    const meta: GameMeta = {
      id,
      roomId: params.roomId,
      players: params.players,
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      winnerId: state.winner ?? null,
    };

    const g: StoredGame = { meta, state };
    this.games.set(id, g);
    return g;
  }

  public get(gameId: GameId): StoredGame {
    const g = this.games.get(gameId);
    if (!g) throw new NotFoundException('Game not found');
    return g;
  }

  public applyMove(
    gameId: GameId,
    move: unknown,
  ): { game: StoredGame; events: unknown[] } {
    const g = this.get(gameId);
    // Controller validates the shape; we narrow here for the core call.
    const { state: next, events } = coreApplyMove(g.state, move as Move);
    g.state = next;
    g.meta.winnerId = next.winner ?? null;
    if (next.phase === 'gameover' && !g.meta.finishedAt) {
      g.meta.finishedAt = new Date().toISOString();
    }
    this.games.set(gameId, g);
    return { game: g, events };
  }
}
