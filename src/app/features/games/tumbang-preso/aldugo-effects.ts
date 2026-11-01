import { PixelEffects } from './pixel-effects';

const COLORS = ['#fde047', '#fb7185', '#c084fc', '#38bdf8', '#5eead4'];

/** Aldugo's cosmetic-only prism trail and starbursts. Coordinates stay in game space. */
export class AldugoEffects {
  private readonly sparks = new PixelEffects();
  private trail: { x: number; y: number; age: number; color: string }[] = [];
  private rings: { x: number; y: number; age: number; radius: number }[] = [];
  private time = 0;
  private lastTrail = -Infinity;
  private lastBurst = -Infinity;
  reducedMotion = false;

  update(seconds: number): void {
    if (this.reducedMotion) { this.clear(); return; }
    const dt = Math.max(0, Math.min(seconds, 0.05));
    this.time += dt;
    this.sparks.update(dt);
    for (const point of this.trail) point.age += dt;
    for (const ring of this.rings) ring.age += dt;
    this.trail = this.trail.filter(p => p.age < 0.28);
    this.rings = this.rings.filter(r => r.age < 0.6);
  }

  flight(x: number, y: number): void {
    if (this.reducedMotion || this.time - this.lastTrail < 1 / 60) return;
    this.lastTrail = this.time;
    this.trail.push({ x, y, age: 0, color: COLORS[Math.floor(this.time * 18) % COLORS.length] });
    this.trail = this.trail.slice(-20);
    this.sparks.burst(x, y, COLORS, 2, 24);
  }

  burst(x: number, y: number, kind: 'launch' | 'bounce' | 'hit'): void {
    if (this.reducedMotion || (kind === 'bounce' && this.time - this.lastBurst < 0.08)) return;
    this.lastBurst = this.time;
    const hit = kind === 'hit';
    this.sparks.burst(x, y, COLORS, hit ? 64 : 18, hit ? 240 : 95);
    this.rings.push({ x, y, age: 0, radius: hit ? 110 : 42 });
    this.rings = this.rings.slice(-8);
  }

  drawTrail(ctx: CanvasRenderingContext2D): void {
    if (this.reducedMotion) return;
    ctx.save();
    for (const point of this.trail) {
      const life = 1 - point.age / 0.28;
      ctx.globalAlpha = life * 0.55;
      ctx.fillStyle = point.color;
      const size = Math.round(4 + life * 12);
      ctx.fillRect(Math.round(point.x - size / 2), Math.round(point.y - size / 2), size, size);
      ctx.fillStyle = '#fff7ed';
      ctx.fillRect(Math.round(point.x - 2), Math.round(point.y - 2), 4, 4);
    }
    ctx.restore();
  }

  drawAura(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    // Reduced motion keeps a small, static legendary signature.
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5 + (this.reducedMotion ? 0 : this.time * 1.4);
      this.star(ctx, x + Math.cos(angle) * 27, y + Math.sin(angle) * 30, 3, COLORS[i]);
    }
    ctx.restore();
  }

  drawImpact(ctx: CanvasRenderingContext2D): void {
    if (this.reducedMotion) return;
    this.sparks.draw(ctx);
    ctx.save();
    for (const ring of this.rings) {
      const progress = ring.age / 0.6;
      ctx.globalAlpha = (1 - progress) * 0.85;
      for (let band = 0; band < 3; band++) {
        const radius = 8 + ring.radius * Math.max(0, progress - band * 0.12);
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6 + band * 0.15;
          this.star(ctx, ring.x + Math.cos(angle) * radius, ring.y + Math.sin(angle) * radius,
            Math.max(1, 4 * (1 - progress)), COLORS[(i + band) % COLORS.length]);
        }
      }
    }
    ctx.restore();
  }

  private star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - size), Math.round(y - 1), Math.round(size * 2), 2);
    ctx.fillRect(Math.round(x - 1), Math.round(y - size), 2, Math.round(size * 2));
  }

  clear(): void {
    this.sparks.clear(); this.trail = []; this.rings = [];
    this.lastTrail = -Infinity; this.lastBurst = -Infinity;
  }
}
