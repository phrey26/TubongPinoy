import { vi } from 'vitest';
import { AldugoEffects } from './aldugo-effects';

describe('Aldugo legendary effects', () => {
  const context = () => ({ save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() }) as unknown as CanvasRenderingContext2D;

  it('expires its flight and hit effects and clears them on reset', () => {
    const fx = new AldugoEffects();
    const ctx = context();
    fx.flight(100, 200);
    fx.burst(100, 100, 'hit');
    fx.drawTrail(ctx); fx.drawImpact(ctx);
    expect(ctx.fillRect).toHaveBeenCalled();
    vi.mocked(ctx.fillRect).mockClear();
    for (let i = 0; i < 20; i++) fx.update(0.05);
    fx.drawTrail(ctx); fx.drawImpact(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    fx.burst(100, 100, 'hit');
    fx.flight(100, 200);
    fx.clear();
    fx.drawTrail(ctx); fx.drawImpact(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('bounds particles and rings during repeated collisions', () => {
    const fx = new AldugoEffects();
    for (let i = 0; i < 1000; i++) fx.burst(100, 100, 'hit');
    const ctx = context();
    fx.drawImpact(ctx);
    // At most 128 particles and 8 rings of 36 two-rectangle stars.
    expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeLessThanOrEqual(128 + 8 * 36 * 2);
  });

  it('suppresses moving effects with reduced motion and keeps a static signature', () => {
    const fx = new AldugoEffects();
    fx.burst(100, 100, 'hit');
    fx.reducedMotion = true;
    fx.update(0.05);
    fx.flight(100, 200); fx.burst(100, 100, 'launch');
    const ctx = context();
    fx.drawTrail(ctx); fx.drawImpact(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    fx.drawAura(ctx, 100, 200);
    const first = vi.mocked(ctx.fillRect).mock.calls.slice();
    vi.mocked(ctx.fillRect).mockClear();
    fx.update(0.05); fx.drawAura(ctx, 100, 200);
    expect(vi.mocked(ctx.fillRect).mock.calls).toEqual(first);
    fx.reducedMotion = false;
    vi.mocked(ctx.fillRect).mockClear();
    fx.drawImpact(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
