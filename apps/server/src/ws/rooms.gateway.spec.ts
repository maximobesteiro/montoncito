import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client';
import { GameService } from '../game/game.service';
import { RoomsGateway } from './rooms.gateway';

describe('Game room synchronization over Socket.IO', () => {
  const secret = 'test-ws-secret';
  let httpServer: ReturnType<typeof createServer>;
  let socketServer: Server;
  let gateway: RoomsGateway;
  let gameService: GameService;
  let gameId: string;
  let baseUrl: string;
  let clients: ClientSocket[];
  let roomPlayers: { id: string }[];
  let roomGameId: string | undefined;
  let leaveRoom: jest.Mock;

  beforeEach(async () => {
    httpServer = createServer();
    socketServer = new Server(httpServer, { cors: { origin: '*' } });
    clients = [];
    gameService = new GameService();
    const game = gameService.create({
      roomId: 'room-1',
      players: ['P1', 'P2'],
      config: { seed: 1 },
    });
    gameId = game.meta.id;
    roomPlayers = [{ id: 'P1' }, { id: 'P2' }];
    roomGameId = gameId;
    leaveRoom = jest.fn(({ clientId }: { clientId: string }) => {
      roomPlayers = roomPlayers.filter((player) => player.id !== clientId);
      return { room: { players: roomPlayers, gameId: roomGameId } };
    });
    const rooms = {
      getById: () => ({ players: roomPlayers, gameId: roomGameId }),
      leave: leaveRoom,
      toView: () => ({}),
    };
    gateway = new RoomsGateway(
      { get: () => secret } as never,
      rooms as never,
      {} as never,
      gameService,
    );
    const namespace = socketServer.of('/ws');
    gateway.server = namespace as unknown as Server;
    namespace.on('connection', (client) => {
      gateway.handleConnection(client);
      client.on('disconnect', () => gateway.handleDisconnect(client));
      client.on('room.sync.request', (payload: unknown) => {
        gateway.synchronizeRoom(client, payload);
      });
      client.on('room.action.submit', (payload: unknown) => {
        void gateway.submitAction(client, payload);
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('No test server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}/ws`;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    clients.forEach((client) => client.disconnect());
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  });

  it('sends a full authoritative snapshot to a current member', async () => {
    const client = await connectAs('P1');
    const snapshot = waitForEvent(client, 'room.sync.snapshot');
    client.emit('room.sync.request', { version: 1 });

    await expect(snapshot).resolves.toMatchObject({
      version: 1,
      seq: 0,
      state: { id: gameId, players: ['P1', 'P2'] },
    });
    client.disconnect();
  });

  it('broadcasts one Accepted Action result with the full Authoritative state', async () => {
    const actionLog = jest.spyOn(console, 'info').mockImplementation();
    const game = gameService.get(gameId);
    const activePlayer = game.state.turn.activePlayer;
    const submittingClient = await connectAs(activePlayer);
    const observingClient = await connectAs(
      activePlayer === 'P1' ? 'P2' : 'P1',
    );
    const actionId = '550e8400-e29b-41d4-a716-446655440010';
    const acceptedForSender = waitForEvent(
      submittingClient,
      'room.action.accepted',
    );
    const acceptedForObserver = waitForEvent(
      observingClient,
      'room.action.accepted',
    );

    const submission = {
      version: 1,
      actionId,
      baseSeq: 0,
      action: {
        kind: 'DISCARD_FROM_HAND',
        cardId: game.state.byId[activePlayer]!.hand.cards[0]!.id,
        pileIndex: 0,
      },
    };
    submittingClient.emit('room.action.submit', submission);

    await expect(acceptedForSender).resolves.toMatchObject({
      version: 1,
      actionId,
      seq: 1,
      state: { turn: { number: 2 } },
    });
    await expect(acceptedForObserver).resolves.toMatchObject({
      actionId,
      seq: 1,
    });
    expect(JSON.parse(actionLog.mock.calls[0]![0] as string)).toEqual({
      roomId: 'room-1',
      playerId: activePlayer,
      actionId,
      seq: 1,
      outcome: 'accepted',
    });

    let duplicateBroadcast = false;
    observingClient.on('room.action.accepted', () => {
      duplicateBroadcast = true;
    });
    const duplicateForSender = waitForEvent(
      submittingClient,
      'room.action.accepted',
    );
    submittingClient.emit('room.action.submit', submission);
    await expect(duplicateForSender).resolves.toMatchObject({
      actionId,
      seq: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(duplicateBroadcast).toBe(false);
    expect(gameService.get(gameId).meta.seq).toBe(1);
    actionLog.mockRestore();
  });

  it('recovers a lost Accepted Action delivery without rebroadcasting', async () => {
    const game = gameService.get(gameId);
    const activePlayer = game.state.turn.activePlayer;
    const nextPlayer = activePlayer === 'P1' ? 'P2' : 'P1';
    const sender = await connectAs(activePlayer);
    const observer = await connectAs(nextPlayer);
    let acceptedBroadcasts = 0;
    observer.on('room.action.accepted', () => {
      acceptedBroadcasts += 1;
    });
    const actionId = '550e8400-e29b-41d4-a716-446655440017';
    const submission = {
      version: 1,
      actionId,
      baseSeq: 0,
      action: {
        kind: 'DISCARD_FROM_HAND',
        cardId: game.state.byId[activePlayer]!.hand.cards[0]!.id,
        pileIndex: 0,
      },
    };
    const processAction = gameService.processAction.bind(gameService);
    let releaseAction: (() => void) | undefined;
    const delayedProcessing = jest
      .spyOn(gameService, 'processAction')
      .mockImplementation(
        (id, input) =>
          new Promise((resolve) => {
            releaseAction = () => {
              void processAction(id, input).then(resolve);
            };
          }),
      );

    const firstBroadcast = waitForEvent(observer, 'room.action.accepted');
    sender.emit('room.action.submit', submission);
    await new Promise((resolve) => setTimeout(resolve, 0));
    sender.disconnect();
    expect(releaseAction).toBeDefined();
    releaseAction!();
    await expect(firstBroadcast).resolves.toMatchObject({
      actionId,
      seq: 1,
    });
    delayedProcessing.mockRestore();
    expect(game.state.turn.activePlayer).toBe(nextPlayer);

    const laterBroadcast = waitForEvent(observer, 'room.action.accepted');
    observer.emit('room.action.submit', {
      version: 1,
      actionId: '550e8400-e29b-41d4-a716-446655440018',
      baseSeq: 1,
      action: {
        kind: 'DISCARD_FROM_HAND',
        cardId: game.state.byId[nextPlayer]!.hand.cards[0]!.id,
        pileIndex: 0,
      },
    });
    await expect(laterBroadcast).resolves.toMatchObject({ seq: 2 });

    const reconnectedSender = await connectAs(activePlayer);
    const retryResult = waitForEvent(reconnectedSender, 'room.action.accepted');
    reconnectedSender.emit('room.action.submit', submission);

    await expect(retryResult).resolves.toMatchObject({
      actionId,
      seq: 2,
      acceptedSeq: 1,
      state: JSON.parse(JSON.stringify(game.state)),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(acceptedBroadcasts).toBe(2);
    expect(game.meta.seq).toBe(2);
  });

  it('targets a wrong-Turn rejection only to the submitting player', async () => {
    const actionLog = jest.spyOn(console, 'info').mockImplementation();
    const activePlayer = gameService.get(gameId).state.turn.activePlayer;
    const rejectedClient = await connectAs(activePlayer === 'P1' ? 'P2' : 'P1');
    const rejectedPlayer = activePlayer === 'P1' ? 'P2' : 'P1';
    const otherClient = await connectAs(activePlayer);
    const rejected = waitForEvent(rejectedClient, 'room.action.rejected');
    let leakedToOther = false;
    otherClient.on('room.action.rejected', () => {
      leakedToOther = true;
    });

    const actionId = '550e8400-e29b-41d4-a716-446655440011';
    rejectedClient.emit('room.action.submit', {
      version: 1,
      actionId,
      baseSeq: 0,
      action: { kind: 'END_TURN' },
    });

    await expect(rejected).resolves.toMatchObject({
      code: 'NOT_YOUR_TURN',
      seq: 0,
    });
    expect(JSON.parse(actionLog.mock.calls[0]![0] as string)).toEqual({
      roomId: 'room-1',
      playerId: rejectedPlayer,
      actionId,
      seq: 0,
      outcome: 'rejected',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(leakedToOther).toBe(false);
    expect(gameService.get(gameId).meta.seq).toBe(0);
  });

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
  ])('delivers a %s discard rejection only to the submitting Game room client', async (_name, wild) => {
    const actionLog = jest.spyOn(console, 'info').mockImplementation();
    const game = gameService.get(gameId);
    const activePlayer = game.state.turn.activePlayer;
    game.state.byId[activePlayer]!.hand.cards = [wild];
    const stateBefore = JSON.parse(JSON.stringify(game.state));
    const sender = await connectAs(activePlayer);
    const observer = await connectAs(activePlayer === 'P1' ? 'P2' : 'P1');
    let observerReceivedResult = false;
    observer.on('room.action.rejected', () => {
      observerReceivedResult = true;
    });
    observer.on('room.action.accepted', () => {
      observerReceivedResult = true;
    });
    const actionId = '550e8400-e29b-41d4-a716-446655440023';
    const rejection = waitForEvent(sender, 'room.action.rejected');

    sender.emit('room.action.submit', {
      version: 1,
      actionId,
      baseSeq: 0,
      action: { kind: 'DISCARD_FROM_HAND', cardId: 'wild', pileIndex: 0 },
    });

    await expect(rejection).resolves.toMatchObject({
      version: 1,
      actionId,
      code: 'ILLEGAL_ACTION',
      seq: 0,
      state: stateBefore,
    });
    expect(JSON.parse(actionLog.mock.calls[0]![0] as string)).toEqual({
      roomId: 'room-1',
      playerId: activePlayer,
      actionId,
      seq: 0,
      outcome: 'rejected',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(observerReceivedResult).toBe(false);
    expect(game.meta.seq).toBe(0);
    expect(game.state.turn.activePlayer).toBe(activePlayer);
    expect(game.state).toEqual(stateBefore);
  });

  it('rejects malformed Action frames without entering the Action sequence', async () => {
    const client = await connectAs('P1');
    const failure = waitForEvent(client, 'protocol.error');
    client.emit('room.action.submit', {
      version: 1,
      actionId: 'not-a-uuid',
      baseSeq: 0,
      playerId: 'P1',
      action: { kind: 'DRAW_TO_HAND' },
    });

    await expect(failure).resolves.toMatchObject({ code: 'MALFORMED_MESSAGE' });
    expect(gameService.get(gameId).meta.seq).toBe(0);
  });

  it('rejects non-members before they join room broadcasts', async () => {
    const client = await connectAs('outsider');
    if (client.connected) await waitForEvent(client, 'disconnect');

    expect(client.connected).toBe(false);
    expect(
      socketServer
        .of('/ws')
        .adapter.rooms.get('room-1')
        ?.has(client.id ?? '') ?? false,
    ).toBe(false);
  });

  it('returns protocol failures for unsupported and malformed requests', async () => {
    const client = await connectAs('P1');
    const unsupported = waitForEvent(client, 'protocol.error');
    client.emit('room.sync.request', { version: 2 });
    await expect(unsupported).resolves.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    });

    const malformed = waitForEvent(client, 'protocol.error');
    client.emit('room.sync.request', { version: 1, roomId: 'room-2' });
    await expect(malformed).resolves.toMatchObject({
      code: 'MALFORMED_MESSAGE',
    });
    client.disconnect();
  });

  it('rechecks membership for every synchronization and Action', async () => {
    const client = await connectAs('P1');
    roomPlayers = [{ id: 'P2' }];

    const syncFailure = waitForEvent(client, 'protocol.error');
    client.emit('room.sync.request', { version: 1 });
    await expect(syncFailure).resolves.toMatchObject({ code: 'NOT_A_MEMBER' });

    const actionFailure = waitForEvent(client, 'protocol.error');
    client.emit('room.action.submit', {
      version: 1,
      actionId: '550e8400-e29b-41d4-a716-446655440020',
      baseSeq: 0,
      action: { kind: 'END_TURN' },
    });
    await expect(actionFailure).resolves.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    expect(gameService.get(gameId).meta.seq).toBe(0);
  });

  it('retains active Game room membership when a socket disconnects for recovery', async () => {
    const client = await connectAs('P1');

    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(roomPlayers).toContainEqual({ id: 'P1' });
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it('releases an open Lobby seat when its last socket disconnects', async () => {
    roomGameId = undefined;
    const client = await connectAs('P1');

    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(roomPlayers).not.toContainEqual({ id: 'P1' });
    expect(leaveRoom).toHaveBeenCalledWith({
      roomId: 'room-1',
      clientId: 'P1',
    });
  });

  it('synchronizes finished games as read-only and rejects new Actions consistently', async () => {
    const game = gameService.get(gameId);
    game.state = { ...game.state, phase: 'gameover', winner: 'P1' };
    const client = await connectAs('P1');

    const snapshot = waitForEvent(client, 'room.sync.snapshot');
    client.emit('room.sync.request', { version: 1 });
    await expect(snapshot).resolves.toMatchObject({
      seq: 0,
      state: { phase: 'gameover', winner: 'P1' },
    });

    const rejection = waitForEvent(client, 'room.action.rejected');
    client.emit('room.action.submit', {
      version: 1,
      actionId: '550e8400-e29b-41d4-a716-446655440021',
      baseSeq: 0,
      action: { kind: 'END_TURN' },
    });
    await expect(rejection).resolves.toMatchObject({ code: 'GAME_FINISHED' });

    const nextRejection = waitForEvent(client, 'room.action.rejected');
    client.emit('room.action.submit', {
      version: 1,
      actionId: '550e8400-e29b-41d4-a716-446655440022',
      baseSeq: 0,
      action: { kind: 'END_TURN' },
    });
    await expect(nextRejection).resolves.toMatchObject({
      code: 'GAME_FINISHED',
      seq: 0,
    });
    expect(game.meta.seq).toBe(0);
  });

  async function connectAs(playerId: string): Promise<ClientSocket> {
    const token = jwt.sign({ roomId: 'room-1', playerId }, secret);
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      auth: { token },
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  }

  function waitForEvent(client: ClientSocket, event: string): Promise<unknown> {
    return new Promise((resolve) => client.once(event, resolve));
  }
});
