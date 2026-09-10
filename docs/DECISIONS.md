# DECISIONS — architecture decision record

Every entry: decision · recommendation · alternatives · reason · performance · complexity · cost · future consequences.

Status values: **Proposed** (awaiting approval) · **Accepted** · **Superseded by ADR-nnn** · **Rejected**.

All ADRs below are **Proposed** pending explicit architecture approval (`PROJECT_SPEC.md` §5). Once approved, they become binding and may only be changed by a new ADR.

---

## ADR-001 · Renderer and engine: Three.js on WebGL2

- **Decision** Build on Three.js (latest stable, exact pinned version) using its WebGL2 renderer.
- **Recommendation** Accept.
- **Alternatives** Babylon.js · PlayCanvas · raw WebGL2 · Unity/Unreal/Godot web export · Three.js WebGPU backend.
- **Reason** Right abstraction level: gives scene graph, materials, glTF loading, instancing, LOD and shadow plumbing while leaving the loop, streaming and simulation to us — exactly the split this project needs. MIT, free, no account, enormous current documentation corpus (which directly reduces token cost, our scarcest resource). Engines are excluded by `PROJECT_SPEC.md` §3 and are wrong for browser-only delivery. Babylon.js is capable but engine-opinionated and heavier. Raw WebGL2 would cost thousands of lines before a single building appears.
- **Performance** WebGL2 with merging + instancing comfortably meets 400 draw calls / 1.2 M triangles at 60 FPS on the reference machine. No engine overhead beyond the scene graph.
- **Complexity** Low-to-medium: we own more, but only what we need.
- **Cost** Zero.
- **Consequences** We must write streaming, collision, AI and UI ourselves (all planned). WebGPU stays an optional future experiment confined to `rendering/`.

## ADR-002 · No ECS; plain typed classes with pooled arrays

- **Decision** No entity-component-system framework. Systems own plain classes; hot fields live in preallocated pooled arrays.
- **Recommendation** Accept.
- **Alternatives** bitECS / miniplex / a hand-rolled ECS.
- **Reason** Peak active entities ≈ 40 pedestrians + 24 vehicles + a few hundred interactables — two orders of magnitude below where ECS iteration wins pay for their indirection and tooling. Plain classes are faster to write, far cheaper in tokens, and much easier to debug.
- **Performance** Equivalent at our counts; pooling gives the cache locality that matters.
- **Complexity** Materially lower.
- **Cost** Zero.
- **Consequences** Revisit only if profiling shows agent updates dominating at >1,000 active agents.

## ADR-003 · UI in plain DOM/CSS; no framework

- **Decision** All interface is HTML/CSS/DOM in `src/ui/`, above the canvas. No React/Vue/Svelte, no React Three Fiber.
- **Recommendation** Accept.
- **Alternatives** React (+R3F) · Svelte · a canvas-drawn UI · Three.js-rendered UI.
- **Reason** The interface is ~10 mostly-static panels updated a few times a second by text and transform writes. A reconciler on the main thread beside a 60 FPS loop buys nothing and costs bundle size, a second state model, and a fight with object pooling. Canvas/3D UI loses accessibility, text rendering quality and CSS layout for free.
- **Performance** Best case: zero per-frame UI cost; CSS transitions run off the main thread.
- **Complexity** Low; each panel is a `mount/update/dispose` module.
- **Cost** Zero KB.
- **Consequences** No component ecosystem; we write ~10 small panels by hand. Accessibility and localization come naturally from real DOM text.

## ADR-004 · Collision: custom lightweight, no physics engine

- **Decision** Custom capsule/OBB sweep collision over a uniform broadphase grid, with analytic ground height. No Rapier, Cannon-es or Ammo.
- **Recommendation** Accept, with documented adoption triggers.
- **Alternatives** Rapier (~1.0–1.3 MB WASM) · Cannon-es (~120 KB) · Ammo.js · three-mesh-bvh.
- **Reason** Requirements are: player capsule vs. static world, gravity/step-up/slopes, arcade vehicle vs. world and vs. vehicles, and push-aside pedestrians. None needs a constraint solver. What a solver adds — ragdolls, stacking, joints, destruction — is explicitly out of scope. Yaw-only OBBs make the math tractable (~500–700 lines total).
- **Performance** Integer grid lookup, zero allocation, no WASM init in the boot path, no second transform authority to synchronise.
- **Complexity** Medium and ours: the risk is *feel* bugs (`RISKS.md` R-7), mitigated by six explicit guards plus tests plus collider visualisation.
- **Cost** Zero bytes, some engineering time.
- **Consequences** All gameplay code calls `physics`' query API and never does collision math, so adopting Rapier later is a contained swap. Triggers: ragdolls, physical stacking props, real suspension simulation, or dynamic-object interactions we cannot fake.

## ADR-005 · Vehicles: arcade kinematic bicycle model

- **Decision** Tuned kinematic model (throttle/brake/steer curves, speed-dependent steering, lateral slip term) with an OBB sweep against the world and a visual-only body spring. Same model for player and AI.
- **Recommendation** Accept.
- **Alternatives** Raycast-suspension vehicle · rigid-body vehicle in a physics engine.
- **Reason** ~200 lines, fully tunable, predictable, and the arcade feel is the design target. Roads are flat, so simulated suspension buys travel we can fake visually. One model for player and AI means the AI exercises the player's code path constantly.
- **Performance** Trivial; lets AI traffic run the same dynamics at 20 Hz.
- **Complexity** Low.
- **Cost** Zero.
- **Consequences** No rollovers, no wrecks, no damage model. If handling disappoints, the escalation is a grip/slip refinement inside `vehicles/`, then raycast suspension — not an engine.

## ADR-006 · World size 1 km², 128 m chunks, distance-ring streaming

- **Decision** MVP world 1.0 × 1.0 km on an 8×8 grid of 128 m chunks; detailed radius 2, silhouette ring +2, unload radius 5; budgeted sliced builds; deterministic per-chunk seeding. Maximum early target 4 km².
- **Recommendation** Accept.
- **Alternatives** Load everything at once · smaller/larger chunks · portal/visibility streaming · per-object distance loading · quadtree.
- **Reason** Draw calls and authoring effort — not area — are the binding constraints. 1 km² of curated, dense district satisfies the design pillars and fits every budget. 128 m ≈ one block plus frontage: small enough to build inside a few frames' budget, large enough to keep merging effective and the grid small. Hysteresis between load (2) and unload (5) prevents boundary thrash.
- **Performance** ~25 detailed chunks visible; 10–16 batches each lands inside 400 draw calls.
- **Complexity** One system, and it is the entire expansion path.
- **Cost** Zero.
- **Consequences** Growth beyond ~2.25 km² requires impostors, coarse occlusion and road-graph paging first. At 1 km² we retain the emergency option of loading everything at once.

## ADR-007 · Save to `localStorage`, versioned JSON

- **Decision** `localStorage` with a versioned, validated JSON save and a tested migration chain. Settings under a separate key.
- **Recommendation** Accept.
- **Alternatives** IndexedDB · File System Access API · export/import files · a backend.
- **Reason** The save is 2–8 KB — three orders of magnitude inside the ~5 MB limit — and being synchronous means the `beforeunload` write actually lands, which async IndexedDB cannot promise. ~80 lines versus 250+.
- **Performance** Irrelevant at kilobytes; throttled to ≤1 write / 5 s.
- **Complexity** Low.
- **Cost** Zero. No backend (excluded by the cost model).
- **Consequences** Isolated behind a 4-method `SaveStore`, so IndexedDB is a contained swap if binary blobs (screenshots, replays) are ever persisted. Saves are user-editable and therefore validated as untrusted input.

## ADR-008 · Hosting: GitHub Pages via Actions

- **Decision** Deploy the static build to GitHub Pages from `main` using the official Pages Actions. Cloudflare Pages documented as the fallback (env-var change only).
- **Recommendation** Accept.
- **Alternatives** Cloudflare Pages · Netlify · Vercel · itch.io · self-hosting.
- **Reason** The source of truth is already GitHub; Pages adds no account, no credential and no cost, and deploys with the same workflow that runs the gate. Everything else adds an integration for a CDN benefit that does not matter at 15 MB and hobby traffic.
- **Performance** Adequate global CDN; assets are cacheable and content-hashed where Vite controls them.
- **Complexity** One workflow file.
- **Cost** Free.
- **Consequences** Project-subpath hosting requires `base` discipline and a static check against root-absolute paths; no server-side anything, ever (which the architecture already assumes).

## ADR-009 · One interaction system for all interactable types

- **Decision** A single registry + 10 Hz proximity resolver serves NPCs, vehicles, pickups, doors, locations and mission objects. Each interactable supplies `prompt()` and `activate()`.
- **Recommendation** Accept.
- **Alternatives** Per-type interaction logic in each owning system.
- **Reason** Per-type logic duplicates the query, prompt lifecycle, input gating, localization and disposal four or five times, and each duplicate is a place for phantom prompts and leaked handles. One 30-line resolver over the existing physics broadphase is cheaper to build and to keep correct.
- **Performance** Negligible: an integer grid query at 10 Hz.
- **Complexity** Low, and it concentrates a subtle lifecycle in one place.
- **Cost** Zero.
- **Consequences** Every system that owns interactables must dispose its registrations; asserted in dev builds and visible in the debug overlay.

## ADR-010 · Minimap: Canvas2D over baked vector road data

- **Decision** Bake the district's road polylines once at boot into an offscreen canvas (~2 px/m); per-frame draw one sub-rect plus a handful of markers, at 15 Hz.
- **Recommendation** Accept.
- **Alternatives** Second Three.js top-down render pass · render-to-texture · pre-rendered map image · DOM/CSS lines.
- **Reason** The road network already exists in vector form; re-rendering the 3D scene to rediscover it would double draw calls in the worst case. A baked canvas makes per-frame cost microseconds and gives full stylistic control.
- **Performance** One `drawImage` + ~6 icons at 15 Hz.
- **Complexity** Low; reuses `RoadNetworkView.polylinesForMinimap()`.
- **Cost** ~4 MB of canvas memory for 1 km² at 2 px/m.
- **Consequences** The same baked layer serves a post-MVP fullscreen map. Traffic and pedestrians are intentionally not shown.

## ADR-011 · Content and configuration as typed TypeScript modules, not JSON

- **Decision** Missions, vehicles, NPC archetypes, anchors, zones, balance values and strings live in `as const` TypeScript modules under `src/data/`.
- **Recommendation** Accept.
- **Alternatives** JSON files (fetched or imported) · YAML · a small custom format.
- **Reason** TS gives compile-time checking of cross-references (`AnchorId`, `StringId`, `ItemId`, `AssetKey` are union types derived from the data itself), so broken content fails the build instead of the player's session. Vite inlines it, so there is no runtime fetch and no parse cost. JSON would need a schema validator and runtime error handling to reach the same safety.
- **Performance** Better: no fetch, no parse, dead-code-eliminated where unused.
- **Complexity** Lower than JSON + validation.
- **Cost** Zero.
- **Consequences** Content edits require a rebuild (acceptable — there is no external content pipeline and no non-technical editor). If a data-driven editor is ever wanted, exporting these modules to JSON is mechanical.

## ADR-012 · Hybrid fixed/variable game loop with a rate scheduler

- **Decision** One rAF loop: 60 Hz fixed steps (max 5) for player and vehicle simulation; variable-dt for camera, animation and UI with `alpha` interpolation; a scheduler running each other system at its own Hz with phase offsets.
- **Recommendation** Accept.
- **Alternatives** All-variable timestep · all-fixed with render interpolation · multiple independent loops/timers.
- **Reason** Collision and vehicle handling need step stability for consistent feel and no tunnelling; camera and UI want true frame delta for smoothness at 60/120/144 Hz. Rate-limiting the rest is what makes 24 vehicles + 40 pedestrians + streaming fit in the budget.
- **Performance** The core enabler of the frame budget in `PERFORMANCE.md` §3.
- **Complexity** Low: ~120 lines in `core/`.
- **Cost** Zero.
- **Consequences** Every system declares a rate and must integrate with accumulated dt. Frame-rate-dependent constants are banned (`CODING_RULES.md` §4).

## ADR-013 · Zero runtime dependencies beyond `three`; ADR required for any addition

- **Decision** `three` is the only runtime dependency. Dev dependencies limited to `vite`, `typescript`, `prettier`, `vitest`, `@playwright/test`. ESLint deferred.
- **Recommendation** Accept.
- **Alternatives** Adopt utility libraries freely; add ESLint + plugins now.
- **Reason** Every dependency is bundle weight, a maintenance surface, a licence question and a token cost. `tsc --strict` + Prettier + the static checks + `CODING_RULES.md` cover ESLint's real value here at a fraction of the configuration cost.
- **Performance** Smallest possible bundle.
- **Complexity** We write small utilities (RNG, pools, easing, assert) — tens of lines each.
- **Cost** Zero.
- **Consequences** Proposals must answer the seven questions in `TECH_STACK.md` §4. Standing bans listed there.

## ADR-014 · Visual direction: stylized realism, mid-poly, colour- and light-led

- **Decision** Correct proportions and materials with simplified forms; atmosphere from lighting, fog and colour grading; trim-sheet/atlas texturing; no post-processing in the MVP.
- **Recommendation** Accept.
- **Alternatives** Photorealism · flat low-poly · cel/toon.
- **Reason** Photorealism is unaffordable in assets, VRAM and licence risk, and would break the frame budget. Flat low-poly undercuts "believable scale" and makes the Palace read as a toy. Cel-shading fights the same pillar and needs custom shaders. Stylized realism keeps Mysuru recognizable while staying cheap.
- **Performance** Few materials, few textures, high reuse — the whole performance plan depends on it.
- **Complexity** Low; the constraint list in `GAME_DESIGN.md` §13 makes it mechanical.
- **Cost** Lowest of the options.
- **Consequences** Bloom on the night Palace is a post-MVP consideration and would first be faked with emissive sprites.

## ADR-015 · No live map service; original layout

- **Decision** The world is an original, hand-designed layout inspired by Mysuru. No mapping API at runtime or build time; no geometry derived from proprietary imagery or from ODbL data.
- **Recommendation** Accept.
- **Alternatives** Google Maps/Mapbox data · OSM-derived geometry · traced satellite imagery.
- **Reason** Paid APIs violate the cost model and would make the game depend on a network service. OSM's ODbL creates share-alike obligations on derived databases; tracing proprietary imagery is a copyright problem. An original layout is legally clean, artistically better for gameplay, and lets us make the district compact and legible.
- **Performance** No network dependency, no tile loading.
- **Complexity** Lower — authoring ~60 segments by hand is less work than importing and cleaning real data.
- **Cost** Zero.
- **Consequences** The world is not geographically accurate, by design (`PROJECT_SPEC.md` §3). Recognition comes from landmarks, signage, props and atmosphere.

---

## Decisions requiring explicit approval before implementation begins

All fifteen ADRs above, and in particular: **ADR-001** (Three.js), **ADR-004** (no physics engine), **ADR-005** (arcade vehicles), **ADR-006** (1 km² / 128 m chunks), **ADR-007** (`localStorage`), **ADR-008** (GitHub Pages), **ADR-011** (TS data modules), **ADR-013** (dependency policy), **ADR-014** (art direction).

## Open questions (not yet decisions)

| # | Question | Needed by |
|---|---|---|
| Q-1 | Source the character and modular kit as CC0 assets, or author originals? | Phase 3 start |
| Q-2 | Is the auto-rickshaw the right MVP vehicle (vs. a motorcycle for simpler handling)? Recommendation: auto-rickshaw — it *is* the Mysuru identity. | Phase 5 start |
| Q-3 | Day length default: 24 min per day, or longer for calmer sessions? | Phase 9 |
| Q-4 | Kannada translation: reviewed by a native speaker, or ship English-only UI with bilingual signage? | Phase 10 |
| Q-5 | Is a fullscreen map view in scope post-MVP, or is the minimap enough? | post-MVP |
