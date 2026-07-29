export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/**
 * Tiny procedural particle system for combat and shift feedback.
 * Positions are in tile space; the renderer converts them to screen space.
 */
export class ParticleSystem {
  private particles: Particle[] = [];

  burst(tileX: number, tileY: number, color: string, count = 10): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 0.04 + Math.random() * 0.08;
      this.particles.push({
        x: tileX + 0.5,
        y: tileY + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color,
        size: 2 + Math.random() * 2,
      });
    }
  }

  /** Advance the simulation. `dt` is in frames-at-60fps units. */
  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= 0.03 * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    tileSize: number,
    offsetX: number,
    offsetY: number
  ): void {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(
        p.x * tileSize + offsetX - p.size / 2,
        p.y * tileSize + offsetY - p.size / 2,
        p.size,
        p.size
      );
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles = [];
  }
}
