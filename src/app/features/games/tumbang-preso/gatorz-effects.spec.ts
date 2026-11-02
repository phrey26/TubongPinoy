import { describe, expect, it, vi } from 'vitest';
import { GatorzEffects } from './gatorz-effects';

describe('Gatorz flecks', () => {
  const canvas = () => ({ save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() }) as unknown as CanvasRenderingContext2D;
  it('bounds particles and expires them after a short trail or impact', () => {
    const fx = new GatorzEffects();
    const ctx = canvas();
    for (let i = 0; i < 50; i++) {
      fx.update(.05); fx.flight(10, 20); fx.burst(10, 20, 'hit');
    }
    fx.draw(ctx);
    expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeLessThanOrEqual(192);
    for (let i = 0; i < 11; i++) fx.update(.05);
    vi.mocked(ctx.fillRect).mockClear(); fx.draw(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
  it('clears particles and suppresses animation for reduced motion', () => {
    const fx = new GatorzEffects();
    const ctx = canvas();
    fx.burst(10, 20, 'launch'); fx.clear(); fx.draw(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    fx.burst(10, 20, 'hit'); fx.reducedMotion = true; fx.update(.05);
    fx.flight(10, 20); fx.burst(10, 20, 'bounce'); fx.draw(ctx);
    fx.reducedMotion = false; fx.draw(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
