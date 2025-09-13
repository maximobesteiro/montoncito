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
  BadRequestException,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import {
  UpdateRoomSchema,
  ListRoomsQuerySchema,
  MoveSchema,
} from './rooms.dto';
import { GameService } from 'src/game/game.service';

@Controller('rooms')
export class RoomsController {
  public constructor(
    private readonly rooms: RoomsService,
    private readonly games: GameService,
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
    return this.rooms.toView(room);
  }

  @Post(':id/leave')
  public leave(
    @Param('id') roomId: string,
    @Headers('x-client-id') clientId: string | undefined,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const result = this.rooms.leave({ roomId, clientId });

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

    // Optional: basic guard that a move has a type
    if (!move.type) throw new BadRequestException('Move "type" is required');

    const { game, events } = this.games.applyMove(room.gameId, move);

    return {
      meta: game.meta,
      state: game.state,
      events,
    };
  }
}
