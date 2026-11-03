// Run after changing Tumbang physics/layouts. Output stays outside the public root.
import { build } from 'esbuild';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const temporary = await mkdtemp(join(tmpdir(), 'tubong-levels-'));
try {
  const entry = join(temporary, 'levels.cjs');
  await build({ entryPoints: ['src/app/features/games/tumbang-preso/level-generation.ts'], outfile: entry, bundle: true, platform: 'node', format: 'cjs' });
  const { generateLevel } = createRequire(import.meta.url)(entry);
  const levels = {};
  for (const level of [1, 2, 3, 4, 5, 6, 12, 20]) {
    levels[level] = [];
    for (let variant = 0; variant < 8; variant++) {
      let seed = level * 1009 + variant * 7919;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      levels[level].push(generateLevel(level, random));
    }
  }
  await writeFile('backend/game-data/tumbang-levels.json', JSON.stringify(levels) + '\n');
  console.log('Generated 64 verified private layouts.');
} finally { await rm(temporary, { recursive: true, force: true }); }
