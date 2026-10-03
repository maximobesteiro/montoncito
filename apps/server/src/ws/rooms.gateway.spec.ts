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
  let chatMessages: {
    id: string;
    playerId: string;
    playerName: string;
    text: string;
    timestamp: number;
  }[];
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
    chatMessages = [];
    leaveRoom = jest.fn(({ clientId }: { clientId: string }) => {
      roomPlayers = roomPlayers.filter((player) => player.id !== clientId);
      return { room: { players: roomPlayers, gameId: roomGameId } };
    });
    const rooms = {
      getById: () => ({
        id: 'room-1',
        players: roomPlayers,
        gameId: roomGameId,
        chatMessages,
      }),
      leave: leaveRoom,
      toView: () => ({}),
    };
    gateway = new RoomsGateway(
      { get: () => secret } as never,
      rooms as never,
      {
        get: (id: string) => ({ displayName: id === 'P1' ? 'Alice' : 'Bob' }),
      } as never,
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
      client.on('chat', (payload: unknown) =>
        gateway.handleChat(client, payload as { text: string }),
      );
      client.on('chat.history.request', (payload: unknown) =>
        gateway.sendChatHistory(client, payload),
      );
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
    gateway.onModuleDestroy();
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

  it.each(['turn', 'gameover'] as const)(
    'delivers chat between seated players while %s without changing the Action sequence',
    async (phase) => {
      const game = gameService.get(gameId);
      if (phase === 'gameover')
        game.state = { ...game.state, phase, winner: 'P1' };
      const sender = await connectAs('P1');
      const receiver = await connectAs('P2');
      const ownMessage = waitForChat(sender);
      const received = waitForChat(receiver);

      sender.emit('chat', { text: ' Hello from Alice ' });

      await expect(ownMessage).resolves.toMatchObject({
        type: 'CHAT_MESSAGE',
        playerId: 'P1',
        playerName: 'Alice',
        text: 'Hello from Alice',
      });
      await expect(received).resolves.toMatchObject({
        type: 'CHAT_MESSAGE',
        playerId: 'P1',
        playerName: 'Alice',
        text: 'Hello from Alice',
      });
      expect(game.meta.seq).toBe(0);
    },
  );

  it('does not broadcast chat from a player whose seat was removed', async () => {
    const sender = await connectAs('P1');
    const receiver = await connectAs('P2');
    roomPlayers = [{ id: 'P2' }];
    let received = false;
    receiver.on('event', (event: { type: string }) => {
      if (event.type === 'CHAT_MESSAGE') received = true;
    });

    sender.emit('chat', { text: 'No longer seated' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toBe(false);
  });

  it('recovers Lobby chat after start and after a Game room reconnect', async () => {
    roomGameId = undefined;
    const sender = await connectAs('P1');
    const first = waitForChat(sender);
    sender.emit('chat', { text: 'Before the match' });
    const message = (await first) as { id: string };

    const joiningPlayer = await connectAs('P2');
    const waitingHistory = waitForEvent(joiningPlayer, 'chat.history');
    joiningPlayer.emit('chat.history.request', { version: 1 });
    await expect(waitingHistory).resolves.toMatchObject({
      messages: [{ id: message.id, text: 'Before the match' }],
    });

    roomGameId = gameId;
    joiningPlayer.disconnect();
    const reconnected = await connectAs('P2');
    const gameHistory = waitForEvent(reconnected, 'chat.history');
    reconnected.emit('chat.history.request', { version: 1 });
    await expect(gameHistory).resolves.toMatchObject({
      messages: [{ id: message.id, text: 'Before the match' }],
    });
    gameService.get(gameId).state = {
      ...gameService.get(gameId).state,
      phase: 'gameover',
      winner: 'P1',
    };
    const finishedHistory = waitForEvent(reconnected, 'chat.history');
    reconnected.emit('chat.history.request', { version: 1 });
    await expect(finishedHistory).resolves.toMatchObject({
      messages: [{ id: message.id }],
    });
  });

  it('keeps an open Lobby member and chat across a brief socket refresh', async () => {
    roomGameId = undefined;
    const sender = await connectAs('P1');
    const delivered = waitForChat(sender);
    sender.emit('chat', { text: 'Before refresh' });
    await delivered;
    sender.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const refreshed = await connectAs('P1');
    const history = waitForEvent(refreshed, 'chat.history');
    refreshed.emit('chat.history.request', { version: 1 });
    await expect(history).resolves.toMatchObject({
      messages: [{ text: 'Before refresh' }],
    });
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it('recovers Lobby history after a longer interruption while another member remains online', async () => {
    roomGameId = undefined;
    const sender = await connectAs('P1');
    const other = await connectAs('P2');
    const delivered = waitForChat(sender);
    sender.emit('chat', { text: 'Still here' });
    await delivered;
    sender.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 5100));
    expect(other.connected).toBe(true);
    expect(leaveRoom).not.toHaveBeenCalled();

    const reconnected = await connectAs('P1');
    const history = waitForEvent(reconnected, 'chat.history');
    reconnected.emit('chat.history.request', { version: 1 });
    await expect(history).resolves.toMatchObject({
      messages: [{ text: 'Still here' }],
    });
  }, 10000);

  it('retains only the last 100 chat messages in delivery order', async () => {
    const sender = await connectAs('P1');
    for (let index = 0; index < 105; index++) {
      const delivered = waitForChat(sender);
      sender.emit('chat', { text: `message-${index}` });
      await delivered;
    }
    const receiver = await connectAs('P2');
    const history = waitForEvent(receiver, 'chat.history');
    receiver.emit('chat.history.request', { version: 1 });
    const result = (await history) as { messages: { text: string }[] };
    expect(result.messages).toHaveLength(100);
    expect(result.messages.map(({ text }) => text)).toEqual(
      Array.from({ length: 100 }, (_, index) => `message-${index + 5}`),
    );
  });

  it('refuses history to a removed member and does not broadcast the history to other players', async () => {
    const member = await connectAs('P1');
    const other = await connectAs('P2');
    const message = waitForChat(member);
    member.emit('chat', { text: 'Private room' });
    await message;
    let leaked = false;
    other.on('chat.history', () => {
      leaked = true;
    });
    const history = waitForEvent(member, 'chat.history');
    member.emit('chat.history.request', { version: 1 });
    await expect(history).resolves.toMatchObject({
      messages: [{ text: 'Private room' }],
    });
    roomPlayers = [{ id: 'P2' }];
    const rejection = waitForEvent(member, 'protocol.error');
    member.emit('chat.history.request', { version: 1 });
    await expect(rejection).resolves.toMatchObject({ code: 'NOT_A_MEMBER' });
    expect(leaked).toBe(false);
    const outsider = await connectAs('outsider');
    if (outsider.connected) await waitForEvent(outsider, 'disconnect');
    expect(outsider.connected).toBe(false);
  });

  it('includes a message posted during history recovery once across live and history', async () => {
    const sender = await connectAs('P1');
    const receiver = await connectAs('P2');
    const earlier = waitForChat(receiver);
    sender.emit('chat', { text: 'Before request' });
    const first = (await earlier) as { id: string };
    const sendHistory = gateway.sendChatHistory.bind(gateway);
    let releaseHistory: (() => void) | undefined;
    jest
      .spyOn(gateway, 'sendChatHistory')
      .mockImplementation((client, payload) => {
        releaseHistory = () => sendHistory(client, payload);
      });
    const history = waitForEvent(receiver, 'chat.history');
    receiver.emit('chat.history.request', { version: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(releaseHistory).toBeDefined();
    const live = waitForChat(receiver);
    sender.emit('chat', { text: 'In flight' });
    const broadcast = (await live) as { id: string };
    releaseHistory!();
    await expect(history).resolves.toMatchObject({
      messages: [{ id: first.id }, { id: broadcast.id }],
    });
  });

  it('rejects unsupported chat history protocol versions', async () => {
    const client = await connectAs('P1');
    const failure = waitForEvent(client, 'protocol.error');
    client.emit('chat.history.request', { version: 2 });
    await expect(failure).resolves.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    });
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
      state: { version: 2, rulesetVersion: 1, turn: { number: 2 } },
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
  ])(
    'delivers a %s discard rejection only to the submitting Game room client',
    async (_name, wild) => {
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
    },
  );

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
    await new Promise((resolve) => setTimeout(resolve, 5100));

    expect(roomPlayers).not.toContainEqual({ id: 'P1' });
    expect(leaveRoom).toHaveBeenCalledWith({
      roomId: 'room-1',
      clientId: 'P1',
    });
  }, 10000);

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

  function waitForChat(client: ClientSocket): Promise<unknown> {
    return new Promise((resolve) => {
      const listener = (event: { type: string }) => {
        if (event.type !== 'CHAT_MESSAGE') return;
        client.off('event', listener);
        resolve(event);
      };
      client.on('event', listener);
    });
  }
});
