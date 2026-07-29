import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/core/rng';

describe('SeededRNG', () => {
  it('produces identical random numbers for the same seed', () => {
    const seed = 'wandering-dungeon-test-123';
    const rng1 = new SeededRNG(seed);
    const rng2 = new SeededRNG(seed);

    expect(rng1.getSeed()).toBe(seed);
    expect(rng2.getSeed()).toBe(seed);

    const values1 = Array.from({ length: 10 }, () => rng1.random());
    const values2 = Array.from({ length: 10 }, () => rng2.random());

    expect(values1).toEqual(values2);
    expect(rng1.getCallCount()).toBe(10);
    expect(rng2.getCallCount()).toBe(10);
  });

  it('restoring fromSerialized produces exact same subsequent sequence', () => {
    const seed = 'save-state-seed-456';
    const originalRng = new SeededRNG(seed);

    for (let i = 0; i < 5; i++) {
      originalRng.random();
    }
    expect(originalRng.getCallCount()).toBe(5);

    const serialized = originalRng.serialize();
    expect(serialized).toEqual({ seed, callCount: 5 });

    const restoredRng = SeededRNG.fromSerialized(serialized);
    expect(restoredRng.getSeed()).toBe(seed);
    expect(restoredRng.getCallCount()).toBe(5);

    const nextOriginal = Array.from({ length: 10 }, () => originalRng.random());
    const nextRestored = Array.from({ length: 10 }, () => restoredRng.random());

    expect(nextOriginal).toEqual(nextRestored);
    expect(originalRng.getCallCount()).toBe(15);
    expect(restoredRng.getCallCount()).toBe(15);
  });

  it('randomRange returns floats within [min, max)', () => {
    const rng = new SeededRNG('range-seed');
    for (let i = 0; i < 100; i++) {
      const val = rng.randomRange(5, 15);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThan(15);
    }
  });

  it('randomInt returns integers within [min, max] inclusive', () => {
    const rng = new SeededRNG('int-seed');
    const counts = new Map<number, number>();

    for (let i = 0; i < 200; i++) {
      const val = rng.randomInt(1, 4);
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(4);
      counts.set(val, (counts.get(val) || 0) + 1);
    }

    expect(counts.has(1)).toBe(true);
    expect(counts.has(2)).toBe(true);
    expect(counts.has(3)).toBe(true);
    expect(counts.has(4)).toBe(true);
  });
});
