import { vi } from 'vitest';
import { MarbleEffects } from './marble-effects';
import { JOLENS_ASSETS } from './jolens-assets';

describe('Marble sprite effects', () => {
  it('advances separate dust and spark frames then expires them', () => {
    const effects = new MarbleEffects();
    const draw = vi.fn();
    effects.play(100, 200, 'dust');
    effects.play(100, 200, 'sparks');
    effects.update(0.17);
    effects.draw(draw);
    expect(draw).toHaveBeenCalledWith(JOLENS_ASSETS.dust[1], 76, 176, 48, 48);
    expect(draw).toHaveBeenCalledWith(JOLENS_ASSETS.sparks[2], 84, 184, 32, 32);
    draw.mockClear();
    effects.update(0.3);
    effects.draw(draw);
    expect(draw).not.toHaveBeenCalled();
  });

  it('bounds collision bursts, clears on reset, and respects reduced motion', () => {
    const effects = new MarbleEffects();
    const draw = vi.fn();
    for (let i = 0; i < 100; i++) effects.play(0, 0, 'sparks');
    effects.draw(draw);
    expect(draw).toHaveBeenCalledTimes(32);
    effects.clear();
    effects.reducedMotion = true;
    effects.play(0, 0, 'dust');
    draw.mockClear();
    effects.draw(draw);
    expect(draw).not.toHaveBeenCalled();
  });
});
