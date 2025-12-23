import { randomInt, randomUUID } from 'crypto';

const ROOM_SLUG_WORDS = [
  'tree',
  'peak',
  'lemon',
  'river',
  'ember',
  'stone',
  'cloud',
  'breeze',
  'meadow',
  'forest',
  'canyon',
  'reef',
  'dawn',
  'glow',
  'drift',
  'sunset',
  'cedar',
  'maple',
  'birch',
  'spruce',
  'sparrow',
  'otter',
  'comet',
  'orbit',
  'nova',
  'poppy',
  'amber',
  'cocoa',
  'mint',
  'olive',
  'tide',
  'ridge',
  'cliff',
  'brook',
  'island',
  'valley',
  'prairie',
  'summit',
  'glacier',
  'thunder',
  'aurora',
  'echo',
  'moss',
  'fern',
  'willow',
  'saffron',
  'hazel',
  'juniper',
  'quartz',
  'opal',
  'coral',
] as const;

const FIRST_NAMES = [
  'Ada',
  'Diego',
  'Maya',
  'Sofia',
  'Liam',
  'Noah',
  'Emma',
  'Olivia',
  'Ava',
  'Isabella',
  'Lucas',
  'Mateo',
  'Elena',
  'Nora',
  'Amir',
  'Zoe',
  'Ivy',
  'Leo',
  'Mila',
  'Aria',
] as const;

const LAST_NAMES = [
  'Lovelace',
  'Rivera',
  'Garcia',
  'Smith',
  'Johnson',
  'Brown',
  'Martinez',
  'Anderson',
  'Taylor',
  'Thomas',
  'Moore',
  'Jackson',
  'Martin',
  'Lee',
  'Perez',
  'Thompson',
  'White',
  'Harris',
  'Clark',
  'Lewis',
] as const;

function pickRandom<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length)];
}

function randomDigits(count: number): string {
  const maxExclusive = 10 ** count;
  return randomInt(0, maxExclusive).toString().padStart(count, '0');
}

function sanitizeSlugWord(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function generateReadableRoomSlug(params: {
  maxLength: number;
  digits?: number;
  separator?: string;
  maxAttempts?: number;
}): string {
  const digits = params.digits ?? 4;
  const separator = params.separator ?? '-';
  const maxAttempts = params.maxAttempts ?? 50;

  // Need at least 1 char word + separator + digits, e.g. "a-0000"
  const minLen = 1 + separator.length + digits;
  if (params.maxLength < minLen) {
    return randomUUID()
      .replace(/-/g, '')
      .slice(0, params.maxLength)
      .toLowerCase();
  }

  const maxWordLen = params.maxLength - separator.length - digits;

  for (let i = 0; i < maxAttempts; i += 1) {
    const noun = sanitizeSlugWord(pickRandom(ROOM_SLUG_WORDS));
    if (noun.length < 1 || noun.length > maxWordLen) continue;

    const suffix = randomDigits(digits);
    const slug = `${noun}${separator}${suffix}`;
    // Extra guard: enforce max length even if separator/digits changed
    if (slug.length <= params.maxLength) return slug;
  }

  // Fallback if faker keeps giving long words (unlikely, but safe)
  return randomUUID()
    .replace(/-/g, '')
    .slice(0, params.maxLength)
    .toLowerCase();
}

export function generateTemporaryHumanName(params?: {
  maxLength?: number;
}): string {
  const maxLength = params?.maxLength ?? 32;

  const first = pickRandom(FIRST_NAMES);
  const last = pickRandom(LAST_NAMES);

  const candidates = [
    `${first} ${last}`,
    `${first} ${last.slice(0, 1)}.`,
    `${first}`,
  ];

  const chosen = candidates.find((s) => s.length >= 1 && s.length <= maxLength);
  if (chosen) return chosen;

  // Ultra-safe fallback (should basically never happen)
  return `Player-${randomDigits(4)}`.slice(0, maxLength);
}
