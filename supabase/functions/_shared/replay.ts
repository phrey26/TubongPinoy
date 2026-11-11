import { launchShot, stepShot, type Obstacle } from './shot-physics.ts';
import { stepMarbles, type PhysicsMarble } from './marble-physics.ts';
import { scatterMarbles } from './marble-placement.ts';

export interface RunContext {
  id: string; sequence: number; obstacles: Obstacle[];
  targets: { x: number; y: number; radius: number; dx: number; dy: number }[];
}

export function replayShot(game: string, vx: number, vy: number, run: RunContext) {
  if (game === 'tumbang-preso') {
    const shot = launchShot(vx, vy);
    for (let frames = 1; frames <= 600; frames++) {
      const result = stepShot(shot, run.obstacles);
      if (result.hit || result.missed) return { runId: run.id, sequence: run.sequence, frames, hit: result.hit };
    }
    return { runId: run.id, sequence: run.sequence, frames: 600, hit: false };
  }
  const shooter: PhysicsMarble = { x: 225, y: 600, radius: 20, dx: vx, dy: vy, isMoving: true };
  let targets: PhysicsMarble[] = run.targets.map(b => ({ ...b, isMoving: false }));
  let pending: PhysicsMarble[] = [];
  let frames = 0;
  for (frames = 1; frames <= 600; frames++) {
    const out = stepMarbles(shooter, targets, { x: 225, y: 300, radius: 150 }, { width: 450, height: 800 }, undefined, pending);
    pending.push(...targets.filter(b => out.has(b)));
    targets = targets.filter(b => !out.has(b));
    if (![shooter, ...targets, ...pending].some(b => b.isMoving)) break;
  }
  const outside = (b: PhysicsMarble) => Math.hypot(b.x - 225, b.y - 300) - b.radius > 150;
  targets.push(...pending.filter(b => !outside(b)));
  pending = pending.filter(outside);
  const delta = outside(shooter) ? pending.length : -1;
  if (!outside(shooter)) {
    const spots: { x: number; y: number }[] = [];
    for (let row = -3; row <= 3; row++) for (let column = -3; column <= 3; column++) {
      if (Math.hypot(column * 42, row * 42) <= 130) spots.push({ x: 225 + column * 42, y: 300 + row * 42 });
    }
    spots.sort((a, b) => Math.hypot(a.x - 225, a.y - 300) - Math.hypot(b.x - 225, b.y - 300));
    for (const ball of pending) {
      const spot = spots.find(p => targets.every(b => Math.hypot(p.x - b.x, p.y - b.y) >= 40));
      if (!spot) {
        targets = [...pending, ...targets.filter(b => !pending.includes(b))];
        targets.forEach((b, i) => Object.assign(b, spots[i]));
        break;
      }
      Object.assign(ball, spot); targets.push(ball);
    }
  }
  return { runId: run.id, sequence: run.sequence, frames: Math.min(frames, 600), delta,
    targets: targets.map(({ x, y, radius }) => ({ x, y, radius, dx: 0, dy: 0 })) };
}

export function roundTargets(bet: number) {
  const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  return scatterMarbles(bet * 2, { x: 225, y: 300 }, 150, 20, random)
    .map(p => ({ ...p, radius: 20, dx: 0, dy: 0 }));
}
