# ARCHITECTURE — Mysuru Open World

Module boundaries and how systems talk. Runtime/frame concerns are in `WEB_ARCHITECTURE.md`.

---

## 1. Shape

```
index.html
    │
    ▼
src/main.ts                 bootstrap: read config, mount canvas, construct Game, start
    │
    ▼
core/Game                   owns the loop, the scheduler, the context, system lifecycle
    │
    ├── GameContext          the only shared handle systems receive
    │     ├─ clock / time-of-day
    │     ├─ events (typed EventBus)
    │     ├─ config (frozen)
    │     ├─ state (GameState: money, progression, flags, mission state)
    │     ├─ scene / renderer handles (rendering)
    │     ├─ collision world (physics)
    │     └─ service lookup (get<T>(SystemId))
    │
    ▼
Systems  (constructed in dependency order, updated in scheduled order)
    Rendering · Input · Physics · World · City · Player · Camera ·
    Interaction · Vehicles · Traffic · NPCs · Missions · UI · Audio · Save · Debug
```

There is no `main.ts` with game logic in it, and no god-object "GameManager" that reaches into systems. `Game` knows *lifecycle and order*; it does not know gameplay.

## 2. The system contract

Every system implements one small interface. This is the entire framework.

```ts
interface System {
  readonly id: SystemId;
  /** Construct-time deps only; no scene access, no async. */
  init(ctx: GameContext): void | Promise<void>;
  /** Called at this system's scheduled rate. dt in seconds. */
  update?(dt: number, ctx: GameContext): void;
  /** Fixed-step simulation, if the system needs determinism. */
  fixedUpdate?(fixedDt: number, ctx: GameContext): void;
  /** Called once per rendered frame after all updates (interpolation, visuals). */
  lateUpdate?(dt: number, alpha: number, ctx: GameContext): void;
  /** Release GPU/DOM/audio resources. Must be idempotent. */
  dispose(): void;
}
```

Rules:
- A system may read `ctx`. It may **not** import another system's module directly for behaviour; cross-system needs go through `ctx.events`, `ctx.state`, or an explicitly published read-only interface fetched via `ctx.get(...)`.
- `init` may be async (asset loading); `Game` awaits systems in declared order and reports progress to the loading screen.
- `dispose` must fully unwind: geometry/material/texture `.dispose()`, event listeners removed, DOM nodes detached, audio nodes disconnected. Enforced by a leak check in tests (`TESTING_STRATEGY.md`).

## 3. Dependency direction

Strictly one-way. Left may depend on right; right must never depend on left.

```
utils  ←  core  ←  rendering / input / physics
                        ↑
                     world / city
                        ↑
            player / camera / vehicles
                        ↑
          traffic / npcs / interaction
                        ↑
                missions / ui / audio / save
                        ↑
                       debug
```

`data/` and `assets/` are leaves depended on by anyone. `debug/` may read everything and is depended on by nobody.

A circular dependency is a build failure, not a style issue: CI runs a cycle check (`TESTING_STRATEGY.md` §Static checks).

## 4. Communication: three channels, chosen deliberately

**1. `GameContext` — direct, synchronous reads of stable facts.**
Time, config, collision world, scene root. Cheap and per-frame safe.

**2. `EventBus` — typed, decoupled notifications.**
One map of event name → payload type, defined in `core/events.ts`. Emit is synchronous and allocation-free for common events (payload objects are reused where they are not retained).

```ts
type GameEvents = {
  'player:entered-vehicle':  { vehicleId: string };
  'player:exited-vehicle':   { vehicleId: string };
  'interaction:available':   { promptKey: string; targetId: string } | null;
  'mission:started':         { missionId: string };
  'mission:objective-done':  { missionId: string; index: number };
  'mission:completed':       { missionId: string; reward: number };
  'economy:money-changed':   { total: number; delta: number };
  'world:chunk-loaded':      { cx: number; cz: number };
  'time:phase-changed':      { phase: 'dawn'|'day'|'dusk'|'night' };
  'save:written':            { slot: number };
  'ui:pause-toggled':        { paused: boolean };
  // …extended per feature, never with `any`
};
```

Events are for *facts that already happened*. They are not commands and they are not a request/response mechanism.

**3. Published read-only interfaces — for queries that need a real answer.**
Example: `Interaction` needs the player's position, and `UI` needs mission progress. Each provider exports a narrow read interface and registers it; consumers fetch once in `init`.

```ts
interface PlayerView   { position: Readonly<Vector3>; isDriving: boolean; }
interface MissionView  { active: Readonly<ActiveMission> | null; }
interface RoadNetworkView { nearestLane(p: Vector3): LaneRef | null; /* … */ }
```

**Forbidden:** module-level mutable singletons, `window.game`, importing a system to call its methods, `document.querySelector` from gameplay code, and any global mutable state outside `GameState` (whose writers are enumerated below).

## 5. Game state ownership

`GameState` is a single plain object tree in `core/state.ts` holding **only persistable, gameplay-meaningful data**: money, driver level, total earnings, mission progress, discovered landmarks, world flags, settings, time-of-day, player transform, vehicle transforms.

Ownership rules:
- **UI never owns gameplay state.** It renders from `GameState` and views, and emits intent events.
- **Player never owns mission state.** Missions own mission state.
- **Missions never touch the scene graph.** They emit events; `World`/`UI` react.
- **Save reads `GameState` only.** If it isn't in `GameState`, it isn't saved — which is the point (`SAVE_SYSTEM.md`).
- Transient data (velocities, animation phase, pooled agents, GPU handles) lives in the owning system, never in `GameState`.

Writers are explicit: each field lists its single owning system in a comment. Anything else mutating it is a bug.

## 6. Module responsibilities

| Module | Owns | Must not |
|---|---|---|
| `core` | loop, scheduler, context, state, event bus, config, system registry | contain gameplay rules |
| `rendering` | renderer, scene root, lights, sky, fog, tone mapping, shared materials, resize | know about players/missions |
| `input` | raw device → `InputState` snapshot, pointer lock, bindings | apply movement |
| `physics` | static collision world, capsule sweeps, ground/ray queries, spatial grid | simulate agents |
| `world` | chunk grid, streaming, terrain, day/night driver, spawn registry | author city content |
| `city` | road graph, lanes, block layout, procedural placement, landmark assembly | drive simulation |
| `player` | movement state machine, collider, animation state | own the camera |
| `camera` | rig, look, follow, smoothing, collision probe, vehicle mode | read gameplay rules |
| `vehicles` | vehicle instances, arcade dynamics, seats, enter/exit flow | contain AI routing |
| `traffic` | AI vehicle agents on lanes, signals, spawn/despawn | own the player vehicle model |
| `npcs` | pedestrian agents, sidewalk navigation, LOD tiers | own dialogue content |
| `interaction` | interactable registry, best-target resolution, prompt event | render prompts |
| `missions` | mission runtime, objectives, economy, progression | mutate the scene |
| `ui` | all DOM, HUD, menus, minimap, dialogue, loading | hold gameplay truth |
| `audio` | AudioContext graph, buses, ambience, one-shots | know about geometry |
| `save` | serialize/deserialize, versioning, migration | contain game rules |
| `data` | typed content and balance modules | contain behaviour |
| `assets` | manifest, load, cache, retry, dispose | contain gameplay |
| `debug` | overlay, gizmos, cheats | exist in production builds |

## 7. Replaceability

Each system is behind a narrow contract so it can be swapped without touching callers. Explicit swap paths already anticipated:

- Custom collision → Rapier: everything goes through `physics`' query API (`sweepCapsule`, `groundAt`, `raycast`). No gameplay code contains collision math.
- Placeholder primitives → authored GLB: gameplay refers to **asset keys**, never file paths or mesh names (`ASSET_PLAN.md`).
- Canvas2D minimap → alternative renderer: minimap consumes `RoadNetworkView` + marker list, nothing else.
- `localStorage` → IndexedDB: `save` exposes `read`/`write`/`list`/`remove`; the backing store is one file.
- WebGL → WebGPU: only `rendering` constructs the renderer.

## 8. Error boundaries

Three tiers, defined in `core`:

- **Fatal** (no WebGL2, corrupt core asset, renderer creation failure): stop the loop, show a fullscreen error panel with a plain-language cause and a Reload action, log once with context.
- **Degraded** (optional asset missing, audio blocked until gesture, save unreadable): continue with a substitute (placeholder mesh, muted audio, fresh save), surface a dismissible notice, log a warning with the asset key.
- **Recoverable** (single chunk build failure, one texture 404): retry with backoff, then mark the item failed and continue.

Never swallow an error silently, and never `catch {}`. See `TESTING_STRATEGY.md` §Runtime error checks.

## 9. Why not ECS, and when to revisit

Our worst-case active entity count is ~40 pedestrians + ~24 vehicles + a few hundred interactables — two orders of magnitude below where ECS iteration wins pay for their indirection, tooling and token cost. Plain classes with pooled, contiguous arrays for the hot fields (positions, lane offsets) give us the same cache behaviour where it matters.

Revisit if *measured* profiles show agent update dominating frame time at >1,000 active agents, or if we need generic cross-cutting behaviour composition. Recorded as ADR-002.
