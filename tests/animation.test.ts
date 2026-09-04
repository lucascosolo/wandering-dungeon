import { describe, it, expect } from 'vitest';
import {
  AnimationTimeline,
  FLOATER_MS,
  LUNGE_DISTANCE,
  LUNGE_MS,
  MOVE_TWEEN_MS,
} from '../src/render/animation';
import { pressureLevel, wantsIdleFrames } from '../src/render/canvasRenderer';
import { dispatchAction } from '../src/core/engine';
import { createMockGameState, createMockEnemy, walkableStep } from './helpers';

describe('AnimationTimeline — movement tweens', () => {
  it('slides from the old tile to the new one and settles exactly', () => {
    const anim = new AnimationTimeline();
    anim.update(0);
    anim.moveFrom('e', { x: 0, y: 0 });
    const base = { x: 1, y: 0 };

    expect(anim.positionOf('e', base).x).toBe(0);
    anim.update(MOVE_TWEEN_MS / 2);
    const mid = anim.positionOf('e', base).x;
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
    anim.update(MOVE_TWEEN_MS + 1);
    expect(anim.positionOf('e', base)).toBe(base);
    expect(anim.active).toBe(false);
  });

  it('returns the base position untouched for anything not animating', () => {
    const anim = new AnimationTimeline();
    const base = { x: 4, y: 4 };
    expect(anim.positionOf('nobody', base)).toBe(base);
  });

  it('does nothing under reduced motion', () => {
    const anim = new AnimationTimeline();
    anim.reducedMotion = true;
    anim.update(0);
    anim.moveFrom('e', { x: 0, y: 0 });
    anim.lunge('e', 1, 0);
    anim.hitStop(100);
    expect(anim.active).toBe(false);
  });
});

describe('AnimationTimeline — lunge', () => {
  it('goes out toward the target and comes back to rest', () => {
    const anim = new AnimationTimeline();
    anim.update(0);
    anim.lunge('p', 1, 0);
    const base = { x: 2, y: 2 };
    anim.update(LUNGE_MS * 0.35);
    expect(anim.positionOf('p', base).x).toBeCloseTo(2 + LUNGE_DISTANCE, 5);
    anim.update(LUNGE_MS + 1);
    expect(anim.positionOf('p', base)).toBe(base);
  });
});

describe('AnimationTimeline — hit-stop', () => {
  it('freezes every tween for the freeze length, then resumes', () => {
    const anim = new AnimationTimeline();
    anim.update(0);
    anim.moveFrom('e', { x: 0, y: 0 });
    anim.hitStop(50);
    const base = { x: 1, y: 0 };

    anim.update(50);
    expect(anim.positionOf('e', base).x).toBe(0);
    anim.update(50 + MOVE_TWEEN_MS + 1);
    expect(anim.positionOf('e', base)).toBe(base);
  });

  it('takes the longer of two overlapping freezes rather than their sum', () => {
    const anim = new AnimationTimeline();
    anim.update(0);
    anim.moveFrom('e', { x: 0, y: 0 });
    anim.hitStop(40);
    anim.hitStop(60);
    anim.update(60);
    expect(anim.positionOf('e', { x: 1, y: 0 }).x).toBe(0);
    anim.update(61);
    expect(anim.positionOf('e', { x: 1, y: 0 }).x).toBeGreaterThan(0);
  });
});

describe('AnimationTimeline — floaters', () => {
  it('rises, fades and expires', () => {
    const anim = new AnimationTimeline();
    anim.update(0);
    anim.float(3, 3, '-9', '#fff');
    anim.update(FLOATER_MS * 0.5);
    const [mid] = anim.floaterFrames();
    expect(mid.rise).toBeGreaterThan(0);
    expect(mid.alpha).toBe(1);
    anim.update(FLOATER_MS * 0.9);
    expect(anim.floaterFrames()[0].alpha).toBeLessThan(1);
    anim.update(FLOATER_MS + 1);
    expect(anim.floaterFrames()).toHaveLength(0);
    expect(anim.active).toBe(false);
  });
});

describe('combat hits are recorded for the shell', () => {
  it('records the player striking an enemy, on the enemy tile', () => {
    const state = createMockGameState('hits-player-strikes');
    const step = walkableStep(state);
    const enemy = createMockEnemy({ x: step.x, y: step.y }, 'crawler');
    state.entities = [enemy];

    dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });

    const hit = state.combatHits.find(h => h.target === 'enemy');
    expect(hit).toBeDefined();
    expect(hit!.targetId).toBe(enemy.id);
    expect({ x: hit!.x, y: hit!.y }).toEqual({ x: step.x, y: step.y });
    expect(hit!.amount).toBeGreaterThan(0);
    expect(hit!.from).toEqual(state.player.position);
  });

  it('records an enemy striking the player with where it came from, and clears next turn', () => {
    const state = createMockGameState('hits-enemy-strikes');
    const step = walkableStep(state);
    const enemy = createMockEnemy({ x: step.x, y: step.y }, 'crawler');
    state.entities = [enemy];

    dispatchAction(state, { type: 'WAIT' });

    const hit = state.combatHits.find(h => h.target === 'player');
    expect(hit).toBeDefined();
    expect(hit!.from).toEqual({ x: step.x, y: step.y });
    expect(hit!.lethal).toBe(false);

    state.entities = [];
    dispatchAction(state, { type: 'WAIT' });
    expect(state.combatHits).toHaveLength(0);
  });
});

describe('pressureLevel', () => {
  it('is calm with turns to spare and climbs as the shift nears', () => {
    const state = createMockGameState('pressure');
    state.shiftCountdown = 6;
    expect(pressureLevel(state)).toBe(0);
    state.shiftCountdown = 3;
    const three = pressureLevel(state);
    state.shiftCountdown = 1;
    const one = pressureLevel(state);
    expect(three).toBeGreaterThan(0);
    expect(one).toBeGreaterThan(three);
    expect(one).toBeLessThanOrEqual(1);
  });

  it('is zero under stasis', () => {
    const state = createMockGameState('pressure-stasis');
    state.shiftCountdown = 1;
    state.isStasisActive = true;
    expect(pressureLevel(state)).toBe(0);
    expect(wantsIdleFrames(state)).toBe(false);
  });

  it('keeps the board alive while the Pursuer hunts', () => {
    const state = createMockGameState('pressure-pursuer');
    state.shiftCountdown = 8;
    state.entities = [createMockEnemy({ x: 1, y: 1 }, 'pursuer')];
    expect(wantsIdleFrames(state)).toBe(true);
  });
});
