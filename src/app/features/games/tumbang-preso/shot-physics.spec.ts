import { launchShot, Obstacle, stepShot } from './shot-physics';

describe('Stone ricochet physics', () => {
  const stone: Obstacle = { x: 190, y: 400, width: 80, height: 26, color: '#aaa' };

  it('reflects off the side face instead of reversing vertical motion', () => {
    const shot = { ...launchShot(17, -2), x: 185, y: 415 };
    const result = stepShot(shot, [stone]);
    expect(result.rockBounces).toEqual([stone]);
    expect(shot.vx).toBeLessThan(0);
    expect(shot.vy).toBeLessThan(0);
    expect(shot.x).toBeLessThan(stone.x);
  });

  it('detects a fast shot crossing a thin obstacle without tunneling through it', () => {
    const thinStone = { ...stone, height: 4 };
    const shot = { ...launchShot(0, -17.6), x: 225, y: 410 };
    const result = stepShot(shot, [thinStone]);
    expect(result.rockBounces).toEqual([thinStone]);
    expect(shot.vy).toBeGreaterThan(0);
    expect(stepShot(shot, [thinStone]).rockBounces).toHaveLength(0);
  });

  it('redirects a shot sideways from an angled face without adding energy', () => {
    const bank = { ...stone, rotation: Math.PI / 4 };
    const shot = { ...launchShot(0, -17.6), x: 225, y: 442 };
    let hit = false;
    for (let frame = 0; frame < 4 && !hit; frame++) hit = stepShot(shot, [bank]).rockBounces.length > 0;
    expect(hit).toBe(true);
    expect(Math.abs(shot.vx)).toBeGreaterThan(10);
    expect(Math.abs(shot.vy)).toBeLessThan(0.001);
    expect(Math.hypot(shot.vx, shot.vy)).toBeLessThan(17.6);
  });
});
