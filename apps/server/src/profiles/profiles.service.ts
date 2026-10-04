import { ConflictException, Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';

export const NICKNAMES = [
  'Boppo',
  'Zibble',
  'Moki',
  'Wumple',
  'Fizzi',
  'Nubbo',
  'Pippo',
  'Zazzu',
  'Dibbi',
  'Luppo',
  'Vimzi',
  'Tibbo',
  'Zoppi',
  'Bimzo',
  'Wibbi',
  'Nimzi',
  'Foppo',
  'Jibbu',
  'Pumzi',
  'Zubbo',
  'Doppi',
  'Vobbi',
  'Kipzu',
  'Lumzi',
  'Bazzle',
  'Womzi',
  'Tuppi',
  'Zimble',
  'Fubbi',
  'Nopzi',
  'Pibzu',
  'Dumple',
  'Jomzi',
  'Vuppo',
  'Kibbi',
  'Lopzu',
  'Bumple',
  'Wizzi',
  'Tobzu',
  'Zuppi',
  'Fimzo',
  'Nazzle',
  'Pobbi',
  'Dizzi',
  'Jupzi',
  'Vimble',
  'Kumzo',
  'Lizzi',
  'Bopzu',
  'Wubbo',
];

export type Profile = {
  clientId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  generation: string;
  revision: number;
};

@Injectable()
export class ProfilesService {
  private readonly profiles = new Map<string, Profile>();
  private readonly generation = randomUUID();

  public assertGeneration(clientId: string, generation: string) {
    const current = this.get(clientId);
    if (!current || current.generation !== generation)
      throw new ConflictException({
        code: 'STALE_PROFILE_GENERATION',
        message: 'Initialize your nickname again before entering a Lobby.',
      });
  }

  public assertCurrent(
    clientId: string,
    base?: Pick<Profile, 'generation' | 'revision'>,
  ) {
    if (!base) return;
    const current = this.get(clientId);
    if (
      !current ||
      base.generation !== current.generation ||
      base.revision !== current.revision
    )
      throw new ConflictException({
        code: 'STALE_PROFILE',
        message: 'Your nickname changed. Review the confirmed name and retry.',
      });
  }

  public get(clientId: string): Profile | undefined {
    return this.profiles.get(clientId);
  }

  public getOrCreate(clientId: string): Profile {
    const existing = this.profiles.get(clientId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const temporaryName = this.generateTemporaryName();
    const prof: Profile = {
      clientId,
      displayName: temporaryName,
      createdAt: now,
      updatedAt: now,
      generation: this.generation,
      revision: 0,
    };
    this.profiles.set(clientId, prof);
    return prof;
  }

  public setDisplayName(clientId: string, displayName: string): Profile {
    const now = new Date().toISOString();
    const current = this.profiles.get(clientId);
    if (current) {
      const updated = {
        ...current,
        displayName,
        updatedAt: now,
        revision: current.revision + 1,
      };
      this.profiles.set(clientId, updated);
      return updated;
    }
    const prof: Profile = {
      clientId,
      displayName,
      createdAt: now,
      updatedAt: now,
      generation: this.generation,
      revision: 0,
    };
    this.profiles.set(clientId, prof);
    return prof;
  }

  private generateTemporaryName(): string {
    return NICKNAMES[randomInt(NICKNAMES.length)];
  }
}
