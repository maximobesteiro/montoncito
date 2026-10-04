import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';

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
};

@Injectable()
export class ProfilesService {
  private readonly profiles = new Map<string, Profile>();

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
    };
    this.profiles.set(clientId, prof);
    return prof;
  }

  public setDisplayName(clientId: string, displayName: string): Profile {
    const now = new Date().toISOString();
    const current = this.profiles.get(clientId);
    if (current) {
      current.displayName = displayName;
      current.updatedAt = now;
      this.profiles.set(clientId, current);
      return current;
    }
    const prof: Profile = {
      clientId,
      displayName,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.set(clientId, prof);
    return prof;
  }

  private generateTemporaryName(): string {
    return NICKNAMES[randomInt(NICKNAMES.length)];
  }
}
