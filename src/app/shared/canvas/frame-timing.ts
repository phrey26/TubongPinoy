// Ranked replays use 60 simulation steps per second. Rendering can run at any rate.
export const PHYSICS_STEP_SECONDS = 1 / 60;
export const PHYSICS_STEP_MS = 1000 / 60;

export interface Position { x: number; y: number; }

export function frameSeconds(timestamp: number, previous: number | null, paused: boolean): number {
  // Catch up through ordinary dropped frames, but bound work after a long stall.
  return previous === null || paused ? 0 : Math.max(0, Math.min((timestamp - previous) / 1000, 0.25));
}

export function interpolatePosition(previous: Position, current: Position, alpha: number): Position {
  const fraction = Math.max(0, Math.min(1, alpha));
  return {
    x: previous.x + (current.x - previous.x) * fraction,
    y: previous.y + (current.y - previous.y) * fraction,
  };
}

export function interpolateAngle(previous: number, current: number, alpha: number): number {
  const difference = Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
  return previous + difference * Math.max(0, Math.min(1, alpha));
}
