import type { PhysicsMarble } from './marble-physics';

/** Cosmetic charge follows marble identity throughout one shot, including ring exits. */
export class SteelBallEffects {
  private charged = new Set<PhysicsMarble>();
  private bursts: { x: number; y: number; age: number; row: number }[] = [];
  private links: { source: PhysicsMarble; target: PhysicsMarble; age: number }[] = [];
  private wake: { x: number; y: number; angle: number; age: number }[] = [];
  private time = 0;
  private lastWake = -Infinity;
  reducedMotion = false;

  isCharged(marble: PhysicsMarble): boolean { return this.charged.has(marble); }

  contact(a: PhysicsMarble, b: PhysicsMarble, shooter: PhysicsMarble): void {
    if (a !== shooter && b !== shooter && !this.charged.has(a) && !this.charged.has(b)) return;
    const target = a === shooter || (this.charged.has(a) && !this.charged.has(b)) ? b : a;
    const source = target === a ? b : a;
    this.charged.add(a); this.charged.add(b);
    if (this.reducedMotion) return;
    if (this.links.some(link => link.age < .1 &&
      ((link.source === a && link.target === b) || (link.source === b && link.target === a)))) return;
    this.links.push({ source, target, age: 0 });
    this.links = this.links.slice(-24);
    this.burst(target.x, target.y, 'hit');
  }

  burst(x: number, y: number, kind: 'launch' | 'hit'): void {
    if (this.reducedMotion) return;
    this.bursts.push({ x, y, age: 0, row: kind === 'launch' ? 1 : 2 });
    this.bursts = this.bursts.slice(-24);
  }

  flight(x: number, y: number, vx: number, vy: number): void {
    if (this.reducedMotion || this.time - this.lastWake < 1 / 60) return;
    this.lastWake = this.time;
    this.wake.push({ x, y, angle: Math.atan2(vy, vx), age: 0 });
    this.wake = this.wake.slice(-40);
  }

  update(seconds: number): void {
    const dt = Math.max(0, Math.min(seconds, .05));
    if (this.reducedMotion) { this.bursts = []; this.links = []; this.wake = []; return; }
    this.time += dt;
    for (const item of [...this.bursts, ...this.links, ...this.wake]) item.age += dt;
    this.bursts = this.bursts.filter(b => b.age < .4);
    this.links = this.links.filter(l => l.age < .56);
    this.wake = this.wake.filter(w => w.age < .65);
  }

  drawTrail(ctx: CanvasRenderingContext2D, atlas?: HTMLImageElement): void {
    if (!this.ready(atlas) || this.reducedMotion) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Join sampled positions into a continuous bolt ribbon, not isolated faint stamps.
    for (let i = 0; i < this.wake.length; i++) {
      const point = this.wake[i];
      const next = this.wake[i + 1];
      const dx = next ? next.x - point.x : Math.cos(point.angle) * 24;
      const dy = next ? next.y - point.y : Math.sin(point.angle) * 24;
      const life = 1 - point.age / .65;
      ctx.globalAlpha = Math.min(1, life * 1.6);
      this.frame(ctx, atlas, 12 + Math.floor(this.time * 12 + i) % 4,
        point.x + dx / 2, point.y + dy / 2, Math.hypot(dx, dy) + 28,
        64 + 32 * life, Math.atan2(dy, dx));
    }
    ctx.restore();
  }

  drawAura(ctx: CanvasRenderingContext2D, x: number, y: number, atlas?: HTMLImageElement): void {
    if (!this.ready(atlas)) return;
    ctx.save();
    ctx.globalAlpha = .8;
    this.frame(ctx, atlas, this.reducedMotion ? 0 : Math.floor(this.time * 9) % 4, x, y, 66, 66);
    ctx.restore();
  }

  drawImpact(ctx: CanvasRenderingContext2D, atlas?: HTMLImageElement): void {
    if (!this.ready(atlas)) return;
    // Attached cages travel with charged marbles, rather than remaining at the collision point.
    for (const marble of this.charged) this.drawAura(ctx, marble.x, marble.y, atlas);
    if (this.reducedMotion) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const link of this.links) {
      // Electricity connects the two actual colliding marbles, following both as they roll.
      const dx = link.target.x - link.source.x, dy = link.target.y - link.source.y;
      ctx.globalAlpha = Math.min(1, (1 - link.age / .56) * 2);
      this.frame(ctx, atlas, 12 + Math.min(3, Math.floor(link.age / .14)),
        (link.source.x + link.target.x) / 2, (link.source.y + link.target.y) / 2,
        Math.hypot(dx, dy), 76, Math.atan2(dy, dx));
    }
    for (const burst of this.bursts) {
      ctx.globalAlpha = Math.min(1, (1 - burst.age / .4) * 3);
      this.frame(ctx, atlas, burst.row * 4 + Math.min(3, Math.floor(burst.age / .1)),
        burst.x, burst.y, burst.row === 1 ? 110 : 140, burst.row === 1 ? 110 : 112);
    }
    ctx.restore();
  }

  private ready(atlas?: HTMLImageElement): atlas is HTMLImageElement {
    return !!atlas?.complete && atlas.naturalWidth >= 4 && atlas.naturalHeight >= 4;
  }

  private frame(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, index: number,
    x: number, y: number, width: number, height: number, angle = 0): void {
    const col = index % 4, row = Math.floor(index / 4);
    const sx = Math.round(col * atlas.naturalWidth / 4), sy = Math.round(row * atlas.naturalHeight / 4);
    const sw = Math.round((col + 1) * atlas.naturalWidth / 4) - sx;
    const sh = Math.round((row + 1) * atlas.naturalHeight / 4) - sy;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.drawImage(atlas, sx, sy, sw, sh, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  clear(): void {
    this.charged.clear(); this.links = []; this.bursts = []; this.wake = [];
    this.time = 0; this.lastWake = -Infinity;
  }
}
