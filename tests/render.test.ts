import { describe, it, expect } from 'vitest';
import { isGuardingExit } from '../src/render/canvasRenderer';
import { createMockGameState, createMockEnemy } from './helpers';

describe('isGuardingExit', () => {
  const exit = createMockGameState().floorMap.exit;

  it('flags a Riftbound standing on the exit', () => {
    expect(isGuardingExit(createMockEnemy(exit, 'riftbound'), exit)).toBe(true);
  });

  it('flags a Riftbound parked beside the exit', () => {
    const beside = { x: exit.x + 1, y: exit.y - 1 };
    expect(isGuardingExit(createMockEnemy(beside, 'riftbound'), exit)).toBe(true);
  });

  it('does not flag a Riftbound still on its way', () => {
    const away = { x: exit.x + 3, y: exit.y };
    expect(isGuardingExit(createMockEnemy(away, 'riftbound'), exit)).toBe(false);
  });

  it('does not flag a dead Riftbound on the exit', () => {
    const corpse = createMockEnemy(exit, 'riftbound');
    corpse.hp = 0;
    expect(isGuardingExit(corpse, exit)).toBe(false);
  });

  it('does not flag another species that happens to be at the exit', () => {
    expect(isGuardingExit(createMockEnemy(exit, 'crawler'), exit)).toBe(false);
  });
});
