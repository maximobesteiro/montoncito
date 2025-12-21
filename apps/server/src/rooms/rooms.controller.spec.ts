import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from '../ws/rooms.gateway';
import { GameService } from '../game/game.service';
import { ProfilesService } from '../profiles/profiles.service';

let wsGateway: {
  emitStateUpdate: jest.Mock;
  emitGameStarted: jest.Mock;
  disconnectPlayer: jest.Mock;
};

describe('RoomsController', () => {
  let controller: RoomsController;
  let roomsService: jest.Mocked<RoomsService>;
  let gameService: jest.Mocked<GameService>;
  let mockRoomsService: jest.Mocked<Partial<RoomsService>>;
  let mockGameService: jest.Mocked<Partial<GameService>>;

  const mockRoom = {
    id: 'room-123',
    slug: 'test-room',
    visibility: 'public' as const,
    status: 'open' as const,
    maxPlayers: 4,
    ownerId: 'client-1',
    players: [{ id: 'client-1', isOwner: true }],
    createdAt: '2024-01-01T00:00:00.000Z',
    gameConfig: { discardPiles: 1 },
  };

  const mockRoomView = {
    id: 'room-123',
    slug: 'test-room',
    visibility: 'public' as const,
    status: 'open' as const,
    maxPlayers: 4,
    ownerId: 'client-1',
    players: [{ id: 'client-1', displayName: 'Player 1', isOwner: true }],
    createdAt: '2024-01-01T00:00:00.000Z',
    gameId: undefined,
    gameConfig: { discardPiles: 1 },
  };

  const mockGame = {
    meta: {
      id: 'game-123',
      roomId: 'room-123',
      players: ['client-1', 'client-2'],
      startedAt: '2024-01-01T00:00:00.000Z',
    },
    state: {
      version: 1 as const,
      id: 'game-123',
      phase: 'turn' as const,
      turn: {
        number: 1,
        activePlayer: 'client-1',
        hasDiscarded: false,
      },
      players: ['client-1', 'client-2'],
      byId: {
        'client-1': {
          id: 'client-1',
          hand: { cards: [] },
          discards: [[], [], []],
          stock: { faceDown: [] },
        },
        'client-2': {
          id: 'client-2',
          hand: { cards: [] },
          discards: [[], [], []],
          stock: { faceDown: [] },
        },
      },
      deck: { drawPile: [], discard: [] },
      center: { buildPiles: [] },
      winner: null,
      rngSeed: 123456789,
      rules: {
        handSize: 5,
        stockSize: 20,
        buildPiles: 4,
        maxBuildRank: 13 as const,
        discardPiles: 3,
        useJokers: false,
        jokersAreWild: true,
        kingsAreWild: true,
        additionalWildRanks: [],
        enableCardWildFlag: true,
        autoClearCompleteBuild: true,
      },
      data: {},
    },
  };

  beforeEach(async () => {
    process.env.WS_SECRET = 'test-secret';

    wsGateway = {
      emitStateUpdate: jest.fn(),
      emitGameStarted: jest.fn(),
      disconnectPlayer: jest.fn(),
    };

    mockRoomsService = {
      create: jest.fn(),
      getById: jest.fn(),
      getBySlug: jest.fn(),
      update: jest.fn(),
      listPublicOpen: jest.fn(),
      toView: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      start: jest.fn(),
    };

    mockGameService = {
      get: jest.fn(),
      applyMove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvVars: false })],
      controllers: [RoomsController],
      providers: [
        {
          provide: RoomsService,
          useValue: mockRoomsService,
        },
        {
          provide: GameService,
          useValue: mockGameService,
        },
        {
          provide: ProfilesService,
          useValue: {},
        },
        {
          provide: RoomsGateway,
          useValue: wsGateway,
        },
      ],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
    roomsService = module.get(RoomsService);
    gameService = module.get(GameService);
  });

  describe('create', () => {
    it('should create a room successfully', () => {
      roomsService.create.mockReturnValue(mockRoom);
      roomsService.toView.mockReturnValue(mockRoomView);

      const result = controller.create('client-1');

      expect(mockRoomsService.create).toHaveBeenCalledWith({
        clientId: 'client-1',
      });
      expect(mockRoomsService.toView).toHaveBeenCalledWith(mockRoom);
      expect(result).toMatchObject(mockRoomView);
      expect(result).toHaveProperty('wsJoinToken');
      expect(typeof (result as any).wsJoinToken).toBe('string');
    });

    it('should throw error when clientId is missing', () => {
      expect(() => controller.create(undefined)).toThrow(
        'Missing X-Client-Id header',
      );
      expect(mockRoomsService.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should list public open rooms with default pagination', () => {
      const mockListResult = {
        items: [mockRoomView],
        page: 1,
        limit: 20,
        total: 1,
        pages: 1,
      };
      roomsService.listPublicOpen.mockReturnValue(mockListResult);

      const result = controller.list({});

      expect(mockRoomsService.listPublicOpen).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
      expect(result).toEqual(mockListResult);
    });

    it('should list public open rooms with custom pagination', () => {
      const mockListResult = {
        items: [mockRoomView],
        page: 2,
        limit: 10,
        total: 15,
        pages: 2,
      };
      roomsService.listPublicOpen.mockReturnValue(mockListResult);

      const result = controller.list({ page: '2', limit: '10' });

      expect(mockRoomsService.listPublicOpen).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
      });
      expect(result).toEqual(mockListResult);
    });
  });

  describe('getBySlug', () => {
    it('should get room by slug successfully', () => {
      roomsService.getBySlug.mockReturnValue(mockRoom);
      roomsService.toView.mockReturnValue(mockRoomView);

      const result = controller.getBySlug('test-room');

      expect(mockRoomsService.getBySlug).toHaveBeenCalledWith('test-room');
      expect(mockRoomsService.toView).toHaveBeenCalledWith(mockRoom);
      expect(result).toEqual(mockRoomView);
    });
  });

  describe('patch', () => {
    it('should update room successfully', () => {
      const updateData = { visibility: 'private' as const, maxPlayers: 6 };
      const updatedRoom = {
        ...mockRoom,
        visibility: 'private' as const,
        maxPlayers: 6,
      };
      const updatedRoomView = {
        ...mockRoomView,
        visibility: 'private' as const,
        maxPlayers: 6,
      };

      roomsService.update.mockReturnValue(updatedRoom);
      roomsService.toView.mockReturnValue(updatedRoomView);

      const result = controller.patch('room-123', 'client-1', updateData);

      expect(mockRoomsService.update).toHaveBeenCalledWith({
        roomId: 'room-123',
        requesterId: 'client-1',
        patch: {
          visibility: 'private',
          maxPlayers: 6,
          gameConfig: undefined,
        },
      });
      expect(mockRoomsService.toView).toHaveBeenCalledWith(updatedRoom);
      expect(result).toEqual(updatedRoomView);
    });

    it('should update room with gameConfig', () => {
      const updateData = { gameConfig: { discardPiles: 2 } };
      const updatedRoom = { ...mockRoom, gameConfig: { discardPiles: 2 } };
      const updatedRoomView = {
        ...mockRoomView,
        gameConfig: { discardPiles: 2 },
      };

      roomsService.update.mockReturnValue(updatedRoom);
      roomsService.toView.mockReturnValue(updatedRoomView);

      const result = controller.patch('room-123', 'client-1', updateData);

      expect(mockRoomsService.update).toHaveBeenCalledWith({
        roomId: 'room-123',
        requesterId: 'client-1',
        patch: {
          visibility: undefined,
          maxPlayers: undefined,
          gameConfig: { discardPiles: 2 },
        },
      });
      expect(result).toEqual(updatedRoomView);
    });

    it('should throw error when clientId is missing', () => {
      expect(() => controller.patch('room-123', undefined, {})).toThrow(
        'Missing X-Client-Id header',
      );
      expect(mockRoomsService.update).not.toHaveBeenCalled();
    });
  });

  describe('join', () => {
    it('should join room successfully', () => {
      const joinedRoom = {
        ...mockRoom,
        players: [...mockRoom.players, { id: 'client-2', isOwner: false }],
      };
      const joinedRoomView = {
        ...mockRoomView,
        players: [
          ...mockRoomView.players,
          { id: 'client-2', displayName: 'Player 2', isOwner: false },
        ],
      };

      roomsService.join.mockReturnValue(joinedRoom);
      roomsService.toView.mockReturnValue(joinedRoomView);

      const result = controller.join('room-123', 'client-2');

      expect(mockRoomsService.join).toHaveBeenCalledWith({
        roomId: 'room-123',
        clientId: 'client-2',
      });
      expect(mockRoomsService.toView).toHaveBeenCalledWith(joinedRoom);

      // NEW: expect a token and the same view fields
      expect(result).toMatchObject(joinedRoomView);
      expect(result).toHaveProperty('wsJoinToken');
    });

    it('should throw error when clientId is missing', () => {
      expect(() => controller.join('room-123', undefined)).toThrow(
        'Missing X-Client-Id header',
      );
      expect(mockRoomsService.join).not.toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('should leave room successfully and return room view', () => {
      const remainingRoom = { ...mockRoom, players: [] };
      const remainingRoomView = { ...mockRoomView, players: [] };

      roomsService.leave.mockReturnValue({
        id: 'room-123',
        room: remainingRoom,
      });
      roomsService.toView.mockReturnValue(remainingRoomView);

      const result = controller.leave('room-123', 'client-1');

      expect(mockRoomsService.leave).toHaveBeenCalledWith({
        roomId: 'room-123',
        clientId: 'client-1',
      });
      expect(mockRoomsService.toView).toHaveBeenCalledWith(remainingRoom);
      expect(result).toEqual(remainingRoomView);
    });

    it('should leave room and return deleted status when room is empty', () => {
      roomsService.leave.mockReturnValue({ id: 'room-123', deleted: true });

      const result = controller.leave('room-123', 'client-1');

      expect(mockRoomsService.leave).toHaveBeenCalledWith({
        roomId: 'room-123',
        clientId: 'client-1',
      });
      expect(mockRoomsService.toView).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'room-123', deleted: true });
    });

    it('should throw error when clientId is missing', () => {
      expect(() => controller.leave('room-123', undefined)).toThrow(
        'Missing X-Client-Id header',
      );
      expect(mockRoomsService.leave).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should start game successfully', () => {
      const startedRoom = {
        ...mockRoom,
        status: 'in_progress' as const,
        gameId: 'game-123',
      };
      const startedRoomView = {
        ...mockRoomView,
        status: 'in_progress' as const,
        gameId: 'game-123',
      };

      roomsService.start.mockReturnValue(startedRoom);
      roomsService.toView.mockReturnValue(startedRoomView);
      gameService.get.mockReturnValue(mockGame);

      const result = controller.start('room-123', 'client-1');

      expect(mockRoomsService.start).toHaveBeenCalledWith({
        roomId: 'room-123',
        requesterId: 'client-1',
      });
      expect(mockRoomsService.toView).toHaveBeenCalledWith(startedRoom);
      expect(result).toEqual(startedRoomView);
      expect(wsGateway.emitGameStarted).toHaveBeenCalledWith('room-123', {
        meta: mockGame.meta,
        state: mockGame.state,
      });
    });

    it('should throw error when clientId is missing', () => {
      expect(() => controller.start('room-123', undefined)).toThrow(
        'Missing X-Client-Id header',
      );
      expect(mockRoomsService.start).not.toHaveBeenCalled();
    });
  });

  describe('getGame', () => {
    it('should get game successfully for room member', () => {
      const roomWithGame = {
        ...mockRoom,
        gameId: 'game-123',
        players: [
          { id: 'client-1', isOwner: true },
          { id: 'client-2', isOwner: false },
        ],
      };
      roomsService.getById.mockReturnValue(roomWithGame);
      gameService.get.mockReturnValue(mockGame);

      const result = controller.getGame('room-123', 'client-1');

      expect(mockRoomsService.getById).toHaveBeenCalledWith('room-123');
      expect(mockGameService.get).toHaveBeenCalledWith('game-123');
      expect(result).toEqual({ meta: mockGame.meta, state: mockGame.state });
    });

    it('should throw ForbiddenException when user is not a room member', () => {
      const roomWithGame = {
        ...mockRoom,
        gameId: 'game-123',
        players: [{ id: 'client-1', isOwner: true }],
      };
      roomsService.getById.mockReturnValue(roomWithGame);

      expect(() => controller.getGame('room-123', 'client-2')).toThrow(
        ForbiddenException,
      );
      expect(() => controller.getGame('room-123', 'client-2')).toThrow(
        'Only room members can view the game',
      );
      expect(mockGameService.get).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when game has not started', () => {
      const roomWithoutGame = {
        ...mockRoom,
        gameId: undefined,
        players: [{ id: 'client-1', isOwner: true }],
      };
      roomsService.getById.mockReturnValue(roomWithoutGame);

      expect(() => controller.getGame('room-123', 'client-1')).toThrow(
        ConflictException,
      );
      expect(() => controller.getGame('room-123', 'client-1')).toThrow(
        'Game has not started',
      );
      expect(mockGameService.get).not.toHaveBeenCalled();
    });

    it('should throw error when clientId is missing', () => {
      expect(() => controller.getGame('room-123', undefined)).toThrow(
        'Missing X-Client-Id header',
      );
      expect(mockRoomsService.getById).not.toHaveBeenCalled();
    });
  });

  describe('applyMove', () => {
    it('should apply move successfully', () => {
      const roomWithGame = {
        ...mockRoom,
        gameId: 'game-123',
        players: [{ id: 'client-1', isOwner: true }],
      };
      const moveData = { type: 'draw', payload: { pile: 'stock' } };
      const updatedGame = { ...mockGame };
      const events = [{ type: 'card_drawn', playerId: 'client-1' }];

      roomsService.getById.mockReturnValue(roomWithGame);
      gameService.applyMove.mockReturnValue({ game: updatedGame, events });

      const result = controller.applyMove('room-123', 'client-1', moveData);

      expect(mockRoomsService.getById).toHaveBeenCalledWith('room-123');
      expect(mockGameService.applyMove).toHaveBeenCalledWith(
        'game-123',
        moveData,
      );
      expect(wsGateway.emitStateUpdate).toHaveBeenCalledWith('room-123', {
        meta: updatedGame.meta,
        state: updatedGame.state,
      });
      expect(result).toEqual({
        meta: updatedGame.meta,
        state: updatedGame.state,
        events,
      });
    });

    it('should throw ForbiddenException when user is not a room member', () => {
      const roomWithGame = {
        ...mockRoom,
        gameId: 'game-123',
        players: [{ id: 'client-1', isOwner: true }],
      };
      roomsService.getById.mockReturnValue(roomWithGame);

      expect(() =>
        controller.applyMove('room-123', 'client-2', { type: 'draw' }),
      ).toThrow(ForbiddenException);
      expect(() =>
        controller.applyMove('room-123', 'client-2', { type: 'draw' }),
      ).toThrow('Only room members can play');
      expect(mockGameService.applyMove).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when game has not started', () => {
      const roomWithoutGame = {
        ...mockRoom,
        gameId: undefined,
        players: [{ id: 'client-1', isOwner: true }],
      };
      roomsService.getById.mockReturnValue(roomWithoutGame);

      expect(() =>
        controller.applyMove('room-123', 'client-1', { type: 'draw' }),
      ).toThrow(ConflictException);
      expect(() =>
        controller.applyMove('room-123', 'client-1', { type: 'draw' }),
      ).toThrow('Game has not started');
      expect(mockGameService.applyMove).not.toHaveBeenCalled();
    });

    it('should throw ZodError when move type is missing', () => {
      const roomWithGame = {
        ...mockRoom,
        gameId: 'game-123',
        players: [{ id: 'client-1', isOwner: true }],
      };
      roomsService.getById.mockReturnValue(roomWithGame);

      expect(() => controller.applyMove('room-123', 'client-1', {})).toThrow();
      expect(mockGameService.applyMove).not.toHaveBeenCalled();
    });

    it('should throw error when clientId is missing', () => {
      expect(() =>
        controller.applyMove('room-123', undefined, { type: 'draw' }),
      ).toThrow('Missing X-Client-Id header');
      expect(mockRoomsService.getById).not.toHaveBeenCalled();
    });
  });
});
