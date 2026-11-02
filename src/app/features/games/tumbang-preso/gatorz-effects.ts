/** Gatorz-only amber flecks. Cosmetic, bounded, and independent of shop availability. */
export class GatorzEffects {
  private particles: { x: number; y: number; vx: number; vy: number; age: number; life: number }[] = [];
  private time = 0;
  private lastTrail = -Infinity;
  private lastBurst = -Infinity;
  reducedMotion = false;

  update(seconds: number): void {
    if (this.reducedMotion) { this.clear(); return; }
    const dt = Math.max(0, Math.min(seconds, .05));
    this.time += dt;
    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 35 * dt; }
    this.particles = this.particles.filter(p => p.age < p.life);
  }

  flight(x: number, y: number): void {
    if (this.reducedMotion || this.time - this.lastTrail < 1 / 45) return;
    this.lastTrail = this.time;
    this.add(x - 4, y, Math.sin(this.time * 37) * 20, 12, .38);
    this.add(x + 4, y, -Math.sin(this.time * 37) * 20, 12, .38);
  }

  burst(x: number, y: number, kind: 'launch' | 'bounce' | 'hit'): void {
    if (this.reducedMotion || this.time - this.lastBurst < .08) return;
    this.lastBurst = this.time;
    const count = kind === 'hit' ? 16 : 10;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      const speed = kind === 'hit' ? 105 : 70;
      this.add(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, .46);
    }
  }

  private add(x: number, y: number, vx: number, vy: number, life: number): void {
    this.particles.push({ x, y, vx, vy, age: 0, life });
    this.particles = this.particles.slice(-64);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.reducedMotion) return;
    ctx.save();
    for (const p of this.particles) {
      const life = 1 - p.age / p.life;
      const size = Math.round(4 + 4 * life);
      const x = Math.round(p.x), y = Math.round(p.y);
      // Dark amber edge keeps the gold visible against the bright street.
      ctx.globalAlpha = Math.min(1, life * 1.8);
      ctx.fillStyle = '#a9570b';
      ctx.fillRect(x - size / 2 - 1, y - size / 2 - 1, size + 2, size + 2);
      ctx.fillStyle = '#ffc32d';
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.fillStyle = '#fff5bf';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    ctx.restore();
  }

  clear(): void { this.particles = []; this.time = 0; this.lastTrail = this.lastBurst = -Infinity; }
}
