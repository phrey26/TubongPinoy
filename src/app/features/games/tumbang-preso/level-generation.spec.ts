import { generateLevel, simulateShot, obstacleBounds, ricochetCount } from './level-generation';

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe('Tumbang Preso level generation', () => {
  it('keeps a forgiving winning route through varied early and late levels', () => {
    for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 17, 20, 30, 50, 75, 100, 250, 1000, 10000]) {
      for (let seed = 1; seed <= 16; seed++) {
        const generated = generateLevel(level, seeded(seed));
        if (level < 6) expect(generated.obstacles.length).toBe(2 + Math.floor((level - 1) / 2));
        else {
          expect(generated.obstacles.length).toBeGreaterThanOrEqual(ricochetCount(level) + 1);
          expect(simulateShot(generated.solution, generated.obstacles)!.rockBounces).toBeGreaterThanOrEqual(ricochetCount(level));
        }
        for (const offset of [-0.75, 0, 0.75]) {
          expect(simulateShot({ ...generated.solution, angle: generated.solution.angle + offset }, generated.obstacles)).not.toBeNull();
        }
        if (level >= 3) expect(simulateShot({ angle: 0, power: 1 }, generated.obstacles)).toBeNull();
        for (let i = 0; i < generated.obstacles.length; i++) {
          const obstacle = obstacleBounds(generated.obstacles[i]);
          for (const original of generated.obstacles.slice(i + 1)) {
            const other = obstacleBounds(original);
            const separated = obstacle.x + obstacle.width + 12 <= other.x ||
              other.x + other.width + 12 <= obstacle.x ||
              obstacle.y + obstacle.height + 12 <= other.y ||
              other.y + other.height + 12 <= obstacle.y;
            expect(separated).toBe(true);
          }
          expect(obstacle.x).toBeGreaterThanOrEqual(34);
          expect(obstacle.x + obstacle.width).toBeLessThanOrEqual(416);
          expect(obstacle.y).toBeGreaterThanOrEqual(185);
          expect(obstacle.y + obstacle.height).toBeLessThanOrEqual(640);
        }
      }
    }
  }, 20000);

  it('rejects sampled single-bounce and sidewalk-only shortcuts in ricochet levels', () => {
    for (const level of [6, 12, 20]) {
      for (let variant = 0; variant < 8; variant++) {
        let calls = 0;
        const generated = generateLevel(level, () => calls++ === 0 ? (variant + 0.1) / 8 : 0.9);
        for (const power of [0.65, 0.8, 0.9, 1]) {
          for (let angle = -75; angle <= 75; angle += 1) {
            const route = simulateShot({ angle, power }, generated.obstacles);
            if (route) {
              expect(route.bounces).toBeGreaterThanOrEqual(ricochetCount(level));
              expect(new Set(route.rockHits).size).toBeGreaterThanOrEqual(ricochetCount(level) - 1);
            }
          }
        }
      }
    }
  }, 20000);

  it('varies layouts and makes later levels denser', () => {
    const early = generateLevel(1, seeded(1));
    const late = generateLevel(20, seeded(1));
    expect(late.obstacles.length).toBeGreaterThan(early.obstacles.length);
    expect(late.obstacles[0].width).toBeGreaterThan(early.obstacles[0].width);
    expect(generateLevel(5, seeded(1)).obstacles).not.toEqual(generateLevel(5, seeded(2)).obstacles);
  });
});
