import { PhysicsMarble, stepMarbles } from './marble-physics';

const ring = { x: 225, y: 300, radius: 150 };
const board = { width: 450, height: 800 };
const ball = (x: number, y: number, dx = 0, dy = 0): PhysicsMarble =>
  ({ x, y, radius: 20, dx, dy, isMoving: dx !== 0 || dy !== 0 });

describe('Marble collision physics', () => {
  it('keeps an exited target rolling with friction and colliding outside the ring', () => {
    const shooter = ball(225, 600);
    const target = ball(394, 300, 8, 0);
    const exited = stepMarbles(shooter, [target], ring, board);
    expect(exited.has(target)).toBe(true);
    const x = target.x;
    const speed = target.dx;
    stepMarbles(shooter, [], ring, board, undefined, [target]);
    expect(target.x).toBeGreaterThan(x);
    expect(target.dx).toBeLessThan(speed);
    const other = ball(target.x + 40, 300);
    stepMarbles(shooter, [], ring, board, undefined, [target, other]);
    expect(other.dx).toBeGreaterThan(0);
  });
  it('passes momentum down a chain without increasing kinetic energy', () => {
    const shooter = ball(225, 380, 0, -12);
    const targets = [ball(225, 340), ball(225, 300)];
    stepMarbles(shooter, targets, ring, board);
    expect(targets[1].dy).toBeLessThan(0);
    const energy = [shooter, ...targets].reduce((sum, m) => sum + m.dx ** 2 + m.dy ** 2, 0);
    expect(energy).toBeLessThanOrEqual(144);
    expect([shooter, ...targets].every(m => Number.isFinite(m.x) && Number.isFinite(m.y))).toBe(true);
  });

  it('requires the whole target to leave the ring and never counts the shooter', () => {
    const shooter = ball(225, 600);
    const touching = ball(225, 130);
    expect(stepMarbles(shooter, [touching], ring, board).size).toBe(0);
    touching.y = 129;
    expect(stepMarbles(shooter, [touching], ring, board)).toEqual(new Set([touching]));
    expect(stepMarbles(shooter, [], ring, board).size).toBe(0);
  });

  it('detects fast collisions and redirects a glancing impact sideways', () => {
    const shooter = ball(225, 380, 0, -80);
    const target = ball(245, 300);
    stepMarbles(shooter, [target], ring, board);
    expect(target.dx).toBeGreaterThan(0);
    expect(target.dy).toBeLessThan(0);
  });

  it('stops rolling with friction and does not bounce off screen edges', () => {
    const shooter = ball(5, 600, -12, 0);
    const target = ball(225, 300, 0.2, 0);
    for (let tick = 0; tick < 600; tick++) stepMarbles(shooter, [target], ring, board);
    expect(shooter.x).toBeLessThan(0);
    expect(shooter.dx).toBe(0);
    expect(target.isMoving).toBe(false);
  });
});
