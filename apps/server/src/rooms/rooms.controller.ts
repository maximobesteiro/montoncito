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
    return this.rooms.toView(room);
  }

  @Get()
  public list(@Query() raw: Record<string, unknown>) {
    const q = ListRoomsQuerySchema.parse(raw ?? {});
    return this.rooms.listPublicOpen({ page: q.page, limit: q.limit });
  }

  @Get('by-slug/:slug')
  public getBySlug(@Param('slug') slug: string) {
    const room = this.rooms.getBySlug(slug);
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
    return this.rooms.toView(room);
  }

  @Post(':id/join')
  public join(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const room = this.rooms.join({ roomId, clientId });

    const claims: WsJoinClaims = { roomId, playerId: clientId };
    const wsSecret = this.configService.get<string>('WS_SECRET');
    if (!wsSecret) throw new Error('WS_SECRET not configured');

    const wsJoinToken = jwt.sign(claims, wsSecret, {
      expiresIn: '10m',
    });

    return { ...this.rooms.toView(room), wsJoinToken };
  }

  @Post(':id/leave')
  public leave(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const result = this.rooms.leave({ roomId, clientId });
    this.ws.disconnectPlayer(roomId, clientId);

    if (result.deleted) {
      return { id: result.id, deleted: true };
    }
    // Room still exists → return consistent resolved view
    return this.rooms.toView(result.room!);
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
