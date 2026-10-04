import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { UpsertProfileSchema } from './profiles.dto';
import { RoomsService } from '../rooms/rooms.service';
import { RoomsGateway } from '../ws/rooms.gateway';

@Controller('profile')
export class ProfilesController {
  public constructor(
    private readonly profiles: ProfilesService,
    @Inject(forwardRef(() => RoomsService))
    private readonly rooms: RoomsService,
    @Inject(forwardRef(() => RoomsGateway)) private readonly ws: RoomsGateway,
  ) {}

  @Get()
  public read(@Headers('x-client-id') clientId: string | undefined) {
    if (!clientId) throw new BadRequestException('Missing X-Client-Id header');
    return {
      ...this.profiles.getOrCreate(clientId),
      suggestions: this.rooms.nicknameSuggestions(clientId),
    };
  }

  // Initialization only applies the browser preference when no profile exists.
  @Post()
  public initialize(
    @Headers('x-client-id') clientId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!clientId) throw new BadRequestException('Missing X-Client-Id header');
    const existing = this.profiles.get(clientId);
    if (existing)
      return {
        ...existing,
        suggestions: this.rooms.nicknameSuggestions(clientId),
      };
    const parsed = UpsertProfileSchema.partial().safeParse(body ?? {});
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues[0].message);
    const profile = parsed.data.displayName
      ? this.profiles.setDisplayName(clientId, parsed.data.displayName)
      : this.profiles.getOrCreate(clientId);
    return {
      ...profile,
      suggestions: this.rooms.nicknameSuggestions(clientId),
    };
  }

  /**
   * Set or update the caller's global displayName.
   * Header required: X-Client-Id
   */
  @Patch()
  public upsert(
    @Headers('x-client-id') clientId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!clientId) throw new BadRequestException('Missing X-Client-Id header');
    const parsed = UpsertProfileSchema.safeParse(body ?? {});
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues[0].message);
    const { profile: prof, lobbies } = this.rooms.renameGuest(
      clientId,
      parsed.data.displayName,
    );
    for (const room of lobbies)
      this.ws.emitRoomUpdated(room.id, this.rooms.toView(room));
    return {
      clientId: prof.clientId,
      displayName: prof.displayName,
      updatedAt: prof.updatedAt,
      suggestions: this.rooms.nicknameSuggestions(clientId),
    };
  }
}
