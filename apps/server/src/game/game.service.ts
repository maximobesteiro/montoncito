import { Injectable, NotFoundException } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import {
  createStartedGame,
  applyMove as coreApplyMove,
  type GameState,
  type Move,
  type ApplyResult,
} from '@mont/core-game';

export type GameId = string;

export type GameMeta = {
  id: GameId;
  roomId: string;
  players: string[]; // ordered clientIds
  startedAt: string;
  seq: number;
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
    config?: { discardPiles?: number; seed?: number };
  }): StoredGame {
    const id = randomUUID();
    const cfg = params.config ?? {};
    const state = createStartedGame({
      players: params.players,
      seed: cfg.seed ?? randomInt(0, 0x1_0000_0000),
      id,
      discardPiles: cfg.discardPiles,
    });

    const meta: GameMeta = {
      id,
      roomId: params.roomId,
      players: params.players,
      startedAt: new Date().toISOString(),
      seq: 0,
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
    move: Move,
  ): ApplyResult & { game: StoredGame } {
    const g = this.get(gameId);
    const result = coreApplyMove(g.state, move);
    if (!result.accepted) return { ...result, game: g };
    const next = result.state;
    g.state = next;
    g.meta.seq += 1;
    g.meta.winnerId = next.winner ?? null;
    if (next.phase === 'gameover' && !g.meta.finishedAt) {
      g.meta.finishedAt = new Date().toISOString();
    }
    this.games.set(gameId, g);
    return { ...result, game: g };
  }
}
