export const ALDUGO_FX_ATLAS = 'assets/tumbang-preso-skins-assets/aldugo-fx-atlas.png';
type BurstKind = 'launch' | 'bounce' | 'hit';

/** Generated RGBA sprite artwork, played in canvas space without changing shot physics. */
export class AldugoEffects {
  private bursts: { x: number; y: number; age: number; kind: BurstKind }[] = [];
  private trail: { x: number; y: number; age: number; angle: number; frame: number }[] = [];
  private time = 0;
  private lastTrail = -Infinity;
  private lastBurst = -Infinity;
  private angle = 0;
  reducedMotion = false;

  update(seconds: number): void {
    if (this.reducedMotion) { this.clear(); return; }
    const dt = Math.max(0, Math.min(seconds, 0.05));
    this.time += dt;
    for (const burst of this.bursts) burst.age += dt;
    for (const point of this.trail) point.age += dt;
    this.bursts = this.bursts.filter(b => b.age < this.duration(b.kind));
    this.trail = this.trail.filter(p => p.age < 0.2);
  }

  flight(x: number, y: number, vx = 0, vy = -1): void {
    if (this.reducedMotion) return;
    this.angle = Math.atan2(vy, vx) + Math.PI / 2;
    if (this.time - this.lastTrail < 1 / 30) return;
    this.lastTrail = this.time;
    this.trail.push({ x, y, age: 0, angle: this.angle, frame: 12 + Math.floor(this.time * 14) % 4 });
    this.trail = this.trail.slice(-8);
  }

  burst(x: number, y: number, kind: BurstKind): void {
    if (this.reducedMotion || (kind === 'bounce' && this.time - this.lastBurst < 0.08)) return;
    this.lastBurst = this.time;
    this.bursts.push({ x, y, age: 0, kind });
    this.bursts = this.bursts.slice(-8);
  }

  drawTrail(ctx: CanvasRenderingContext2D, atlas?: HTMLImageElement): void {
    if (this.reducedMotion || !this.ready(atlas)) return;
    ctx.save();
    for (const point of this.trail) {
      ctx.globalAlpha = (1 - point.age / 0.2) * 0.28;
      this.frame(ctx, atlas, point.frame, point.x, point.y, 70, point.angle, 0.3);
    }
    ctx.restore();
  }

  drawAura(ctx: CanvasRenderingContext2D, x: number, y: number, atlas?: HTMLImageElement, flying = false): void {
    if (!this.ready(atlas)) return;
    ctx.save();
    if (this.reducedMotion) {
      ctx.globalAlpha = 0.65;
      this.frame(ctx, atlas, 0, x, y, 54);
    } else if (flying) {
      // The comet head follows the slipper; its painted tail points away from travel.
      this.frame(ctx, atlas, 12 + Math.floor(this.time * 14) % 4, x, y, 94, this.angle, 0.3);
    } else {
      ctx.globalAlpha = 0.65;
      this.frame(ctx, atlas, 1, x, y, 76, this.time * 0.65);
    }
    ctx.restore();
  }

  drawImpact(ctx: CanvasRenderingContext2D, atlas?: HTMLImageElement): void {
    if (this.reducedMotion || !this.ready(atlas)) return;
    ctx.save();
    for (const burst of this.bursts) {
      const progress = burst.age / this.duration(burst.kind);
      const hit = burst.kind === 'hit';
      const frame = (hit ? 4 : 0) + Math.min(hit ? 7 : 3, Math.floor(progress * (hit ? 8 : 4)));
      // Fade the last painted embers instead of snapping the animation off.
      ctx.globalAlpha = Math.min(1, (1 - progress) * 4);
      this.frame(ctx, atlas, frame, burst.x, burst.y, hit ? 240 : burst.kind === 'launch' ? 120 : 92);
    }
    ctx.restore();
  }

  private duration(kind: BurstKind): number { return kind === 'hit' ? 0.8 : 0.36; }

  private ready(atlas?: HTMLImageElement): atlas is HTMLImageElement {
    return !!atlas?.complete && atlas.naturalWidth >= 4 && atlas.naturalHeight >= 4;
  }

  private frame(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, index: number,
    x: number, y: number, size: number, angle = 0, anchorY = 0.5): void {
    const column = index % 4, row = Math.floor(index / 4);
    const sx = Math.round(column * atlas.naturalWidth / 4);
    const sy = Math.round(row * atlas.naturalHeight / 4);
    const sw = Math.round((column + 1) * atlas.naturalWidth / 4) - sx;
    const sh = Math.round((row + 1) * atlas.naturalHeight / 4) - sy;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(atlas, sx, sy, sw, sh, -size / 2, -size * anchorY, size, size);
    ctx.restore();
  }

  clear(): void {
    this.bursts = []; this.trail = []; this.angle = 0; this.time = 0;
    this.lastTrail = -Infinity; this.lastBurst = -Infinity;
  }
}
