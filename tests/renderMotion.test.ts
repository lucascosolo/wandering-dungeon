import { describe, it, expect } from 'vitest';
import { renderFrame } from '../src/render/canvasRenderer';
import { AnimationTimeline, MOVE_TWEEN_MS } from '../src/render/animation';
import { createMockGameState, createMockEnemy } from './helpers';

/**
 * A 2D context that records what was asked of it. Enough of the surface for
 * `renderFrame` to run end to end without a DOM, so the motion layer can be
 * checked by what the frame actually drew rather than by reading the code.
 */
function recordingContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const target: Record<string, unknown> = {};
  const noop = () => undefined;
  const methods = [
    'fillRect', 'strokeRect', 'fillText', 'strokeText', 'beginPath', 'arc', 'stroke',
    'setLineDash', 'createRadialGradient',
  ];
  for (const name of methods) {
    target[name] = (...args: unknown[]) => {
      calls.push({ name, args });
      if (name === 'createRadialGradient') return { addColorStop: noop };
      return undefined;
    };
  }
  return { ctx: target as unknown as CanvasRenderingContext2D, calls };
}

function textsDrawn(calls: { name: string; args: unknown[] }[]): string[] {
  return calls.filter(c => c.name === 'fillText').map(c => String(c.args[0]));
}

describe('renderFrame — motion layer', () => {
  it('draws the player between tiles mid-tween, and at rest once it ends', () => {
    const state = createMockGameState('render-tween');
    const anim = new AnimationTimeline();
    anim.update(0);
    const to = state.player.position;
    anim.moveFrom(state.player.id, { x: to.x - 1, y: to.y });
    anim.update(MOVE_TWEEN_MS * 0.3);

    // A viewport larger than the map centres it, so the camera is a constant
    // and a glyph's screen x is a straight function of its drawn tile.
    const playerX = (calls: { name: string; args: unknown[] }[]) => {
      const glyphs = calls.filter(c => c.name === 'fillText');
      return glyphs[glyphs.length - 1].args[1] as number;
    };
    const mid = recordingContext();
    renderFrame(mid.ctx, state, 5000, 5000, undefined, undefined, { anim, now: MOVE_TWEEN_MS * 0.3 });
    const still = recordingContext();
    renderFrame(still.ctx, state, 5000, 5000);

    const offset = playerX(still.calls) - playerX(mid.calls);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(30);

    anim.update(MOVE_TWEEN_MS * 2);
    const done = recordingContext();
    renderFrame(done.ctx, state, 5000, 5000, undefined, undefined, { anim, now: MOVE_TWEEN_MS * 2 });
    expect(playerX(done.calls)).toBe(playerX(still.calls));
  });

  it('floats damage figures over the board', () => {
    const state = createMockGameState('render-floater');
    const anim = new AnimationTimeline();
    anim.update(0);
    anim.float(state.player.position.x, state.player.position.y, '-12', '#ff4d6d');
    anim.update(100);

    const { ctx, calls } = recordingContext();
    renderFrame(ctx, state, 600, 400, undefined, undefined, { anim, now: 100 });

    expect(textsDrawn(calls)).toContain('-12');
    expect(calls.some(c => c.name === 'strokeText' && c.args[0] === '-12')).toBe(true);
  });

  it('paints the pressure vignette only when the shift is close', () => {
    const state = createMockGameState('render-vignette');
    const anim = new AnimationTimeline();
    anim.update(0);

    state.shiftCountdown = 8;
    const calm = recordingContext();
    renderFrame(calm.ctx, state, 600, 400, undefined, undefined, { anim, now: 0 });
    expect(calm.calls.some(c => c.name === 'createRadialGradient')).toBe(false);

    state.shiftCountdown = 1;
    const tense = recordingContext();
    renderFrame(tense.ctx, state, 600, 400, undefined, undefined, { anim, now: 0 });
    expect(tense.calls.some(c => c.name === 'createRadialGradient')).toBe(true);
  });

  it('draws an enemy where its tween says, and the Pursuer ring breathes', () => {
    const state = createMockGameState('render-enemy-tween');
    const p = state.player.position;
    const enemy = createMockEnemy({ x: p.x + 2, y: p.y }, 'pursuer');
    state.entities = [enemy];
    state.floorMap.visible[enemy.position.y][enemy.position.x] = true;
    const anim = new AnimationTimeline();
    anim.update(0);
    anim.moveFrom(enemy.id, { x: p.x + 3, y: p.y });
    anim.update(MOVE_TWEEN_MS * 0.5);

    const { ctx, calls } = recordingContext();
    renderFrame(ctx, state, 5000, 5000, undefined, undefined, { anim, now: MOVE_TWEEN_MS * 0.5 });
    const ring = calls.find(c => c.name === 'arc')!;
    const glyphs = calls.filter(c => c.name === 'fillText');
    const enemyGlyph = glyphs.find(c => c.args[0] === 'X')!;
    const playerGlyph = glyphs[glyphs.length - 1];
    // Ring and glyph share a centre, and the enemy sits strictly between its
    // old tile and its new one, measured against the player who did not move.
    expect(ring.args[0]).toBeCloseTo(enemyGlyph.args[1] as number, 5);
    const deltaTiles = ((enemyGlyph.args[1] as number) - (playerGlyph.args[1] as number)) / 30;
    expect(deltaTiles).toBeGreaterThan(2);
    expect(deltaTiles).toBeLessThan(3);
  });
});
