interface Particle {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; size: number; color: string; gravity: number;
}
interface Ripple { x: number; y: number; age: number; radius: number; color: string; }

export const FEEDBACK_COLORS = {
  dust: ['#c5af86', '#e2cca1', '#f8e7be'],
  tin: ['#fff3c4', '#facc65', '#cbd5db'],
  glass: ['#e0f5ff', '#7dd3fc', '#fff3c4'],
  win: ['#facc65', '#86efac', '#7dd3fc', '#f9a8d4'],
} as const;

/** Cosmetic only: time-based, bounded pixel effects shared by the two boards. */
export class GameFeedback {
  private particles: Particle[] = [];
  private trails: Particle[] = [];
  private ripples: Ripple[] = [];
  private time = 0;
  private lastImpact = -Infinity;
  private lastTrail = -Infinity;
  private shake = 0;
  private motionReduced = false;

  get count(): number { return this.particles.length + this.trails.length + this.ripples.length; }
  get reducedMotion(): boolean { return this.motionReduced; }
  set reducedMotion(value: boolean) {
    this.motionReduced = value;
    if (value) this.clear();
  }

  private burst(x: number, y: number, colors: readonly string[], count: number, force: number,
    direction?: number): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const angle = direction === undefined ? i / count * Math.PI * 2
        : direction + (Math.random() - 0.5) * 1.5;
      const speed = force * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30,
        age: 0, life: 0.3 + Math.random() * 0.3, size: 3 + Math.floor(Math.random() * 3),
        color: colors[i % colors.length], gravity: 150 });
    }
    this.particles = this.particles.slice(-128);
  }

  launch(x: number, y: number, vx: number, vy: number): void {
    this.burst(x, y, FEEDBACK_COLORS.dust, 12, 90, Math.atan2(-vy, -vx));
    this.ripple(x, y, '#f8e7be', 26);
  }

  trail(x: number, y: number, speed: number, color: string): void {
    if (this.reducedMotion || speed < 3 || this.time - this.lastTrail < 1 / 60) return;
    this.lastTrail = this.time;
    this.trails.push({ x, y, vx: 0, vy: 0, age: 0, life: 0.18,
      size: Math.min(10, 3 + speed / 3), color, gravity: 0 });
    this.trails = this.trails.slice(-24);
  }

  impact(x: number, y: number, strength: number, colors: readonly string[]): void {
    // Dense marble collisions can report many contacts in one tick.
    if (this.reducedMotion || this.time - this.lastImpact < 0.045) return;
    this.lastImpact = this.time;
    const force = Math.max(0, Math.min(1, strength));
    this.burst(x, y, colors, 6 + Math.round(force * 8), 70 + force * 70);
    this.ripple(x, y, colors[0], 22 + force * 20);
    this.shake = Math.max(this.shake, 0.07 + force * 0.08);
  }

  ripple(x: number, y: number, color: string, radius = 40): void {
    if (this.reducedMotion) return;
    this.ripples.push({ x, y, color, radius, age: 0 });
    this.ripples = this.ripples.slice(-12);
  }

  celebrate(x: number, y: number): void {
    this.burst(x, y, FEEDBACK_COLORS.win, 40, 180, -Math.PI / 2);
    this.ripple(x, y, '#fff3c4', 80);
  }

  update(seconds: number): void {
    const dt = Math.max(0, seconds);
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    for (const particle of [...this.particles, ...this.trails]) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
    }
    this.particles = this.particles.filter(p => p.age < p.life);
    this.trails = this.trails.filter(p => p.age < p.life);
    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter(r => r.age < 0.32);
  }

  /** Percent translation keeps the nudge proportional at any canvas display size. */
  get canvasTransform(): string {
    if (!this.shake || this.reducedMotion) return '';
    const amplitude = 2.5 * this.shake / 0.15;
    const x = Math.round(Math.sin(this.time * 95) * amplitude);
    const y = Math.round(Math.cos(this.time * 115) * amplitude * 0.6);
    return `translate(${x / 450 * 100}%, ${y / 800 * 100}%) scale(1.012)`;
  }

  drawTrails(ctx: CanvasRenderingContext2D): void { this.drawParticles(ctx, this.trails, 0.45); }

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawParticles(ctx, this.particles, 1);
    ctx.save();
    for (const ripple of this.ripples) {
      const progress = ripple.age / 0.32;
      ctx.globalAlpha = (1 - progress) * 0.65;
      ctx.fillStyle = ripple.color;
      const radius = 8 + ripple.radius * progress;
      for (let i = 0; i < 20; i++) {
        const angle = i / 20 * Math.PI * 2;
        ctx.fillRect(Math.round((ripple.x + Math.cos(angle) * radius) / 2) * 2,
          Math.round((ripple.y + Math.sin(angle) * radius) / 2) * 2, 3, 3);
      }
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], opacity: number): void {
    ctx.save();
    for (const p of particles) {
      const remaining = 1 - p.age / p.life;
      const size = Math.max(2, Math.round(p.size * remaining));
      ctx.globalAlpha = remaining * opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    }
    ctx.restore();
  }

  /** A static, segmented power gauge remains useful with reduced motion enabled. */
  drawPower(ctx: CanvasRenderingContext2D, x: number, y: number, power: number): void {
    const level = Math.max(0, Math.min(1, power));
    ctx.save();
    ctx.fillStyle = '#292524';
    ctx.fillRect(Math.round(x - 43), Math.round(y - 3), 86, 14);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < Math.ceil(level * 10)
        ? (i >= 8 ? '#f9a8d4' : i >= 5 ? '#facc65' : '#86efac') : '#57534e';
      ctx.fillRect(Math.round(x - 39 + i * 8), Math.round(y), 6, 8);
    }
    ctx.restore();
  }

  clear(): void {
    this.particles = []; this.trails = []; this.ripples = [];
    this.shake = 0; this.lastImpact = -Infinity; this.lastTrail = -Infinity;
  }
}
