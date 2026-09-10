// Layer check (TESTING_STRATEGY.md §3 item 2, ARCHITECTURE.md §3).
//
// Dependency direction is strictly one-way: utils <- core <- rendering/input/physics <-
// world/city <- ... and `debug/` is depended on by nobody. Two rules are live today and
// enforced here; the wider matrix is added as those modules arrive, so nothing is
// asserted about directories that do not exist yet.
//
// One documented exception: the __DEV__-guarded dynamic import in core/Game.ts, which is
// the single hook into debug/ and is dead-code-eliminated in production.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC = 'src';
const DEBUG_HOOK = join('src', 'core', 'Game.ts');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (entry.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** Every import specifier, including type-only ones: layering is a source-level rule. */
function allImports(source) {
  const specifiers = [];
  for (const match of source.matchAll(
    /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g,
  )) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1]);
  }
  return specifiers.filter((s) => s.startsWith('.'));
}

/** Which src/ module a path or specifier belongs to. */
function moduleOf(fileOrSpecifier) {
  const match =
    /(?:^|[./\\])(core|rendering|input|physics|world|city|player|camera|interaction|vehicles|traffic|npcs|missions|ui|audio|save|data|assets|debug|utils)[/\\]/.exec(
      fileOrSpecifier,
    );
  return match === null ? null : match[1];
}

const violations = [];
for (const file of walk(SRC)) {
  const owner = file.split(sep).includes('src') ? moduleOf(file) : null;
  for (const specifier of allImports(readFileSync(file, 'utf8'))) {
    const target = moduleOf(specifier);
    if (target === null) continue;

    // Rule 1: core may only reach utils (and itself).
    if (owner === 'core' && target !== 'core' && target !== 'utils') {
      if (!(file === DEBUG_HOOK && target === 'debug')) {
        violations.push(`${file} (core) imports ${specifier} (${target})`);
      }
    }

    // Rule 2: nobody outside debug/ imports debug/.
    if (target === 'debug' && owner !== 'debug' && file !== DEBUG_HOOK) {
      violations.push(`${file} imports ${specifier} — only the guarded hook may reach debug/`);
    }
  }
}

if (violations.length > 0) {
  console.error('[static] dependency-direction violations:');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log(
  '[static] dependency direction holds: core reaches only utils, debug reached only by its hook',
);
