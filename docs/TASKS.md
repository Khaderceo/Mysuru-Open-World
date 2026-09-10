# TASKS — ordered implementation backlog

Work top to bottom. One task at a time. Read `CLAUDE_WORKFLOW.md` §1 before starting any task.

> ## Current position
> **Phase 1 — in progress.** Last done: **T-1.4**. Next task: **T-1.5**.
> Update these two lines with every completed task, and read **only the current phase's section** below (plus the one architecture doc the task names). This file is ~850 lines; reading all of it every session is the largest avoidable token cost in the project (`PROJECT_SPEC.md` §6).

**Status legend:** `todo` · `in-progress` · `done` · `blocked`
**Complexity:** S (≤1 sitting) · M (a sitting or two) · L (needs splitting if it grows)
**Every task's implicit validation** is `npm run check` unless a narrower command is named. Every task's implicit acceptance includes: no new dependency, no new folder without one, no unrelated file touched.

> Status column is updated **in the same commit** that completes the task.

---

## PHASE 1 — Browser technical foundation (M1)

### T-1.1 · Scaffold Vite + TypeScript + Three.js project — `done`
- **Purpose** A buildable, type-checked, deployable shell. Everything else depends on this being right once.
- **Deps** Phase 0 approval.
- **Files** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.prettierrc`, `.gitignore` (verify `dist/`, `.vite/`), `.nvmrc`.
- **Acceptance** `npm run dev` serves a page; `npm run typecheck` and `npm run build` pass; `three` pinned to an exact version; `base` set for the Pages subpath; `__DEV__`/`__E2E__` defines present; scripts `dev/build/preview/typecheck/test/test:e2e/check` exist (some may be stubs until T-1.9).
- **Validation** `npm run typecheck && npm run build`
- **Risk / Complexity** Low / S

### T-1.2 · Renderer, scene and resize — `done`
- **Purpose** One place that owns the WebGL context, scene root, tone mapping and resize handling.
- **Deps** T-1.1. **Doc** `PERFORMANCE.md` §5, `WEB_ARCHITECTURE.md` §6–7.
- **Files** `src/rendering/Renderer.ts`, `src/rendering/Scene.ts`, `src/rendering/camera.ts`, `src/core/capabilities.ts`.
- **Acceptance** WebGL2 context created with the documented settings; **`rendering/camera.ts` creates and owns the single `PerspectiveCamera`** (near 0.15, far 600, FOV 60) — no other task creates one, and `camera/CameraSystem.ts` (T-2.6) *drives* this instance rather than constructing its own; dpr clamped to the cap; debounced resize updates renderer and camera aspect; `capabilities.ts` is the single detection site and is frozen; context-loss/restore listeners registered.
- **Validation** `npm run build`; manual resize + zoom check.
- **Risk / Complexity** Low / S

### T-1.3 · Game runtime, system contract and context — `done`
- **Purpose** The skeleton every system plugs into.
- **Deps** T-1.2. **Doc** `ARCHITECTURE.md` §2–5.
- **Files** `src/core/Game.ts`, `src/core/System.ts`, `src/core/GameContext.ts`, `src/core/state.ts`, `src/core/config.ts`.
- **Acceptance** `System` interface exactly as documented; systems init in declared order with async support and progress reporting; `dispose` unwinds in reverse; `GameContext` exposes clock/events/config/state/scene/camera/get, plus `physics` and `assets` typed as **present-but-unset until T-2.1 and T-2.8 register them** (a `get`-style lookup that throws a named error if used early — never a silent `undefined`); `GameState` is a single typed tree with owner comments; no module-level mutable singletons.
- **Validation** `npm run typecheck`; a throwaway test system proves ordering and disposal.
- **Risk / Complexity** Medium / M

### T-1.4 · Typed event bus — `done`
- **Purpose** Decoupled, allocation-free notifications.
- **Deps** T-1.3. **Doc** `ARCHITECTURE.md` §4.
- **Files** `src/core/events.ts`, `src/core/EventBus.ts`, `tests/unit/eventbus.test.ts`.
- **Acceptance** `GameEvents` map typed with no `any`; `on/off/emit` typed by key; emit is synchronous and allocates nothing for reused payloads; unsubscribe during emit is safe; unit tests cover ordering, unsubscribe-during-emit and payload typing.
- **Validation** `npm run test`
- **Risk / Complexity** Low / S

### T-1.5 · Game loop and scheduler — `todo`
- **Purpose** The hybrid fixed/variable loop and per-system rates.
- **Deps** T-1.3. **Doc** `WEB_ARCHITECTURE.md` §3–5, ADR-012.
- **Files** `src/core/Loop.ts`, `src/core/Scheduler.ts`, `src/core/Clock.ts`, `tests/unit/loop.test.ts`.
- **Acceptance** rAF driver with `MAX_FRAME_DT = 0.1`, `FIXED_DT = 1/60`, `MAX_STEPS = 5` and debt-dropping; `alpha` exposed to `lateUpdate`; scheduler honours per-system Hz with phase offsets and passes accumulated dt; per-system timings recorded for the debug overlay; page-visibility pause discards elapsed time.
- **Validation** `npm run test` (loop stepping is unit-testable with an injected time source).
- **Risk / Complexity** Medium / M

### T-1.5a · Minimal validation scene — `todo`
- **Purpose** M1's acceptance requires the page to load **a lit scene with a ground plane and a test box at 60 FPS**, but no Phase 1 task produced renderable content: T-1.2 correctly stops at the scene root, and the grey-box world is Phase 2 (T-2.4). Without this, T-1.5 cannot demonstrate a frame rate, T-1.6's `renderer.info` counters all read zero, and T-1.9's smoke assertion `render.calls > 0` fails. This is the smallest content that makes the Phase 1 rendering path observable.
- **Deps** T-1.2, T-1.5. **Doc** `ARCHITECTURE.md` §6 (`rendering` owns lights), `ROADMAP.md` Phase 1.
- **Files** `src/rendering/validationScene.ts`.
- **Acceptance** One function that populates the existing scene root from T-1.2 with a hemisphere + directional light, a ground plane and a single test box at correct 1 m scale; reuses the T-1.2 renderer, scene and camera and **constructs no renderer, scene or camera of its own**; ≤4 draw calls; no colliders and no input (physics is T-2.1) — this is a render-path probe, not a playground. **Not `__DEV__`-gated:** it is the visible Phase 1 deliverable and must be present in the deployed build for M1 and for T-1.9's smoke assertion, which distinguishes it from T-2.4's `__DEV__`+URL-flagged `TestWorld`.
- **Retirement (so it never becomes a duplicate system)** Superseded in two steps: **T-2.4** replaces its geometry with `world/TestWorld.ts`, **T-3.10** replaces its lighting with `rendering/Lighting.ts` and **deletes this file**. It is placeholder scaffolding under `ASSET_PLAN.md` §10, not a system.
- **Validation** manual (a lit box on a ground plane is visible in the built page) + the frame-time readout once T-1.6 lands.
- **Risk / Complexity** Low / S

### T-1.6 · Debug overlay and diagnostics — `todo`
- **Purpose** Build the instrument panel before the machine. Every later bug is diagnosed with this.
- **Deps** T-1.5, T-1.5a (the counters need something to count). **Doc** `PERFORMANCE.md` §7, `TESTING_STRATEGY.md` §9.
- **Files** `src/debug/Overlay.ts`, `src/debug/gizmos.ts`, `src/debug/index.ts`.
- **Acceptance** Shows FPS, frame-time p95/max, `renderer.info` counters, texture-memory estimate, heap where available, and the per-system timing table; toggled with a key and a URL flag; entirely behind `__DEV__` and **absent from the production bundle** (asserted by a build check); nothing in `src/` imports `debug/` except the guarded hook in `core/`.
- **Validation** `npm run build` + grep the bundle for a debug-only marker string.
- **Risk / Complexity** Low / M

### T-1.7 · Error handling, capability gate and loading screen — `todo`
- **Purpose** Never a white screen; never a silent failure.
- **Deps** T-1.2, T-1.3. **Doc** `ARCHITECTURE.md` §8, `UI_ARCHITECTURE.md` §4.
- **Files** `src/core/errors.ts`, `src/ui/Loading.ts`, `src/ui/FatalPanel.ts`, `index.html` (static loading markup + CSP meta).
- **Acceptance** Three error tiers routed through one module; global `onerror`/`unhandledrejection` show the fatal panel and log once with context; a missing WebGL2 context produces the documented panel; the loading screen paints before JS and reports progress with a phase label; a 20 s no-progress watchdog surfaces what is pending. **In Phase 1 progress is driven by system-init step count** (there are no assets yet); byte-weighted asset progress and pending *asset keys* arrive with the asset system in T-2.8, which extends this panel rather than replacing it.
- **Validation** `npm run test:e2e` (forced null context case).
- **Risk / Complexity** Low / M

### T-1.8 · Input system — `todo`
- **Purpose** Device events → one snapshot per frame, decoupled from gameplay.
- **Deps** T-1.5. **Doc** `PLAYER_ARCHITECTURE.md` §6.
- **Files** `src/input/InputSystem.ts`, `src/input/InputState.ts`, `src/data/bindings.ts`.
- **Acceptance** `InputState` exactly as documented with `Pressed` edge flags; bindings are data keyed by `event.code`; pointer lock requested on canvas click with a drag-to-look fallback and a HUD hint; Escape handled once; a single `inputBlocked` flag gates all consumers; no gameplay callbacks from listeners.
- **Validation** `npm run typecheck`; manual key/mouse check with the debug overlay showing the snapshot.
- **Risk / Complexity** Low / M

### T-1.9 · CI, deploy workflow and test harness — `todo`
- **Purpose** The gate exists before there is anything to break.
- **Deps** T-1.1 … T-1.8. **Doc** `TESTING_STRATEGY.md`, `DEPLOYMENT.md`.
- **Files** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `vitest.config.ts` (only if config is actually needed), `playwright.config.ts`, `tests/static/*.mjs`, `tests/e2e/smoke.spec.ts`.
- **Note** `vitest` was installed and the `test` script activated in **T-1.4**, whose acceptance required `npm run test` — do not re-install it, and do not add a `vitest.config.ts` unless something needs configuring (T-1.4 needed none). `@playwright/test` and `test:e2e` are still stubs and remain this task's job.
- **Acceptance** `npm run check` chains typecheck → unit → build → static checks → e2e smoke; static checks include import cycles, layering, secret scan (manifest/credits/string checks land with their systems); a `build:e2e` script produces the production config with `__E2E__: true` (`TESTING_STRATEGY.md` §5) and the deploy build asserts the hook is absent; **the Phase 1 smoke test implements only steps 1–3, 8 and 9** of `TESTING_STRATEGY.md` §5 — the player/vehicle/mission/save steps land with their milestones; e2e runs against `preview` in Chromium and Firefox with SwiftShader and asserts zero console errors; deploy publishes to Pages only after a green gate; the live subpath URL loads.
- **Validation** CI green on push; deployed URL loads.
- **Risk / Complexity** Medium / M

**→ MILESTONE M1** — tag `m1-scene`. Acceptance: `ROADMAP.md` Phase 1.

---

## PHASE 2 — Player, camera, test world (M2)

### T-2.1 · Collision world: shapes and broadphase — `todo`
- **Purpose** The foundation of all movement.
- **Deps** T-1.3. **Doc** `PLAYER_ARCHITECTURE.md` §2.
- **Files** `src/physics/CollisionWorld.ts`, `src/physics/shapes.ts`, `src/utils/grid.ts`, `src/utils/math.ts`, `tests/unit/grid.test.ts`.
- **Note** The uniform grid goes in `utils/` because `city/spatialIndex.ts` (T-3.3) and `interaction` need the same structure over different contents. **One implementation, several instances** — a second grid implementation is the duplication `CLAUDE_WORKFLOW.md` §9 names.
- **Acceptance** `Collider` union (box/ramp/wall, yaw-only) and the documented `CollisionWorld` API; a generic `UniformGrid<T>` in `utils/` with 8 m cells, insert/remove and per-owner bulk removal; `overlapSphere` and `raycast` allocation-free with `out` parameters; unit tests for grid membership, bulk removal and query correctness.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M

### T-2.2 · Capsule sweep and resolution — `todo`
- **Purpose** Correct, stable character collision — the highest-risk bespoke code in the project.
- **Deps** T-2.1. **Doc** `PLAYER_ARCHITECTURE.md` §2, §9.
- **Files** `src/physics/sweep.ts`, `src/physics/ground.ts`, `tests/unit/physics-sweep.test.ts`.
- **Acceptance** Capsule-vs-OBB closest-point narrowphase; delta sub-stepped to ≤0.25 × radius; 4-iteration move/project/slide resolver; analytic `groundAt` plus collider tops; tests cover penetration resolved, slide along a wall, corner stability (no jitter over 300 steps), step-up at 0.35 m, no step-up at 0.5 m, 45° slope walkable / 50° not, and no tunnelling at 30 m/s.
- **Validation** `npm run test`
- **Risk / Complexity** **High** / L — if this grows past ~400 lines, split narrowphase from resolution.

### T-2.3 · Collider visualisation — `todo`
- **Purpose** Debugging collision without it is guesswork.
- **Deps** T-2.1, T-1.6.
- **Files** `src/debug/colliderView.ts`.
- **Acceptance** Toggle draws every collider as wireframe plus the occupied broadphase cells and the player capsule; uses one shared line material and updates only on change; `__DEV__` only.
- **Validation** manual.
- **Risk / Complexity** Low / S

### T-2.4 · Grey-box test world — `todo`
- **Purpose** A controlled environment for tuning feel before the real city exists.
- **Deps** T-2.1, T-1.2.
- **Files** `src/world/TestWorld.ts`, `src/data/testWorld.ts`.
- **Acceptance** A flat ground plane with kerbs (0.15/0.35/0.5 m), ramps (20/45/50°), a stair run, narrow gaps, a wall corner, a moving platform-free box grid, and a reference 1.8 m human proxy for scale; all colliders registered; ≤10 draw calls; removable in one commit later (it is dev content, kept behind `__DEV__` and a URL flag). **Also removes the geometry half of T-1.5a's validation scene** (its ground plane and test box) in the same commit, so there is never a second ground plane; T-1.5a's lighting stays until T-3.10.
- **Validation** manual.
- **Risk / Complexity** Low / S

### T-2.5 · Player controller and movement state machine — `todo`
- **Purpose** Walking, running, jumping — the core verb set.
- **Deps** T-2.2, T-1.8. **Doc** `PLAYER_ARCHITECTURE.md` §3–5.
- **Files** `src/player/PlayerSystem.ts`, `src/player/states.ts`, `src/data/balance.ts`, `tests/unit/player-states.test.ts`.
- **Acceptance** All constants from §3 live in `data/balance.ts`; explicit Idle/Walk/Run/Jumping/Falling/Driving states with `enter/update/exit` (no boolean soup); fixed-step integration exactly as §5; coyote time and jump buffer work; `PlayerView` published; visual interpolation with `alpha`; state-transition unit tests.
- **Validation** `npm run test` + manual in the test world.
- **Risk / Complexity** High / L

### T-2.6 · Third-person camera rig — `todo`
- **Purpose** The camera the player looks through for the whole game.
- **Deps** T-2.5. **Doc** `CAMERA_ARCHITECTURE.md`.
- **Files** `src/camera/CameraSystem.ts`, `src/camera/rig.ts`, `src/camera/probe.ts`.
- **Acceptance** Anchor/orbit/position rig with the documented time constants; pitch clamps; `1 - exp(-dt/tau)` smoothing (never dt-multiplied mouse delta); wheel distance control; sphere-cast probe with 4 corner rays, fast pull-in / slow push-out, and the ground floor clamp; anchor-inside-geometry fallback; `cameraYaw` published for camera-relative movement; zero per-frame allocation.
- **Validation** manual against the wall/corner cases in the test world; `npm run typecheck`.
- **Risk / Complexity** Medium / M

### T-2.7 · Movement and camera feel tuning — `todo`
- **Purpose** Make it *pleasant*. This is a deliverable, not a nicety.
- **Deps** T-2.5, T-2.6. **Doc** `GAME_DESIGN.md` §15, `MVP_ACCEPTANCE.md` L1–L2.
- **Files** `src/data/balance.ts` only.
- **Acceptance** A written checklist signed off: acceleration feels responsive without ice-skating; running is distinctly faster without being twitchy; jump lands where the player expects; no jitter against walls; the camera never flinches; identical feel at 60 and 144 Hz. Values changed in data only — **no logic changes in this task**.
- **Validation** manual checklist recorded in the commit body.
- **Risk / Complexity** Medium / M

### T-2.8 · Player character proxy and animation hookup — `todo`
- **Purpose** Something legible to look at, with the animation contract in place.
- **Deps** T-2.5. **Doc** `PLAYER_ARCHITECTURE.md` §7, `ASSET_PLAN.md` §2.
- **Files** `src/player/PlayerVisual.ts`, `src/assets/AssetSystem.ts` (initial), `src/data/assets.ts`.
- **Acceptance** Asset system with manifest, keyed cache, reference counting, de-duplicated in-flight loads, retry policy and tiered loading; player visual driven by **animation keys** not clip names; a stylized proxy is acceptable if no character asset is available; swapping the asset requires no gameplay change.
- **Validation** `npm run check`; manual.
- **Risk / Complexity** Medium / M

### T-2.9 · Guard tests for the six known failure modes — `todo`
- **Purpose** Lock in the fixes for the classic controller bugs.
- **Deps** T-2.2, T-2.5. **Doc** `PLAYER_ARCHITECTURE.md` §9.
- **Files** `tests/unit/player-guards.test.ts`, `src/physics/*` (guards).
- **Acceptance** Tests for: ground floor clamp; push-out when a collider is inserted overlapping the player; no-progress corner nudge; clamped vehicle push with no vertical impulse; sub-stepped tunnelling; spawn validation finds a free position.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M

**→ MILESTONE M2** — tag `m2-player`. Acceptance: `MVP_ACCEPTANCE.md` C1–C8.

---

## PHASE 3 — Mysuru environment foundation (M3, M4)

### T-3.1 · Seeded RNG and pooling utilities — `todo`
- **Purpose** Deterministic generation and zero-allocation reuse, needed by everything that follows.
- **Deps** T-1.3. **Doc** `WEB_ARCHITECTURE.md` §8, `CODING_RULES.md` §4.
- **Files** `src/utils/rng.ts`, `src/utils/pool.ts`, `src/utils/hash.ts`, `tests/unit/rng.test.ts`, `tests/unit/pool.test.ts`.
- **Acceptance** mulberry32-style PRNG with `hash(worldSeed, cx, cz)` chunk seeding; identical sequences for identical seeds across runs; `Pool<T>` with acquire/release, no leaks over 10k cycles, and a dev-mode double-release assert; no `Math.random` anywhere in `src/` (static check added).
- **Validation** `npm run test`
- **Risk / Complexity** Low / S

### T-3.2 · Authored road and zone data — `todo`
- **Purpose** The ~60 segments and 4 zones that define the district.
- **Deps** T-3.1. **Doc** `CITY_SYSTEM.md` §1, `WORLD_DESIGN.md` §2.
- **Files** `src/data/city/roads.ts`, `src/data/city/zones.ts`, `src/data/anchors.ts`.
- **Acceptance** 40–60 nodes and 60–90 segments forming a fully connected network with a bounding ring road; four zone polygons covering the district; the documented types with no `any`; named anchors for palace gate, market stalls, auto stand, home lane; a validation test asserts connectivity, no duplicate ids, no zero-length segments, every anchor inside a zone.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M — layout design work; iterate with the minimap/overlay, not by guessing.

### T-3.3 · RoadGraph: curves, lanes, sidewalks, intersections — `todo`
- **Purpose** The single derived road model every system reads.
- **Deps** T-3.2. **Doc** `CITY_SYSTEM.md` §1.
- **Files** `src/city/RoadGraph.ts`, `src/city/lanes.ts`, `src/city/intersections.ts`, `src/city/spatialIndex.ts` (an instance of `utils/grid.ts`, not a new grid), `tests/unit/roadgraph.test.ts`.
- **Acceptance** Catmull-Rom sampling at 2 m shared by lanes, sidewalks and the minimap; lane centrelines with direction/width/index/neighbours; turn connectivity through intersections; sidewalk polylines and crossing links for every signalled node; intersection polygons and stop lines; block polygons (planar faces); uniform spatial index; `RoadNetworkView` published exactly as documented; build time <20 ms; unit tests per bullet.
- **Validation** `npm run test`
- **Risk / Complexity** **High** / L — split into curve/lane, intersection, and block-extraction commits if it grows.

### T-3.4 · Lane and sidewalk debug overlay — `todo`
- **Purpose** You cannot author or debug a road network you cannot see.
- **Deps** T-3.3, T-1.6.
- **Files** `src/debug/roadView.ts`.
- **Acceptance** Toggles for lane centrelines (coloured by direction), sidewalks, crossings, intersection polygons, stop lines, node ids and block polygons; built once and updated only on rebuild; `__DEV__` only.
- **Validation** manual.
- **Risk / Complexity** Low / S

### T-3.5 · Chunk manager and streaming — `todo`
- **Purpose** The world grows without hitching.
- **Deps** T-3.3, T-2.1. **Doc** `WORLD_DESIGN.md` §3–4.
- **Files** `src/world/ChunkManager.ts`, `src/world/Chunk.ts`, `src/world/ChunkBuildQueue.ts`, `tests/unit/streaming.test.ts`.
- **Acceptance** 8×8 grid of 128 m chunks; 4 Hz evaluation; detailed radius 2, silhouette ring +2, unload radius 5 with hysteresis; distance- then view-direction-ordered queue; sliced builds within a 4 ms/frame budget; chunks attach only when fully built; 3×3 prewarm behind the loading screen; disposal removes colliders, returns pooled buffers and disposes chunk-owned geometry/materials; a single failed build retries once then degrades to flat ground; unit tests for the load/keep/drop set computation and boundary oscillation.
- **Validation** `npm run test` + manual walk across boundaries with the frame-time graph open.
- **Risk / Complexity** **High** / L

### T-3.6 · Terrain ground and analytic height — `todo`
- **Purpose** A believable ground surface whose collision is exact and free.
- **Deps** T-3.5. **Doc** `WORLD_DESIGN.md` §6.
- **Files** `src/world/Terrain.ts`, `src/physics/ground.ts` (extend).
- **Acceptance** Per-chunk 8×8 subdivided plane with ±0.6 m seeded noise displacement; ground fitted to road edges with no seams or floating kerbs; one draw call per chunk; `groundAt(x,z)` samples the identical function (a test asserts mesh vertex heights match `groundAt` within 1 mm); vertex-colour blending for dirt/grass/paving.
- **Validation** `npm run test` + manual.
- **Risk / Complexity** Medium / M

### T-3.7 · Road, kerb and sidewalk mesh generation — `todo`
- **Purpose** The streets themselves, in as few draw calls as possible.
- **Deps** T-3.3, T-3.6. **Doc** `CITY_SYSTEM.md` §2.
- **Files** `src/city/roadMesh.ts`, `src/city/kerbMesh.ts`, `src/rendering/materials.ts`.
- **Acceptance** Ribbon meshes from centrelines split per chunk; lane markings, stop lines, zebra crossings and kerb stripes as atlas UV regions (no extra meshes, no decals); triangulated intersection polygons with chamfered corners; speed breakers with `ramp` colliders; one shared material for all road surfaces; ≤2 draw calls per chunk for roads+kerbs+sidewalks.
- **Validation** manual + draw-call counter.
- **Risk / Complexity** Medium–High / L

### T-3.8 · Modular building assembly (Phase-A primitives) — `todo`
- **Purpose** Buildings everywhere, cheaply, with the assembly rules the real kit will inherit.
- **Deps** T-3.5, T-3.3. **Doc** `CITY_SYSTEM.md` §3–4, `ASSET_PLAN.md` §10.
- **Files** `src/city/blocks.ts`, `src/city/buildings.ts`, `src/city/kitPrimitives.ts`, `tests/unit/city-determinism.test.ts`.
- **Acceptance** Block inset/frontage walk/lot consumption as documented; storey count, palette and kit weights from zone data; per-lot assembly merged into the chunk's static mesh (1–3 draw calls per material per block); box colliders fitted to footprints (never mesh colliders); determinism test compares placement digests for two builds of the same chunk and asserts different seeds differ.
- **Validation** `npm run test` + draw-call counter.
- **Risk / Complexity** High / L

### T-3.9 · Street furniture and vegetation instancing — `todo`
- **Purpose** Density and Mysuru texture at instanced cost.
- **Deps** T-3.8. **Doc** `CITY_SYSTEM.md` §5.
- **Files** `src/city/props.ts`, `src/city/vegetation.ts`, `src/data/city/propProfiles.ts`.
- **Acceptance** Prop profiles drive spacing per road class; rejection sampling with a minimum-distance check so nothing intersects (test asserts no pair closer than the profile minimum); **static props merged into the chunk mesh (0 extra draw calls), vegetation instanced at ≤3 species batches per chunk** (`CITY_SYSTEM.md` §5); `castShadow = false` on props and vegetation; utility-pole cables as catenary strips; parked vehicle props with colliders; density scales with the quality preset; the draw-call counter stays within the `WORLD_DESIGN.md` §3 arithmetic with all four zones populated.
- **Validation** `npm run test` + manual.
- **Risk / Complexity** Medium / M

### T-3.10 · Lighting, sky and fog (day only) — `todo`
- **Purpose** The district looks like a place, and the draw distance is bounded.
- **Deps** T-1.2. **Doc** `WORLD_DESIGN.md` §8, `PERFORMANCE.md` §5.
- **Files** `src/rendering/Lighting.ts`, `src/rendering/Sky.ts`.
- **Acceptance** One directional sun + hemisphere ambient; 2048² shadow map fitted to a 120 m box around the player and **texel-snapped** (no shimmer while walking); gradient sky dome; exp²  fog matched to the sky horizon at ~250 m; ACESFilmic tone mapping; all values in data. **Deletes `src/rendering/validationScene.ts` in the same commit** — this is the real lighting that supersedes it, and two lighting setups must never coexist.
- **Validation** manual + shadow-shimmer check while walking.
- **Risk / Complexity** Medium / M

### T-3.11 · World edges and blockers — `todo`
- **Purpose** Leaving the district is graceful, not broken.
- **Deps** T-3.5. **Doc** `WORLD_DESIGN.md` §7.
- **Files** `src/world/Edges.ts`.
- **Acceptance** Low-detail scenery bands and the Chamundi silhouette placed outside the grid with no colliders; an invisible wall a few metres beyond the ring road's outer kerb; a HUD hint at 20 m; no invisible walls anywhere inside the district (a test walks the perimeter of every block and asserts no unexpected blocking).
- **Validation** manual + perimeter test.
- **Risk / Complexity** Low / S

### T-3.12 · Asset manifest and path static checks — `todo`
- **Purpose** Close the "works locally, 404s on Pages" failure class permanently.
- **Deps** T-2.8, T-1.9. **Doc** `TESTING_STRATEGY.md` §3, `DEPLOYMENT.md` §2.
- **Files** `tests/static/assets.mjs`, `src/assets/url.ts`.
- **Acceptance** All runtime URLs built from `BASE_URL` in one helper; checks fail on a manifest URL missing from `public/`, an unreferenced file in `public/`, any root-absolute asset path, and any non-lowercase filename.
- **Validation** `npm run check`
- **Risk / Complexity** Low / S

**→ MILESTONE M3** — tag `m3-walkable` (player walks a populated street).
**→ MILESTONE M4** — tag `m4-district`. Acceptance: `MVP_ACCEPTANCE.md` B1–B6.

---

## PHASE 4 — Landmarks and visual identity (M5)

### T-4.1 · Resolve Q-1 and source the asset kit — `todo`
- **Purpose** Decide CC0-sourced vs. original before any art work begins.
- **Deps** M4. **Doc** `ASSET_PLAN.md` §7–8, `DECISIONS.md` Q-1.
- **Files** `docs/DECISIONS.md`, `public/ASSET_CREDITS.md`, `public/asset-credits.json`, `licenses/`.
- **Acceptance** A recorded decision; every candidate asset's licence verified and registered before download; the credits files exist with the correct schema.
- **Validation** `npm run check` (credits check added in T-4.2).
- **Risk / Complexity** **High risk (R-4)** / M

### T-4.2 · Credits check and in-game credits panel — `todo`
- **Purpose** Make attribution structurally impossible to forget.
- **Deps** T-4.1.
- **Files** `tests/static/credits.mjs`, `src/ui/Credits.ts`.
- **Acceptance** CI fails if any file under `public/{models,textures,audio,fonts}` lacks a credits row with source, author, licence, licence URL, attribution and modifications; the pause-menu Credits panel renders the register.
- **Validation** `npm run check`
- **Risk / Complexity** Low / S

### T-4.3 · Modular building kit (Phase-B assets) — `todo`
- **Purpose** Replace primitives with the real look, with no gameplay change.
- **Deps** T-4.1, T-3.8. **Doc** `CITY_SYSTEM.md` §4, `ASSET_PLAN.md` §4–5.
- **Files** `public/models/kit_building.glb`, `public/textures/city_atlas.*`, `src/city/buildings.ts` (offsets only), `src/data/assets.ts`.
- **Acceptance** ≤30 unique part meshes covering all four zones; parts within the triangle guidance; one atlas material; assembly and merging unchanged; `kitPrimitives.ts` **deleted in this commit** (no parallel implementation); draw calls and texture memory still within budget.
- **Validation** `npm run check` + draw-call/VRAM counters.
- **Risk / Complexity** High / L

### T-4.4 · Signage, hoardings and Kannada street textures — `todo`
- **Purpose** The fastest, cheapest Mysuru recognition win.
- **Deps** T-4.3. **Doc** `GAME_DESIGN.md` §6, `LOCALIZATION_PLAN.md` §1 rule 4.
- **Files** `public/textures/signs_atlas.*`, `src/city/signs.ts`.
- **Acceptance** Kannada-primary/English-secondary signage as bilingual *art* (not localized text); instanced sign placement driven by frontage data; ≥12 distinct shop boards from one atlas; script rendering verified against real Kannada text (correct conjuncts, no tofu).
- **Validation** manual.
- **Risk / Complexity** Medium / M

### T-4.5 · Mysore Palace hero asset — `todo`
- **Purpose** The landmark the whole game orients around.
- **Deps** T-4.3. **Doc** `CITY_SYSTEM.md` §6, `ASSET_PLAN.md` §5.
- **Files** `public/models/lm_palace.glb`, `src/city/landmarks.ts`, `src/data/landmarks.ts`.
- **Acceptance** Original stylized reinterpretation with a recognizable silhouette (central dome, towers, arcaded facade); correct footprint scale beside the 1.75 m player; boundary wall, gate and lawns; ≤40k triangles at LOD0 with 3 LOD levels; visible as an orientation anchor from ≥3 streets; registered as a minimap landmark; no third-party or scanned Palace geometry.
- **Validation** manual + triangle counter + the 30-second recognition judgement recorded.
- **Risk / Complexity** **High** / L

### T-4.6 · Market hero pieces and maximum-density market street — `todo`
- **Purpose** The atmosphere showcase.
- **Deps** T-4.3, T-4.4.
- **Files** `public/models/kit_market.glb`, `src/data/city/zones.ts` (market profile).
- **Acceptance** 3–4 bespoke pieces (arch entrance, canopy run, flower-stall row) plus maximum prop/sign density; the street is dense enough to feel crowded before any pedestrians exist; still within draw-call budget.
- **Validation** manual + counters.
- **Risk / Complexity** Medium / M

### T-4.7 · Chamundi Hill skyline silhouette — `todo`
- **Purpose** The other half of Mysuru's identity, at silhouette cost.
- **Deps** T-3.11.
- **Files** `public/models/lm_chamundi.glb`, `src/world/Edges.ts`.
- **Acceptance** Recognizable hill profile with the temple silhouette, visible from the main road and the Palace precinct; no colliders; ≤3k triangles; one draw call.
- **Validation** manual.
- **Risk / Complexity** Low / S

### T-4.8 · Vegetation and materials pass — `todo`
- **Purpose** Local flora, cohesive materials.
- **Deps** T-4.3, T-3.9.
- **Files** `public/models/veg_*.glb`, `src/city/vegetation.ts`, `src/rendering/materials.ts`.
- **Acceptance** Rain tree, coconut palm, bougainvillea and banana leaf at ≤600 tris LOD0 with a billboard LOD; species mix from zone data; ≤6 resident textures total; texture memory ≤256 MB.
- **Validation** VRAM estimate + manual.
- **Risk / Complexity** Medium / M

**→ MILESTONE M5** — tag `m5-palace`. Acceptance: `MVP_ACCEPTANCE.md` J1–J4, B7.

---

## PHASE 5 — Vehicles (M6)

### T-5.1 · Vehicle spec data and instance model — `todo`
- **Purpose** One data-driven vehicle model for player and AI.
- **Deps** M5, T-2.1. **Doc** `VEHICLE_ARCHITECTURE.md` §1, §3.
- **Files** `src/data/vehicles.ts`, `src/vehicles/VehicleInstance.ts`, `src/vehicles/VehicleSystem.ts`.
- **Acceptance** `VehicleSpec` exactly as documented with the auto-rickshaw's target figures; instances hold transform, velocity, wheels, seats, visual and OBB collider; `VehicleView`/`VehicleHandle` published; no subclass per vehicle type.
- **Validation** `npm run typecheck`
- **Risk / Complexity** Low / M

### T-5.2 · Arcade dynamics — `todo`
- **Purpose** Driving that is predictable and fun.
- **Deps** T-5.1. **Doc** `VEHICLE_ARCHITECTURE.md` §2, ADR-005.
- **Files** `src/vehicles/dynamics.ts`, `tests/unit/vehicle-dynamics.test.ts`.
- **Acceptance** Kinematic bicycle integration in `fixedUpdate` as documented; speed-dependent steering falloff; lateral slip with a handbrake grip reduction; OBB sweep resolution with speed loss along the contact normal; ground snap with visual-only pitch/roll; tests assert top speed reached, 0→10 m/s within the target ±20 %, reverse capped, no NaN at zero speed, and steering authority monotonically decreasing with speed.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M

### T-5.3 · Auto-rickshaw asset and visual polish — `todo`
- **Purpose** It has to look like an auto.
- **Deps** T-5.1. **Doc** `ASSET_PLAN.md` §5.
- **Files** `public/models/veh_auto.glb`, `src/vehicles/VehicleVisual.ts`.
- **Acceptance** ≤3k triangles, yellow/green livery from the shared atlas; wheel spin and steer rotation from named nodes; visual body spring (pitch under accel/brake, roll in turns); 2 LOD levels; licence registered.
- **Validation** manual + `npm run check`.
- **Risk / Complexity** Medium / M

### T-5.4 · Enter / exit flow — `todo`
- **Purpose** The most bug-prone interaction in the game.
- **Deps** T-5.2, T-2.5. **Doc** `VEHICLE_ARCHITECTURE.md` §4.
- **Files** `src/vehicles/seats.ts`, `src/vehicles/enterExit.ts`, `src/player/states.ts` (Driving).
- **Acceptance** Every rule in §4 implemented: entry validation, 0.5 s blend, collider disable, visual-only attachment written in `lateUpdate`, camera transition, HUD swap; exit picks the first free exit point and **refuses with a prompt** when none is free; handbrake applied on exit; the player is never a physics child of a moving object; tests cover blocked-exit refusal and state restoration.
- **Validation** `npm run test` + manual against a wall, a kerb and traffic.
- **Risk / Complexity** **High** / M

### T-5.5 · Vehicle camera mode and transition — `todo`
- **Deps** T-5.4, T-2.6. **Doc** `CAMERA_ARCHITECTURE.md` §2, §6.
- **Files** `src/camera/CameraSystem.ts` (modes), `src/data/balance.ts`.
- **Acceptance** `ThirdPersonVehicle` params as documented; yaw eases to heading only above ~2 m/s; reverse blends 180° after 1 s; FOV/distance scale with speed; the 0.45 s transition both ways with no cut; shake respects the accessibility toggle.
- **Validation** manual.
- **Risk / Complexity** Medium / M

### T-5.6 · Vehicle collision responses — `todo`
- **Deps** T-5.2. **Doc** `VEHICLE_ARCHITECTURE.md` §5.
- **Files** `src/vehicles/collisionResponse.ts`, `tests/unit/vehicle-collision.test.ts`.
- **Acceptance** Static slide with speed loss; vehicle-vs-vehicle separation with partial speed exchange and no stacking or rotation impulse; clamped push on the player capsule with no vertical component; speed-breaker and kerb responses; no launching, no falling through (tests assert bounded impulse magnitudes).
- **Validation** `npm run test` + manual.
- **Risk / Complexity** Medium / M

### T-5.7 · Player vehicle lifecycle and persistence hook — `todo`
- **Deps** T-5.4. **Doc** `VEHICLE_ARCHITECTURE.md` §6.
- **Files** `src/vehicles/VehicleSystem.ts`, `src/core/state.ts`.
- **Acceptance** One player auto exists from boot at the home anchor; never streamed out; its transform lives in `GameState`; a minimap icon always shows it (icon registration only — the minimap lands in Phase 10).
- **Validation** manual.
- **Risk / Complexity** Low / S

### T-5.8 · Handling feel tuning — `todo`
- **Purpose** Data-only iteration until driving is fun.
- **Deps** T-5.2 … T-5.6. **Doc** `MVP_ACCEPTANCE.md` D4.
- **Files** `src/data/vehicles.ts` only.
- **Acceptance** Written checklist signed off: acceleration has weight; braking is confident; the auto feels tippy and buzzy without being uncontrollable; reversing is usable; low-speed manoeuvring in the market lane works; no logic changes in this task.
- **Validation** manual checklist in the commit body.
- **Risk / Complexity** Medium / M

**→ MILESTONE M6** — tag `m6-vehicle`. Acceptance: `MVP_ACCEPTANCE.md` D1–D7.

---

## PHASE 6 — Traffic (M7)

### T-6.1 · Traffic config and agent pool — `todo`
- **Deps** M6, T-3.3. **Doc** `TRAFFIC_ARCHITECTURE.md` §1, §8, §10.
- **Files** `src/data/traffic.ts`, `src/traffic/TrafficSystem.ts`, `src/traffic/Agent.ts`.
- **Acceptance** Pool of 28 preallocated agents built at boot; no allocation per spawn; caps enforced (≤24 active, ≤10 near tier); density by road class and time of day from data; agent state is `{laneRef, s, speed, targetSpeed, route, state}` with the transform derived from the lane sample.
- **Validation** `npm run typecheck` + debug counters.
- **Risk / Complexity** Medium / M

### T-6.2 · Car-following (IDM) — `todo`
- **Deps** T-6.1. **Doc** `TRAFFIC_ARCHITECTURE.md` §3.
- **Files** `src/traffic/idm.ts`, `src/traffic/laneOccupancy.ts`, `tests/unit/idm.test.ts`.
- **Acceptance** IDM as documented with per-type parameters and slight per-agent randomisation; per-lane sorted occupancy list giving O(1) leader lookup; tests assert convergence to target speed on a clear lane, ≥`minGap` maintained behind a stopped leader, no oscillation in a 10-vehicle queue over 60 s, and a full stop at a `vLead = 0` stop line.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M

### T-6.3 · Signals and signal groups — `todo`
- **Deps** T-6.1, T-3.3. **Doc** `TRAFFIC_ARCHITECTURE.md` §4.
- **Files** `src/traffic/signals.ts`, `src/data/city/signals.ts`, `src/city/signalMeshes.ts`.
- **Acceptance** Fixed phase plans cycling deterministically; non-green approaches treated as a stationary leader at the stop line (no special-case code); light meshes reflect state with emissive swaps; pedestrian crossing links read the same group state; tests assert phase cycling and that no two conflicting groups are green simultaneously.
- **Validation** `npm run test` + manual at the main junction.
- **Risk / Complexity** Medium / M

### T-6.4 · Unsignalled junction reservations — `todo`
- **Deps** T-6.2. **Doc** `TRAFFIC_ARCHITECTURE.md` §4.
- **Files** `src/traffic/reservations.ts`, `tests/unit/reservations.test.ts`.
- **Acceptance** Conflict areas per intersection; first-come reservations with the documented priority tie-break; released on clearing; a >6 s starvation guard; tests assert no two agents hold conflicting areas simultaneously and that a 4-way arrival never deadlocks over 200 simulated seconds.
- **Validation** `npm run test`
- **Risk / Complexity** **High** / M — deadlock is the failure mode; the test is the deliverable.

### T-6.5 · Routing — `todo`
- **Deps** T-6.1, T-3.3. **Doc** `TRAFFIC_ARCHITECTURE.md` §5.
- **Files** `src/traffic/routing.ts`, `tests/unit/routing.test.ts`.
- **Acceptance** Destination 200–600 m away; Dijkstra over segment lengths with a small LRU cache; turns chosen from `turnsFrom`; re-route on invalidation, despawn after two failures; tests assert a connected route between arbitrary node pairs and cache correctness.
- **Validation** `npm run test`
- **Risk / Complexity** Low / S

### T-6.6 · Player-as-obstacle integration — `todo`
- **Deps** T-6.2, T-5.4. **Doc** `TRAFFIC_ARCHITECTURE.md` §6.
- **Files** `src/traffic/playerObstacle.ts`.
- **Acceptance** The player vehicle is projected to the nearest lane (cached) and becomes a leader with its real speed; off-lane it is ignored except a 6 m emergency-brake check; a hit agent enters `Recovering` for ~2 s then re-snaps to its lane; agents visibly queue behind the stopped player.
- **Validation** manual: stop in a lane and watch traffic queue.
- **Risk / Complexity** Medium / M

### T-6.7 · Spawning, tiers and instanced rendering — `todo`
- **Deps** T-6.1 … T-6.6. **Doc** `TRAFFIC_ARCHITECTURE.md` §7, §9.
- **Files** `src/traffic/spawning.ts`, `src/traffic/TrafficVisuals.ts`.
- **Acceptance** Off-screen-preferred spawning at 140–200 m with a clear-gap requirement, rate-limited to 3/s; despawn at 200 m (120 m off-screen); near/far tiers at 20/5 Hz; one `InstancedMesh` per type/colour group (≤4 draw calls); brake lights and indicators via instanced attributes on the near tier; headlight emissives plus ≤4 road light-cone quads at night.
- **Validation** debug counters + manual observation.
- **Risk / Complexity** Medium / M

### T-6.8 · Honking and traffic atmosphere — `todo`
- **Deps** T-6.7, (audio system lands in Phase 9 — register the events now).
- **Files** `src/traffic/honk.ts`, `src/core/events.ts`.
- **Acceptance** Honk events emitted on hard braking, a >2 s blocked stop line, and low-frequency randomness near the market; globally rate-limited from data; no audio dependency (events only until Phase 9).
- **Validation** debug log of honk events at a plausible rate.
- **Risk / Complexity** Low / S

**→ MILESTONE M7** — tag `m7-traffic`. Acceptance: `MVP_ACCEPTANCE.md` E4–E7.

---

## PHASE 7 — NPCs (M8)

### T-7.1 · Pedestrian pool and archetype data — `todo`
- **Deps** M7. **Doc** `NPC_ARCHITECTURE.md` §1, §10.
- **Files** `src/data/npcs.ts`, `src/npcs/NpcSystem.ts`, `src/npcs/Pedestrian.ts`.
- **Acceptance** 48 pooled instances constructed during load (no runtime GLB parsing); `NpcArchetype` as documented; caps enforced (≤40 visible, ≤12 Tier A); zone/time density with the global cap winning.
- **Validation** debug counters.
- **Risk / Complexity** Medium / M

### T-7.2 · Sidewalk navigation — `todo`
- **Deps** T-7.1, T-3.3. **Doc** `NPC_ARCHITECTURE.md` §3.
- **Files** `src/npcs/navigation.ts`, `tests/unit/npc-nav.test.ts`.
- **Acceptance** Agents hold `{pathRef, t, direction, speed, goal}`; path selection at endpoints with continue-straight bias and zone weighting; lateral offsets separate opposing streams; authored loop paths for the market plaza and palace lawn; **no navmesh, no A\* grid**; tests assert agents never leave their polyline and that path transitions are continuous.
- **Validation** `npm run test` + overlay.
- **Risk / Complexity** Medium / M

### T-7.3 · Crossings and signal integration — `todo`
- **Deps** T-7.2, T-6.3. **Doc** `NPC_ARCHITECTURE.md` §3, `MVP_ACCEPTANCE.md` E1–E2.
- **Files** `src/npcs/crossing.ts`.
- **Acceptance** Pedestrians wait at crossings until the shared signal state permits, then traverse in a fixed duration; they never step into moving traffic; traffic and pedestrians never contradict each other (a 5-minute observation at the main junction shows no conflicts).
- **Validation** manual observation with the overlay.
- **Risk / Complexity** Medium / M

### T-7.4 · State machine, idles and reactions — `todo`
- **Deps** T-7.2. **Doc** `NPC_ARCHITECTURE.md` §4.
- **Files** `src/npcs/states.ts`.
- **Acceptance** Walking/Waiting/Idling/Talking/Reacting exactly as documented, each a few lines; idles trigger at shop fronts, stalls and benches for 3–12 s; startle reaction on a nearby vehicle or horn resolves in ~1.2 s; no behaviour trees.
- **Validation** manual.
- **Risk / Complexity** Low / M

### T-7.5 · LOD tiers and local avoidance — `todo`
- **Deps** T-7.1, T-7.4. **Doc** `NPC_ARCHITECTURE.md` §2, §5.
- **Files** `src/npcs/lod.ts`, `src/npcs/avoidance.ts`.
- **Acceptance** Four tiers at the documented radii/rates with ±5 m hysteresis (no flicker); Tier A avoidance queries ≤4 neighbours from the physics grid, nudges laterally and yields to vehicles within 2.5 m; **NPCs never sweep against static geometry**; total NPC cost ≤1.0 ms/frame at 40 agents.
- **Validation** debug timing table.
- **Risk / Complexity** Medium / M

### T-7.6 · Character variants, animation and draw-call budget — `todo`
- **Deps** T-7.1. **Doc** `NPC_ARCHITECTURE.md` §7–8, `ASSET_PLAN.md` §5.
- **Files** `public/models/char_ped.glb`, `src/npcs/NpcVisual.ts`.
- **Acceptance** 1–2 base meshes with 8–12 clothing variants from one atlas; ≤4 shared materials; ≤6 draw calls for all pedestrians; scale and animation-phase variation; mixers updated at tier rates (Tier C not at all); hidden beyond 100 m; licence registered.
- **Validation** draw-call counter + manual.
- **Risk / Complexity** **High** / L — if skinning cost dominates, stop and record the escalation rather than inventing an instancing scheme mid-task.

### T-7.7 · Spawning and despawning — `todo`
- **Deps** T-7.5. **Doc** `NPC_ARCHITECTURE.md` §6.
- **Files** `src/npcs/spawning.ts`.
- **Acceptance** Spawn ring 45–110 m, off-screen preferred, deferred if no off-screen point exists; despawn at 140 m (100 m off-screen); target recomputed at 2 Hz, spawns rate-limited to 2/s; mission NPCs pinned and outside the budget; no on-screen popping in a 3-minute walk.
- **Validation** manual observation.
- **Risk / Complexity** Medium / M

**→ MILESTONE M8** — tag `m8-npcs`. Acceptance: `MVP_ACCEPTANCE.md` E1–E3, E6–E7.

---

## PHASE 8 — Interaction, missions, progression (M9)

### T-8.0 · UI host and localization core (pulled forward from Phase 10) — `todo`
- **Purpose** Phase 8 writes `src/ui/Tracker.ts` and `src/ui/Dialogue.ts` and uses `StringId` throughout, but the UI host and `t()` were originally scheduled in Phase 10. Building them here — once — prevents a throwaway panel in Phase 8 and a rewrite in Phase 10, which is exactly the duplicated-implementation failure `CLAUDE_WORKFLOW.md` §9 names.
- **Deps** M8. **Doc** `UI_ARCHITECTURE.md` §1–2, `LOCALIZATION_PLAN.md` §2–3.
- **Files** `src/ui/UiRoot.ts`, `src/ui/panel.ts`, `src/ui/i18n.ts`, `src/data/strings/en.ts`, `tests/static/strings.mjs`, `tests/unit/i18n.test.ts`.
- **Acceptance** The `#ui` overlay structure and the `mount/update/dispose` panel contract exist; `t(id, params)` with interpolation, `Intl` formatting and `en` as the id-defining source; `data-i18n` re-resolution; the string-id static check is wired into `npm run check`. **This is the host only — no HUD content panels.** T-10.4 and T-10.5 then *extend* this; neither creates a second host or a second `t()`.
- **Validation** `npm run check`
- **Risk / Complexity** Low / M

### T-8.1 · Interaction registry and resolver — `todo`
- **Deps** M8, T-2.1. **Doc** `INTERACTION_ARCHITECTURE.md` §1–3, ADR-009.
- **Files** `src/interaction/InteractionSystem.ts`, `src/interaction/registry.ts`, `tests/unit/interaction.test.ts`.
- **Acceptance** `Interactable` contract and disposer-returning `register` exactly as documented; 10 Hz resolution over the physics broadphase with zero allocation; scoring by priority then distance; facing cone honoured; self-gating via `prompt() === null`; `interaction:available` emitted only on change; while driving the candidate set is filtered to vehicles + reachable locations; dev-mode assert that every registered id has a live owner; tests cover selection, gating, and disposal removing the prompt.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M

### T-8.2 · Interactable registrations across systems — `todo`
- **Deps** T-8.1. **Doc** `INTERACTION_ARCHITECTURE.md` §3, §5.
- **Files** `src/vehicles/*`, `src/npcs/*`, `src/city/*`, `src/world/*` (registration only).
- **Acceptance** Vehicles (enter/exit), role NPCs, static props/doors, landmark discovery zones and mission anchors all register through the one registry and dispose on unload/despawn/objective end; `activate` implementations only emit events or call the owning system's public request method; no phantom prompts after a 3-minute walk (verified with the debug interactable list).
- **Validation** manual + debug list.
- **Risk / Complexity** Medium / M

### T-8.3 · Items and inventory — `todo`
- **Deps** T-8.1. **Doc** `INTERACTION_ARCHITECTURE.md` §6.
- **Files** `src/data/items.ts`, `src/core/state.ts` (inventory).
- **Acceptance** `Record<ItemId, number>` in `GameState` with `missions` as the sole writer; item data with `StringId` name, icon key and optional carried-mesh key; no bag UI.
- **Validation** `npm run typecheck`
- **Risk / Complexity** Low / S

### T-8.4 · Mission runtime and objective primitives — `todo`
- **Deps** T-8.1, T-8.3. **Doc** `MISSION_ARCHITECTURE.md` §1–2.
- **Files** `src/missions/MissionSystem.ts`, `src/missions/objectives/*.ts`, `src/data/missions.ts`, `tests/unit/objectives.test.ts`.
- **Acceptance** All six primitives (`goto`, `interact`, `talk`, `carry`, `deliver`, `wait`, `collect`) implementing the `Objective` contract; checks at 10 Hz using only distance/flag/inventory tests; ordered advance with events; `dispose` always called including on abandon; **missions never touch the scene graph**; per-primitive unit tests asserting completion only on the true condition.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / L

### T-8.5 · Economy and progression — `todo`
- **Deps** T-8.4. **Doc** `MISSION_ARCHITECTURE.md` §6–7.
- **Files** `src/missions/economy.ts`, `src/data/balance.ts`, `tests/unit/economy.test.ts`.
- **Acceptance** `addMoney(delta, reason)` as the single writer, emitting `economy:money-changed` and appending to a debug ledger; money never negative; driver level **derived** from `totalEarned` (never stored); unlock flags checked by `MissionDef.requires`; tests cover level boundaries and reward idempotence (a completed mission cannot pay twice).
- **Validation** `npm run test`
- **Risk / Complexity** Low / S

### T-8.6 · Dialogue system — `todo`
- **Deps** T-8.4, T-8.0. **Doc** `MISSION_ARCHITECTURE.md` §8, `UI_ARCHITECTURE.md` §3.
- **Files** `src/data/dialogue.ts`, `src/ui/Dialogue.ts`.
- **Acceptance** Linear advance-on-key dialogue with speaker names and subtitles always on; movement blocked while open; `choices` present in the type but unused; all text via `StringId`.
- **Validation** manual.
- **Risk / Complexity** Low / M

### T-8.7 · `M_TIFFIN_RUN` content and anchors — `todo`
- **Deps** T-8.4 … T-8.6, T-4.5. **Doc** `MISSION_ARCHITECTURE.md` §4.
- **Files** `src/data/missions.ts`, `src/data/anchors.ts`, `src/data/strings/en.ts`.
- **Acceptance** The mission exactly as specified; giver at the market, customer at the Palace gate; both NPCs pinned; completable on foot and by vehicle; ₹120 paid once.
- **Validation** manual playthrough end to end.
- **Risk / Complexity** Low / S

### T-8.8 · Mission markers and tracker wiring — `todo`
- **Deps** T-8.4, T-8.0. **Doc** `MISSION_ARCHITECTURE.md` §2, `UI_ARCHITECTURE.md` §6.
- **Files** `src/missions/markers.ts`, `src/ui/Tracker.ts`.
- **Acceptance** Objectives publish `MarkerDesc`s consumed by the HUD tracker and (in Phase 10) the minimap; the tracker shows title, current objective label and distance; updates are event-driven plus 10 Hz for distance; markers are removed on objective completion and on abandon.
- **Validation** manual.
- **Risk / Complexity** Low / S

### T-8.9 · Mission robustness — `todo`
- **Deps** T-8.4 … T-8.8. **Doc** `MISSION_ARCHITECTURE.md` §5.
- **Files** `src/missions/MissionSystem.ts`, `tests/unit/mission-robustness.test.ts`.
- **Acceptance** Abandon disposes every live objective, clears markers and unpins NPCs; a mission whose anchor no longer exists self-invalidates with a logged warning and returns to available (never a crash, never a stuck save); no interactable or marker leaks after 20 start/abandon cycles.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M

**→ MILESTONE M9** — tag `m9-mission`. Acceptance: `MVP_ACCEPTANCE.md` F1–F7.

---

## PHASE 9 — Day/night, audio, weather scaffolding

### T-9.1 · Time of day driver — `todo`
- **Deps** M9, T-3.10. **Doc** `WORLD_DESIGN.md` §8.
- **Files** `src/world/TimeOfDay.ts`, `src/data/timeOfDay.ts`.
- **Acceptance** One normalised clock (default 24 game hours per 24 real minutes, configurable, pausable, persisted); keyframed sun colour/intensity, ambient, sky and fog values published at 4 Hz with the sun transform lerped every frame; `time:phase-changed` emitted for dawn/day/dusk/night; no astronomical math.
- **Validation** manual time-scrub via a debug control.
- **Risk / Complexity** Medium / M

### T-9.2 · Night lighting — `todo`
- **Deps** T-9.1, T-4.3. **Doc** `WORLD_DESIGN.md` §8, `PERFORMANCE.md` §2.
- **Files** `src/rendering/NightLights.ts`, `src/city/streetlights.ts`.
- **Acceptance** Emissive material swaps for streetlights, shop fronts and windows at dusk; ≤8 pooled point lights following the player; shadows disabled below the horizon; night is readable, not black; Palace floodlights with 2 dedicated lights; frame time within budget at night (measured).
- **Validation** manual + frame-time graph at night.
- **Risk / Complexity** Medium / M

### T-9.3 · Audio graph and buses — `todo`
- **Deps** M9. **Doc** `AUDIO_PLAN.md` §1–2.
- **Files** `src/audio/AudioSystem.ts`, `src/audio/buses.ts`, `src/audio/voicePool.ts`.
- **Acceptance** The documented bus graph; 24-voice pool allocated at boot with oldest/quietest stealing; per-sound-id rate limiting; suspended context resumed on the first gesture with a "click to enable sound" notice and a silent-mode fallback; suspend/resume on visibility; `setTargetAtTime` for all gain changes.
- **Validation** manual, including a blocked-autoplay run.
- **Risk / Complexity** Medium / M

### T-9.4 · Ambience system — `todo`
- **Deps** T-9.3, T-9.1. **Doc** `AUDIO_PLAN.md` §4.
- **Files** `src/audio/ambience.ts`, `src/data/audio.ts`.
- **Acceptance** Two-slot crossfade over 2–4 s, target chosen at 2 Hz from (zone, phase) with border hysteresis; a traffic-murmur layer following nearby agent count; scheduled one-shots (temple bell near the hour, crows at dawn, vendor calls in the market by day); no audible seams.
- **Validation** manual walk across zone borders and a time scrub.
- **Risk / Complexity** Medium / M

### T-9.5 · Gameplay sounds — `todo`
- **Deps** T-9.3, T-5.3, T-6.8. **Doc** `AUDIO_PLAN.md` §3, `VEHICLE_ARCHITECTURE.md` §7.
- **Files** `src/audio/sfx.ts`, `src/audio/vehicleAudio.ts`, `public/audio/*`.
- **Acceptance** Footsteps triggered by animation cycle phase (not a timer) with surface variants; engine/idle crossfade and tyre loop mapped to speed; horn and impact buckets; AI honks positioned and rate-limited; a vehicle bus is **disconnected** beyond 60 m or at far tier; ≤8 positional loops; every file licence-registered.
- **Validation** manual + voice-count readout.
- **Risk / Complexity** Medium / M

### T-9.6 · Tiered audio loading — `todo`
- **Deps** T-9.3. **Doc** `AUDIO_PLAN.md` §5.
- **Files** `src/audio/loading.ts`, `src/data/assets.ts`.
- **Acceptance** Tier 0 (~500 KB) during the loading screen, Tier 1 at idle after first frames, Tier 2 on demand; `.ogg` primary with `.m4a` fallback chosen by `canPlayType`; mono for positional sounds; failed loads degrade silently-with-a-log, never retry-loop; tier 0+1 total ≤2.5 MB.
- **Validation** `npm run check` + network panel.
- **Risk / Complexity** Low / M

### T-9.7 · UI sounds and mission stings — `todo`
- **Deps** T-9.3, T-8.4.
- **Files** `src/audio/uiAudio.ts`.
- **Acceptance** Click/back/toast/accept/complete/level-up/save sounds on the UI bus; the mission-complete sting ducks ambience by 4 dB; nothing plays while paused except UI.
- **Risk / Complexity** Low / S

### T-9.8 · Weather scaffolding (clear/cloudy only) — `todo` · **OPTIONAL — cut first**
- **Scope note** Weather is explicitly *not* required by `MVP_ACCEPTANCE.md`. This task exists only because it is nearly free (a blend factor over values that already exist). **Skip it without hesitation** if Phase 9 runs long, or if it would delay Phase 10; do not let it grow.
- **Deps** T-9.1. **Doc** `WORLD_DESIGN.md` §9.
- **Files** `src/world/Weather.ts`, `src/data/weather.ts`.
- **Acceptance** A blend-factor state set modulating existing fog/sun/ambient values only — **no new rendering systems, no particles**; `clear` and `cloudy` implemented, `rain` defined in data but disabled; switching states is smooth and costs zero extra draw calls.
- **Validation** manual state switch via debug.
- **Risk / Complexity** Low / S

---

## PHASE 10 — Save/load, UI, localization (M10)

### T-10.1 · Save store and schema — `todo`
- **Deps** Phase 9. **Doc** `SAVE_SYSTEM.md` §1–3.
- **Files** `src/save/store.ts`, `src/save/schema.ts`, `src/save/SaveSystem.ts`.
- **Acceptance** The 4-method `SaveStore` as the only place touching storage; `SaveFileV1` exactly as documented; settings under a separate key; nothing saved that is derivable; a probe write at boot detects unavailable storage and enables ephemeral mode with a persistent notice.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M

### T-10.2 · Validation, migration and quarantine — `todo`
- **Deps** T-10.1. **Doc** `SAVE_SYSTEM.md` §5–7.
- **Files** `src/save/validate.ts`, `src/save/migrate.ts`, `tests/unit/save.test.ts`, `tests/fixtures/save-v*.json`.
- **Acceptance** Every field type/range/id validated with the input typed `unknown`; unknown ids dropped with a warning; bad saves quarantined (max 2 kept) with a user notice, never deleted silently and never crashing; newer-version saves refused with a clear message; `worldSeed`/`worldDataVersion` mismatch handled per §5; a committed fixture per historical version migrates to current; hostile-input tests (truncated JSON, wrong types, huge numbers, NaN, prototype-pollution keys) all pass.
- **Validation** `npm run test`
- **Risk / Complexity** Medium / M

### T-10.3 · Load, placement safety and autosave — `todo`
- **Deps** T-10.2. **Doc** `SAVE_SYSTEM.md` §4–5.
- **Files** `src/save/SaveSystem.ts`, `src/world/spawn.ts`.
- **Acceptance** Autosave every 60 s when dirty, on mission completion/level-up/money change, and on `beforeunload`/visibility-hidden, throttled to ≤1 per 5 s with a `save:written` toast; loaded positions validated and relocated to the nearest free sidewalk point if obstructed; the 3×3 prewarm happens around the loaded position; reload restores position, money, mission progress, time, settings and vehicle transform.
- **Validation** `npm run test:e2e` (reload restore case) + manual.
- **Risk / Complexity** Medium / M

### T-10.4 · Localization: second locale and coverage — `todo`
- **Purpose** Extend the T-8.0 core with the Kannada locale and the fallback/coverage machinery. **Does not re-create `i18n.ts` or `en.ts`.**
- **Deps** Phase 9, T-8.0. **Doc** `LOCALIZATION_PLAN.md` §2–3, §6.
- **Files** `src/data/strings/kn.ts`, `src/ui/i18n.ts` (extend), `tests/static/strings.mjs` (extend).
- **Acceptance** `kn` typed `Partial<Record<StringId, string>>`; locale switching at runtime with `data-i18n` re-resolution and no remount; missing `kn` falls back to `en` and logs once in dev; `Intl` formatting for `kn-IN`; the static check reports `kn` coverage as a percentage.
- **Validation** `npm run check`
- **Risk / Complexity** Medium / M

### T-10.5 · HUD panels — `todo`
- **Purpose** The remaining HUD content panels, mounted into the T-8.0 host.
- **Deps** T-8.0, T-10.4, T-8.8. **Doc** `UI_ARCHITECTURE.md` §1–2, §6.
- **Files** `src/ui/Hud.ts`, `src/ui/Money.ts`, `src/ui/Speed.ts`, `src/ui/Prompt.ts`, `src/ui/Clock.ts`, `src/ui/Toasts.ts`, `src/ui/Notice.ts`, `src/ui/hud.css`.
- **Acceptance** Panels are `mount/update/dispose` modules subscribing to events; static markup built once; updates write text/transform/custom-properties only at 10 Hz plus event-driven; CSS transitions for animation; no layout reads in the loop; toast queue with max 3 visible; notices dismissible; `clamp()`/`rem` layout scaling from 1280×720 to 4K.
- **Validation** manual at three window sizes + frame-time check.
- **Risk / Complexity** Medium / M

### T-10.6 · Minimap — `todo`
- **Deps** T-10.5, T-3.3. **Doc** `UI_ARCHITECTURE.md` §5, ADR-010.
- **Files** `src/ui/Minimap.ts`, `tests/unit/minimap.test.ts`.
- **Acceptance** Static road layer baked once at boot from `polylinesForMinimap()` at ~2 px/m into an offscreen canvas; per-frame work is one `drawImage` sub-rect plus ≤8 icons at 15 Hz; rotating and north-up modes, 3 zoom levels; markers for player, player vehicle, active objective and discovered landmarks; **no second scene render**; traffic and pedestrians not drawn.
- **Validation** frame-time delta with the minimap on/off; manual.
- **Risk / Complexity** Medium / M

### T-10.7 · Pause menu, settings and UI state machine — `todo`
- **Deps** T-10.5, T-10.1. **Doc** `UI_ARCHITECTURE.md` §3, §7.
- **Files** `src/ui/Pause.ts`, `src/ui/Settings.ts`, `src/ui/UiState.ts`.
- **Acceptance** One `UiState` machine owning transitions and the single `inputBlocked` flag; pause offers Resume/Save/Settings/Abandon mission/Controls/Credits; every documented setting applies immediately via events and persists; Escape backs out exactly one level; the scene keeps rendering behind the pause menu; menus are tab-navigable with visible focus.
- **Validation** manual.
- **Risk / Complexity** Medium / M

### T-10.8 · Accessibility pass — `todo`
- **Deps** T-10.5, T-10.7. **Doc** `UI_ARCHITECTURE.md` §8.
- **Files** `src/ui/*.css`, `src/ui/*.ts`.
- **Acceptance** AA contrast on all text against opaque panel backdrops; ≥14 px effective text at 1080p; subtitles default on; icon+text prompts (never colour alone); `prefers-reduced-motion` honoured; camera-shake toggle wired; no strobing; full keyboard navigation verified.
- **Validation** manual contrast check + keyboard-only playthrough.
- **Risk / Complexity** Low / M

### T-10.9 · Kannada content pass and layout verification — `todo`
- **Deps** T-10.4, T-10.8, Q-4 resolved. **Doc** `LOCALIZATION_PLAN.md` §4, §6.
- **Files** `src/data/strings/kn.ts`, `public/fonts/notosans-kannada-subset.woff2`, `src/ui/*.css`.
- **Acceptance** Noto Sans Kannada (OFL) subset self-hosted and loaded only for the Kannada locale, licence registered; 100 % UI and MVP-mission coverage; machine drafts marked `// TODO: review` and reviewed per Q-4; every panel verified with Kannada strings — no clipping, no truncation without an ellipsis + `title`, adequate line-height for conjuncts.
- **Validation** `npm run check` (coverage) + manual pass in both locales.
- **Risk / Complexity** Medium / M

### T-10.10 · Controls screen and first-run guidance — `todo`
- **Deps** T-10.7.
- **Files** `src/ui/Controls.ts`, `src/data/strings/en.ts`.
- **Acceptance** A controls reference reachable from pause and shown once on first run; covers WASD/Shift/Space/E/Esc/wheel and driving; dismissible and re-openable; localized.
- **Validation** manual.
- **Risk / Complexity** Low / S

**→ MILESTONE M10** — tag `m10-saveload`. Acceptance: `MVP_ACCEPTANCE.md` G1–G8, H1–H5.

---

## PHASE 11 — Performance optimization

> Every task here requires a **measured before/after** in the commit body. No speculative work. Follow the escalation ladder in `PERFORMANCE.md` §8 and stop as soon as the budget is met.

### T-11.1 · Benchmark route and perf harness — `todo`
- **Deps** M10. **Doc** `PERFORMANCE.md` §7, `TESTING_STRATEGY.md` §6.
- **Files** `src/debug/bench.ts`, `tests/e2e/perf.spec.ts`, `tests/perf-baseline.json`.
- **Acceptance** `?bench=1` drives a fixed path through all four zones (walking and driving) and prints a JSON summary (p95/max frame time, draw calls, triangles, scene objects, heap start/end, asset bytes); the Playwright perf test compares against the committed baseline with the documented hard/soft failure split; the first baseline is committed with the machine and browser recorded.
- **Validation** `npm run test:e2e`
- **Risk / Complexity** Medium / M

### T-11.2 · Draw-call and batching pass — `todo`
- **Deps** T-11.1.
- **Acceptance** Draw calls ≤400 typical / ≤500 peak on the benchmark route, achieved by merging and instancing improvements only (no content cuts); before/after numbers recorded.
- **Risk / Complexity** Medium / M

### T-11.3 · GPU/triangle and shadow pass — `todo`
- **Deps** T-11.1.
- **Acceptance** Triangles ≤1.2 M typical; LOD distances tuned; shadow map cost measured and within the render slice; before/after recorded.
- **Risk / Complexity** Medium / M

### T-11.4 · Simulation cost pass — `todo`
- **Deps** T-11.1.
- **Acceptance** Traffic ≤1.0 ms, NPCs ≤1.0 ms, player+vehicle ≤1.5 ms per frame from the timing table; achieved by tier rates and radii, not by cutting caps below the MVP figures; before/after recorded.
- **Risk / Complexity** Medium / M

### T-11.5 · Streaming hitch elimination — `todo`
- **Deps** T-11.1.
- **Acceptance** **Zero frames over 33 ms** across the whole benchmark route, including every chunk crossing; build-step granularity tuned; material/program warming during load verified (no first-use compile hitch); before/after frame-time traces recorded.
- **Risk / Complexity** **High** / M
- **Note** If main-thread merging remains the bottleneck, stop and record the worker escalation as its own task rather than improvising it here.

### T-11.6 · Memory and leak pass — `todo`
- **Deps** T-11.1.
- **Acceptance** Texture memory ≤256 MB; heap ≤400 MB after 10 minutes with no monotonic growth; chunk unload disposal verified (geometry/material/texture counts return to baseline after a round trip across the district); pool leak checks pass.
- **Risk / Complexity** Medium / M

### T-11.7 · Quality presets and adaptive resolution — `todo`
- **Deps** T-11.2 … T-11.6. **Doc** `PERFORMANCE.md` §6, `WEB_ARCHITECTURE.md` §7.
- **Acceptance** The four presets exactly as tabulated; `Auto` picks from the boot benchmark plus `hardwareConcurrency`; adaptive render scaling with hysteresis between 0.7 and 1.0; the Low preset holds ≥30 FPS on the low-tier machine without stutter; player overrides always win and persist.
- **Risk / Complexity** Medium / M

### T-11.8 · Bundle and download budget — `todo`
- **Deps** T-11.1.
- **Acceptance** JS ≤900 KB gzipped with `three` in its own chunk; first-playable total ≤15 MB; KTX2 with WebP fallback in place; a CI size check fails on regression; the `debug` module and e2e hooks are verifiably absent from the production bundle.
- **Validation** `npm run check`
- **Risk / Complexity** Low / S

---

## PHASE 12 — Release

### T-12.1 · Full MVP acceptance pass — `todo`
- **Deps** Phase 11.
- **Acceptance** Every criterion in `MVP_ACCEPTANCE.md` A–L run and recorded, with results (pass / fail / note) written into the release notes; any failure becomes a task before release, not a known issue.
- **Risk / Complexity** Low / M

### T-12.2 · Browser matrix pass — `todo`
- **Deps** T-12.1. **Doc** `BROWSER_COMPATIBILITY.md` §7.
- **Acceptance** Manual pass on Chrome, Edge, Firefox and (best-effort) Safari at 1080p; results and any Safari issues recorded in the README's known-issues section.
- **Risk / Complexity** Low / S

### T-12.3 · README, controls and credits — `todo`
- **Deps** T-12.1.
- **Files** `README.md`, `public/ASSET_CREDITS.md`.
- **Acceptance** README covers what the game is, the live URL, controls, browser requirements, the no-data-collected statement, licence, credits and how to build; the in-game Credits panel matches the register.
- **Risk / Complexity** Low / S

### T-12.4 · Deploy verification from a cold cache — `todo`
- **Deps** T-12.1, T-12.3. **Doc** `DEPLOYMENT.md` §5.
- **Acceptance** The deployed URL loads within 8 s from a cold cache on a 20 Mbps connection with no 404s, no console errors and no external requests; the mission is completable end to end on the live build.
- **Risk / Complexity** Low / S

### T-12.5 · Tag `v0.1.0` and write release notes — `todo`
- **Deps** T-12.1 … T-12.4. **Doc** `GITHUB_WORKFLOW.md` §4.
- **Acceptance** Tag pushed; notes list features, the acceptance results, the browser matrix, known issues, credits and the perf baseline.
- **Risk / Complexity** Low / S

### T-12.6 · Post-MVP backlog triage — `todo`
- **Deps** T-12.5.
- **Files** `docs/ROADMAP.md`, `docs/DECISIONS.md`.
- **Acceptance** The post-MVP backlog is re-ordered against what was learned; open questions Q-1…Q-5 are all resolved or explicitly deferred; risks re-scored.
- **Risk / Complexity** Low / S

---

## Task hygiene rules

1. A task that grows past its complexity estimate is **split**, not pushed through. Add `T-x.ya`, `T-x.yb`.
2. A task blocked on a decision is marked `blocked` with the question written into `DECISIONS.md` §Open questions — never guessed.
3. Discovered work becomes a **new task**, appended in phase order. It is not smuggled into the current commit.
4. Every completed task updates its status line in the same commit (`GITHUB_WORKFLOW.md` §8).
5. Tasks marked `done` are never re-opened; follow-up work gets a new id.
