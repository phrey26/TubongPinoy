import { vi } from 'vitest';
import { SteelBallEffects } from './steel-ball-effects';
import { PhysicsMarble, stepMarbles } from './marble-physics';

const ball = (x: number, y: number, dy = 0): PhysicsMarble =>
  ({ x, y, radius: 20, dx: 0, dy, isMoving: dy !== 0 });
const atlas = { complete: true, naturalWidth: 1254, naturalHeight: 1254 } as HTMLImageElement;
const context = () => ({ save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D;

describe('Steel Ball magnetic chain effects', () => {
  it('propagates through actual marble contacts without charging unrelated marbles', () => {
    const fx = new SteelBallEffects();
    const shooter = ball(225, 380, -12), a = ball(225, 340), b = ball(225, 300);
    const unrelated = ball(100, 200);
    stepMarbles(shooter, [a, b, unrelated], { x: 225, y: 300, radius: 150 },
      { width: 450, height: 800 }, (_x, _y, _speed, _isShooter, first, second) => fx.contact(first, second, shooter));
    expect(fx.isCharged(a)).toBe(true);
    expect(fx.isCharged(b)).toBe(true);
    expect(fx.isCharged(unrelated)).toBe(false);
    const c = ball(100, 100), d = ball(140, 100);
    fx.contact(c, d, shooter);
    expect(fx.isCharged(c)).toBe(false);
    fx.contact(b, c, shooter);
    fx.contact(c, d, shooter);
    expect(fx.isCharged(d)).toBe(true);
  });

  it('follows moving charged marbles and clears the chain between shots', () => {
    const fx = new SteelBallEffects(), ctx = context();
    const shooter = ball(225, 380), target = ball(225, 340);
    fx.contact(shooter, target, shooter);
    target.x = 310;
    fx.drawImpact(ctx, atlas);
    expect(ctx.translate).toHaveBeenCalledWith(310, 340);
    fx.clear();
    vi.mocked(ctx.drawImage).mockClear();
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(fx.isCharged(target)).toBe(false);
  });

  it('keeps static charged markers but suppresses animated discharges with reduced motion', () => {
    const fx = new SteelBallEffects(), ctx = context();
    const shooter = ball(225, 380), target = ball(225, 340);
    fx.reducedMotion = true;
    fx.contact(shooter, target, shooter);
    fx.burst(225, 380, 'launch'); fx.flight(225, 380, 0, -10);
    fx.drawTrail(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(ctx.drawImage).mock.calls.every(call => call[1] === 0 && call[2] === 0)).toBe(true);
  });

  it('draws a continuous, thicker lightning wake that lasts longer than the old trail', () => {
    const fx = new SteelBallEffects(), ctx = context();
    fx.flight(225, 600, 0, -12);
    fx.update(.02);
    fx.flight(225, 588, 0, -12);
    for (let i = 0; i < 4; i++) fx.update(.05);
    fx.drawTrail(ctx, atlas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(ctx.drawImage).mock.calls.every(call => Number(call[8]) >= 34)).toBe(true);
    for (let i = 0; i < 10; i++) fx.update(.05);
    vi.mocked(ctx.drawImage).mockClear();
    fx.drawTrail(ctx, atlas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('draws lightning directly from shooter to target and from that target to the next', () => {
    const fx = new SteelBallEffects(), ctx = context();
    const shooter = ball(225, 380), first = ball(225, 340), second = ball(265, 340);
    fx.contact(shooter, first, shooter);
    fx.contact(second, first, shooter); // Charged source can be either collision participant.
    second.x = 280;
    fx.drawImpact(ctx, atlas);
    expect(ctx.translate).toHaveBeenCalledWith(225, 360); // Shooter → first marble.
    expect(ctx.translate).toHaveBeenCalledWith(252.5, 340); // First → second, after it moves.
    expect(ctx.rotate).toHaveBeenCalledWith(-Math.PI / 2);
    const links = vi.mocked(ctx.drawImage).mock.calls.filter(call => call[2] === 941);
    expect(links).toHaveLength(2);
    expect(links.map(call => call[7])).toEqual([40, 55]);
    expect(ctx.drawImage).toHaveBeenCalledTimes(7); // 3 cages, 2 direct links, 2 discharges.
    expect(ctx.translate).not.toHaveBeenCalledWith(225 - 12, 340 - 75);
    expect(fx.isCharged(second)).toBe(true);
  });

  it('bounds repeated contacts and expires bursts without dropping charge mid-shot', () => {
    const fx = new SteelBallEffects(), ctx = context();
    const shooter = ball(225, 380), target = ball(225, 340);
    for (let i = 0; i < 100; i++) fx.contact(shooter, target, shooter);
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(4); // two cages, direct lightning bridge, discharge
    for (let i = 0; i < 14; i++) fx.update(.05);
    vi.mocked(ctx.drawImage).mockClear();
    fx.drawImpact(ctx, atlas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(fx.isCharged(target)).toBe(true);
  });
});
