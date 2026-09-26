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
    const rooms = { getById: () => ({ players: roomPlayers, gameId }) };
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
    const current = gameService.get(gameId).state;
    const nextState = { ...current, turn: { ...current.turn, number: 2 } };
    const update = waitForEvent(client, 'room.state');
    gateway.emitStateUpdate('room-1', { meta: { seq: 1 }, state: nextState });
    await expect(update).resolves.toMatchObject({
      version: 1,
      seq: 1,
      state: { id: gameId, turn: { number: 2 } },
    });
    client.disconnect();
  });

  it('broadcasts one Accepted Action result with the full Authoritative state', async () => {
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
  });

  it('targets a wrong-Turn rejection only to the submitting player', async () => {
    const activePlayer = gameService.get(gameId).state.turn.activePlayer;
    const rejectedClient = await connectAs(activePlayer === 'P1' ? 'P2' : 'P1');
    const otherClient = await connectAs(activePlayer);
    const rejected = waitForEvent(rejectedClient, 'room.action.rejected');
    let leakedToOther = false;
    otherClient.on('room.action.rejected', () => {
      leakedToOther = true;
    });

    rejectedClient.emit('room.action.submit', {
      version: 1,
      actionId: '550e8400-e29b-41d4-a716-446655440011',
      baseSeq: 0,
      action: { kind: 'END_TURN' },
    });

    await expect(rejected).resolves.toMatchObject({
      code: 'NOT_YOUR_TURN',
      seq: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(leakedToOther).toBe(false);
    expect(gameService.get(gameId).meta.seq).toBe(0);
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
