import { GameService } from './game.service';

describe('GameService core outcomes', () => {
  it.each([
    [
      'King',
      {
        kind: 'standard' as const,
        id: 'wild',
        rank: 13 as const,
        suit: 'Hearts' as const,
      },
    ],
    ['Joker', { kind: 'joker' as const, id: 'wild' }],
  ])('rejects a %s discard through the normal Game room action flow', async (_name, wild) => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const playerId = game.state.turn.activePlayer;
    game.state.byId[playerId]!.hand.cards = [
      wild,
      { kind: 'standard', id: 'ordinary', rank: 7, suit: 'Hearts' },
    ];
    const before = structuredClone(game.state);
    const original = game.state;

    const rejected = await service.processAction(game.meta.id, {
      playerId,
      actionId: '550e8400-e29b-41d4-a716-446655440020',
      baseSeq: 0,
      action: { kind: 'DISCARD_FROM_HAND', cardId: 'wild', pileIndex: 0 },
    });

    expect(rejected).toMatchObject({
      accepted: false,
      code: 'ILLEGAL_ACTION',
      message: 'Wild cards cannot be discarded',
      seq: 0,
      state: before,
    });
    expect(game.state).toBe(original);
    expect(game.meta.seq).toBe(0);
    expect(game.state.turn.activePlayer).toBe(playerId);

    const accepted = await service.processAction(game.meta.id, {
      playerId,
      actionId: '550e8400-e29b-41d4-a716-446655440021',
      baseSeq: 0,
      action: { kind: 'DISCARD_FROM_HAND', cardId: 'ordinary', pileIndex: 0 },
    });
    expect(accepted).toMatchObject({ accepted: true, seq: 1 });
    expect(game.state.turn.activePlayer).not.toBe(playerId);
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
    const nextHandCard = service.get(game.meta.id).state.byId[nextPlayer]!.hand
      .cards[0]!;
    const laterResult = await service.processAction(game.meta.id, {
      playerId: nextPlayer,
      actionId: '550e8400-e29b-41d4-a716-446655440012',
      baseSeq: 1,
      action: {
        kind: 'DISCARD_FROM_HAND',
        cardId: nextHandCard.id,
        pileIndex: 0,
      },
    });
    const retryAfterLaterAction = await service.processAction(
      game.meta.id,
      submission,
    );

    expect(laterResult).toMatchObject({ accepted: true, seq: 2 });
    expect(retryAfterLaterAction).toMatchObject({
      accepted: true,
      seq: 2,
      acceptedSeq: 1,
      state: laterResult.state,
      duplicate: true,
    });
    expect(service.get(game.meta.id).meta.seq).toBe(2);
  });

  it('serializes concurrent retries so only one state transition is committed', async () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const playerId = game.state.turn.activePlayer;
    const submission = {
      playerId,
      actionId: '550e8400-e29b-41d4-a716-446655440013',
      baseSeq: 0,
      action: {
        kind: 'DISCARD_FROM_HAND' as const,
        cardId: game.state.byId[playerId]!.hand.cards[0]!.id,
        pileIndex: 0,
      },
    };

    const [first, second] = await Promise.all([
      service.processAction(game.meta.id, submission),
      service.processAction(game.meta.id, submission),
    ]);

    expect([first, second].map((result) => result.accepted)).toEqual([
      true,
      true,
    ]);
    expect([first, second].filter((result) => result.duplicate)).toHaveLength(
      1,
    );
    expect(game.meta.seq).toBe(1);
  });

  it('replays a retained rejection with the latest Authoritative state', async () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const firstPlayer = game.state.turn.activePlayer;
    const submission = {
      playerId: firstPlayer,
      actionId: '550e8400-e29b-41d4-a716-446655440014',
      baseSeq: 3,
      action: { kind: 'END_TURN' as const },
    };

    const rejected = await service.processAction(game.meta.id, submission);
    const legalAction = await service.processAction(game.meta.id, {
      playerId: firstPlayer,
      actionId: '550e8400-e29b-41d4-a716-446655440015',
      baseSeq: 0,
      action: {
        kind: 'DISCARD_FROM_HAND',
        cardId: game.state.byId[firstPlayer]!.hand.cards[0]!.id,
        pileIndex: 0,
      },
    });
    const retry = await service.processAction(game.meta.id, submission);

    expect(rejected).toMatchObject({
      accepted: false,
      code: 'STALE_BASE_SEQ',
      seq: 0,
    });
    expect(legalAction).toMatchObject({ accepted: true, seq: 1 });
    expect(retry).toMatchObject({
      accepted: false,
      code: 'STALE_BASE_SEQ',
      seq: 1,
      state: legalAction.state,
      duplicate: true,
    });
    expect(game.meta.seq).toBe(1);
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

  it('rejects reuse of an Action ID with a changed Base sequence number', async () => {
    const service = new GameService();
    const game = service.create({
      roomId: 'room',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    const playerId = game.state.turn.activePlayer;
    const actionId = '550e8400-e29b-41d4-a716-446655440016';
    const action = { kind: 'END_TURN' as const };

    await service.processAction(game.meta.id, {
      playerId,
      actionId,
      baseSeq: 0,
      action,
    });
    const conflict = await service.processAction(game.meta.id, {
      playerId,
      actionId,
      baseSeq: 1,
      action,
    });

    expect(conflict).toMatchObject({
      accepted: false,
      code: 'ACTION_ID_CONFLICT',
      seq: 0,
    });
    expect(game.meta.seq).toBe(0);
  });
});
