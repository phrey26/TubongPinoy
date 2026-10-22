export interface PhysicsMarble {
  x: number;
  y: number;
  radius: number;
  dx: number;
  dy: number;
  isMoving: boolean;
}

/** One 60 Hz tick: equal-mass collisions, rolling friction, and ring exits. */
export function stepMarbles(
  shooter: PhysicsMarble, targets: PhysicsMarble[],
  ring: { x: number; y: number; radius: number },
  board: { width: number; height: number },
): Set<PhysicsMarble> {
  const knockedOut = new Set<PhysicsMarble>();
  const balls = [shooter, ...targets];
  const speed = Math.max(...balls.map(ball => Math.hypot(ball.dx, ball.dy)));
  const steps = Math.max(1, Math.ceil(speed / 5));
  for (let step = 0; step < steps; step++) {
    const active = balls.filter(ball => !knockedOut.has(ball));
    for (const ball of active) {
      ball.x += ball.dx / steps;
      ball.y += ball.dy / steps;
    }
    // Repeat separation to keep dense chains from leaving overlapping marbles.
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i], b = active[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const distance = Math.hypot(dx, dy), minimum = a.radius + b.radius;
          if (distance >= minimum) continue;
          const nx = distance > 0 ? dx / distance : 1;
          const ny = distance > 0 ? dy / distance : 0;
          const separation = (minimum - distance + 0.001) / 2;
          a.x -= nx * separation; a.y -= ny * separation;
          b.x += nx * separation; b.y += ny * separation;
          const approaching = (a.dx - b.dx) * nx + (a.dy - b.dy) * ny;
          if (approaching <= 0) continue;
          const impulse = approaching * 0.95;
          a.dx -= impulse * nx; a.dy -= impulse * ny;
          b.dx += impulse * nx; b.dy += impulse * ny;
        }
      }
    }
    for (const target of targets) {
      // The entire target must clear the line before it scores.
      if (Math.hypot(target.x - ring.x, target.y - ring.y) - target.radius > ring.radius) {
        knockedOut.add(target);
      }
    }
    // The screen edge is not a cushion in a street marble game.
    if (shooter.x < -shooter.radius || shooter.x > board.width + shooter.radius ||
        shooter.y < -shooter.radius || shooter.y > board.height + shooter.radius) {
      shooter.dx = shooter.dy = 0;
    }
  }
  for (const ball of balls) {
    ball.dx *= 0.985;
    ball.dy *= 0.985;
    if (Math.hypot(ball.dx, ball.dy) < 0.08) ball.dx = ball.dy = 0;
    ball.isMoving = ball.dx !== 0 || ball.dy !== 0;
  }
  return knockedOut;
}
