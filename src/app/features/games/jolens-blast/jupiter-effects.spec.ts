import { describe, expect, it, vi } from 'vitest';
import { JupiterEffects } from './jupiter-effects';

describe('Jupiter effects', () => {
  const canvas = () => ({ save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), translate: vi.fn(),
    rotate: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn() }) as unknown as CanvasRenderingContext2D;
  it('bounds and expires dust, and clears it for reduced motion', () => {
    const fx = new JupiterEffects(), ctx = canvas();
    for (let i = 0; i < 60; i++) { fx.update(.05); fx.flight(0, 0); fx.burst(0, 0); }
    fx.drawDust(ctx);
    expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeLessThanOrEqual(112);
    for (let i = 0; i < 10; i++) fx.update(.05);
    vi.mocked(ctx.fillRect).mockClear(); fx.drawDust(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    fx.burst(0, 0); fx.reducedMotion = true; fx.update(.05);
    fx.flight(0, 0); fx.drawDust(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
  it('shows collision rings, expires them, and suppresses them for reduced motion', () => {
    const fx = new JupiterEffects(), ctx = canvas();
    fx.burst(10, 20, true); fx.drawImpact(ctx);
    expect(ctx.ellipse).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalled();
    for (let i = 0; i < 10; i++) fx.update(.05);
    vi.mocked(ctx.ellipse).mockClear(); fx.drawImpact(ctx);
    expect(ctx.ellipse).not.toHaveBeenCalled();
    fx.burst(10, 20, true); fx.reducedMotion = true; fx.update(.05);
    fx.reducedMotion = false; fx.drawImpact(ctx);
    expect(ctx.ellipse).not.toHaveBeenCalled();
  });

  it('draws both orbit halves and freezes moon positions with reduced motion', () => {
    const fx = new JupiterEffects(), ctx = canvas();
    fx.reducedMotion = true;
    fx.drawOrbit(ctx, 30, 40, 20, false); fx.drawOrbit(ctx, 30, 40, 20, true);
    expect(ctx.ellipse).toHaveBeenCalledTimes(2);
    const moons = vi.mocked(ctx.arc).mock.calls.slice();
    vi.mocked(ctx.arc).mockClear(); fx.update(.05);
    fx.drawOrbit(ctx, 30, 40, 20, false); fx.drawOrbit(ctx, 30, 40, 20, true);
    expect(vi.mocked(ctx.arc).mock.calls).toEqual(moons);
  });
});
