import { JOLENS_ASSETS } from './jolens-assets';

export class MarbleEffects {
  private effects: { x: number; y: number; kind: 'dust' | 'sparks'; age: number }[] = [];
  reducedMotion = false;

  play(x: number, y: number, kind: 'dust' | 'sparks'): void {
    if (this.reducedMotion) return;
    this.effects.push({ x, y, kind, age: 0 });
    this.effects = this.effects.slice(-32);
  }

  update(seconds: number): void {
    for (const effect of this.effects) effect.age += seconds;
    this.effects = this.effects.filter(effect => effect.age < (effect.kind === 'dust' ? 0.4 : 0.24));
  }

  draw(draw: (path: string, x: number, y: number, width: number, height: number) => unknown): void {
    for (const effect of this.effects) {
      const frames = effect.kind === 'dust' ? JOLENS_ASSETS.dust : JOLENS_ASSETS.sparks;
      const duration = effect.kind === 'dust' ? 0.1 : 0.08;
      const size = effect.kind === 'dust' ? 48 : 32;
      draw(frames[Math.min(frames.length - 1, Math.floor(effect.age / duration))],
        effect.x - size / 2, effect.y - size / 2, size, size);
    }
  }

  clear(): void { this.effects = []; }
}
