import { frameSeconds, interpolateAngle } from './frame-timing';

describe('frame timing', () => {
  it('preserves dropped-frame time but bounds long stalls and ignores paused or invalid intervals', () => {
    expect(frameSeconds(100, 0, false)).toBe(0.1);
    expect(frameSeconds(10000, 0, false)).toBe(0.25);
    expect(frameSeconds(10000, 0, true)).toBe(0);
    expect(frameSeconds(10000, null, false)).toBe(0);
    expect(frameSeconds(0, 100, false)).toBe(0);
  });

  it('interpolates rotation across the wrap without reversing a full turn', () => {
    const angle = interpolateAngle(Math.PI * 2 - 0.1, 0.1, 0.5);
    expect(angle).toBeCloseTo(Math.PI * 2, 10);
    expect(interpolateAngle(-Math.PI * 2 + 0.1, -0.1, 0.5)).toBeCloseTo(-Math.PI * 2, 10);
  });
});
