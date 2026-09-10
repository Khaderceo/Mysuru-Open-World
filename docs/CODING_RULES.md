# CODING_RULES

Standards that keep the codebase small, fast and debuggable. Enforced by `tsc --strict`, Prettier, the static checks in `TESTING_STRATEGY.md` §3, and review.

---

## 1. TypeScript

```json
// tsconfig.json essentials
"strict": true,
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true,
"exactOptionalPropertyTypes": true,
"noFallthroughCasesInSwitch": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"isolatedModules": true,
"target": "ES2020",
"moduleResolution": "bundler"
```

- **`any` requires a one-line comment explaining why.** Prefer `unknown` + a narrowing function. Untrusted input (save files) is typed `unknown` and validated (`SAVE_SYSTEM.md` §6).
- No non-null `!` on values that can genuinely be null — narrow properly. `!` is acceptable only where an invariant is asserted immediately above it.
- No enums; use `as const` object maps and derived union types (smaller output, better inference).
- Types describe data; **do not build type gymnastics**. If a type needs a comment to be understood, simplify the data instead.
- `interface` for object shapes, `type` for unions and aliases. Consistency over debate.
- Exported functions have explicit return types. Local functions may infer.
- No decorators, no `namespace`, no `declare global` except the single `__DEV__`/`__E2E__` declaration file.
- Discriminated unions for anything with variants (`ObjectiveDef`, `Collider`, player states) — never a struct with five optional fields and a boolean.

## 2. Modules

- **Small files.** Soft limit 250 lines, hard limit 400. Past that, split by responsibility (not by arbitrary halves).
- One primary export per file; the filename matches it.
- No barrel `index.ts` re-export files (they defeat tree-shaking and hide the dependency graph).
- Import with explicit paths; no path aliases beyond a single `@/` → `src/` if it proves useful.
- Respect the dependency direction (`ARCHITECTURE.md` §3). Cycles fail CI.
- No side effects at module scope beyond `const` data. No code that runs on import.
- `import * as THREE from 'three'` in `rendering/` and where geometry is genuinely built; elsewhere import the specific classes needed. Gameplay logic should mostly not need Three.js at all — that is a design signal worth watching.

## 3. Naming

| Thing | Convention |
|---|---|
| Files | `PascalCase.ts` for classes, `camelCase.ts` for functions/data |
| Classes, interfaces, types | `PascalCase` |
| Functions, variables, fields | `camelCase` |
| Constants (module-level, frozen) | `SCREAMING_SNAKE` |
| Ids and keys | `snake_case` strings (`palace_gate`, `veh.auto`) |
| Booleans | `is`/`has`/`can`/`should` prefix |
| Event names | `'domain:past-tense-fact'` (`'mission:completed'`) |
| Units in names when ambiguous | `radiusMeters`, `delaySec`, `speedMps` |

Say what it is. `updateTrafficAgents` beats `update2`; `nearestUnoccupiedVehicle` beats `find`.

## 4. Performance rules (non-negotiable in loop paths)

- **Zero allocation per frame.** Reuse module-scope scratch objects:
  ```ts
  const _v = new Vector3();   // scratch — never stored, never returned
  ```
  Never return a scratch object from a function that a caller might retain. Functions that produce vectors take an `out` parameter.
- No array literals, object literals, closures, `map/filter/reduce`, spread, or string concatenation in per-frame code. Use indexed `for` loops over preallocated arrays.
- No `new` in loop paths. Pool instead (`utils/pool.ts`).
- No `scene.traverse` per frame; keep explicit lists.
- No `try/catch` in hot loops (deoptimises and hides errors); validate at boundaries.
- **Frame-rate independence:** every rate is `× dt`; every smoothing uses `1 - exp(-dt/tau)`. Never `value += 0.1` per frame. Exception, called out because it is a classic bug: **mouse delta is not multiplied by `dt`** (`CAMERA_ARCHITECTURE.md` §3).
- No DOM reads (`offsetWidth`, `getBoundingClientRect`) inside the loop; cache on resize.
- Debug-only work sits behind `if (__DEV__)` so it is eliminated in production.

## 5. Error handling

- **Never `catch {}`.** Never swallow. Every catch either recovers meaningfully or rethrows with context.
- Classify errors into the three tiers in `ARCHITECTURE.md` §8 (fatal / degraded / recoverable) and route them through `core/errors.ts`, which owns logging and the user-facing notice.
- Use `Result<T, E>` for expected failures (save read, asset load) rather than exceptions for control flow.
- `assert(cond, msg)` from `utils/assert.ts` for invariants; it throws in dev and logs-once in production.
- Log messages are actionable: what failed, which key/id, what happens next. No `console.log('here')`, no logging in loops.
- One global `window.onerror` / `unhandledrejection` handler that shows the fatal panel and logs context once — never a silent white screen.

## 6. Comments and documentation

- Comment **why**, not what. The code says what.
- Every non-obvious constant states its unit and its reason.
- Every system file starts with a 2–5 line header: responsibility, what it owns, what it must not do.
- `// TODO(T-x.y):` only — a TODO without a task id is deleted, not kept.
- No commented-out code in commits. Git remembers.
- No ASCII-art banners, no changelog comments, no author tags.

## 7. Data over code

- Tuning values live in `data/balance.ts`. Content lives in `data/*.ts`. Strings live in `data/strings/`.
- If a value would ever be tuned by a designer, it is data.
- Data modules are `as const` and typed so bad content fails the build (`MISSION_ARCHITECTURE.md` §1).
- Behaviour is one implementation parameterised by data — not a subclass per variant (`VehicleSpec`, `NpcArchetype`).

## 8. Class and function shape

- Composition over inheritance. Inheritance depth ≥2 requires a justification.
- Functions do one thing; if a function needs a section comment, split it.
- Max ~5 parameters; past that, take an options object.
- No optional-boolean parameters that change behaviour (`update(true)`); use two named functions or an enum-ish union.
- Constructors do not do work (no loading, no scene mutation) — that is `init`'s job (`ARCHITECTURE.md` §2).
- Every class that acquires a resource has `dispose()`, and it is idempotent.

## 9. Formatting

Prettier, default-ish: 2-space indent, single quotes, semicolons, trailing commas, 100-column print width. Run automatically; never argue about it; never reformat files a change does not touch.

## 10. Things that are simply banned

`eval` · `with` · `var` · implicit globals · `window.<anything>` for game state (except the guarded `__mow` e2e hook) · module-level mutable singletons · `document.querySelector` outside `src/ui/` · `Math.random()` in world generation (use the seeded RNG) · `setTimeout` for game timing (use the loop) · `setInterval` anywhere · `async` functions in the loop path · `await` inside `update` · magic numbers in logic · dead code · duplicated implementations · dependencies without an ADR.
