import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RoomDefaults } from './rooms.config';
import { ProfilesService } from '../profiles/profiles.service';
import { GameService } from '../game/game.service';

export type Visibility = 'public' | 'private';
export type RoomStatus = 'open' | 'in_progress' | 'finished';

export type PlayerRef = {
  id: string; // clientId
  isOwner: boolean;
};

export type GameConfig = {
  // Pre-game config placeholders; will be frozen on start
  discardPiles: number;
  // add more when needed
};

export type Room = {
  id: string;
  slug: string;
  visibility: Visibility;
  status: RoomStatus;
  maxPlayers: number;
  ownerId: string;
  players: PlayerRef[];
  createdAt: string;
  gameId?: string;
  gameConfig: GameConfig;
};

@Injectable()
export class RoomsService {
  private readonly roomsById = new Map<string, Room>();
  private readonly roomIdBySlug = new Map<string, string>();

  public constructor(
    @Inject('ROOM_DEFAULTS') private readonly defaults: RoomDefaults,
    private readonly profiles: ProfilesService,
    private readonly games: GameService,
  ) {}

  public create(params: { clientId: string }): Room {
    const id = randomUUID();
    const slug = this.generateUniqueSlug(this.defaults.slugLength);
    const now = new Date().toISOString();

    // Ensure the profile exists (auto-provision temporary displayName if new)
    this.profiles.getOrCreate(params.clientId);

    const room: Room = {
      id,
      slug,
      visibility: this.defaults.defaultVisibility,
      status: 'open',
      maxPlayers: this.defaults.defaultMaxPlayers,
      ownerId: params.clientId,
      players: [{ id: params.clientId, isOwner: true }],
      createdAt: now,
      gameConfig: { discardPiles: 1 },
    };

    this.roomsById.set(id, room);
    this.roomIdBySlug.set(slug, id);
    return room;
  }

  public getById(id: string): Room {
    const room = this.roomsById.get(id);
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  public getBySlug(slug: string): Room {
    const id = this.roomIdBySlug.get(slug);
    if (!id) throw new NotFoundException('Room not found');
    return this.getById(id);
  }

  public update(params: {
    roomId: string;
    requesterId: string;
    patch: {
      visibility?: Visibility;
      maxPlayers?: number;
      gameConfig?: Partial<GameConfig>;
    };
  }): Room {
    const room = this.roomsById.get(params.roomId);
    if (!room) throw new NotFoundException('Room not found');

    if (!this.isOwner(room, params.requesterId)) {
      throw new ForbiddenException('Only the owner can update the room');
    }
    if (room.status !== 'open') {
      throw new ConflictException(
        'Room cannot be updated once the game has started or finished',
      );
    }

    // visibility
    if (typeof params.patch.visibility !== 'undefined') {
      room.visibility = params.patch.visibility;
    }

    // maxPlayers
    if (typeof params.patch.maxPlayers !== 'undefined') {
      const currentPlayers = room.players.length;
      const requested = params.patch.maxPlayers;

      if (requested < currentPlayers) {
        throw new ConflictException(
          `maxPlayers cannot be less than current players (${currentPlayers})`,
        );
      }
      if (requested < 2) {
        throw new BadRequestException('maxPlayers must be at least 2');
      }
      if (requested > this.defaults.hardMaxPlayers) {
        throw new BadRequestException(
          `maxPlayers cannot exceed hard limit (${this.defaults.hardMaxPlayers})`,
        );
      }
      room.maxPlayers = requested;
    }

    // gameConfig (pre-game only)
    if (params.patch.gameConfig) {
      if (typeof params.patch.gameConfig.discardPiles !== 'undefined') {
        const v = params.patch.gameConfig.discardPiles;
        if (v < 1 || v > 8) {
          throw new BadRequestException('discardPiles must be between 1 and 8');
        }
        room.gameConfig.discardPiles = v;
      }
      // add more fields as needed in the future
    }

    // persist back (map holds reference; this is mainly semantic)
    this.roomsById.set(room.id, room);
    return room;
  }

  public listPublicOpen(params: { page: number; limit: number }) {
    const all = Array.from(this.roomsById.values());
    const filtered = all.filter(
      (r) => r.visibility === 'public' && r.status === 'open',
    );

    const total = filtered.length;
    const page = params.page;
    const limit = params.limit;
    const pages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = filtered
      .slice(start, start + limit)
      .map((r) => this.toView(r));

    return {
      items,
      page,
      limit,
      total,
      pages,
    };
  }

  public toView(room: Room) {
    return {
      id: room.id,
      slug: room.slug,
      visibility: room.visibility,
      status: room.status,
      maxPlayers: room.maxPlayers,
      ownerId: room.ownerId,
      players: room.players.map((p) => {
        const prof = this.profiles.get(p.id) ?? this.profiles.getOrCreate(p.id);
        return { id: p.id, displayName: prof.displayName, isOwner: p.isOwner };
      }),
      createdAt: room.createdAt,
      gameId: room.gameId,
      gameConfig: room.gameConfig,
    };
  }

  public join(params: { roomId: string; clientId: string }): Room {
    const room = this.roomsById.get(params.roomId);
    if (!room) throw new NotFoundException('Room not found');

    if (room.status !== 'open') {
      throw new ConflictException('Room is not open for joining');
    }
    if (this.hasPlayer(room, params.clientId)) {
      throw new ConflictException('Player already in room');
    }
    if (room.players.length >= room.maxPlayers) {
      throw new ConflictException('Room is full');
    }

    // Ensure the profile exists (auto-provision a temporary displayName if missing)
    this.profiles.getOrCreate(params.clientId);

    room.players.push({ id: params.clientId, isOwner: false });
    this.roomsById.set(room.id, room);
    return room;
  }

  public leave(params: { roomId: string; clientId: string }): {
    room?: Room;
    deleted?: true;
    id: string;
  } {
    const room = this.roomsById.get(params.roomId);
    if (!room) throw new NotFoundException('Room not found');

    if (room.status !== 'open') {
      throw new ConflictException(
        'Room cannot be left while in progress or finished',
      );
    }

    const idx = room.players.findIndex((p) => p.id === params.clientId);
    if (idx === -1) {
      throw new ConflictException('Player is not in this room');
    }

    // Remove the player
    const [removed] = room.players.splice(idx, 1);

    if (room.players.length === 0) {
      // Delete room entirely
      this.roomsById.delete(room.id);
      this.roomIdBySlug.delete(room.slug);
      return { id: room.id, deleted: true };
    }

    // If owner left, transfer ownership to the oldest remaining player
    if (removed.isOwner) {
      room.ownerId = room.players[0].id;
      room.players = room.players.map((p, i) => ({ ...p, isOwner: i === 0 }));
    }

    this.roomsById.set(room.id, room);
    return { id: room.id, room };
  }

  public start(params: { roomId: string; requesterId: string }): Room {
    const room = this.roomsById.get(params.roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.ownerId !== params.requesterId)
      throw new ForbiddenException('Only the owner can start the game');
    if (room.status !== 'open') throw new ConflictException('Room is not open');
    if (room.players.length < 2)
      throw new ConflictException('At least two players are required to start');

    const playersOrdered = room.players.map((p) => p.id);
    const config = {
      discardPiles: room.gameConfig.discardPiles,
      // you can add more knobs later (handSize, buildPiles, etc.)
    };

    const game = this.games.create({
      roomId: room.id,
      players: playersOrdered,
      config,
    });
    room.gameId = game.meta.id;
    room.status = 'in_progress';

    this.roomsById.set(room.id, room);
    return room;
  }

  private hasPlayer(room: Room, clientId: string): boolean {
    return room.players.some((p) => p.id === clientId);
  }

  private generateUniqueSlug(length: number): string {
    // Simple, collision-resistant enough for phase 1:
    // use UUID (32 hex chars) without dashes and slice.
    for (let i = 0; i < 5; i += 1) {
      const candidate = randomUUID()
        .replace(/-/g, '')
        .slice(0, length)
        .toLowerCase();
      if (!this.roomIdBySlug.has(candidate)) return candidate;
    }
    // Extremely unlikely fallback: append a short suffix
    const base = randomUUID().replace(/-/g, '').toLowerCase();
    return (
      base.slice(0, length - 3) + base.slice(length, length + 3)
    ).toLowerCase();
  }

  private isOwner(room: Room, clientId: string): boolean {
    return room.ownerId === clientId;
  }
}
