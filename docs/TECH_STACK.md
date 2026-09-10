# TECH_STACK — Mysuru Open World

Decisions recorded formally in `DECISIONS.md` (ADR-001 … ADR-005). This document is the practical reference.

---

## 1. The stack

| Layer | Choice | Notes |
|---|---|---|
| Renderer | **Three.js** (latest stable `r1xx`, pinned exactly) | WebGL2 via `WebGLRenderer` |
| Language | **TypeScript**, `strict: true` | No `any` without a written reason |
| Build / dev server | **Vite** | ES modules, fast HMR, static `dist/` output |
| UI | **Plain HTML + CSS + DOM** | DOM overlay above the canvas |
| 3D assets | **glTF 2.0 / `.glb`** | Draco or Meshopt compression via decoders shipped inside the `three` package |
| Audio | **Web Audio API** (`AudioContext`) directly | No audio library |
| Persistence | **`localStorage`**, versioned JSON | IndexedDB deferred; see `SAVE_SYSTEM.md` |
| Physics / collision | **Custom lightweight collision** | No physics engine; see `PLAYER_ARCHITECTURE.md` §Collision |
| Hosting | **GitHub Pages** via GitHub Actions | Cloudflare Pages as documented fallback |

**Runtime dependency count: 1** — `three`.

Everything else in the game (loop, input, camera, collision, streaming, AI, missions, UI, minimap, audio graph, save) is project code over browser APIs.

## 2. Why Three.js

- **Right abstraction level.** It is a rendering library, not an engine. We need scene graph, camera, materials, loaders, instancing and shadow plumbing — and we need to own the game loop, streaming and simulation ourselves. Three.js gives exactly the former without dictating the latter.
- **Instancing and merging are first-class.** `InstancedMesh`, `BufferGeometryUtils.mergeGeometries`, `LOD` and frustum culling are built in. These are the primitives our entire performance plan rests on (`PERFORMANCE.md`).
- **glTF is the native path.** `GLTFLoader` plus the Draco/Meshopt/KTX2 decoders ship in the same package, so the asset pipeline needs no extra runtime dependency.
- **Tree-shakes acceptably.** Importing from `three` with Vite's ESM build keeps only what is reached; a scene of our complexity lands in the low hundreds of KB gzipped.
- **Enormous, current documentation and example corpus**, which directly lowers the token cost of implementation — the largest project-specific risk (`RISKS.md` R-12).
- **MIT licence**, no attribution obligation in-game, no cost, no account, no telemetry.
- **Mature WebGL2 backend** with a WebGPU backend available as opt-in only. We stay on the well-trodden path and can experiment later without rewriting the game.

## 3. Why the alternatives were rejected

| Rejected | Reason |
|---|---|
| **Unity** | Not a web-only tool. Requires editor + local install, produces heavy WebGL builds (large WASM payload, long load, poor mobile/低-end behaviour), incompatible with the Claude-Code-Web-only workflow, and explicitly excluded by `PROJECT_SPEC.md` §3. Any prior Unity plan is void. |
| **Unreal Engine** | No viable browser target; enormous payloads; editor-bound. |
| **Godot** | Web export exists but is a large WASM runtime, editor-centric, and its scene/script model would live outside the Git-diff-friendly TypeScript workflow this project depends on. |
| **Babylon.js** | Genuinely capable and closer to a full engine. Rejected because we do *not* want engine-level opinions (its scene/inspector/physics/GUI stack) for a project whose whole thesis is a minimal, fully-owned runtime; the bundle is heavier and the community/example corpus for our exact needs is smaller than Three.js's. |
| **PlayCanvas** | Editor-hosted workflow conflicts with GitHub-as-source-of-truth; self-hosted engine use loses the main advantage. |
| **React / React Three Fiber** | Adds React + reconciler to every frame's mental model and bundle for a game whose scene graph is imperative, streamed, and pooled. Declarative reconciliation actively fights object pooling and per-frame mutation. HUD needs are simple enough for DOM. Explicitly excluded. |
| **An ECS framework** | Our entity counts are small (tens of NPCs, tens of vehicles). Plain typed classes with pooled arrays are simpler, faster to write, cheaper in tokens, and easier to debug. Revisit only if entity counts exceed ~2,000 active. |
| **Rapier / Cannon-es / Ammo.js** | See `DECISIONS.md` ADR-004 and `PLAYER_ARCHITECTURE.md`. Cost (bundle, complexity, tuning) exceeds MVP need. Documented adoption triggers exist. |
| **A state-management library** | Game state is one owned object tree plus a typed event bus. Redux-style stores add ceremony and per-frame overhead for nothing. |
| **Any backend / DB / multiplayer** | Excluded by cost model and non-goals. |

## 4. Dependency policy

**Runtime dependencies require an ADR in `DECISIONS.md`, approved before installation.** Every proposal must state:

1. **Purpose** — the exact requirement, and why it is a requirement.
2. **Size** — gzipped bundle delta, measured.
3. **Licence** — must be MIT / BSD / Apache-2.0 / CC0-equivalent. No copyleft, no unclear licence, no "source available".
4. **Maintenance** — release cadence, open-issue health, single-maintainer risk, breaking-change history.
5. **Performance impact** — per-frame cost, allocation behaviour, GC pressure.
6. **Can Three.js or a browser API do this already?** If yes, the proposal is rejected by default.
7. **Exit plan** — how it would be removed if it turns out to be wrong.

Dev dependencies (build/test only, never shipped) follow a lighter bar but are still listed in `DECISIONS.md`.

### Approved dev dependencies (MVP)

| Package | Role | Shipped? |
|---|---|---|
| `vite` | dev server + production build | no |
| `typescript` | type checking (`tsc --noEmit`) | no |
| `prettier` | formatting, to keep diffs (and token cost) small | no |
| `vitest` | unit tests for pure logic | no |
| `@playwright/test` | headless smoke/perf test of the built page | no |

**ESLint is deliberately deferred.** `tsc --strict` plus Prettier plus `CODING_RULES.md` cover the value at a fraction of the config, plugin and CI cost. Reconsider only if a class of real bug recurs that types cannot catch.

### Standing bans

`three-mesh-bvh` (until profiling proves collision needs it), `tween.js`/`gsap` (write the 20 lines), `lil-gui`/`dat.gui` (debug UI is plain DOM — see `debug` module), `stats.js` (our debug overlay reports FPS already), `howler` (Web Audio is enough), any physics engine, any framework.

## 5. Repository layout

```
/
├─ index.html                # Vite entry, canvas + UI root + loading screen
├─ package.json  tsconfig.json  vite.config.ts
├─ .github/workflows/        # ci.yml, deploy.yml
├─ public/                   # copied verbatim; referenced by absolute-from-base URLs
│  ├─ models/  textures/  audio/  fonts/
├─ src/
│  ├─ main.ts                # bootstrap only: ~40 lines, no game logic
│  ├─ core/                  # Game runtime, loop, scheduler, event bus, time, config, system contract
│  ├─ rendering/             # renderer, scene, lighting, sky, fog, materials, LOD helpers
│  ├─ input/                 # keyboard/mouse → InputState; pointer lock; bindings
│  ├─ camera/                # third-person rig, vehicle camera, collision probe
│  ├─ player/                # controller, movement state machine, collider
│  ├─ physics/               # collision world: shapes, broadphase grid, capsule sweep, ground queries
│  ├─ world/                 # chunk manager, streaming, terrain, day/night driver, spawn registry
│  ├─ city/                  # road graph, lanes, blocks, procedural building/prop placement, landmarks
│  ├─ vehicles/              # vehicle model, arcade dynamics, seats, enter/exit
│  ├─ traffic/               # lane agents, car-following, intersections, signals, pooling
│  ├─ npcs/                  # pedestrian agents, sidewalk graph navigation, LOD tiers
│  ├─ missions/              # mission runtime, objectives, economy, progression
│  ├─ interaction/           # interactable registry, proximity query, prompt resolution
│  ├─ ui/                    # HUD, prompts, tracker, minimap, pause, settings, dialogue, loading
│  ├─ audio/                 # AudioContext graph, buses, ambience, one-shots, lazy loading
│  ├─ save/                  # serialize, deserialize, versioning, migrations
│  ├─ data/                  # typed data modules: missions, vehicles, npcs, landmarks, balance, strings
│  ├─ assets/                # loader, cache, manifest, error/retry policy
│  ├─ debug/                 # dev-only overlay + gizmos, stripped in production
│  └─ utils/                 # math, seeded RNG, pools, easing, assert
├─ tests/
│  ├─ unit/                  # vitest
│  └─ e2e/                   # playwright
└─ docs/                     # this planning set — project memory
```

Rules: no folder is created before it has a file that belongs in it; `main.ts` never grows game logic; nothing in `src/` imports from `debug/` except through the guarded hook in `core/`.

## 6. Build and run

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve `dist/` locally |
| `npm run test` | vitest unit tests |
| `npm run test:e2e` | Playwright smoke + perf against the preview server |
| `npm run check` | typecheck + build + unit + e2e — the gate before any commit |

Vite config essentials: `base` set for GitHub Pages project-path hosting, `build.target: 'es2020'`, manual chunking so `three` is its own long-cached chunk, `define` flag `__DEV__` so `debug/` is dead-code-eliminated in production.

## 7. Browser API surface we rely on

WebGL2 · `requestAnimationFrame` · Pointer Lock · `AudioContext` · `fetch` · `localStorage` · `ResizeObserver` · `devicePixelRatio` · Fullscreen API · Page Visibility · `performance.now` · Canvas2D (minimap) · `structuredClone` (save copy) · `AbortController` (load cancellation).

Optional, feature-detected, never required: WebGPU, `KHR_texture_basisu`/KTX2, `EXT_texture_compression_bptc`, Gamepad API, `navigator.deviceMemory`/`hardwareConcurrency` (quality auto-tier hints only).
