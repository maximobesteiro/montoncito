import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { RoomsModule } from './rooms.module';
import type { RoomView } from './rooms.dto';
import type { ServerEvent, RoomChatMessage } from '../ws/events';
import { applyMove } from '@mont/core-game';
import type { SyncSnapshot, PlayerAction } from '@mont/game-room';
import { randomUUID } from 'crypto';
import type { Profile } from '../profiles/profiles.service';

type Membership = RoomView & { wsJoinToken: string; profile: Profile };

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
  const rename = (id: string, displayName: string) =>
    api().patch('/profile').set('x-client-id', id).send({ displayName });
  const profile = async (id: string): Promise<Profile> =>
    (await api().get('/profile').set('x-client-id', id).expect(200))
      .body as Profile;

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

  it('replays the guest-scoped destination after it becomes full, private and started, using the current profile', async () => {
    const target = (await casual('host')).body as Membership;
    const operationId = randomUUID();
    const entered = (await casual('guest').send({ operationId }).expect(201))
      .body as Membership;
    await patch(target, { visibility: 'private' });
    const privateRecovery = (
      await casual('guest').send({ operationId }).expect(201)
    ).body as Membership;
    expect(privateRecovery.id).toBe(target.id);
    expect(privateRecovery.visibility).toBe('private');
    expect(privateRecovery.players).toHaveLength(2);
    await rename('guest', 'Current name').expect(200);
    await ready(target, 'guest').expect(201);
    await api()
      .post(`/rooms/${target.id}/start`)
      .set('x-client-id', 'host')
      .expect(201);
    const recovered = (await casual('guest').send({ operationId }).expect(201))
      .body as Membership;
    expect(recovered.id).toBe(entered.id);
    expect(recovered.status).toBe('in_progress');
    expect(recovered.profile.displayName).toBe('Current name');
    await connect(recovered.wsJoinToken);
    const fresh = (
      await casual('guest').send({ operationId: randomUUID() }).expect(201)
    ).body as Membership;
    expect(fresh.id).not.toBe(target.id);
    const other = (await casual('other').send({ operationId }).expect(201))
      .body as Membership;
    expect(other.id).toBe(fresh.id);
  });

  it('suffixes case-insensitive conflicts using the first available name and returns the confirmed profile', async () => {
    await api()
      .patch('/profile')
      .set('x-client-id', 'host')
      .send({ displayName: 'alex' });
    await api()
      .patch('/profile')
      .set('x-client-id', 'other')
      .send({ displayName: 'ALEX_2' });
    await api()
      .patch('/profile')
      .set('x-client-id', 'guest')
      .send({ displayName: '  Alex  ' });
    const room = (await casual('host')).body as Membership;
    await patch(room, { maxPlayers: 4 });
    await join(room, 'other');
    const before = (await api().get('/profile').set('x-client-id', 'guest'))
      .body as Profile;
    const entered = (await casual('guest').expect(201)).body as Membership;
    expect(entered.id).toBe(room.id);
    expect(entered.profile).toMatchObject({
      displayName: 'Alex_3',
      generation: before.generation,
      revision: before.revision + 1,
    });
    expect(entered.players.find((p) => p.id === 'guest')?.displayName).toBe(
      'Alex_3',
    );
    expect(
      (await api().get('/profile').set('x-client-id', 'guest')).body,
    ).toMatchObject(entered.profile);
  });

  it('requires a fresh operation after departure even if the guest later rejoins the same Lobby', async () => {
    const target = (await casual('host')).body as Membership;
    const operationId = randomUUID();
    await casual('guest').send({ operationId }).expect(201);
    await api()
      .post(`/rooms/${target.id}/leave`)
      .set('x-client-id', 'guest')
      .expect(201);
    await join(target, 'guest').expect(201);
    await casual('guest')
      .send({ operationId })
      .expect(409)
      .expect(({ body }) => {
        expect((body as { code: string }).code).toBe(
          'CASUAL_DESTINATION_UNAVAILABLE',
        );
      });
    expect(
      (await casual('guest').send({ operationId: randomUUID() }).expect(201))
        .body as Membership,
    ).toMatchObject({ id: target.id });
  });

  it('concurrent duplicate entry suffixes once, broadcasts once per affected Lobby, and preserves readiness on replay', async () => {
    await rename('host', 'Alex');
    await rename('guest', 'Alex');
    const privateLobby = (await create('guest')).body as Membership;
    const privateSocket = await connect(privateLobby.wsJoinToken);
    const target = (await casual('host')).body as Membership;
    const hostSocket = await connect(target.wsJoinToken);
    const updates: ServerEvent[] = [];
    const privateUpdates: ServerEvent[] = [];
    hostSocket.on('event', (event: ServerEvent) => updates.push(event));
    privateSocket.on('event', (event: ServerEvent) =>
      privateUpdates.push(event),
    );
    const before = await profile('guest');
    const operationId = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        casual('guest').send({ operationId }).expect(201),
      ),
    );
    expect(
      new Set(responses.map((response) => (response.body as Membership).id)),
    ).toEqual(new Set([target.id]));
    expect(await profile('guest')).toMatchObject({
      displayName: 'Alex_2',
      revision: before.revision + 1,
    });
    await ready(target, 'guest');
    const recovered = (await casual('guest').send({ operationId }).expect(201))
      .body as Membership;
    expect(
      recovered.players.filter((player) => player.id === 'guest'),
    ).toHaveLength(1);
    expect(
      recovered.players.find((player) => player.id === 'guest')?.isReady,
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Ready itself emits one update. Entry must emit exactly one more.
    expect(
      updates.filter((event) => event.type === 'ROOM_UPDATED'),
    ).toHaveLength(2);
    expect(
      privateUpdates.filter((event) => event.type === 'ROOM_UPDATED'),
    ).toHaveLength(1);
  });

  it('retains deleted fallback destinations and requires explicit fresh entry without creating a replacement on replay', async () => {
    const operationId = randomUUID();
    const responses = await Promise.all([
      casual('guest').send({ operationId }),
      casual('guest').send({ operationId }),
    ]);
    const target = responses[0].body as Membership;
    expect((responses[1].body as Membership).id).toBe(target.id);
    expect(
      (await api().get('/rooms')).body as { items: RoomView[] },
    ).toMatchObject({ items: [expect.objectContaining({ id: target.id })] });
    await api()
      .post(`/rooms/${target.id}/leave`)
      .set('x-client-id', 'guest')
      .expect(201);
    await casual('guest')
      .send({ operationId })
      .expect(409)
      .expect(({ body }) =>
        expect((body as { code: string }).code).toBe(
          'CASUAL_DESTINATION_UNAVAILABLE',
        ),
      );
    expect(
      (await api().get('/rooms')).body as { items: RoomView[] },
    ).toMatchObject({ items: [] });
    const fresh = (
      await casual('guest').send({ operationId: randomUUID() }).expect(201)
    ).body as Membership;
    expect(fresh.id).not.toBe(target.id);
  });

  it('checks profile generation before replay and rejects invalid operation identities without admission', async () => {
    const operationId = randomUUID();
    const target = (await casual('guest').send({ operationId }))
      .body as Membership;
    await casual('guest')
      .set('x-profile-generation', 'retired-generation')
      .send({ operationId })
      .expect(409)
      .expect(({ body }) =>
        expect((body as { code: string }).code).toBe(
          'STALE_PROFILE_GENERATION',
        ),
      );
    await casual('other').send({ operationId: 'invalid' }).expect(400);
    expect((await read(target)).players).toHaveLength(1);
    expect(
      (
        await casual('guest')
          .set('x-profile-generation', target.profile.generation)
          .send({ operationId })
          .expect(201)
      ).body as Membership,
    ).toMatchObject({ id: target.id });
  });

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

  it.each([
    ['Alex_2', 'Alex_2_2'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcd_2'],
  ])(
    'treats %s as the literal base within the 32-character limit',
    async (base, expected) => {
      await rename('host', base.toLowerCase());
      await rename('guest', base);
      const target = (await casual('host')).body as Membership;
      const entered = (await casual('guest').expect(201)).body as Membership;
      expect(entered.id).toBe(target.id);
      expect(entered.profile.displayName).toBe(expected);
      expect(entered.profile.displayName.length).toBeLessThanOrEqual(32);
    },
  );

  it('recomputes base truncation when suffixes grow to two digits', async () => {
    const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
    await rename('host', base.toLowerCase());
    await rename('guest', base);
    const target = (await casual('host')).body as Membership;
    for (let number = 2; number <= 9; number++) {
      const id = `collision-${number}`;
      await rename(id, `ABCDEFGHIJKLMNOPQRSTUVWXYZabcd_${number}`);
      const privateRoom = (await create(id)).body as Membership;
      await join(privateRoom, 'guest').expect(201);
    }
    const entered = (await casual('guest').expect(201)).body as Membership;
    expect(entered.id).toBe(target.id);
    expect(entered.profile.displayName).toBe(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabc_10',
    );
  });

  it('checks all joined private Lobbies, broadcasts each changed roster once and preserves their readiness and membership', async () => {
    await rename('host', 'alex');
    await rename('guest', 'Alex');
    await rename('other', 'ALEX_2');
    await rename('next', 'alex_3');
    const target = (await casual('host')).body as Membership;
    const first = (await create('other')).body as Membership;
    const second = (await create('next')).body as Membership;
    await join(first, 'guest');
    await join(second, 'guest');
    await ready(first, 'guest');
    await ready(second, 'guest');
    await ready(target, 'host');
    const updates: RoomView[] = [];
    for (const room of [target, first, second]) {
      const socket = await connect(room.wsJoinToken);
      socket.on('event', (event: ServerEvent) => {
        if (event.type === 'ROOM_UPDATED') updates.push(event.room);
      });
    }
    const entered = (await casual('guest').expect(201)).body as Membership;
    expect(entered.id).toBe(target.id);
    expect(entered.profile.displayName).toBe('Alex_4');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates.map((room) => room.id).sort()).toEqual(
      [target.id, first.id, second.id].sort(),
    );
    for (const room of [first, second]) {
      const view = await read(room);
      expect(view.ownerId).toBe(room.ownerId);
      expect(view.players).toHaveLength(2);
      expect(view.players.find((p) => p.id === 'guest')).toMatchObject({
        displayName: 'Alex_4',
        isReady: true,
        isOwner: false,
      });
    }
    expect(entered.players.every((p) => !p.isReady)).toBe(true);
    const beforeRecovery = await profile('guest');
    await ready(target, 'guest');
    await new Promise((resolve) => setTimeout(resolve, 50));
    updates.length = 0;
    const recovered = (await casual('guest').expect(201)).body as Membership;
    expect(recovered.profile).toMatchObject(beforeRecovery);
    expect(recovered.players.find((p) => p.id === 'guest')?.isReady).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates).toHaveLength(0);
  });

  it('rejects a stale generation without partially suffixing, admitting or broadcasting', async () => {
    await rename('host', 'alex');
    await rename('guest', 'Alex');
    const target = (await casual('host')).body as Membership;
    const socket = await connect(target.wsJoinToken);
    const updates: RoomView[] = [];
    socket.on('event', (event: ServerEvent) => {
      if (event.type === 'ROOM_UPDATED') updates.push(event.room);
    });
    const before = await profile('guest');
    await casual('guest')
      .set('x-profile-generation', 'old-generation')
      .expect(409);
    expect(await profile('guest')).toEqual(before);
    expect((await read(target)).players).toEqual(target.players);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates).toHaveLength(0);
  });

  it('serializes conflicting admissions and last-seat selection without duplicate names or partial profile changes', async () => {
    await rename('host', 'Alex');
    const target = (await casual('host')).body as Membership;
    await patch(target, { maxPlayers: 4 });
    const ids = ['guest', 'other', 'next', 'last'];
    for (const id of ids) await rename(id, 'Alex');
    const before = await Promise.all(ids.map(profile));
    const results = await Promise.all(ids.map((id) => casual(id).expect(201)));
    const entered = results.map((r) => r.body as Membership);
    const selected = entered.filter((r) => r.id === target.id);
    expect(selected).toHaveLength(3);
    expect(selected.map((r) => r.profile.displayName).sort()).toEqual([
      'Alex_2',
      'Alex_3',
      'Alex_4',
    ]);
    const roster = (await read(target)).players;
    expect(roster).toHaveLength(4);
    expect(new Set(roster.map((p) => p.displayName.toLowerCase())).size).toBe(
      4,
    );
    for (const [index, result] of entered.entries()) {
      expect(await profile(ids[index])).toMatchObject(result.profile);
      expect(result.profile.revision).toBe(
        before[index].revision + (result.id === target.id ? 1 : 0),
      );
      if (result.id !== target.id) {
        expect(result.profile.displayName).toBe('Alex');
        expect((await read(result)).players).toHaveLength(1);
      }
    }
  });

  it('preserves captured match names, state and stored chat when Casual Game suffixes the shared preference', async () => {
    await rename('guest', 'Alex');
    await rename('other', 'alex');
    const match = (await create('host')).body as Membership;
    const joined = (await join(match, 'guest')).body as Membership;
    const socket = await connect(joined.wsJoinToken);
    const chat = (text: string) =>
      new Promise<RoomChatMessage>((resolve) => {
        const listener = (event: ServerEvent) => {
          if (event.type !== 'CHAT_MESSAGE') return;
          socket.off('event', listener);
          resolve(event);
        };
        socket.on('event', listener);
        socket.emit('chat', { text });
      });
    expect((await chat('before')).playerName).toBe('Alex');
    await ready(match, 'guest');
    await api()
      .post(`/rooms/${match.id}/start`)
      .set('x-client-id', 'host')
      .expect(201);
    const sync = () =>
      new Promise<SyncSnapshot>((resolve) => {
        socket.once('room.sync.snapshot', resolve);
        socket.emit('room.sync.request', { version: 1 });
      });
    const before = await sync();
    const target = (await casual('other')).body as Membership;
    const entered = (await casual('guest').expect(201)).body as Membership;
    expect(entered.id).toBe(target.id);
    expect(entered.profile.displayName).toBe('Alex_2');
    expect(await sync()).toEqual(before);
    expect(before.state.byId.guest.name).toBe('Alex');
    expect((await chat('after')).playerName).toBe('Alex');
    const history = new Promise<{ messages: RoomChatMessage[] }>((resolve) =>
      socket.once('chat.history', resolve),
    );
    socket.emit('chat.history.request', { version: 1 });
    expect((await history).messages.map((m) => m.playerName)).toEqual([
      'Alex',
      'Alex',
    ]);
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
