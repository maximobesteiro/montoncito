import { Injectable, NotFoundException } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import {
  createStartedGame,
  applyMove as coreApplyMove,
  type GameState,
  type Move,
  type ApplyResult,
} from '@mont/core-game';
import type { PlayerAction } from '@mont/game-room';

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

export type ActionOutcome =
  | {
      accepted: true;
      actionId: string;
      seq: number;
      acceptedSeq?: number;
      state: GameState;
      duplicate?: true;
    }
  | {
      accepted: false;
      actionId: string;
      code:
        | 'STALE_BASE_SEQ'
        | 'ACTION_ID_CONFLICT'
        | 'NOT_YOUR_TURN'
        | 'ILLEGAL_ACTION'
        | 'GAME_FINISHED';
      seq: number;
      state: GameState;
      message?: string;
      duplicate?: true;
    };

type RetainedOutcome = {
  baseSeq: number;
  action: PlayerAction;
  outcome: ActionOutcome;
};

type ActionRequest = {
  playerId: string;
  actionId: string;
  baseSeq: number;
  action: PlayerAction;
};

@Injectable()
export class GameService {
  private readonly games = new Map<GameId, StoredGame>();
  private readonly outcomes = new Map<string, RetainedOutcome>();
  private readonly roomQueues = new Map<string, Promise<void>>();

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
    this.commitAcceptedState(g, result.state);
    this.games.set(gameId, g);
    return { ...result, game: g };
  }

  public processAction(
    gameId: GameId,
    input: ActionRequest,
  ): Promise<ActionOutcome> {
    const game = this.get(gameId);
    const previous = this.roomQueues.get(game.meta.roomId) ?? Promise.resolve();
    const current = previous.then(() => this.applyAction(game, input));
    const settled = current.then(
      () => undefined,
      () => undefined,
    );
    this.roomQueues.set(game.meta.roomId, settled);
    void settled.then(() => {
      if (this.roomQueues.get(game.meta.roomId) === settled) {
        this.roomQueues.delete(game.meta.roomId);
      }
    });
    return current;
  }

  private applyAction(game: StoredGame, input: ActionRequest): ActionOutcome {
    const outcomeKey = `${game.meta.roomId}::${input.playerId}::${input.actionId}`;
    const retained = this.outcomes.get(outcomeKey);
    if (retained) {
      if (
        retained.baseSeq !== input.baseSeq ||
        JSON.stringify(retained.action) !== JSON.stringify(input.action)
      ) {
        return this.reject(input.actionId, game, 'ACTION_ID_CONFLICT');
      }
      return retained.outcome.accepted
        ? {
            ...retained.outcome,
            acceptedSeq: retained.outcome.seq,
            seq: game.meta.seq,
            state: game.state,
            duplicate: true,
          }
        : {
            ...retained.outcome,
            seq: game.meta.seq,
            state: game.state,
            duplicate: true,
          };
    }

    let outcome: ActionOutcome;
    if (game.state.phase === 'gameover') {
      outcome = this.reject(input.actionId, game, 'GAME_FINISHED');
    } else if (input.baseSeq !== game.meta.seq) {
      outcome = this.reject(input.actionId, game, 'STALE_BASE_SEQ');
    } else if (game.state.turn.activePlayer !== input.playerId) {
      outcome = this.reject(input.actionId, game, 'NOT_YOUR_TURN');
    } else {
      const applied = coreApplyMove(game.state, input.action);
      if (!applied.accepted) {
        outcome = this.reject(
          input.actionId,
          game,
          'ILLEGAL_ACTION',
          applied.reason,
        );
      } else {
        this.commitAcceptedState(game, applied.state);
        outcome = {
          accepted: true,
          actionId: input.actionId,
          seq: game.meta.seq,
          state: game.state,
        };
      }
    }

    this.outcomes.set(outcomeKey, {
      baseSeq: input.baseSeq,
      action: input.action,
      outcome,
    });
    return outcome;
  }

  private commitAcceptedState(game: StoredGame, state: GameState): void {
    game.state = state;
    game.meta.seq += 1;
    game.meta.winnerId = state.winner ?? null;
    if (state.phase === 'gameover' && !game.meta.finishedAt) {
      game.meta.finishedAt = new Date().toISOString();
    }
  }

  private reject(
    actionId: string,
    game: StoredGame,
    code: Extract<ActionOutcome, { accepted: false }>['code'],
    message?: string,
  ): Extract<ActionOutcome, { accepted: false }> {
    return {
      accepted: false,
      actionId,
      code,
      seq: game.meta.seq,
      state: game.state,
      ...(message ? { message } : {}),
    };
  }
}
