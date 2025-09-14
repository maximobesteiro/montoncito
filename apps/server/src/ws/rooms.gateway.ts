import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { WsJoinClaims } from './auth';
import { assertServerEvent } from './events';

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

  constructor(private readonly configService: ConfigService) {}

  public handleConnection(client: Socket) {
    try {
      const raw = client.handshake.auth?.token as string | undefined;
      if (!raw) throw new Error('Missing token');

      const wsSecret = this.configService.get<string>('WS_SECRET');
      if (!wsSecret) throw new Error('WS_SECRET not configured');

      const decoded = jwt.verify(raw, wsSecret) as Record<string, unknown>; // will throw if expired/bad
      const claims = WsJoinClaims.parse(decoded);

      void client.join(claims.roomId);
      this.conns.set(client.id, claims);

      const k = key(claims.roomId, claims.playerId);
      if (!this.byPlayer.has(k)) this.byPlayer.set(k, new Set());
      this.byPlayer.get(k)!.add(client.id);

      // Presence broadcast
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
      if (set.size === 0) this.byPlayer.delete(k);
    }

    const ev = { type: 'PLAYER_LEFT', playerId: claims.playerId } as const;
    assertServerEvent(ev);
    this.server.to(claims.roomId).emit('event', ev);
  }

  /** Broadcast fresh view (state/meta) to everyone in the room */
  public emitStateUpdate(
    roomId: string,
    payload: { meta?: unknown; state: unknown },
  ) {
    const ev = { type: 'STATE_UPDATE', ...payload } as const;
    assertServerEvent(ev);
    this.server.to(roomId).emit('event', ev);
  }

  /** Broadcast initial game state when the room owner starts the game */
  public emitGameStarted(
    roomId: string,
    payload: { meta: unknown; state: unknown },
  ) {
    const ev = { type: 'GAME_STARTED', ...payload } as const;
    assertServerEvent(ev);
    this.server.to(roomId).emit('event', ev);
  }

  /** If you want to kick a player’s sockets after REST /leave */
  public disconnectPlayer(roomId: string, playerId: string) {
    const k = key(roomId, playerId);
    const set = this.byPlayer.get(k);
    if (!set) return;

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
}
