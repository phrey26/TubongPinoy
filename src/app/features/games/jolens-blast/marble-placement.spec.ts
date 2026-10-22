import { scatterMarbles } from './marble-placement';

describe('Natural marble placement', () => {
  it('keeps every bet inside the ring and separated across varied layouts', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      let state = seed;
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
      };
      for (const count of [2, 4, 6, 8, 10]) {
        const positions = scatterMarbles(count, { x: 225, y: 300 }, 150, 20, random);
        expect(positions).toHaveLength(count);
        positions.forEach((point, index) => {
          expect(Math.hypot(point.x - 225, point.y - 300)).toBeLessThanOrEqual(130);
          positions.slice(index + 1).forEach(other => {
            expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThanOrEqual(40);
          });
        });
        layouts.add(JSON.stringify(positions));
      }
    }
    expect(layouts.size).toBe(250);
  });

  it.each([0, 0.5, 0.999999])('can still place ten targets with constant random input %s', value => {
    expect(scatterMarbles(10, { x: 225, y: 300 }, 150, 20, () => value)).toHaveLength(10);
  });
});
