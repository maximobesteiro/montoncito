import { Body, Controller, Headers, Patch } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { UpsertProfileSchema } from './profiles.dto';

@Controller('profile')
export class ProfilesController {
  public constructor(private readonly profiles: ProfilesService) {}

  /**
   * Set or update the caller's global displayName.
   * Header required: X-Client-Id
   */
  @Patch()
  public upsert(
    @Headers('x-client-id') clientId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!clientId) throw new Error('Missing X-Client-Id header');
    const dto = UpsertProfileSchema.parse(body ?? {});
    const prof = this.profiles.setDisplayName(clientId, dto.displayName);
    return {
      clientId: prof.clientId,
      displayName: prof.displayName,
      updatedAt: prof.updatedAt,
    };
  }
}
