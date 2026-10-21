import { launchShot, Obstacle, ROAD, ShotState, START, stepShot } from './shot-physics';

export interface WinningShot {
  angle: number;
  power: number;
}

export interface Route extends WinningShot {
  points: { x: number; y: number }[];
  bounces: number;
  rockBounces: number;
  rockHits: number[];
}

export interface GeneratedLevel {
  obstacles: Obstacle[];
  solution: WinningShot;
}

export function simulateShot(shot: WinningShot, obstacles: readonly Obstacle[]): Route | null {
  const radians = shot.angle * Math.PI / 180;
  const state: ShotState = launchShot(Math.sin(radians) * 17.6 * shot.power, -Math.cos(radians) * 17.6 * shot.power);
  const points: { x: number; y: number }[] = [{ ...START }];
  let bounces = 0;
  let rockBounces = 0;
  const rockHits: number[] = [];
  for (let frame = 0; frame < 420; frame++) {
    const result = stepShot(state, obstacles);
    points.push({ x: state.x, y: state.y });
    if (result.wallBounce) bounces++;
    bounces += result.rockBounces.length;
    rockBounces += result.rockBounces.length;
    rockHits.push(...result.rockBounces.map(obstacle => obstacles.indexOf(obstacle)));
    if (result.hit) return { ...shot, points, bounces, rockBounces, rockHits };
    if (result.missed) return null;
  }
  return null;
}

let routes: Route[] | undefined;
function winningRoutes(): Route[] {
  if (!routes) {
    routes = [];
    for (const power of [0.85, 0.925, 1]) {
      for (let angle = -55; angle <= 55; angle += 0.5) {
        const route = simulateShot({ angle, power }, []);
        if (route) routes.push(route);
      }
    }
  }
  return routes;
}

function touches(route: Route, obstacle: Obstacle, margin = 0): boolean {
  return route.points.some(point =>
    point.x >= obstacle.x - margin && point.x <= obstacle.x + obstacle.width + margin &&
    point.y >= obstacle.y - margin && point.y <= obstacle.y + obstacle.height + margin);
}

function overlaps(a: Obstacle, b: Obstacle): boolean {
  return a.x < b.x + b.width + 12 && a.x + a.width + 12 > b.x &&
    a.y < b.y + b.height + 12 && a.y + a.height + 12 > b.y;
}

/** Fresh layouts preserve a tested, forgiving route rather than piling on random rocks. */
export function generateLevel(level: number, random: () => number = Math.random): GeneratedLevel {
  if (level >= 6) return generateRicochetLevel(level, random);
  const difficulty = 1 - 1 / (1 + (Math.max(1, level) - 1) / 10);
  const count = Math.min(8, 2 + Math.floor((level - 1) / 2));
  const clearance = 25 + 25 * (1 - difficulty);
  const allRoutes = winningRoutes();
  const bankRoutes = allRoutes.filter(route => route.bounces >= 1 && Math.abs(route.angle) > 20);
  const options = level <= 2 ? allRoutes.filter(route => route.bounces === 0 && route.power === 1) : bankRoutes;

  let fallbackSeed = Math.max(1, Math.floor(level)) * 7919;
  let safeFallback: GeneratedLevel | undefined;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (attempt === 8) random = () => {
      fallbackSeed = (Math.imul(fallbackSeed, 1664525) + 1013904223) >>> 0;
      return fallbackSeed / 4294967296;
    };
    // The first level teaches a straight shot; later levels explore bank-shot angles.
    const route = level === 1 ? allRoutes.find(route => route.angle === 0 && route.power === 1)!
      : options[Math.floor(random() * options.length)];
    const nearby = [-0.75, 0, 0.75].map(offset =>
      simulateShot({ angle: route.angle + offset, power: route.power }, []));
    if (nearby.some(path => path === null)) continue;
    const protectedRoutes = nearby as Route[];
    const obstacles: Obstacle[] = [];
    let remaining = allRoutes;

    for (let slot = 0; slot < count; slot++) {
      let best: Obstacle | undefined;
      let bestRemaining = remaining;
      for (let candidate = 0; candidate < 100; candidate++) {
        const width = Math.round(62 + difficulty * 40 + random() * 16);
        const obstacle: Obstacle = {
          x: level >= 3 && slot === 0 ? Math.round(START.x - width / 2)
            : ROAD.left + Math.floor(random() * (ROAD.right - ROAD.left - width + 1)),
          y: Math.round(235 + random() * 315), width,
          height: Math.round(32 + difficulty * 10), color: '#fb923c',
        };
        if (obstacles.some(other => overlaps(obstacle, other)) ||
          protectedRoutes.some(path => touches(path, obstacle, clearance))) continue;
        const survivors = remaining.filter(path => !touches(path, obstacle));
        if (!best || survivors.length < bestRemaining.length) {
          best = obstacle;
          bestRemaining = survivors;
        }
      }
      if (!best) break;
      obstacles.push(best);
      remaining = bestRemaining;
    }

    if (protectedRoutes.every(path => simulateShot(path, obstacles)) &&
      (level < 3 || !simulateShot({ angle: 0, power: 1 }, obstacles))) {
      const generated = { obstacles, solution: { angle: route.angle, power: route.power } };
      if (obstacles.length === count) return generated;
      if (!safeFallback || obstacles.length > safeFallback.obstacles.length) safeFallback = generated;
    }
  }

  // Prefer a verified, slightly sparser puzzle to ever presenting an impossible board.
  if (safeFallback) return safeFallback;
  throw new Error(`Unable to generate level ${level}`);
}

export function obstacleBounds(obstacle: Obstacle) {
  const angle = obstacle.rotation ?? 0;
  const halfWidth = (Math.abs(Math.cos(angle)) * obstacle.width + Math.abs(Math.sin(angle)) * obstacle.height) / 2;
  const halfHeight = (Math.abs(Math.sin(angle)) * obstacle.width + Math.abs(Math.cos(angle)) * obstacle.height) / 2;
  const cx = obstacle.x + obstacle.width / 2, cy = obstacle.y + obstacle.height / 2;
  return { x: cx - halfWidth, y: cy - halfHeight, width: halfWidth * 2, height: halfHeight * 2, color: obstacle.color };
}

export function ricochetCount(level: number): number {
  return level >= 20 ? 4 : level >= 12 ? 3 : level >= 6 ? 2 : 0;
}

const ricochetTemplates = new Map<string, GeneratedLevel>();

function makeBanks(points: { x: number; y: number }[], width: number): Obstacle[] {
  const nodes = [START, ...points, { x: 225, y: 120 }];
  return points.map((point, index) => {
    const before = nodes[index], after = nodes[index + 2];
    const incoming = Math.hypot(point.x - before.x, point.y - before.y);
    const outgoing = Math.hypot(after.x - point.x, after.y - point.y);
    let nx = (point.x - before.x) / incoming - (after.x - point.x) / outgoing;
    let ny = (point.y - before.y) / incoming - (after.y - point.y) / outgoing;
    const length = Math.hypot(nx, ny);
    nx /= length; ny /= length;
    const height = 26;
    return {
      x: point.x + nx * height / 2 - width / 2,
      y: point.y + ny * height / 2 - height / 2,
      width, height, rotation: Math.atan2(ny, nx) + Math.PI / 2, color: '#fb923c',
    };
  });
}

function shortcutRoutes(obstacles: Obstacle[], minimum: number): Route[] {
  const shortcuts: Route[] = [];
  for (const power of [0.65, 0.8, 0.9, 1]) {
    for (let angle = -75; angle <= 75; angle += 1) {
      const route = simulateShot({ angle, power }, obstacles);
      if (route && (route.bounces < minimum || new Set(route.rockHits).size < minimum - 1)) shortcuts.push(route);
    }
  }
  return shortcuts;
}

export function generateRicochetLevel(level: number, random: () => number): GeneratedLevel {
  const minimum = ricochetCount(level);
  const variant = Math.floor(random() * 8);
  const key = `${minimum}:${variant}`;
  let template = ricochetTemplates.get(key);
  if (!template) {
    let seed = (minimum * 1009 + variant * 7919) >>> 0;
    const roll = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const bases = minimum === 2 ? [{ x: 120, y: 490 }, { x: 330, y: 340 }]
      : minimum === 3 ? [{ x: 120, y: 530 }, { x: 330, y: 410 }, { x: 130, y: 285 }]
      : [{ x: 155, y: 560 }, { x: 300, y: 460 }, { x: 150, y: 355 }, { x: 285, y: 250 }];
    for (let attempt = 0; attempt < 20 && !template; attempt++) {
      const points = bases.map(point => ({ x: point.x + (roll() - 0.5) * 12, y: point.y + (roll() - 0.5) * 12 }));
      const obstacles = makeBanks(points, 80 + Math.round(roll() * 8));
      obstacles.push({ x: 190, y: 580, width: 70, height: 32, color: '#fb923c' });
      const ideal = Math.atan2(points[0].x - START.x, START.y - points[0].y) * 180 / Math.PI;
      let solution: WinningShot | undefined;
      let protectedRoutes: Route[] = [];
      for (let angle = ideal - 2; angle <= ideal + 2; angle += 0.5) {
        const near = [-0.75, 0, 0.75].map(offset => simulateShot({ angle: angle + offset, power: 0.95 }, obstacles));
        if (near.every(route => route && new Set(route.rockHits).size >= minimum)) {
          solution = { angle, power: 0.95 };
          protectedRoutes = near as Route[];
          break;
        }
      }
      if (!solution) continue;
      for (let pass = 0; pass < 8; pass++) {
        const shortcuts = shortcutRoutes(obstacles, minimum);
        if (!shortcuts.length) {
          template = { obstacles, solution };
          break;
        }
        let best: Obstacle | undefined;
        let bestScore = 0;
        for (let trial = 0; trial < 300; trial++) {
          const route = shortcuts[Math.floor(roll() * shortcuts.length)];
          const point = route.points[Math.floor(roll() * route.points.length)];
          const width = 48 + Math.floor(roll() * 30), height = 32;
          const candidate = { x: Math.round(point.x - width / 2), y: Math.round(point.y - height / 2), width, height, color: '#fb923c' };
          if (candidate.x < ROAD.left || candidate.x + width > ROAD.right || candidate.y < 185 || candidate.y + height > 640 ||
            obstacles.some(other => overlaps(candidate, obstacleBounds(other))) ||
            protectedRoutes.some(path => touches(path, candidate, 20))) continue;
          const score = shortcuts.filter(path => touches(path, candidate)).length;
          if (score > bestScore) { best = candidate; bestScore = score; }
        }
        if (!best) break;
        obstacles.push(best);
        if (!protectedRoutes.every(route => (simulateShot(route, obstacles)?.rockBounces ?? 0) >= minimum)) break;
      }
    }
    if (!template) throw new Error(`Unable to generate ricochet puzzle ${key}`);
    ricochetTemplates.set(key, template);
  }
  const mirror = random() < 0.5;
  return {
    obstacles: template.obstacles.map(obstacle => ({ ...obstacle,
      x: mirror ? ROAD.left + ROAD.right - obstacle.x - obstacle.width : obstacle.x,
      rotation: mirror ? -(obstacle.rotation ?? 0) : obstacle.rotation,
    })),
    solution: { ...template.solution, angle: mirror ? -template.solution.angle : template.solution.angle },
  };
}
