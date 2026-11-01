import { vi } from 'vitest';
import { AldugoEffects } from './aldugo-effects';

describe('Aldugo generated sprite effects', () => {
  const atlas = { complete: true, naturalWidth: 1254, naturalHeight: 1254 } as HTMLImageElement;
  const context = () => ({
    save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
  }) as unknown as CanvasRenderingContext2D;
  const advance = (fx: AldugoEffects, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / 0.05); i++) fx.update(0.05);
  };

  it('plays launch and hit frames from their atlas rows, then expires them', () => {
    const fx = new AldugoEffects(), ctx = context();
    fx.burst(100, 200, 'launch'); fx.burst(200, 100, 'hit');
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, atlas, 0, 0, 314, 314, -60, -60, 120, 120);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, atlas, 0, 314, 314, 313, -120, -120, 240, 240);
    advance(fx, 0.5);
    vi.mocked(ctx.drawImage).mockClear();
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    // Second row of the eight-frame impact sequence.
    expect(vi.mocked(ctx.drawImage).mock.calls[0][2]).toBe(627);
    advance(fx, 0.5);
    vi.mocked(ctx.drawImage).mockClear();
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('uses the comet frames and orients the tail away from velocity', () => {
    const fx = new AldugoEffects(), ctx = context();
    fx.flight(100, 200, 10, 0);
    fx.drawAura(ctx, 100, 200, atlas, true);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(vi.mocked(ctx.drawImage).mock.calls[0][2]).toBe(941);
    advance(fx, 0.25);
    vi.mocked(ctx.drawImage).mockClear();
    fx.drawTrail(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('bounds simultaneous bursts and clears all effects on reset', () => {
    const fx = new AldugoEffects(), ctx = context();
    for (let i = 0; i < 1000; i++) fx.burst(100, 100, 'hit');
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(8);
    fx.flight(100, 200);
    fx.clear();
    vi.mocked(ctx.drawImage).mockClear();
    fx.drawImpact(ctx, atlas); fx.drawTrail(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('tolerates an unavailable atlas and uses a static frame for reduced motion', () => {
    const fx = new AldugoEffects(), ctx = context();
    fx.burst(100, 100, 'hit');
    fx.drawImpact(ctx);
    fx.drawAura(ctx, 100, 200, { complete: false } as HTMLImageElement);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    fx.reducedMotion = true;
    fx.update(0.05);
    fx.flight(100, 200); fx.burst(100, 100, 'launch');
    fx.drawTrail(ctx, atlas); fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    fx.drawAura(ctx, 100, 200, atlas, true);
    expect(ctx.drawImage).toHaveBeenCalledWith(atlas, 0, 0, 314, 314, -27, -27, 54, 54);
    fx.reducedMotion = false;
    vi.mocked(ctx.drawImage).mockClear();
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
