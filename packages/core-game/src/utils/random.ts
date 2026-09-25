// Deterministic RNG (Mulberry32) + Fisher-Yates shuffle
import { RandomGeneratorState } from "../state/types";

export type RNG = () => number;

export function makeRng(seed: number): RNG {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextRandom(rng: RandomGeneratorState): {
  value: number;
  rng: RandomGeneratorState;
} {
  const t = (rng.seed + Math.imul(rng.cursor + 1, 0x6d2b79f5)) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return {
    value: ((r ^ (r >>> 14)) >>> 0) / 4294967296,
    rng: { ...rng, cursor: (rng.cursor + 1) >>> 0 },
  };
}

export function shuffle<T>(xs: T[], rng: RNG): T[] {
  const arr = xs.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  return arr;
}

export function shuffleWithRngState<T>(
  xs: T[],
  rng: RandomGeneratorState,
): { cards: T[]; rng: RandomGeneratorState } {
  const cards = xs.slice();
  let nextRng = rng;
  for (let i = cards.length - 1; i > 0; i--) {
    const next = nextRandom(nextRng);
    nextRng = next.rng;
    const j = Math.floor(next.value * (i + 1));
    const temp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = temp;
  }
  return { cards, rng: nextRng };
}
