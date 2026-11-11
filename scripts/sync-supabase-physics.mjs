// Keep Edge replay physics identical to the browser; --check never writes files.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const files = {
  'shot-physics.ts': 'src/app/features/games/tumbang-preso/shot-physics.ts',
  'marble-physics.ts': 'src/app/features/games/jolens-blast/marble-physics.ts',
  'marble-placement.ts': 'src/app/features/games/jolens-blast/marble-placement.ts',
};
await mkdir('supabase/functions/_shared', {recursive:true});
for (const [name,source] of Object.entries(files)) {
  const expected = '// Synced from '+source+' by scripts/sync-supabase-physics.mjs.\n'+await readFile(source,'utf8');
  const target = 'supabase/functions/_shared/'+name;
  if (process.argv.includes('--check')) {
    if (await readFile(target,'utf8') !== expected) throw new Error('Edge physics out of sync: '+source);
  } else await writeFile(target,expected);
}
console.log('Supabase/browser physics sources match.');
