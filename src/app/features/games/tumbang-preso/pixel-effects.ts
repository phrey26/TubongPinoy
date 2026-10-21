interface PixelParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  duration: number;
  size: number;
  color: string;
}

/** Small, bounded canvas effects; particles never participate in game collisions. */
export class PixelEffects {
  private particles: PixelParticle[] = [];
  reducedMotion = false;

  get count(): number { return this.particles.length; }

  burst(x: number, y: number, colors: string[], count = 10, force = 65): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * i / count + Math.random() * 0.4;
      const speed = force * (0.4 + Math.random() * 0.6);
      const duration = 0.25 + Math.random() * 0.3;
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 15,
        life: duration, duration, size: 2 + Math.floor(Math.random() * 3),
        color: colors[i % colors.length],
      });
    }
    this.particles = this.particles.slice(-128);
  }

  update(seconds: number): void {
    for (const particle of this.particles) {
      particle.life -= seconds;
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      particle.vy += 75 * seconds;
    }
    this.particles = this.particles.filter(particle => particle.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.duration);
      ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
    }
    ctx.restore();
  }

  clear(): void { this.particles = []; }
}
