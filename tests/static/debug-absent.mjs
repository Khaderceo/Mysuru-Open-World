// T-1.6 build check: the debug overlay must not exist in a production bundle.
//
// `debug/` is reached only from a __DEV__-guarded dynamic import in core/Game.ts, so
// Rollup should drop the whole module graph when __DEV__ is false. This asserts it,
// because a debug panel shipping to players is both a leak and dead weight.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '__MOW_DEBUG_OVERLAY__';
const DIST = 'dist';

if (!existsSync(DIST)) {
  console.error(`[static] ${DIST}/ not found — run \`npm run build\` first.`);
  process.exit(1);
}

/** Every emitted file, so a stray debug chunk cannot hide in one we forgot to check. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const files = walk(DIST).filter((f) => /\.(js|mjs|css|html)$/.test(f));
const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(MARKER));

if (offenders.length > 0) {
  console.error(`[static] debug overlay leaked into the production bundle:`);
  for (const file of offenders) console.error(`  ${file}`);
  console.error(`  (searched for ${MARKER} in ${String(files.length)} emitted files)`);
  process.exit(1);
}

console.log(`[static] debug overlay absent from ${String(files.length)} emitted production files`);
