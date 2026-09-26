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
    expect(game.state.rng).toMatchObject({
      algorithm: 'mulberry32-v1',
      seed: 1,
    });
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

    expect(result).toMatchObject({
      accepted: false,
      reason: 'Hand already full',
    });
    expect(service.get(game.meta.id).state).toBe(state);
    expect(service.get(game.meta.id).meta).toEqual(meta);
    expect(service.get(game.meta.id).meta.seq).toBe(0);
  });

  it('processes an Action once and returns the same outcome for a retry', async () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const playerId = game.state.turn.activePlayer;
    const submission = {
      playerId,
      actionId: '550e8400-e29b-41d4-a716-446655440000',
      baseSeq: 0,
      action: {
        kind: 'DISCARD_FROM_HAND' as const,
        cardId: game.state.byId[playerId]!.hand.cards[0]!.id,
        pileIndex: 0,
      },
    };

    const accepted = await service.processAction(game.meta.id, submission);
    const duplicate = await service.processAction(game.meta.id, submission);

    expect(accepted).toMatchObject({ accepted: true, seq: 1 });
    expect(duplicate).toMatchObject({
      accepted: true,
      seq: 1,
      state: accepted.state,
    });

    const nextPlayer = service.get(game.meta.id).state.turn.activePlayer;
    const nextHandCard = service.get(game.meta.id).state.byId[nextPlayer]!.hand.cards[0]!;
    const laterResult = await service.processAction(game.meta.id, {
      playerId: nextPlayer,
      actionId: '550e8400-e29b-41d4-a716-446655440012',
      baseSeq: 1,
      action: { kind: 'DISCARD_FROM_HAND', cardId: nextHandCard.id, pileIndex: 0 },
    });
    const retryAfterLaterAction = await service.processAction(game.meta.id, submission);

    expect(laterResult).toMatchObject({ accepted: true, seq: 2 });
    expect(retryAfterLaterAction).toMatchObject({
      accepted: true,
      seq: 1,
      state: laterResult.state,
      duplicate: true,
    });
    expect(service.get(game.meta.id).meta.seq).toBe(2);
  });

  it('rejects a stale Action without advancing authoritative state or sequence', async () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const playerId = game.state.turn.activePlayer;
    const result = await service.processAction(game.meta.id, {
      playerId,
      actionId: '550e8400-e29b-41d4-a716-446655440001',
      baseSeq: 3,
      action: { kind: 'END_TURN' },
    });

    expect(result).toMatchObject({
      accepted: false,
      code: 'STALE_BASE_SEQ',
      seq: 0,
    });
    expect(service.get(game.meta.id).state).toBe(game.state);
  });

  it('rejects reuse of an Action ID with a changed player Action', async () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const playerId = game.state.turn.activePlayer;
    const cardId = game.state.byId[playerId]!.hand.cards[0]!.id;
    const actionId = '550e8400-e29b-41d4-a716-446655440006';

    await service.processAction(game.meta.id, {
      playerId,
      actionId,
      baseSeq: 0,
      action: { kind: 'DISCARD_FROM_HAND', cardId, pileIndex: 0 },
    });
    const conflict = await service.processAction(game.meta.id, {
      playerId,
      actionId,
      baseSeq: 0,
      action: { kind: 'DISCARD_FROM_HAND', cardId, pileIndex: 1 },
    });

    expect(conflict).toMatchObject({
      accepted: false,
      code: 'ACTION_ID_CONFLICT',
      seq: 1,
    });
    expect(service.get(game.meta.id).meta.seq).toBe(1);
  });
});
