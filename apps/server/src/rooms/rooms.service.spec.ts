import { ConflictException } from '@nestjs/common';
import { GameService } from '../game/game.service';
import { ProfilesService } from '../profiles/profiles.service';
import { RoomsService } from './rooms.service';

describe('RoomsService.start', () => {
  let rooms: RoomsService;
  let games: GameService;

  beforeEach(() => {
    games = new GameService();
    rooms = new RoomsService(
      {
        defaultVisibility: 'public',
        defaultMaxPlayers: 4,
        hardMaxPlayers: 4,
        slugLength: 10,
      },
      new ProfilesService(),
      games,
    );
  });

  it('commits a complete playable Game room at sequence zero and is idempotent', () => {
    const lobby = rooms.create({ clientId: 'P1' });
    rooms.join({ roomId: lobby.id, clientId: 'P2' });
    rooms.setReady({ roomId: lobby.id, clientId: 'P2', ready: true });

    const started = rooms.start({ roomId: lobby.id, requesterId: 'P1' });
    const game = games.get(started.gameId!);

    expect(started.status).toBe('in_progress');
    expect(game.meta.seq).toBe(0);
    expect(game.state.phase).toBe('turn');
    expect(game.state.rng.algorithm).toBe('mulberry32-v1');
    expect(game.state.rules).toMatchObject({
      handSize: 5,
      stockSize: 20,
      discardPiles: 3,
      useJokers: true,
    });
    for (const playerId of ['P1', 'P2']) {
      expect(game.state.byId[playerId]?.stock.faceDown).toHaveLength(20);
      expect(game.state.byId[playerId]?.hand.cards).toHaveLength(5);
    }

    expect(rooms.start({ roomId: lobby.id, requesterId: 'P1' })).toBe(started);
    expect(games.get(started.gameId!).meta.seq).toBe(0);
  });

  it('leaves Lobby status and readiness unchanged when start validation fails', () => {
    const lobby = rooms.create({ clientId: 'P1' });
    const before = structuredClone(lobby);

    expect(() => rooms.start({ roomId: lobby.id, requesterId: 'P1' })).toThrow(
      ConflictException,
    );
    expect(rooms.getById(lobby.id)).toEqual(before);
  });
});
