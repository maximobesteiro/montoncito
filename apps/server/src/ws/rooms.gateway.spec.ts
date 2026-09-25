import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { createStartedGame } from '@mont/core-game';
import { RoomsGateway } from './rooms.gateway';

describe('Game room synchronization over Socket.IO', () => {
  const secret = 'test-ws-secret';
  let httpServer: ReturnType<typeof createServer>;
  let socketServer: Server;
  let gateway: RoomsGateway;
  let baseUrl: string;
  let clients: ClientSocket[];

  beforeEach(async () => {
    httpServer = createServer();
    socketServer = new Server(httpServer, { cors: { origin: '*' } });
    clients = [];
    const state = createStartedGame({
      players: ['P1', 'P2'],
      seed: 1,
      id: 'game-1',
    });
    const rooms = {
      getById: () => ({ players: [{ id: 'P1' }, { id: 'P2' }], gameId: 'game-1' }),
    };
    const games = { get: () => ({ meta: { seq: 0 }, state }) };
    gateway = new RoomsGateway(
      { get: () => secret } as never,
      rooms as never,
      {} as never,
      games as never,
    );
    const namespace = socketServer.of('/ws');
    gateway.server = namespace as unknown as Server;
    namespace.on('connection', (client) => {
      gateway.handleConnection(client);
      client.on('room.sync.request', (payload: unknown) => {
        gateway.synchronizeRoom(client, payload);
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
    const state = createStartedGame({
      players: ['P1', 'P2'],
      seed: 1,
      id: 'game-1',
    });
    const snapshot = waitForEvent(client, 'room.sync.snapshot');
    client.emit('room.sync.request', { version: 1 });

    await expect(snapshot).resolves.toMatchObject({
      version: 1,
      seq: 0,
      state: { id: 'game-1', players: ['P1', 'P2'] },
    });
    const nextState = { ...state, turn: { ...state.turn, number: 2 } };
    const update = waitForEvent(client, 'room.state');
    gateway.emitStateUpdate('room-1', { meta: { seq: 1 }, state: nextState });
    await expect(update).resolves.toMatchObject({
      version: 1,
      seq: 1,
      state: { id: 'game-1', turn: { number: 2 } },
    });
    client.disconnect();
  });

  it('rejects synchronization without returning state to a non-member', async () => {
    const client = await connectAs('outsider');
    const failure = waitForEvent(client, 'protocol.error');
    client.emit('room.sync.request', { version: 1 });

    await expect(failure).resolves.toMatchObject({
      version: 1,
      code: 'NOT_A_MEMBER',
    });
    client.disconnect();
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
    await expect(malformed).resolves.toMatchObject({ code: 'MALFORMED_MESSAGE' });
    client.disconnect();
  });

  async function connectAs(playerId: string): Promise<ClientSocket> {
    const token = jwt.sign({ roomId: 'room-1', playerId }, secret);
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      auth: { token },
    });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    clients.push(client);
    return client;
  }

  function waitForEvent(client: ClientSocket, event: string): Promise<unknown> {
    return new Promise((resolve) => client.once(event, resolve));
  }
});
