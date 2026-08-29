import { describe, it, expect } from 'vitest';
import { createItem } from '../src/core/game';

describe('Rift Shard', () => {
  it('is a registered item type with the displacement category', () => {
    const item = createItem('rift_shard', 'rift_test');
    expect(item.type).toBe('rift_shard');
    expect(item.category).toBe('displacement');
    expect(item.name).toBe('Rift Shard');
  });
});
