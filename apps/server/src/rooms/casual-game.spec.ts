import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { RoomsModule } from './rooms.module';
import type { RoomView } from './rooms.dto';
import type { ServerEvent } from '../ws/events';
import { applyMove } from '@mont/core-game';
import type { SyncSnapshot, PlayerAction } from '@mont/game-room';
import { randomUUID } from 'crypto';
import type { Profile } from '../profiles/profiles.service';

type Membership = RoomView & { wsJoinToken: string };

describe('Casual Game through REST and WebSocket', () => {
  let app: INestApplication;
  const sockets: Socket[] = [];
  const api = () => request(app.getHttpServer() as Express);
  const casual = (id: string) =>
    api().post('/rooms/casual').set('x-client-id', id);
  const create = (id: string) => api().post('/rooms').set('x-client-id', id);
  const read = async (room: RoomView): Promise<RoomView> =>
    (await api().get(`/rooms/${room.id}`).expect(200)).body as RoomView;
  const patch = (room: RoomView, body: object) =>
    api()
      .patch(`/rooms/${room.id}`)
      .set('x-client-id', room.ownerId)
      .send(body);
  const join = (room: RoomView, id: string) =>
    api().post(`/rooms/${room.id}/join`).set('x-client-id', id);
  const ready = (room: RoomView, id: string) =>
    api()
      .post(`/rooms/${room.id}/ready`)
      .set('x-client-id', id)
      .send({ ready: true });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        RoomsModule,
      ],
    })
      .overrideProvider('ROOM_DEFAULTS')
      .useValue({
        defaultVisibility: 'private',
        defaultMaxPlayers: 2,
        hardMaxPlayers: 4,
        slugLength: 10,
      })
      .compile();
    app = module.createNestApplication();
    process.env.WS_SECRET = 'casual-test-secret';
    await app.listen(0, '127.0.0.1');
    for (const id of ['host', 'guest', 'other', 'next', 'last'])
      await api()
        .post('/profile')
        .set('x-client-id', id)
        .send({ displayName: id });
  });
  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    await app.close();
  });

  async function connect(token: string) {
    const socket = io(`${await app.getUrl()}/ws`, {
      auth: { token },
      transports: ['websocket'],
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    return socket;
  }

  it('creates a public default Lobby with host membership and a working socket token despite private creation defaults', async () => {
    const room = (await casual('guest').expect(201)).body as Membership;
    expect(room).toMatchObject({
      visibility: 'public',
      status: 'open',
      maxPlayers: 2,
      ownerId: 'guest',
      gameConfig: { discardPiles: 3 },
      players: [
        { id: 'guest', displayName: 'guest', isOwner: true, isReady: false },
      ],
    });
    expect(await read(room)).toMatchObject({
      id: room.id,
      visibility: 'public',
    });
    await connect(room.wsJoinToken);
  });

  it('joins the oldest eligible Lobby with custom settings, ignores private membership, and broadcasts a readiness-reset roster', async () => {
    const privateRoom = (await create('guest')).body as Membership;
    const oldest = (await create('host')).body as Membership;
    await patch(oldest, {
      visibility: 'public',
      maxPlayers: 4,
      gameConfig: { discardPiles: 4 },
    });
    const newer = (await create('other')).body as Membership;
    await patch(newer, { visibility: 'public' });
    await join(oldest, 'next');
    await ready(oldest, 'next');
    const socket = await connect(oldest.wsJoinToken);
    const update = new Promise<RoomView>((resolve) =>
      socket.on('event', (event: ServerEvent) => {
        if (event.type === 'ROOM_UPDATED') resolve(event.room);
      }),
    );
    const response = await casual('guest').expect(201);
    expect(response.body).toMatchObject({
      id: oldest.id,
      maxPlayers: 4,
      gameConfig: { discardPiles: 4 },
      status: 'open',
    });
    const roster = await update;
    expect(roster.players.map((player) => player.id)).toEqual([
      'host',
      'next',
      'guest',
    ]);
    expect(roster.players.every((player) => !player.isReady)).toBe(true);
    expect((await read(privateRoom)).players).toHaveLength(1);
    expect((await read(newer)).players).toHaveLength(1);
  });

  it('recovers the oldest public membership even when full, preserving readiness and emitting no admission update', async () => {
    const emptySeat = (await casual('host')).body as Membership;
    await patch(emptySeat, { maxPlayers: 4 });
    const first = (await create('other')).body as Membership;
    await patch(first, { visibility: 'public' });
    await join(first, 'guest');
    const second = (await create('next')).body as Membership;
    await patch(second, { visibility: 'public' });
    await join(second, 'guest');
    await ready(first, 'guest');
    const socket = await connect(first.wsJoinToken);
    const updates: RoomView[] = [];
    socket.on('event', (event: ServerEvent) => {
      if (event.type === 'ROOM_UPDATED') updates.push(event.room);
    });
    const response = (await casual('guest').expect(201)).body as Membership;
    expect(response.id).toBe(first.id);
    expect(
      response.players.find((player: { id: string }) => player.id === 'guest'),
    ).toMatchObject({ displayName: 'guest', isReady: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates).toHaveLength(0);
    expect((await read(emptySeat)).players).toHaveLength(1);
  });

  it('excludes full and started rooms and serializes concurrent last-seat admissions', async () => {
    const full = (await casual('host')).body as Membership;
    await join(full, 'guest');
    const started = (await create('other')).body as Membership;
    await patch(started, { visibility: 'public', maxPlayers: 4 });
    await join(started, 'next');
    await ready(started, 'next');
    await api()
      .post(`/rooms/${started.id}/start`)
      .set('x-client-id', 'other')
      .expect(201);
    const available = (await create('last')).body as Membership;
    await patch(available, { visibility: 'public' });
    for (const id of ['a', 'b'])
      await api()
        .post('/profile')
        .set('x-client-id', id)
        .send({ displayName: id });
    const results = await Promise.all([casual('a'), casual('b')]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    const destinations = results.map((result) => result.body as Membership);
    expect(
      destinations.filter((result) => result.id === available.id),
    ).toHaveLength(1);
    expect(new Set(destinations.map((result) => result.id)).size).toBe(2);
    expect((await read(available)).players).toHaveLength(2);
    expect((await read(full)).players).toHaveLength(2);
    expect((await read(started)).players).toHaveLength(2);
  });

  it('admits during disconnection grace and treats an explicit departure as new admission', async () => {
    const room = (await casual('host')).body as Membership;
    const socket = await connect(room.wsJoinToken);
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const joined = (await casual('guest').expect(201)).body as Membership;
    expect(joined.id).toBe(room.id);
    await connect(joined.wsJoinToken);
    await api()
      .post(`/rooms/${room.id}/leave`)
      .set('x-client-id', 'guest')
      .expect(201);
    await ready(room, 'host');
    const rejoined = (await casual('guest').expect(201)).body as Membership;
    expect(rejoined.id).toBe(room.id);
    expect(
      rejoined.players.every((player: { isReady: boolean }) => !player.isReady),
    ).toBe(true);
  });

  it('rejects stale profile generations before selecting or creating a Lobby and permits initialized recovery', async () => {
    const rejected = await casual('guest')
      .set('x-profile-generation', 'old-generation')
      .expect(409);
    expect(rejected.body as unknown).toMatchObject({
      code: 'STALE_PROFILE_GENERATION',
    });
    expect((await api().get('/rooms')).body as unknown).toMatchObject({
      total: 0,
    });
    const profile = (await api().post('/profile').set('x-client-id', 'guest'))
      .body as Profile;
    await casual('guest')
      .set('x-profile-generation', profile.generation)
      .expect(201);
  });

  it('excludes a finished match with vacant seats after playing through the real WebSocket protocol', async () => {
    const room = (await casual('host')).body as Membership;
    await patch(room, { maxPlayers: 4 });
    const guest = (await join(room, 'guest')).body as Membership;
    await ready(room, 'guest');
    await api()
      .post(`/rooms/${room.id}/start`)
      .set('x-client-id', 'host')
      .expect(201);
    const clients = {
      host: await connect(room.wsJoinToken),
      guest: await connect(guest.wsJoinToken),
    };
    let snapshot = await new Promise<SyncSnapshot>((resolve) => {
      clients.host.once('room.sync.snapshot', resolve);
      clients.host.emit('room.sync.request', { version: 1 });
    });
    const log = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      for (
        let count = 0;
        snapshot.state.phase !== 'gameover' && count < 3000;
        count++
      ) {
        const state = snapshot.state;
        const player = state.byId[state.turn.activePlayer];
        const targets = [
          ...state.center.buildPiles.map((pile) => pile.id),
          'new',
        ];
        const candidates: PlayerAction[] = [
          ...targets.map((target) => ({
            kind: 'PLAY_STOCK_TO_BUILD' as const,
            target,
          })),
          ...player.discards.flatMap((_, pileIndex) =>
            targets.map((target) => ({
              kind: 'PLAY_DISCARD_TO_BUILD' as const,
              pileIndex,
              target,
            })),
          ),
          ...player.hand.cards.flatMap((card) =>
            targets.map((target) => ({
              kind: 'PLAY_HAND_TO_BUILD' as const,
              cardId: card.id,
              target,
            })),
          ),
          ...player.hand.cards.map((card) => ({
            kind: 'DISCARD_FROM_HAND' as const,
            cardId: card.id,
            pileIndex: 0,
          })),
          { kind: 'END_TURN' },
        ];
        const action = candidates.find(
          (candidate) => applyMove(state, candidate).accepted,
        );
        expect(action).toBeDefined();
        const socket = clients[state.turn.activePlayer as keyof typeof clients];
        snapshot = await new Promise<SyncSnapshot>((resolve) => {
          socket.once('room.action.accepted', resolve);
          socket.emit('room.action.submit', {
            version: 1,
            actionId: randomUUID(),
            baseSeq: snapshot.seq,
            action,
          });
        });
      }
      expect(snapshot.state.phase).toBe('gameover');
      const selected = (await casual('other').expect(201)).body as Membership;
      expect(selected.id).not.toBe(room.id);
      expect((await read(room)).players).toHaveLength(2);
    } finally {
      log.mockRestore();
    }
  }, 30_000);
});
