export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation?: number;
}

export interface ShotState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
}

export const ROAD = { left: 34, right: 416, height: 800 } as const;
export const START = { x: 225, y: 680 } as const;
export const TARGET = { x: 225, y: 120 } as const;

export function launchShot(vx: number, vy: number): ShotState {
  return {
    ...START, vx, vy, angle: 0,
    spin: Math.sign(vx || 1) * Math.min(0.45, Math.hypot(vx, vy) * 0.025),
  };
}

/** One physics tick, shared by gameplay and the level generator's solver. */
export function stepShot(shot: ShotState, obstacles: readonly Obstacle[]) {
  const previous = { x: shot.x, y: shot.y };
  shot.angle = (shot.angle + shot.spin) % (Math.PI * 2);
  shot.spin *= 0.985;
  shot.x += shot.vx;
  shot.y += shot.vy;
  shot.vx *= 0.985;
  shot.vy *= 0.985;

  const halfWidth = Math.abs(Math.cos(shot.angle)) * 12 + Math.abs(Math.sin(shot.angle)) * 21;
  const left = Math.ceil(ROAD.left + halfWidth);
  const right = Math.floor(ROAD.right - halfWidth);
  let wallBounce = false;
  if (shot.x <= left) {
    shot.x = left;
    if (shot.vx < 0) wallBounce = true;
  } else if (shot.x >= right) {
    shot.x = right;
    if (shot.vx > 0) wallBounce = true;
  }
  if (wallBounce) {
    shot.vx *= -0.7;
    shot.spin *= -0.7;
  }

  const rockBounces: Obstacle[] = [];
  for (const obstacle of obstacles) {
    const angle = obstacle.rotation ?? 0;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const cx = obstacle.x + obstacle.width / 2, cy = obstacle.y + obstacle.height / 2;
    const sx = (previous.x - cx) * cos + (previous.y - cy) * sin;
    const sy = -(previous.x - cx) * sin + (previous.y - cy) * cos;
    const ex = (shot.x - cx) * cos + (shot.y - cy) * sin;
    const ey = -(shot.x - cx) * sin + (shot.y - cy) * cos;
    let entry = -Infinity, exit = Infinity, nx = 0, ny = 0;
    let intersects = true;
    for (const [start, delta, half, axis] of [
      [sx, ex - sx, obstacle.width / 2, 0],
      [sy, ey - sy, obstacle.height / 2, 1],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (Math.abs(start) > half) intersects = false;
        continue;
      }
      const first = (-half - start) / delta, last = (half - start) / delta;
      const near = Math.min(first, last), far = Math.max(first, last);
      if (near > entry) {
        entry = near;
        nx = axis === 0 ? -Math.sign(delta) : 0;
        ny = axis === 1 ? -Math.sign(delta) : 0;
      }
      exit = Math.min(exit, far);
    }
    if (!intersects || entry < 0 || entry > 1 || entry > exit) continue;
    const normalX = nx * cos - ny * sin, normalY = nx * sin + ny * cos;
    const dot = shot.vx * normalX + shot.vy * normalY;
    if (dot >= 0) continue;
    const hitX = previous.x + (shot.x - previous.x) * entry;
    const hitY = previous.y + (shot.y - previous.y) * entry;
    shot.vx = (shot.vx - 2 * dot * normalX) * 0.98;
    shot.vy = (shot.vy - 2 * dot * normalY) * 0.98;
    shot.spin *= -0.8;
    // Separate from the face and finish the remaining part of this tick.
    shot.x = hitX + normalX * 0.5 + shot.vx * (1 - entry);
    shot.y = hitY + normalY * 0.5 + shot.vy * (1 - entry);
    rockBounces.push(obstacle);
    break;
  }

  const hit = Math.hypot(shot.x - TARGET.x, shot.y - TARGET.y) < 35;
  const missed = !hit && ((Math.abs(shot.vx) < 0.2 && Math.abs(shot.vy) < 0.2) ||
    shot.y < 0 || shot.y > ROAD.height);
  return { hit, missed, wallBounce, rockBounces };
}
