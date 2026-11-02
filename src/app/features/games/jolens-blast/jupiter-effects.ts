/** Cosmetic Jupiter moon orbit and warm atmospheric dust; no gameplay or audio changes. */
export class JupiterEffects {
  private time = 0;
  private lastTrail = -Infinity;
  private lastBurst = -Infinity;
  private dust: { x: number; y: number; vx: number; vy: number; age: number; color: string }[] = [];
  private impacts: { x: number; y: number; age: number }[] = [];
  reducedMotion = false;

  update(seconds: number): void {
    if (this.reducedMotion) { this.clear(); return; }
    const dt = Math.max(0, Math.min(.05, seconds));
    this.time += dt;
    for (const impact of this.impacts) impact.age += dt;
    this.impacts = this.impacts.filter(impact => impact.age < .48);
    for (const p of this.dust) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.dust = this.dust.filter(p => p.age < .4);
  }

  flight(x: number, y: number): void {
    if (this.reducedMotion || this.time - this.lastTrail < 1 / 30) return;
    this.lastTrail = this.time;
    this.add(x - 5, y, -8, 10, '#e5b37b');
    this.add(x + 5, y, 8, 10, '#b85f3d');
  }

  burst(x: number, y: number, collision = false): void {
    if (this.reducedMotion || this.time - this.lastBurst < .08) return;
    this.lastBurst = this.time;
    if (collision) {
      this.impacts.push({ x, y, age: 0 });
      this.impacts = this.impacts.slice(-8);
    }
    const count = collision ? 20 : 12;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      this.add(x, y, Math.cos(angle) * (collision ? 135 : 75), Math.sin(angle) * (collision ? 95 : 45), i % 2 ? '#ce7946' : '#fff0cb');
    }
  }

  private add(x: number, y: number, vx: number, vy: number, color: string): void {
    this.dust.push({ x, y, vx, vy, color, age: 0 });
    this.dust = this.dust.slice(-56);
  }

  drawDust(ctx: CanvasRenderingContext2D): void {
    if (this.reducedMotion) return;
    ctx.save();
    for (const p of this.dust) {
      ctx.globalAlpha = Math.min(1, (1 - p.age / .4) * 1.6);
      ctx.fillStyle = '#75432e';
      ctx.fillRect(Math.round(p.x) - 4, Math.round(p.y) - 3, 8, 6);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 2, 6, 4);
    }
    ctx.restore();
  }

  drawImpact(ctx: CanvasRenderingContext2D): void {
    if (this.reducedMotion) return;
    ctx.save();
    for (const impact of this.impacts) {
      const progress = impact.age / .48;
      ctx.globalAlpha = Math.min(1, (1 - progress) * 1.8);
      ctx.beginPath();
      ctx.ellipse(impact.x, impact.y, 16 + 48 * progress, 12 + 32 * progress, -.3, 0, Math.PI * 2);
      ctx.strokeStyle = '#8d452c'; ctx.lineWidth = 8 * (1 - progress) + 2; ctx.stroke();
      ctx.strokeStyle = '#ffe7b2'; ctx.lineWidth = 4 * (1 - progress) + 1; ctx.stroke();
      // Short cream core marks the exact contact before the storm ring expands.
      if (progress < .25) {
        ctx.globalAlpha = .85 * (1 - progress / .25);
        ctx.fillStyle = '#fff3d6'; ctx.beginPath();
        ctx.arc(impact.x, impact.y, 13 + 12 * progress, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Split orbit keeps its rear behind the shooter and its near side in front. */
  drawOrbit(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, front: boolean): void {
    const start = front ? 0 : Math.PI;
    const rx = radius + 11, ry = radius * .65;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-.3);
    ctx.globalAlpha = .75;
    ctx.strokeStyle = '#b87849'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, start, start + Math.PI); ctx.stroke();
    ctx.strokeStyle = '#ffe3ad'; ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < 2; i++) {
      const angle = (this.time * 2 + i * Math.PI) % (Math.PI * 2);
      if ((Math.sin(angle) >= 0) !== front) continue;
      const mx = Math.cos(angle) * rx, my = Math.sin(angle) * ry;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#75432e'; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i ? '#d99a65' : '#fff0d2'; ctx.beginPath(); ctx.arc(mx - .5, my - .5, 2.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  clear(): void { this.dust = []; this.impacts = []; this.time = 0; this.lastTrail = this.lastBurst = -Infinity; }
}
