# PERFORMANCE — budgets and optimization order

Measurement first. Nothing in this document authorises speculative optimization.

---

## 1. Reference machines

| Tier | Spec | Target |
|---|---|---|
| **Reference (primary target)** | Desktop, 4-core CPU from ~2019+, integrated Iris Xe / GTX 1050-class GPU, Chrome, 1920×1080, dpr 1 | **stable 60 FPS** |
| **Low** | Older laptop iGPU (UHD 620-class), 1366×768 | ≥30 FPS at Low preset, no stutter |
| **High** | Modern dGPU, 1440p/4K | 60 FPS with dpr cap 1.5–2 and headroom |

"Stable 60" means: 95th-percentile frame time ≤16.6 ms and **no frame above 33 ms** during a scripted 3-minute drive through all four zones. Average FPS alone is not an acceptance criterion — hitching is what players feel.

## 2. Budgets

| Metric | Budget (reference machine, 1080p) | Where enforced |
|---|---|---|
| Frame time | ≤ 16.6 ms (p95); 0 frames > 33 ms | e2e perf test |
| Draw calls (**including the shadow pass**) | **≤ 400** typical, ≤ 500 peak | debug overlay + perf test |
| Triangles rendered | **≤ 1.2 M** typical, ≤ 1.8 M peak | debug overlay |
| Programs (shaders) | ≤ 25 | debug overlay |
| Texture memory | **≤ 256 MB** | manifest sum + debug estimate |
| JS heap | **≤ 400 MB** after 10 min, no monotonic growth | perf test with `performance.memory` where available |
| Initial download (first playable) | ≤ 15 MB | build size check in CI |
| JS bundle (gzip) | ≤ 900 KB | build size check in CI |
| Time to interactive (20 Mbps, cold) | ≤ 8 s | e2e timing test |
| Time to first paint (loading screen) | ≤ 0.5 s | it is static HTML |
| Chunk build cost | ≤ 4 ms per frame, ≤ 60 ms total per chunk | debug timing |
| Active chunks | 25 detailed + 24 silhouette ring | streaming config |
| Visible objects (scene children traversed) | ≤ 1,500 | debug overlay |
| Pedestrians | ≤ 40 visible, ≤ 12 full-sim | `NPC_ARCHITECTURE.md` |
| Traffic | ≤ 24 active, ≤ 10 near-tier | `TRAFFIC_ARCHITECTURE.md` |
| Dynamic lights | 1 directional + 1 hemisphere + ≤ 8 point | rendering config |
| Shadow maps | 1 × 2048² | rendering config |
| Audio voices | ≤ 24 concurrent, ≤ 8 positional loops | `AUDIO_PLAN.md` |
| Per-frame allocations in loop paths | **0** | review + allocation test |

## 3. Frame budget split

See `WEB_ARCHITECTURE.md` §5 for the per-slice allocation (render 7 ms, sim 3.5 ms, streaming ≤4 ms, UI/audio 1.5 ms, headroom 0.6 ms).

## 4. The techniques we rely on, in order of impact

1. **Geometry merging per chunk.** All static content in a chunk collapses to a few draw calls per material. This is the single largest win and is built in from Phase 3, not retrofitted.
2. **Instancing** for props, vegetation, vehicles. `InstancedMesh` per type; instance counts updated, never rebuilt.
3. **Material and texture reuse via atlases.** ≤6 resident textures, ≤25 shader programs. Every unique material is a state change and a potential extra program compile (which causes a visible hitch on first use, so materials are warmed during load).
4. **Frustum culling** — Three.js does this per object; it works *because* we have few, large objects rather than thousands of small ones.
5. **Distance culling and fog.** Fog fully occludes at ~250 m so the far plane never renders detail nobody can see. Silhouette ring beyond that is block geometry only.
6. **LOD** on landmarks, trees and vehicles (`ASSET_PLAN.md` §5).
7. **Tiered simulation.** NPCs and traffic simulate at rates and fidelities that fall off with distance.
8. **Scheduler** so no system runs more often than it needs to.
9. **Pooling and zero-allocation loops** to keep GC out of the frame.
10. **Shadow map fitted and texel-snapped** to a 120 m box around the player rather than the whole world. `renderer.info.render.calls` counts the shadow pass, so every caster is drawn twice: **only buildings, walls and landmarks cast shadows.** Ground, roads, props, vegetation, pedestrians and traffic have `castShadow = false` (they still receive). This roughly halves the shadow pass and is the reason the ≤400 budget closes — see the arithmetic in `WORLD_DESIGN.md` §3.

## 5. Rendering configuration

```
WebGLRenderer: antialias true (MSAA is cheap at our triangle counts and cheaper than FXAA post),
  powerPreference 'high-performance', stencil false, depth true,
  outputColorSpace SRGB, toneMapping ACESFilmic, toneMappingExposure ~1.0
shadowMap: type PCFSoft, single 2048² directional, autoUpdate true but disabled at night
pixelRatio: min(devicePixelRatio, dprCap)  — default cap 1.5
Post-processing: NONE in the MVP.
```

**Why no post-processing:** an `EffectComposer` chain costs a full-screen pass per effect plus a render target (and breaks MSAA). Bloom on the night Palace floodlights is the only effect with real value; it is a post-MVP item and would be added as a *single* cheap pass, measured against the frame budget, or faked with emissive sprite glows (which is the preferred solution and costs nothing).

**WebGPU:** not used. Feature-detected only as a future option; never required (`BROWSER_COMPATIBILITY.md`).

## 6. Quality presets

| Setting | Low | Medium | High |
|---|---|---|---|
| dpr cap | 1.0 | 1.25 | 1.5 |
| Shadows | off | 1024², 80 m | 2048², 120 m |
| Fog/draw distance | 140 m | 200 m | 250 m |
| Detailed chunk radius | 1 | 2 | 2 |
| Pedestrians / traffic | 16 / 10 | 28 / 18 | 40 / 24 |
| Trees & prop density | 0.5× | 0.8× | 1.0× |
| Point lights at night | 0 | 4 | 8 |
| Anisotropy | 1 | 4 | 8 |

`Auto` picks a starting preset from a 3-second boot benchmark (frame times while the first chunks build) plus `hardwareConcurrency`, then applies adaptive render scaling (`WEB_ARCHITECTURE.md` §7). The player can always override.

## 7. Measurement tooling

Built in from Phase 1 — you cannot hit a budget you cannot see (`debug` module, dev builds only):
- FPS, frame-time graph, p95/max over a rolling window.
- `renderer.info`: draw calls, triangles, programs, geometries, textures.
- Estimated texture memory; heap size where `performance.memory` exists.
- Counts: active chunks, pending chunk builds, NPCs by tier, traffic by tier, interactables, audio voices.
- Per-system update timings (rolling averages) — the scheduler records them automatically.
- Toggles: wireframe, collider visualisation, chunk boundaries, lane/sidewalk graph overlay, freeze streaming, force a quality preset.
- A **scripted benchmark route** (`?bench=1`) that drives a fixed path through all four zones and prints a JSON summary — the same route the CI perf test uses, so local and CI numbers are comparable.

## 8. Escalation ladder

Only climb a rung when profiling shows the current rung is the bottleneck.

**If draw calls are the bottleneck:** merge more aggressively per chunk → merge across adjacent chunks for the silhouette ring → per-street impostor rows → occlusion culling (sector/portal along streets).

**If triangles/GPU-bound:** tighten LOD distances → reduce tree LOD0 → cut shadow map size → lower dpr cap → adaptive resolution.

**If CPU-bound in simulation:** lower tier rates → shrink near-tier radii → move chunk geometry merging into a Web Worker (transferable buffers) → typed-array agent storage.

**If main-thread hitching on load:** smaller chunk build steps → move Draco/Meshopt decoding fully to workers → split kit GLBs → warm materials/programs during the loading screen.

**If memory-bound:** KTX2 everywhere → smaller atlases → release tier-2 audio → shrink the pool sizes.

Each escalation is a task with a measurement before and after. "It feels faster" is not evidence.

## 9. Anti-patterns explicitly banned

Allocating vectors/matrices in loops · creating materials or geometries per object · `scene.traverse` per frame · reading layout properties (`offsetWidth`) inside the loop · per-frame DOM writes · a second render pass for the minimap · `new Audio()` per sound · `JSON.parse`/`stringify` per frame · unbounded arrays that grow with playtime · `console.log` in loop paths (dev-only, rate-limited) · frame-rate-dependent constants · resizing the renderer per resize event.

## 10. Regression gate

The CI perf test (`TESTING_STRATEGY.md`) runs the benchmark route headlessly and fails the build if p95 frame time, draw calls, triangle count or bundle size regress beyond a tolerance against the committed baseline in `tests/perf-baseline.json`. Headless GPU numbers are noisier than real hardware, so the gate uses generous absolute thresholds and treats *draw calls, triangles, heap growth and bundle size* — which are deterministic — as the hard failures, with frame time as a warning signal.
