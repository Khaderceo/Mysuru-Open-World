// Import cycle check (TESTING_STRATEGY.md §3 item 1, ARCHITECTURE.md §3).
//
// A circular dependency is a build failure, not a style issue. Type-only imports are
// skipped because TypeScript erases them, so they create no runtime cycle — the
// System <-> GameContext pair is deliberately of that kind.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const SRC = 'src';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (entry.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** Relative specifiers from value imports, re-exports and dynamic imports. */
function valueImports(source) {
  const specifiers = [];
  const statement = /(?:^|\n)\s*(?:import|export)([\s\S]*?)from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(statement)) {
    const clause = match[1];
    const target = match[2];
    // `import type { X } from` is erased; `import { type X, Y }` still imports Y.
    if (/^\s*type\s/.test(clause)) continue;
    if (target.startsWith('.')) specifiers.push(target);
  }
  for (const match of source.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return normalize(relative('.', candidate));
    } catch {
      // Not this candidate; try the next form.
    }
  }
  return null;
}

const files = walk(SRC);
const graph = new Map();
for (const file of files) {
  const key = normalize(file);
  const edges = [];
  for (const specifier of valueImports(readFileSync(file, 'utf8'))) {
    const target = resolveSpecifier(file, specifier);
    if (target !== null) edges.push(target);
  }
  graph.set(key, edges);
}

const cycles = [];
const state = new Map();
const stack = [];

function visit(node) {
  state.set(node, 'open');
  stack.push(node);
  for (const next of graph.get(node) ?? []) {
    if (state.get(next) === 'open') {
      cycles.push([...stack.slice(stack.indexOf(next)), next].join(' -> '));
    } else if (state.get(next) === undefined) {
      visit(next);
    }
  }
  stack.pop();
  state.set(node, 'done');
}

for (const node of graph.keys()) {
  if (state.get(node) === undefined) visit(node);
}

if (cycles.length > 0) {
  console.error('[static] runtime import cycles found:');
  for (const cycle of [...new Set(cycles)]) console.error(`  ${cycle}`);
  process.exit(1);
}
console.log(`[static] no runtime import cycles across ${String(files.length)} source files`);
