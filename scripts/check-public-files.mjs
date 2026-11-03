import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
if (!['source', 'build'].includes(mode)) throw new Error('Use source or build.');
const roots = mode === 'source' ? ['public', 'src'] : ['dist/tubongpinoybeta2/browser'];
const problems = [];
const privateExtension = /\.(php\d*|phtml|phar|sql|sqlite3?|db|env|ini|log|bak|old|orig|pem|key|p12|pfx|zip|gz|tgz|7z)$/i;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:sk_live_|rk_live_|sk-proj-)[A-Za-z0-9_-]{16,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bTUBONG_DB_(?:PASSWORD|USERNAME|HOST)\b/,
  /mysql:host=/i,
  /(?:api[_-]?key|client[_-]?secret|db[_-]?password)\s*["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i,
];

async function scan(path, sourceCode = false) {
  const label = relative(root, path);
  const name = basename(path);
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) { problems.push(`${label}: symbolic links are not allowed`); return; }
  if (stat.isDirectory()) {
    if (/^(?:backend|\.git|\.aws|\.codex|node_modules)$/i.test(name)) {
      problems.push(`${label}: private directory`); return;
    }
    for (const child of await readdir(path)) await scan(resolve(path, child), sourceCode);
    return;
  }
  if (!stat.isFile()) { problems.push(`${label}: unexpected file type`); return; }
  // Angular already excludes Finder metadata from copied assets.
  if (mode === 'source' && name === '.DS_Store') return;
  if (privateExtension.test(name) || (name.startsWith('.') && name !== '.htaccess') ||
      /^(?:config\.local\.|proxy\.conf\.)/i.test(name) || (!sourceCode && /\.map$/i.test(name))) {
    problems.push(`${label}: private file type`); return;
  }
  if (['.ts', '.js', '.mjs', '.json', '.html', '.css', '.svg', '.txt', '.xml', ''].includes(extname(name))) {
    const content = await readFile(path, 'utf8');
    if (secretPatterns.some(pattern => pattern.test(content))) {
      // Report the path only. Never repeat a potential secret in build logs.
      problems.push(`${label}: possible credential or backend configuration`);
    }
  }
}

try {
  for (const directory of roots) await scan(resolve(root, directory), directory === 'src');
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`Frontend privacy check passed (${mode}).`);
} catch (error) {
  console.error(`Frontend privacy check failed:\n${error.message}`);
  process.exitCode = 1;
}
