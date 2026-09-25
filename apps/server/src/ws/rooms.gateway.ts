import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { WsJoinClaims } from './auth';
import { assertServerEvent } from './events';
import { RoomsService } from '../rooms/rooms.service';
import { ProfilesService } from '../profiles/profiles.service';
import { randomUUID } from 'crypto';
import {
  GAME_ROOM_PROTOCOL_VERSION,
  RoomStateUpdateSchema,
  SyncRequestSchema,
  SyncSnapshotSchema,
  type ProtocolFailure,
} from '@mont/game-room';
import { GameService } from '../game/game.service';
import type { GameState } from '@mont/core-game';

type Conn = WsJoinClaims; // { roomId, playerId }

function key(roomId: string, playerId: string) {
  return `${roomId}::${playerId}`;
}

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: true, credentials: true },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private conns = new Map<string, Conn>(); // socket.id -> claims
  private byPlayer = new Map<string, Set<string>>(); // "roomId::playerId" -> Set<socket.id>

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => RoomsService))
    private readonly rooms: RoomsService,
    private readonly profiles: ProfilesService,
    private readonly games: GameService,
  ) {}

  public handleConnection(client: Socket) {
    try {
      const raw = client.handshake.auth?.token as string | undefined;
      if (!raw) throw new Error('Missing token');

      const wsSecret = this.configService.get<string>('WS_SECRET');
      if (!wsSecret) throw new Error('WS_SECRET not configured');

      const decoded = jwt.verify(raw, wsSecret) as Record<string, unknown>; // will throw if expired/bad
      const claims = WsJoinClaims.parse(decoded);
      const room = this.rooms.getById(claims.roomId);
      if (!room.players.some((player) => player.id === claims.playerId)) {
        throw new Error('Player is no longer a member of this room');
      }

      void client.join(claims.roomId);
      this.conns.set(client.id, claims);

      const k = key(claims.roomId, claims.playerId);
      if (!this.byPlayer.has(k)) this.byPlayer.set(k, new Set());
      this.byPlayer.get(k)!.add(client.id);

      // Presence broadcast - indicates player is online
      const ev = { type: 'PLAYER_JOINED', playerId: claims.playerId } as const;
      assertServerEvent(ev);
      this.server.to(claims.roomId).emit('event', ev);
    } catch {
      client.disconnect(true);
    }
  }

  public handleDisconnect(client: Socket) {
    const claims = this.conns.get(client.id);
    if (!claims) return;

    this.conns.delete(client.id);
    const k = key(claims.roomId, claims.playerId);
    const set = this.byPlayer.get(k);
    if (set) {
      set.delete(client.id);
      if (set.size === 0) {
        // Last socket disconnected - treat as leaving the room (refresh/navigation/tab close)
        this.byPlayer.delete(k);

        try {
          const result = this.rooms.leave({
            roomId: claims.roomId,
            clientId: claims.playerId,
          });

          if (!result.deleted && result.room) {
            const roomView = this.rooms.toView(result.room);
            this.emitRoomUpdated(claims.roomId, roomView);
          }
        } catch {
          // Room might be in_progress/finished or already removed; ignore.
        }
        return;
      }
    }

    // Player still has other sockets connected, just close this one
    // No need to broadcast anything
  }

  /** Broadcast fresh view (state/meta) to everyone in the room */
  public emitStateUpdate(
    roomId: string,
    payload: { meta: { seq: number }; state: GameState },
  ) {
    const ev = { type: 'STATE_UPDATE', ...payload } as const;
    assertServerEvent(ev);
    this.server.to(roomId).emit('event', ev);
    const update = RoomStateUpdateSchema.parse({
      version: GAME_ROOM_PROTOCOL_VERSION,
      seq: payload.meta.seq,
      state: payload.state,
    });
    this.server.to(roomId).emit('room.state', update);
  }

  /** Notify room members that this room has become a Game room. */
  public emitGameStarted(roomId: string) {
    const ev = { type: 'GAME_STARTED', roomId } as const;
    assertServerEvent(ev);
    this.server.to(roomId).emit('event', ev);
  }

  /** Broadcast room settings update to all players in the room */
  public emitRoomUpdated(roomId: string, room: unknown) {
    const ev = { type: 'ROOM_UPDATED', room } as const;
    assertServerEvent(ev);
    this.server.to(roomId).emit('event', ev);
  }

  /** Notify a player that they have been kicked */
  public emitKicked(roomId: string, playerId: string) {
    const k = key(roomId, playerId);
    const set = this.byPlayer.get(k);
    if (!set) return;

    const ev = { type: 'KICKED' } as const;
    assertServerEvent(ev);

    for (const sid of set) {
      this.server.to(sid).emit('event', ev);
    }
  }

  /** If you want to kick a player's sockets after REST /leave */
  public disconnectPlayer(roomId: string, playerId: string) {
    const k = key(roomId, playerId);
    const set = this.byPlayer.get(k);
    if (!set) return;

    // Safety check: ensure WebSocket server is initialized
    if (!this.server?.sockets?.sockets) return;

    for (const sid of set) {
      const sock = this.server.sockets.sockets.get(sid);
      sock?.disconnect(true);
      this.conns.delete(sid);
    }
    this.byPlayer.delete(k);
  }

  /** Optional: targeted error to a single socket (if you later track socket by player) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public emitMoveRejectedToPlayer(/* playerId: string, */ _reason: string) {
    // Parameter intentionally unused for future implementation
    // no-op for now
  }

  /** Handle incoming chat messages from clients */
  @SubscribeMessage('chat')
  public handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { text: string },
  ) {
    const claims = this.conns.get(client.id);
    if (!claims) return;

    // Validate message
    const text = data?.text?.trim();
    if (!text || text.length === 0 || text.length > 500) return;

    // Get player name from profile
    const profile = this.profiles.get(claims.playerId);
    const playerName = profile?.displayName ?? 'Unknown';

    // Broadcast chat message to all players in the room
    this.emitChatMessage(claims.roomId, {
      id: randomUUID(),
      playerId: claims.playerId,
      playerName,
      text,
      timestamp: Date.now(),
    });
  }

  /** Broadcast a chat message to everyone in the room */
  public emitChatMessage(
    roomId: string,
    payload: {
      id: string;
      playerId: string;
      playerName: string;
      text: string;
      timestamp: number;
    },
  ) {
    const ev = { type: 'CHAT_MESSAGE', ...payload } as const;
    assertServerEvent(ev);
    this.server.to(roomId).emit('event', ev);
  }

  @SubscribeMessage('room.sync.request')
  public synchronizeRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    const claims = this.conns.get(client.id);
    if (!claims) return;

    const request = SyncRequestSchema.safeParse(payload);
    if (!request.success) {
      const version =
        typeof payload === 'object' && payload !== null && 'version' in payload
          ? (payload as { version?: unknown }).version
          : undefined;
      this.emitProtocolFailure(
        client,
        version !== undefined && version !== GAME_ROOM_PROTOCOL_VERSION
          ? {
              version: GAME_ROOM_PROTOCOL_VERSION,
              code: 'UNSUPPORTED_VERSION',
              message: 'Unsupported Game room protocol version',
            }
          : {
              version: GAME_ROOM_PROTOCOL_VERSION,
              code: 'MALFORMED_MESSAGE',
              message: 'Invalid synchronization request',
            },
      );
      return;
    }

    let room: ReturnType<RoomsService['getById']>;
    try {
      room = this.rooms.getById(claims.roomId);
    } catch {
      this.emitProtocolFailure(client, {
        version: GAME_ROOM_PROTOCOL_VERSION,
        code: 'NOT_A_MEMBER',
        message: 'Game room is unavailable to this player',
      });
      return;
    }
    if (!room.players.some((player) => player.id === claims.playerId)) {
      this.emitProtocolFailure(client, {
        version: GAME_ROOM_PROTOCOL_VERSION,
        code: 'NOT_A_MEMBER',
        message: 'Player is no longer a member of this Game room',
      });
      return;
    }
    if (!room.gameId) {
      this.emitProtocolFailure(client, {
        version: GAME_ROOM_PROTOCOL_VERSION,
        code: 'GAME_NOT_STARTED',
        message: 'Game has not started',
      });
      return;
    }

    try {
      const game = this.games.get(room.gameId);
      const snapshot = SyncSnapshotSchema.parse({
        version: GAME_ROOM_PROTOCOL_VERSION,
        seq: game.meta.seq,
        state: game.state,
      });
      client.emit('room.sync.snapshot', snapshot);
    } catch {
      this.emitProtocolFailure(client, {
        version: GAME_ROOM_PROTOCOL_VERSION,
        code: 'MALFORMED_MESSAGE',
        message: 'Game room synchronization snapshot is invalid',
      });
    }
  }

  private emitProtocolFailure(client: Socket, payload: ProtocolFailure) {
    client.emit('protocol.error', payload);
  }
}
