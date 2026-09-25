import { GameService } from './game.service';

describe('GameService core outcomes', () => {
  it('creates a playable game at sequence zero and advances sequence for accepted actions', () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const activePlayer = game.state.turn.activePlayer;
    const initialSeq = game.meta.seq;
    const result = service.applyMove(game.meta.id, {
      kind: 'DISCARD_FROM_HAND',
      cardId: game.state.byId[activePlayer]!.hand.cards[0]!.id,
      pileIndex: 0,
    });

    expect(game.state.phase).toBe('turn');
    expect(game.state.rng).toMatchObject({ algorithm: 'mulberry32-v1', seed: 1 });
    expect(initialSeq).toBe(0);
    expect(result.accepted).toBe(true);
    expect(service.get(game.meta.id).state).toBe(result.state);
    expect(result.game.meta.seq).toBe(1);
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

    expect(result).toMatchObject({ accepted: false, reason: 'Hand already full' });
    expect(service.get(game.meta.id).state).toBe(state);
    expect(service.get(game.meta.id).meta).toEqual(meta);
    expect(service.get(game.meta.id).meta.seq).toBe(0);
  });
});
