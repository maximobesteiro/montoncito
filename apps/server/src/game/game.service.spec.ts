import { GameService } from './game.service';

describe('GameService core outcomes', () => {
  it('commits an accepted winning transition and preserves its completion time on rejection', () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const initial = game.state;
    const result = service.applyMove(game.meta.id, { kind: 'START_GAME' });

    expect(result.accepted).toBe(true);
    expect(service.get(game.meta.id).state).toBe(result.state);
    expect(result.state).not.toBe(initial);
    // Current setup uses an empty Draw pile, so starting wins immediately.
    expect(result.state.phase).toBe('gameover');
    expect(result.game.meta.winnerId).toBe('P1');
    expect(result.game.meta.finishedAt).toEqual(expect.any(String));
    const finishedAt = result.game.meta.finishedAt;
    const rejected = service.applyMove(game.meta.id, { kind: 'START_GAME' });
    expect(rejected).toMatchObject({
      accepted: false,
      reason: 'Game already started',
    });
    expect(rejected.state).toBe(result.state);
    expect(rejected.game.meta.finishedAt).toBe(finishedAt);
  });

  it('returns rejection without replacing stored state or metadata', () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const state = game.state;
    const meta = { ...game.meta };

    const result = service.applyMove(game.meta.id, { kind: 'DRAW_TO_HAND' });

    expect(result).toMatchObject({ accepted: false, reason: 'Not your turn' });
    expect(service.get(game.meta.id).state).toBe(state);
    expect(service.get(game.meta.id).meta).toEqual(meta);
  });
});
