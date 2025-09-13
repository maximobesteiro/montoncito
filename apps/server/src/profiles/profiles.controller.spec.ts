import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let profilesService: jest.Mocked<ProfilesService>;
  let mockProfilesService: jest.Mocked<Partial<ProfilesService>>;

  const mockProfile = {
    clientId: 'client-123',
    displayName: 'Test Player',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    mockProfilesService = {
      get: jest.fn(),
      getOrCreate: jest.fn(),
      setDisplayName: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        {
          provide: ProfilesService,
          useValue: mockProfilesService,
        },
      ],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
    profilesService = module.get(ProfilesService);
  });

  describe('upsert', () => {
    it('should create a new profile successfully', () => {
      const requestBody = { displayName: 'New Player' };
      const newProfile = { ...mockProfile, displayName: 'New Player' };

      profilesService.setDisplayName.mockReturnValue(newProfile);

      const result = controller.upsert('client-123', requestBody);

      expect(mockProfilesService.setDisplayName).toHaveBeenCalledWith(
        'client-123',
        'New Player',
      );
      expect(result).toEqual({
        clientId: 'client-123',
        displayName: 'New Player',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should update an existing profile successfully', () => {
      const requestBody = { displayName: 'Updated Player' };
      const updatedProfile = {
        ...mockProfile,
        displayName: 'Updated Player',
        updatedAt: '2024-01-01T01:00:00.000Z',
      };

      profilesService.setDisplayName.mockReturnValue(updatedProfile);

      const result = controller.upsert('client-123', requestBody);

      expect(mockProfilesService.setDisplayName).toHaveBeenCalledWith(
        'client-123',
        'Updated Player',
      );
      expect(result).toEqual({
        clientId: 'client-123',
        displayName: 'Updated Player',
        updatedAt: '2024-01-01T01:00:00.000Z',
      });
    });

    it('should handle null request body by using empty object', () => {
      const requestBody = null;

      // This test verifies that null body is converted to {} and then schema validation fails
      // which is the expected behavior since displayName is required
      expect(() => controller.upsert('client-123', requestBody)).toThrow();
    });

    it('should throw error when clientId is missing', () => {
      const requestBody = { displayName: 'Test Player' };

      expect(() => controller.upsert(undefined, requestBody)).toThrow(
        'Missing X-Client-Id header',
      );
      expect(mockProfilesService.setDisplayName).not.toHaveBeenCalled();
    });

    it('should handle minimum length display name', () => {
      const requestBody = { displayName: 'A' };
      const newProfile = { ...mockProfile, displayName: 'A' };

      profilesService.setDisplayName.mockReturnValue(newProfile);

      const result = controller.upsert('client-123', requestBody);

      expect(mockProfilesService.setDisplayName).toHaveBeenCalledWith(
        'client-123',
        'A',
      );
      expect(result).toEqual({
        clientId: 'client-123',
        displayName: 'A',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should handle maximum length display name', () => {
      const longDisplayName = 'A'.repeat(32);
      const requestBody = { displayName: longDisplayName };
      const newProfile = { ...mockProfile, displayName: longDisplayName };

      profilesService.setDisplayName.mockReturnValue(newProfile);

      const result = controller.upsert('client-123', requestBody);

      expect(mockProfilesService.setDisplayName).toHaveBeenCalledWith(
        'client-123',
        longDisplayName,
      );
      expect(result).toEqual({
        clientId: 'client-123',
        displayName: longDisplayName,
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should handle special characters in display name', () => {
      const requestBody = { displayName: 'Player-123_Test!' };
      const newProfile = { ...mockProfile, displayName: 'Player-123_Test!' };

      profilesService.setDisplayName.mockReturnValue(newProfile);

      const result = controller.upsert('client-123', requestBody);

      expect(mockProfilesService.setDisplayName).toHaveBeenCalledWith(
        'client-123',
        'Player-123_Test!',
      );
      expect(result).toEqual({
        clientId: 'client-123',
        displayName: 'Player-123_Test!',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should handle unicode characters in display name', () => {
      const requestBody = { displayName: '玩家123' };
      const newProfile = { ...mockProfile, displayName: '玩家123' };

      profilesService.setDisplayName.mockReturnValue(newProfile);

      const result = controller.upsert('client-123', requestBody);

      expect(mockProfilesService.setDisplayName).toHaveBeenCalledWith(
        'client-123',
        '玩家123',
      );
      expect(result).toEqual({
        clientId: 'client-123',
        displayName: '玩家123',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });
  });
});
