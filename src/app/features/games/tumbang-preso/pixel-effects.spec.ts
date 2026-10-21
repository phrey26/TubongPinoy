import { PixelEffects } from './pixel-effects';

describe('PixelEffects', () => {
  it('bounds particle counts during repeated impacts and clears expired effects', () => {
    const effects = new PixelEffects();
    for (let i = 0; i < 100; i++) effects.burst(225, 120, ['#ffffff'], 28);
    expect(effects.count).toBeLessThanOrEqual(128);
    expect(effects.count).toBeGreaterThan(0);
    effects.update(1);
    expect(effects.count).toBe(0);
  });

  it('disables particles for reduced motion', () => {
    const effects = new PixelEffects();
    effects.reducedMotion = true;
    effects.burst(225, 120, ['#ffffff']);
    expect(effects.count).toBe(0);
  });

  it('clears particles when a round resets', () => {
    const effects = new PixelEffects();
    effects.burst(225, 680, ['#ffffff']);
    effects.clear();
    expect(effects.count).toBe(0);
  });
});
