import { generateReadableRoomSlug, generateTemporaryHumanName } from './names';

describe('utils/names', () => {
  describe('generateReadableRoomSlug', () => {
    it('generates "{noun}-{4digits}" when maxLength allows', () => {
      const slug = generateReadableRoomSlug({ maxLength: 64 });
      expect(slug).toMatch(/^[a-z0-9]+-[0-9]{4}$/);
    });

    it('never exceeds maxLength', () => {
      for (const maxLength of [6, 7, 8, 9, 10, 12]) {
        const slug = generateReadableRoomSlug({ maxLength });
        expect(slug.length).toBeLessThanOrEqual(maxLength);
      }
    });

    it('falls back when maxLength cannot fit "a-0000"', () => {
      const slug = generateReadableRoomSlug({ maxLength: 5 });
      expect(slug.length).toBeLessThanOrEqual(5);
    });
  });

  describe('generateTemporaryHumanName', () => {
    it('generates a non-empty name <= 32 chars', () => {
      const name = generateTemporaryHumanName({ maxLength: 32 });
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(32);
    });

    it('respects custom maxLength', () => {
      const name = generateTemporaryHumanName({ maxLength: 10 });
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(10);
    });
  });
});
