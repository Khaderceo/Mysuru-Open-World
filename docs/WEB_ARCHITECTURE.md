# WEB_ARCHITECTURE — runtime, loop and browser lifecycle

Complements `ARCHITECTURE.md` (structure) with *when things run*.

---

## 1. Page structure

```html
<body>
  <canvas id="game"></canvas>      <!-- WebGL2, sized to CSS pixels × dpr -->
  <div id="ui"></div>              <!-- DOM overlay: HUD, prompts, menus, minimap -->
  <div id="boot"></div>            <!-- loading screen; removed after first frame -->
  <noscript>…</noscript>
</body>
```

The canvas is the only 3D surface. All interface is DOM above it (`UI_ARCHITECTURE.md`). The loading screen is plain HTML/CSS present in `index.html` itself, so it paints before any JavaScript parses.

## 2. Boot sequence

```
1. HTML paints loading screen                     (~0 ms, no JS needed)
2. main.ts: capability check (WebGL2, localStorage, AudioContext)
     └─ fail → fatal panel, stop
3. Construct renderer + scene                     → "Starting renderer"
4. Construct Game, register systems
5. await Game.initSystems()  (ordered, progress-reported)
     ├─ assets: load core manifest (player, vehicle, shared atlases)
     ├─ world:  build road graph + first chunk ring
     └─ ui/audio: mount DOM, create suspended AudioContext
6. First render (synchronously, before hiding the loading screen)
7. Hide loading screen, start rAF loop
8. Resume AudioContext on the first user gesture
```

Nothing blocks the main thread for more than ~16 ms at a time after step 5; chunk building is budgeted (§5). Total target: interactive in **≤ 8 s** on a 20 Mbps connection, cold cache (`PERFORMANCE.md`).

## 3. The loop

Single `requestAnimationFrame` driver in `core/Loop.ts`. Hybrid fixed/variable:

```
frame(now):
  rawDt   = (now - last) / 1000
  dt      = min(rawDt, MAX_FRAME_DT)        // 0.1 s clamp: tab-switch / stall guard
  accum  += dt

  input.snapshot()                          // once per frame, before any consumer

  steps = 0
  while accum >= FIXED_DT and steps < MAX_STEPS:   // FIXED_DT = 1/60, MAX_STEPS = 5
      fixedUpdate(FIXED_DT)                 // player movement + collision, vehicle dynamics
      accum -= FIXED_DT
      steps++
  if steps == MAX_STEPS: accum = 0          // drop debt rather than spiral

  alpha = accum / FIXED_DT
  scheduler.run(dt)                         // rate-limited systems (§4)
  lateUpdate(dt, alpha)                     // camera, interpolation, animation, UI
  renderer.render(scene, camera)
  debug?.sample(dt)
```

**Why hybrid:** collision and vehicle handling need a stable step to feel consistent and to avoid tunnelling; camera smoothing, animation and UI want the true frame delta so they stay smooth at any refresh rate. Rendering is once per rAF — never a second render pass for the minimap (`UI_ARCHITECTURE.md` §Minimap).

**High-refresh displays (120/144 Hz):** the loop is refresh-rate agnostic. `fixedUpdate` runs 60 Hz worth of steps regardless; visuals interpolate with `alpha`. No frame-rate-dependent constants anywhere — enforced by `CODING_RULES.md` (no `+= 0.1` per frame).

## 4. Scheduler: not everything runs every frame

`core/Scheduler.ts` holds systems with a target Hz and a phase offset so their work is spread across frames rather than spiking on the same one.

| System | Rate | Rationale |
|---|---|---|
| Input snapshot | every frame | latency |
| Player + collision | 60 Hz fixed | feel, determinism |
| Player vehicle dynamics | 60 Hz fixed | feel |
| Camera | every frame (`lateUpdate`) | smoothness |
| Interaction proximity query | 10 Hz | prompt latency is imperceptible below ~100 ms |
| Traffic agents | 20 Hz near ring, 5 Hz far ring | plausible motion, cheap |
| NPC agents | 10 Hz near, 2 Hz mid, 0 Hz dormant | see `NPC_ARCHITECTURE.md` |
| World streaming evaluation | 4 Hz | chunk is 128 m; player moves ≤14 m/s |
| Chunk build work | budgeted, every frame | ≤4 ms/frame, see §5 |
| Time-of-day / lighting | 4 Hz (values), every frame (sun transform lerp) | shadows must not jitter |
| Missions | 10 Hz | objective checks are distance/flag tests |
| UI HUD | 10 Hz, plus event-driven | DOM writes are expensive |
| Minimap | 15 Hz | Canvas2D redraw cost |
| Audio ambience mixing | 2 Hz | crossfades are slow by nature |
| Save autosave | every 60 s + on key events | see `SAVE_SYSTEM.md` |
| Debug overlay | 4 Hz | dev only |

Rate-limited systems receive the *accumulated* dt since their last run, never `FIXED_DT`, so their integration stays correct.

## 5. Frame budget and time-slicing

Target frame: **16.6 ms**. Working allocation on the reference machine:

| Slice | Budget |
|---|---|
| Render (draw submission + GPU sync) | 7.0 ms |
| Player + vehicle fixed steps | 1.5 ms |
| Traffic + NPC | 2.0 ms |
| Streaming / chunk build (amortized) | 4.0 ms max, 0 ms typical |
| UI + minimap + audio + misc | 1.5 ms |
| Headroom | 0.6 ms |

**Chunk building is the only unbounded work in the game, so it is explicitly sliced.** Each chunk build is a generator-style job broken into steps (allocate → place buildings → place props → merge geometry → build instanced batches → register colliders → attach to scene). `world/ChunkBuildQueue` runs steps until the per-frame budget is spent, then yields. A chunk becomes visible only when fully built, so no partially populated blocks pop in.

Texture/GLB decoding happens off the main thread where the browser allows it (`ImageBitmap`, Draco/Meshopt workers from the `three` package). We do not write our own workers in the MVP; if profiling shows main-thread geometry merging is the bottleneck, a worker for chunk geometry is the documented next step (`PERFORMANCE.md` §Escalation).

## 6. Browser lifecycle handling

| Event | Behaviour |
|---|---|
| `visibilitychange` → hidden | pause the loop (rAF already throttles), suspend `AudioContext`, record wall-clock; on return, discard elapsed time (no fast-forward), resume audio |
| Window blur | release pointer lock, open pause menu if in gameplay |
| `resize` / `ResizeObserver` | debounce 100 ms, then resize renderer + update camera aspect; never resize per event |
| `devicePixelRatio` change (monitor swap / zoom) | re-clamp render scale (§7) |
| Fullscreen toggle | F11-equivalent button in settings; layout is resolution-independent |
| `webglcontextlost` | `preventDefault`, pause loop, show "graphics context lost — reload" panel; attempt restore on `webglcontextrestored` by re-initialising `rendering` and re-uploading via the asset cache |
| `beforeunload` | synchronous best-effort save write (`localStorage` is sync, which is one reason it was chosen) |
| Pointer lock lost | fall back to drag-to-look; do not silently stop camera input |

## 7. Resolution and DPI policy

Render target = `cssSize × min(devicePixelRatio, dprCap)`, with `dprCap` default **1.5** and adjustable in settings (1.0 / 1.25 / 1.5 / 2.0).

Adaptive resolution (post-MVP, spec'd now): if the rolling 60-frame average exceeds 18 ms, step the internal scale down in 0.1 increments to a floor of 0.7; if it stays below 13 ms for 3 s, step back up. Hysteresis prevents oscillation. This is a *render-scale* change only; UI is DOM and stays crisp.

## 8. Determinism

Full lockstep determinism is not a requirement (no multiplayer, no replays). But *reproducibility of world content* is:

- All procedural placement uses a **seeded PRNG** (`utils/rng.ts`, small xorshift/mulberry32), seeded per chunk as `hash(worldSeed, cx, cz)`. The same seed always yields the same city.
- Simulation (traffic, NPC) is intentionally non-deterministic across sessions and is never persisted beyond coarse counts.
- Fixed-step player physics keeps movement consistent across frame rates, which is the practical benefit we actually need.

## 9. Memory discipline in a long session

The tab may stay open for hours. Therefore:

- **No per-frame allocation** in loop paths. Vectors/quaternions/matrices are preallocated scratch objects in module scope (used and released within one function, never stored). Enforced by review and by an allocation smoke test.
- **Pools** for traffic vehicles, pedestrians, particles, audio one-shot voices, and chunk geometry buffers (`utils/pool.ts`).
- **Explicit disposal** on chunk unload: geometries, materials not in the shared cache, and textures owned solely by that chunk.
- **Shared material/texture cache** keyed by asset key with reference counting; the cache is the only owner.
- Heap ceiling in the budget table (`PERFORMANCE.md`); the e2e perf test asserts no monotonic growth over a scripted 3-minute drive.

## 10. Static-hosting constraints that shape the runtime

Since there is no server: no runtime config endpoint (config is a bundled module plus URL query overrides for debug), no server-side asset negotiation (one asset variant set, with feature-detected KTX2 as an optional extra), all paths are relative to Vite's `base` so the game works from a project subpath, and 404s are handled in-app (a missing asset is a degraded error, never a broken page). See `DEPLOYMENT.md`.
