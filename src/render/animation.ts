import { Position } from '../core/state';

/**
 * Screen-side motion for a turn-based board. The engine moves things by whole
 * tiles in zero time; this layer owns the fraction of a second between one
 * board and the next — a glyph sliding into its new tile, an attacker lunging
 * at what it struck, a damage figure drifting up off the struck tile, and the
 * brief freeze that gives a hit its weight.
 *
 * Nothing here is game state. It reads the engine's positions as the truth and
 * only decides where to *draw* a thing this frame, so a mid-tween save, reload
 * or shift cannot desync anything: the target of every tween is wherever the
 * engine says the entity is now.
 *
 * Time is fed in from outside, in milliseconds, and the timeline keeps its own
 * clock. That clock stops during hit-stop, which is what freezes every tween at
 * once, and it makes the whole module testable with a hand-turned clock.
 */

export const MOVE_TWEEN_MS = 95;
export const LUNGE_MS = 140;
/** How far a lunge carries, in tiles: enough to read as a strike, short of the target. */
export const LUNGE_DISTANCE = 0.32;
export const FLOATER_MS = 760;
/** Frames-at-60fps worth of freeze on an ordinary landed blow. */
export const HIT_STOP_MS = 45;
export const KILL_STOP_MS = 90;

interface Tween {
  from: Position;
  start: number;
}

interface Lunge {
  dx: number;
  dy: number;
  start: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  start: number;
  /** Larger for heavier hits so the number's size carries its weight. */
  scale: number;
}

export interface FloaterFrame extends Floater {
  /** 0 at spawn → 1 at expiry. */
  progress: number;
  /** Tile-space rise applied by the drift. */
  rise: number;
  alpha: number;
}

/** Quick out, overshoot-free: `1 - (1 - t)^3`. */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

/** Out then back, peaking at the midpoint — the shape of a lunge. */
export function lungeCurve(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.35 ? easeOutCubic(c / 0.35) : 1 - easeOutCubic((c - 0.35) / 0.65);
}

export class AnimationTimeline {
  private clock = 0;
  private lastNow: number | null = null;
  private frozenMs = 0;
  private tweens = new Map<string, Tween>();
  private lunges = new Map<string, Lunge>();
  private floaters: Floater[] = [];

  /** Whether the reduced-motion preference is in force: no tweens, no freeze. */
  reducedMotion = false;

  /**
   * Advance the internal clock to wall time `now`. During hit-stop the clock
   * holds still and the freeze burns down instead, so everything in flight
   * pauses together.
   */
  update(now: number): void {
    if (this.lastNow === null) {
      this.lastNow = now;
      return;
    }
    const dt = Math.max(0, now - this.lastNow);
    this.lastNow = now;

    if (this.frozenMs > 0) {
      const used = Math.min(this.frozenMs, dt);
      this.frozenMs -= used;
      this.clock += dt - used;
    } else {
      this.clock += dt;
    }

    this.floaters = this.floaters.filter(f => this.clock - f.start < FLOATER_MS);
    for (const [id, tween] of this.tweens) {
      if (this.clock - tween.start >= MOVE_TWEEN_MS) this.tweens.delete(id);
    }
    for (const [id, lunge] of this.lunges) {
      if (this.clock - lunge.start >= LUNGE_MS) this.lunges.delete(id);
    }
  }

  /** True while anything would draw differently next frame. */
  get active(): boolean {
    return this.frozenMs > 0 || this.tweens.size > 0 || this.lunges.size > 0 || this.floaters.length > 0;
  }

  /** Begin sliding `id` from `from` to wherever the engine now says it stands. */
  moveFrom(id: string, from: Position): void {
    if (this.reducedMotion) return;
    this.tweens.set(id, { from: { ...from }, start: this.clock });
    // A lunge carried over a move would drag the glyph sideways off its path.
    this.lunges.delete(id);
  }

  /** Lunge `id` toward `(dx, dy)`, a unit-ish direction in tile space. */
  lunge(id: string, dx: number, dy: number): void {
    if (this.reducedMotion) return;
    const len = Math.hypot(dx, dy) || 1;
    this.lunges.set(id, { dx: dx / len, dy: dy / len, start: this.clock });
  }

  /** Freeze every tween for `ms`. Stacks to the longer of the two, never adds. */
  hitStop(ms: number): void {
    if (this.reducedMotion) return;
    this.frozenMs = Math.max(this.frozenMs, ms);
  }

  float(x: number, y: number, text: string, color: string, scale = 1): void {
    this.floaters.push({ x, y, text, color, start: this.clock, scale });
  }

  /** Forget everything in flight — a new floor, a resumed run. */
  clear(): void {
    this.tweens.clear();
    this.lunges.clear();
    this.floaters = [];
    this.frozenMs = 0;
  }

  /**
   * Where to draw `id` this frame, given the engine's position `base`. Returns
   * `base` itself when nothing is animating it, so the common case allocates
   * nothing.
   */
  positionOf(id: string, base: Position): Position {
    let x = base.x;
    let y = base.y;

    const tween = this.tweens.get(id);
    if (tween) {
      const t = easeOutCubic((this.clock - tween.start) / MOVE_TWEEN_MS);
      x = tween.from.x + (base.x - tween.from.x) * t;
      y = tween.from.y + (base.y - tween.from.y) * t;
    }

    const lunge = this.lunges.get(id);
    if (lunge) {
      const k = lungeCurve((this.clock - lunge.start) / LUNGE_MS) * LUNGE_DISTANCE;
      x += lunge.dx * k;
      y += lunge.dy * k;
    }

    if (!tween && !lunge) return base;
    return { x, y };
  }

  /** The live floaters with their drift and fade resolved for this frame. */
  floaterFrames(): FloaterFrame[] {
    return this.floaters.map(f => {
      const progress = Math.min(1, (this.clock - f.start) / FLOATER_MS);
      return {
        ...f,
        progress,
        rise: easeOutCubic(progress) * 0.9,
        alpha: progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4,
      };
    });
  }
}
