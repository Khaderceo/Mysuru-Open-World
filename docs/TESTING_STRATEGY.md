# TESTING_STRATEGY

Tests exist to make small changes safe and to keep Claude sessions from re-discovering breakage. Every test must be cheap to run and unambiguous when it fails.

---

## 1. The gate

```
npm run check   =   typecheck  →  unit  →  build  →  asset-manifest check  →  e2e smoke  →  perf
```

`npm run check` must pass before any commit that claims a milestone. CI runs the same command on every push and PR, so local and CI never disagree (`GITHUB_WORKFLOW.md`).

## 2. Layers

| Layer | Tool | Runs | What it covers |
|---|---|---|---|
| Type checking | `tsc --noEmit`, `strict` | seconds | the majority of real defects in a TS codebase |
| Static checks | small node scripts | seconds | import cycles, banned imports, asset manifest ↔ files, string-id coverage, credits coverage |
| Unit | vitest | seconds | pure logic: math, RNG determinism, collision resolution, IDM, save migration, mission objectives, localization |
| Build | vite build | ~10 s | production build succeeds; bundle size within budget |
| E2E smoke | Playwright + Chromium | ~30 s | the page actually loads and plays |
| Perf | Playwright + benchmark route | ~60 s | budget regressions |

No test framework is added beyond vitest and Playwright.

## 3. Static checks (custom, tiny scripts in `tests/static/`)

1. **Import cycle check** — walks `src/` imports and fails on any cycle (`ARCHITECTURE.md` §3).
2. **Layer check** — fails if a module imports "upward" against the dependency direction, or if anything outside `core` imports `debug/`.
3. **Asset manifest check** — every `MANIFEST` url exists in `public/`; every file in `public/{models,textures,audio,fonts}` is referenced; no absolute `/` paths that would break subpath hosting (`DEPLOYMENT.md`).
4. **Credits check** — every asset file has a row in `public/asset-credits.json` (`ASSET_PLAN.md` §8).
5. **String-id check** — every `t('…')` id exists in `en`; report `kn` coverage (`LOCALIZATION_PLAN.md` §6).
6. **Literal-string check** — flags user-visible string literals in `src/ui/` outside `data/strings/`.
7. **Secret scan** — fails on anything resembling a key/token in tracked files (`PROJECT_SPEC.md` §3).

These catch exactly the failure classes that are invisible to types and expensive to find at runtime.

## 4. Unit tests — what is worth testing

Prioritised by "would a silent break here cost hours?":

| Area | Tests |
|---|---|
| `utils/rng` | determinism: same seed → same sequence; distribution sanity |
| `city` generation | same seed → identical placement digest for a chunk; different seeds differ; no two props within min-distance |
| `physics` | capsule vs. box: penetration resolved, slide along walls, corner stability, step-up at 0.35 m, no step-up at 0.5 m, no tunnelling at 30 m/s with sub-stepping |
| `RoadGraph` | lane counts and widths from segment defs; lane connectivity at intersections; `nearestLane` correctness; route finding returns a connected path; sidewalk/crossing links exist for every signalled node |
| `traffic` IDM | converges to target speed; maintains ≥ minGap behind a stopped leader; queue does not oscillate; stops at a red stop line |
| `missions` | each objective kind completes on its condition and only then; ordered advance; abandon disposes; reward applied once (idempotence) |
| `save` | round-trip fidelity; every historical fixture migrates to current; corrupt/hostile inputs rejected without throwing; quota error handled |
| `economy` | money never negative; level derived correctly at boundaries |
| `localization` | interpolation; fallback to `en`; `Intl` formatting for `en-IN` |
| `pool` | acquire/release invariants; no leak after N cycles |
| `interaction` | best-candidate selection by priority then distance; facing cone; disposal removes prompts |

Tests import only the module under test — pure logic modules must not require a WebGL context. That constraint is itself a design check: if a piece of logic cannot be unit-tested without a renderer, it is in the wrong module.

## 5. E2E smoke (Playwright, headless Chromium)

Run against `npm run preview` serving a **test build** — produced by `npm run build:e2e`, which is the production config with `__E2E__: true` and nothing else changed. This is the one place the two builds differ: the deployed build (`npm run build`) has `__E2E__: false`, so the `?e2e=1` hook is absent from it, and the build check asserts that. Testing a build that is byte-identical to the deployed one *and* exposes a test hook is not possible; a single flag flip is the smallest honest compromise, and every other code path is shared.

WebGL is enabled via `--use-gl=angle --use-angle=swiftshader` so it works on CI runners without a GPU.

The smoke test **grows with the milestones** — each step below lands with the system it exercises, and is not written before it. Phase 1 (T-1.9) implements steps 1–3, 8 and 9 only:
1. Loads the page; asserts the loading screen appears, then disappears within a timeout.
2. Asserts **zero console errors and zero unhandled rejections** (a strict allowlist for known-benign warnings, reviewed when it changes).
3. Asserts the canvas has non-zero size and that `renderer.info.render.calls > 0` via an exposed dev hook.
4. Presses `W` for 2 s; asserts the player position changed (read through a test hook on `window.__mow` exposed only when `?e2e=1`).
5. Walks to the parked auto, presses `E`; asserts `driving` state and that the HUD speed element appears.
6. Runs the scripted mission path with teleport helpers; asserts `mission:completed` fired and money increased.
7. Reloads; asserts the player position and money are restored (save/load).
8. Asserts a 404'd optional asset produces a notice and **not** a crash (network interception).
9. Asserts no WebGL context loss and no `THREE.WebGLProgram` compile errors.

The `?e2e=1` hook exposes a **read-only** state snapshot plus a few input/teleport helpers, is guarded by `if (__E2E__)`, and is therefore present in the `build:e2e` output and absent from the deployed `build` output — which the build check asserts (`TASKS.md` T-11.8).

## 6. Perf test

Runs the `?bench=1` benchmark route (`PERFORMANCE.md` §7) headlessly, collects the JSON summary and compares against `tests/perf-baseline.json`:

- **Hard failures:** draw calls, triangle count, scene object count, JS bundle size, total asset bytes, heap growth over the run.
- **Warnings (reported, not failing):** p95/max frame time — headless SwiftShader timings are not representative of real GPUs.
- Baselines are updated deliberately, in their own commit, with the reason in the message.

## 7. Manual acceptance testing

Automation cannot judge feel. Each milestone has a short written checklist run by hand in a real browser (see `MVP_ACCEPTANCE.md`), covering: control responsiveness, camera behaviour near walls, vehicle handling, chunk-boundary hitching, night readability, audio balance, and UI legibility in both locales.

Manual results are recorded as a checked list in the milestone's commit or PR description, so the state is discoverable later without re-testing (a token-efficiency measure).

## 8. Browser compatibility testing

- CI runs the smoke test in **Chromium and Firefox** (both provided by Playwright).
- WebKit is run best-effort and is **not** a merge gate (`BROWSER_COMPATIBILITY.md`).
- A manual matrix pass on real Chrome/Edge/Firefox happens at each phase boundary, plus once on Safari before release.

## 9. Runtime diagnostics as a testing tool

The debug overlay, collider visualisation, lane-graph overlay and the per-system timing table are treated as *test infrastructure*, not conveniences. They are built in Phase 1 (`TASKS.md` T-1.6) because every later bug is diagnosed with them, and their absence is what turns a 10-minute fix into a rewrite loop.

## 10. What we deliberately do not test

Rendering output pixels (no screenshot diffing — too brittle for a dynamic scene with a day/night cycle), Three.js internals, exact simulation trajectories of traffic/NPCs (non-deterministic by design), audio output, and anything requiring a real GPU in CI. Where visual regression matters, a manual checklist item covers it.
