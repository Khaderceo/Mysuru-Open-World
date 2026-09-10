// The `?e2e=1` test hook must not exist in the deployed build (TESTING_STRATEGY.md §5).
//
// It is guarded by `if (__E2E__)`, which is false for `npm run build`, so Rollup drops
// it. This asserts that, because a test hook exposing internals to players is exactly
// the kind of thing that ships unnoticed.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Anchored so it cannot match longer identifiers that merely start with it, such as
// capabilities.ts's `__mow_probe__` localStorage key.
const MARKER = /__mow(?![A-Za-z0-9_])/;
const DIST = 'dist';

if (!existsSync(DIST)) {
  console.error(`[static] ${DIST}/ not found — run \`npm run build\` first.`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const files = walk(DIST).filter((f) => /\.(js|mjs|html)$/.test(f));
const offenders = files.filter((f) => MARKER.test(readFileSync(f, 'utf8')));

if (offenders.length > 0) {
  console.error('[static] the e2e hook leaked into the production bundle:');
  for (const file of offenders) console.error(`  ${file}`);
  process.exit(1);
}
console.log(`[static] e2e hook absent from ${String(files.length)} emitted production files`);
