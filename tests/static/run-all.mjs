// Runs every static check in this directory. Each check is also runnable on its own
// (`node tests/static/import-cycles.mjs`), so this only discovers and aggregates.
//
// T-1.6 added debug-absent.mjs and the `check:static` script; T-1.9 extends that script
// here rather than starting a second harness. Later checks — asset manifest, credits and
// string ids (TESTING_STRATEGY.md §3, items 3-6) — land with the systems they validate.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const self = 'run-all.mjs';
const checks = readdirSync(here)
  .filter((name) => name.endsWith('.mjs') && name !== self)
  .sort();

let failed = 0;
for (const check of checks) {
  const result = spawnSync(process.execPath, [join(here, check)], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}

if (failed > 0) {
  console.error(`[static] ${String(failed)} of ${String(checks.length)} checks failed`);
  process.exit(1);
}
console.log(`[static] all ${String(checks.length)} checks passed`);
