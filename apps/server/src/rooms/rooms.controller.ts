import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Patch,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomsService } from './rooms.service';
import {
  UpdateRoomSchema,
  ListRoomsQuerySchema,
  MoveSchema,
  SetReadySchema,
} from './rooms.dto';
import { GameService } from '../game/game.service';
import { RoomsGateway } from '../ws/rooms.gateway';
import { WsJoinClaims } from '../ws/auth';
import jwt from 'jsonwebtoken';

@Controller('rooms')
export class RoomsController {
  public constructor(
    private readonly rooms: RoomsService,
    private readonly games: GameService,
    private readonly ws: RoomsGateway,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  public create(@Headers('x-client-id') clientId: string | undefined) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const room = this.rooms.create({ clientId });

    const claims: WsJoinClaims = { roomId: room.id, playerId: clientId };
    const wsSecret = this.configService.get<string>('WS_SECRET');
    if (!wsSecret) throw new Error('WS_SECRET not configured');

    const wsJoinToken = jwt.sign(claims, wsSecret, {
      expiresIn: '10m',
    });

    return { ...this.rooms.toView(room), wsJoinToken };
  }

  @Get()
  public list(@Query() raw: Record<string, unknown>) {
    const q = ListRoomsQuerySchema.parse(raw ?? {});
    return this.rooms.listPublicOpen({ page: q.page, limit: q.limit });
  }

  @Get('by-slug/:slug')
  public getBySlug(
    @Param('slug') slug: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    const cid = clientId;
    if (!cid) throw new Error('Missing X-Client-Id header');
    const room = this.rooms.getOrCreateBySlug({ slug, clientId: cid });
    return this.rooms.toView(room);
  }

  @Patch(':id')
  public patch(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const dto = UpdateRoomSchema.parse(body ?? {});
    const room = this.rooms.update({
      roomId,
      requesterId: clientId,
      patch: {
        visibility: dto.visibility,
        maxPlayers: dto.maxPlayers,
        gameConfig: dto.gameConfig,
      },
    });
    const roomView = this.rooms.toView(room);

    // Broadcast room update to all connected clients in this room
    this.ws.emitRoomUpdated(roomId, roomView);

    return roomView;
  }

  @Post(':id/join')
  public join(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    // Avoid broadcasting if this is an idempotent re-join.
    const alreadyMember = this.rooms
      .getById(roomId)
      .players.some((p) => p.id === clientId);

    const room = this.rooms.join({ roomId, clientId });

    const claims: WsJoinClaims = { roomId, playerId: clientId };
    const wsSecret = this.configService.get<string>('WS_SECRET');
    if (!wsSecret) throw new Error('WS_SECRET not configured');

    const wsJoinToken = jwt.sign(claims, wsSecret, {
      expiresIn: '10m',
    });

    const roomView = this.rooms.toView(room);

    // Broadcast updated room to all connected clients (for real-time player list updates)
    // Note: The joining player won't receive this yet as they haven't connected to WS,
    // but they already have the updated room from this REST response
    if (!alreadyMember) this.ws.emitRoomUpdated(roomId, roomView);

    return { ...roomView, wsJoinToken };
  }

  @Post(':id/leave')
  public leave(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const result = this.rooms.leave({ roomId, clientId });

    // Broadcast room update before disconnecting WebSocket
    if (!result.deleted && result.room) {
      const roomView = this.rooms.toView(result.room);
      this.ws.emitRoomUpdated(roomId, roomView);
    }

    // Disconnect player's WebSocket connections
    this.ws.disconnectPlayer(roomId, clientId);

    if (result.deleted) {
      return { id: result.id, deleted: true };
    }
    // Room still exists → return consistent resolved view
    return this.rooms.toView(result.room!);
  }

  @Post(':id/kick/:playerId')
  public kick(
    @Param('id') roomId: string,
    @Param('playerId') targetId: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');

    const room = this.rooms.kick({
      roomId,
      requesterId: clientId,
      targetId,
    });

    const roomView = this.rooms.toView(room);

    // 1. Notify the kicked player first
    this.ws.emitKicked(roomId, targetId);

    // 2. Broadcast room update to remaining players
    this.ws.emitRoomUpdated(roomId, roomView);

    // 3. Force disconnect the kicked player's sockets
    this.ws.disconnectPlayer(roomId, targetId);

    return roomView;
  }

  @Post(':id/ready')
  public setReady(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const dto = SetReadySchema.parse(body ?? {});
    const room = this.rooms.setReady({
      roomId,
      clientId,
      ready: dto.ready,
    });

    const roomView = this.rooms.toView(room);

    // Broadcast room update so all players see readiness change
    this.ws.emitRoomUpdated(roomId, roomView);

    return roomView;
  }

  @Post(':id/start')
  public start(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const room = this.rooms.start({ roomId, requesterId: clientId });

    // If a game was created, broadcast initial state to room members.
    if (room.gameId) {
      const game = this.games.get(room.gameId);
      this.ws.emitGameStarted(roomId, { meta: game.meta, state: game.state });
    }

    return this.rooms.toView(room);
  }

  @Get(':id/game')
  public getGame(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');

    const room = this.rooms.getById(roomId);

    const isMember = room.players.some((p) => p.id === clientId);
    if (!isMember) {
      throw new ForbiddenException('Only room members can view the game');
    }

    if (!room.gameId) {
      throw new ConflictException('Game has not started');
    }

    const game = this.games.get(room.gameId);
    return { meta: game.meta, state: game.state };
  }

  @Post(':id/game/moves')
  public applyMove(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');

    const room = this.rooms.getById(roomId);

    const isMember = room.players.some((p) => p.id === clientId);
    if (!isMember) throw new ForbiddenException('Only room members can play');

    if (!room.gameId) throw new ConflictException('Game has not started');

    const move = MoveSchema.parse(body ?? {});

    const { game, events } = this.games.applyMove(room.gameId, move);

    this.ws.emitStateUpdate(roomId, { meta: game.meta, state: game.state });

    return {
      meta: game.meta,
      state: game.state,
      events,
    };
  }
}
