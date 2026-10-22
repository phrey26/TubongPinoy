/** Scatter targets uniformly over the playable circle, with space between marbles. */
export function scatterMarbles(
  count: number, center: { x: number; y: number }, ringRadius: number, marbleRadius: number,
  random: () => number = Math.random,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const limit = ringRadius - marbleRadius - 4;
  const spacing = marbleRadius * 2 + 4;
  for (let attempt = 0; attempt < 1000 && positions.length < count; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * limit;
    const candidate = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    if (positions.every(other => Math.hypot(other.x - candidate.x, other.y - candidate.y) >= spacing)) {
      positions.push(candidate);
    }
  }
  if (positions.length === count) return positions;
  // Bounded fallback for constant or unusually repetitive random input.
  const fallback: { x: number; y: number }[] = [];
  const angle = random() * Math.PI * 2;
  for (let row = -2; row <= 2; row++) {
    for (let column = -2; column <= 2; column++) {
      if (Math.hypot(column * spacing, row * spacing) > limit) continue;
      fallback.push({
        x: center.x + column * spacing * Math.cos(angle) - row * spacing * Math.sin(angle),
        y: center.y + column * spacing * Math.sin(angle) + row * spacing * Math.cos(angle),
      });
    }
  }
  return fallback.slice(0, count);
}
