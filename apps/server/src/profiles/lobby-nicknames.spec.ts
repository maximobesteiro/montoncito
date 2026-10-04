import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { RoomsModule } from '../rooms/rooms.module';
import type { RoomView } from '../rooms/rooms.dto';
import type { ServerEvent, RoomChatMessage } from '../ws/events';
import type { Profile } from './profiles.service';
import type { SyncSnapshot } from '@mont/game-room';

type Membership = RoomView & { wsJoinToken: string };

describe('Lobby nicknames through REST and WebSocket', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];
  const api = () => request(app.getHttpServer() as Express);
  const rename = (id: string, displayName: string) =>
    api().patch('/profile').set('x-client-id', id).send({ displayName });
  const create = (id: string) => api().post('/rooms').set('x-client-id', id);
  const join = (roomId: string, id: string) =>
    api().post(`/rooms/${roomId}/join`).set('x-client-id', id);

  beforeEach(async () => {
    process.env.WS_SECRET = 'nickname-test-secret';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        RoomsModule,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    await app?.close();
  });

  async function connect(token: string) {
    const socket = io(`${url}/ws`, {
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

  it('accepts only one simultaneous conflicting rename and delivers the confirmed roster without resetting ready', async () => {
    await rename('host', 'Host');
    await rename('guest', 'Guest');
    const room = (await create('host')).body as Membership;
    const joined = (await join(room.id, 'guest')).body as Membership;
    await api()
      .post(`/rooms/${room.id}/ready`)
      .set('x-client-id', 'guest')
      .send({ ready: true });
    const socket = await connect(joined.wsJoinToken);
    const updates: RoomView[] = [];
    socket.on('event', (event: ServerEvent) => {
      if (event.type === 'ROOM_UPDATED') updates.push(event.room);
    });
    const results = await Promise.all([
      rename('host', ' Moki '),
      rename('guest', 'moki'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates).toHaveLength(1);
    expect(
      updates[0].players.find((player) => player.id === 'guest')?.isReady,
    ).toBe(true);
    expect(updates[0].ownerId).toBe('host');
    const names = updates[0].players.map((player) =>
      player.displayName.toLowerCase(),
    );
    expect(new Set(names).size).toBe(2);
  });

  it('admits only one of concurrent case-insensitive duplicates, preserves repeated joins and permits names in unrelated Lobbies', async () => {
    await rename('host', 'Host');
    await rename('a', 'Moki');
    await rename('b', ' moki ');
    const room = (await create('host')).body as Membership;
    const results = await Promise.all([join(room.id, 'a'), join(room.id, 'b')]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const admitted = results[0].status === 201 ? 'a' : 'b';
    const rejected = admitted === 'a' ? 'b' : 'a';
    await api()
      .post(`/rooms/${room.id}/ready`)
      .set('x-client-id', admitted)
      .send({ ready: true });
    const repeated = await join(room.id, admitted);
    expect(repeated.status).toBe(201);
    expect(
      (repeated.body as Membership).players.find(
        (player) => player.id === admitted,
      )?.isReady,
    ).toBe(true);
    expect((await create(rejected)).status).toBe(201);
    const sameSlug = await api()
      .get(`/rooms/by-slug/${room.slug}`)
      .set('x-client-id', rejected);
    expect((sameSlug.body as RoomView).id).toBe(room.id);
    expect((await join((sameSlug.body as RoomView).id, rejected)).status).toBe(
      409,
    );
  });

  it('rejects the whole shared rename when another joined Lobby conflicts, filters suggestions, and broadcasts to every Lobby on success', async () => {
    await rename('shared', 'Shared');
    await rename('a', 'Boppo');
    await rename('b', 'Moki');
    const first = (await create('a')).body as Membership;
    const second = (await create('b')).body as Membership;
    const membership = (await join(first.id, 'shared')).body as Membership;
    await join(second.id, 'shared');
    const firstSocket = await connect(membership.wsJoinToken);
    const secondSocket = await connect(second.wsJoinToken);
    const updates: RoomView[] = [];
    for (const socket of [firstSocket, secondSocket])
      socket.on('event', (event: ServerEvent) => {
        if (event.type === 'ROOM_UPDATED') updates.push(event.room);
      });
    const rejected = await rename('shared', 'moki');
    expect(rejected.status).toBe(409);
    expect((rejected.body as { message: string }).message).toContain('Lobby');
    expect((rejected.body as { message: string }).message).not.toContain(
      second.id,
    );
    const profile = (await api().get('/profile').set('x-client-id', 'shared'))
      .body as Profile & { suggestions: string[] };
    expect(profile.displayName).toBe('Shared');
    expect(profile.suggestions).not.toContain('Moki');
    expect(profile.suggestions).not.toContain('Boppo');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates).toHaveLength(0);
    expect((await rename('shared', '小 Moki!')).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates.map((room) => room.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    for (const room of updates)
      expect(
        room.players.find((player) => player.id === 'shared')?.displayName,
      ).toBe('小 Moki!');
  });

  it('serializes admission against a concurrent rename so either result leaves distinct names', async () => {
    await rename('host', 'Host');
    await rename('guest', 'Moki');
    const room = (await create('host')).body as Membership;
    const results = await Promise.all([
      rename('host', 'moki'),
      join(room.id, 'guest'),
    ]);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    const view = (
      await api().get(`/rooms/by-slug/${room.slug}`).set('x-client-id', 'host')
    ).body as RoomView;
    const names = view.players.map((player) =>
      player.displayName.toLowerCase(),
    );
    expect(new Set(names).size).toBe(view.players.length);
  });

  it('keeps chat names at send time and active match state and sequence unchanged by a shared preference rename', async () => {
    await rename('host', 'Boppo');
    await rename('guest', 'Moki');
    const room = (await create('host')).body as Membership;
    await join(room.id, 'guest');
    const socket = await connect(room.wsJoinToken);
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
    expect((await chat('before')).playerName).toBe('Boppo');
    await rename('host', 'Zibble');
    expect((await chat('after')).playerName).toBe('Zibble');
    const history = new Promise<{ messages: RoomChatMessage[] }>((resolve) =>
      socket.once('chat.history', resolve),
    );
    socket.emit('chat.history.request', { version: 1 });
    expect(
      (await history).messages.map((message) => message.playerName),
    ).toEqual(['Boppo', 'Zibble']);
    await api()
      .post(`/rooms/${room.id}/ready`)
      .set('x-client-id', 'guest')
      .send({ ready: true });
    await api().post(`/rooms/${room.id}/start`).set('x-client-id', 'host');
    const sync = () =>
      new Promise<SyncSnapshot>((resolve) => {
        socket.once('room.sync.snapshot', resolve);
        socket.emit('room.sync.request', { version: 1 });
      });
    const before = await sync();
    expect((await rename('host', 'moki')).status).toBe(200);
    expect(await sync()).toEqual(before);
    expect(before.seq).toBe(0);
  });

  it('returns an empty suggestion list when all generated names are occupied across memberships', async () => {
    await rename('shared', 'My own name');
    const initial = (await api().get('/profile').set('x-client-id', 'shared'))
      .body as Profile & { suggestions: string[] };
    for (const [index, name] of initial.suggestions.entries()) {
      const id = `other-${index}`;
      await rename(id, name);
      const room = (await create(id)).body as Membership;
      expect((await join(room.id, 'shared')).status).toBe(201);
    }
    const exhausted = (await api().get('/profile').set('x-client-id', 'shared'))
      .body as Profile & { suggestions: string[] };
    expect(exhausted.suggestions).toEqual([]);
    expect((await rename('shared', 'Custom!')).status).toBe(200);
  });

  it('confirms a replacement and admission together, validating the target and every joined Lobby', async () => {
    await rename('host', 'Moki');
    await rename('other', 'Boppo');
    await rename('guest', 'moki');
    const target = (await create('host')).body as Membership;
    const existing = (await create('other')).body as Membership;
    await join(existing.id, 'guest');
    const firstSocket = await connect(existing.wsJoinToken);
    const targetSocket = await connect(target.wsJoinToken);
    const updates: RoomView[] = [];
    for (const socket of [firstSocket, targetSocket])
      socket.on('event', (event: ServerEvent) => {
        if (event.type === 'ROOM_UPDATED') updates.push(event.room);
      });
    const suggestions = await api()
      .get(`/rooms/${target.id}/nickname-suggestions`)
      .set('x-client-id', 'guest');
    expect(suggestions.status).toBe(200);
    const suggested = suggestions.body as { suggestions: string[] };
    expect(Array.isArray(suggested.suggestions)).toBe(true);
    expect(suggested.suggestions).not.toContain('Moki');
    expect(suggested.suggestions).not.toContain('Boppo');
    const replace = (displayName: string) =>
      api()
        .post(`/rooms/${target.id}/join`)
        .set('x-client-id', 'guest')
        .send({ displayName });
    expect((await replace('boppo')).status).toBe(409);
    expect((await replace('MOKI')).status).toBe(409);
    expect(
      (
        (await api().get('/profile').set('x-client-id', 'guest'))
          .body as Profile
      ).displayName,
    ).toBe('moki');
    const joined = await replace('  New name!  ');
    expect(joined.status).toBe(201);
    const confirmed = joined.body as Membership & { profile: Profile };
    expect(confirmed.profile).toMatchObject({
      clientId: 'guest',
      displayName: 'New name!',
    });
    expect(confirmed.players.filter((p) => p.id === 'guest')).toHaveLength(1);
    const existingView = (
      await api()
        .get(`/rooms/by-slug/${existing.slug}`)
        .set('x-client-id', 'guest')
    ).body as RoomView;
    expect(existingView.players).toContainEqual(
      expect.objectContaining({ id: 'guest', displayName: 'New name!' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates.map((room) => room.id).sort()).toEqual(
      [existing.id, target.id].sort(),
    );
  });

  it('rejects a taken suggestion and blocked admission without confirming the draft', async () => {
    await rename('host', 'Moki');
    await rename('guest', 'moki');
    const target = (await create('host')).body as Membership;
    const available = await api()
      .get(`/rooms/${target.id}/nickname-suggestions`)
      .set('x-client-id', 'guest');
    const suggestion = (available.body as { suggestions: string[] })
      .suggestions[0];
    await rename('host', suggestion);
    const replace = (displayName: string) =>
      api()
        .post(`/rooms/${target.id}/join`)
        .set('x-client-id', 'guest')
        .send({ displayName });
    const taken = await replace(suggestion);
    expect(taken.status).toBe(409);
    expect((taken.body as { code: string }).code).toBe('NICKNAME_CONFLICT');
    await rename('second', 'Second');
    await join(target.id, 'second');
    await api()
      .patch(`/rooms/${target.id}`)
      .set('x-client-id', 'host')
      .send({ maxPlayers: 2 });
    const full = await replace('Custom');
    expect(full.status).toBe(409);
    expect((full.body as { message: string }).message).toBe('Room is full');
    await api()
      .post(`/rooms/${target.id}/ready`)
      .set('x-client-id', 'second')
      .send({ ready: true });
    await api().post(`/rooms/${target.id}/start`).set('x-client-id', 'host');
    const started = await replace('Custom');
    expect(started.status).toBe(409);
    expect((started.body as { message: string }).message).toBe(
      'Room is not open for joining',
    );
    expect(
      (
        (await api().get('/profile').set('x-client-id', 'guest'))
          .body as Profile
      ).displayName,
    ).toBe('moki');
    const targetView = (
      await api()
        .get(`/rooms/by-slug/${target.slug}`)
        .set('x-client-id', 'host')
    ).body as RoomView;
    expect(targetView.players).not.toContainEqual(
      expect.objectContaining({ id: 'guest' }),
    );
  });
});
