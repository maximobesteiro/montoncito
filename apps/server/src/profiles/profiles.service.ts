import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

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
    // Simple, readable temp name, e.g. "Player-7f3a"
    return `Player-${randomUUID().replace(/-/g, '').slice(0, 4).toLowerCase()}`;
  }
}
