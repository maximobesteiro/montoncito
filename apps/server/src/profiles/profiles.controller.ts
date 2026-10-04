import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
} from '@nestjs/common';
import { NICKNAMES, ProfilesService } from './profiles.service';
import { UpsertProfileSchema } from './profiles.dto';

@Controller('profile')
export class ProfilesController {
  public constructor(private readonly profiles: ProfilesService) {}

  @Get()
  public read(@Headers('x-client-id') clientId: string | undefined) {
    if (!clientId) throw new BadRequestException('Missing X-Client-Id header');
    return { ...this.profiles.getOrCreate(clientId), suggestions: NICKNAMES };
  }

  // Initialization only applies the browser preference when no profile exists.
  @Post()
  public initialize(
    @Headers('x-client-id') clientId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!clientId) throw new BadRequestException('Missing X-Client-Id header');
    const existing = this.profiles.get(clientId);
    if (existing) return { ...existing, suggestions: NICKNAMES };
    const parsed = UpsertProfileSchema.partial().safeParse(body ?? {});
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues[0].message);
    const profile = parsed.data.displayName
      ? this.profiles.setDisplayName(clientId, parsed.data.displayName)
      : this.profiles.getOrCreate(clientId);
    return { ...profile, suggestions: NICKNAMES };
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
    const prof = this.profiles.setDisplayName(
      clientId,
      parsed.data.displayName,
    );
    return {
      clientId: prof.clientId,
      displayName: prof.displayName,
      updatedAt: prof.updatedAt,
    };
  }
}
