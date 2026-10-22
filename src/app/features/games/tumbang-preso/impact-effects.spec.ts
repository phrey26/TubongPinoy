import { vi } from 'vitest';
import { ImpactEffects } from './impact-effects';

describe('ImpactEffects', () => {
  it('animates dust and sparks from separate atlas rows and expires them', () => {
    const effects = new ImpactEffects();
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const atlas = { complete: true, naturalWidth: 1024, naturalHeight: 512 } as HTMLImageElement;
    effects.play(100, 200, 'dust');
    effects.play(225, 120, 'spark');
    effects.update(0.15);
    effects.draw(ctx, atlas);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, atlas, 256, 0, 256, 256, 50, 150, 100, 100);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, atlas, 256, 256, 256, 256, 161, 56, 128, 128);
    vi.mocked(ctx.drawImage).mockClear();
    effects.update(0.5);
    effects.draw(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('clears impacts on reset and tolerates an unloaded atlas', () => {
    const effects = new ImpactEffects();
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    effects.play(100, 200, 'dust');
    effects.draw(ctx, undefined);
    effects.clear();
    effects.draw(ctx, { complete: true, naturalWidth: 1024, naturalHeight: 512 } as HTMLImageElement);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
