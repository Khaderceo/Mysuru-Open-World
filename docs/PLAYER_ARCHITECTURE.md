# PLAYER_ARCHITECTURE — controller, movement, collision

---

## 1. Collision & physics decision

**Chosen: custom lightweight collision.** No physics engine in the MVP. Recorded as ADR-004 in `DECISIONS.md`.

### What we actually need

| Requirement | Needs a rigid-body solver? |
|---|---|
| Player capsule vs. static world (walls, kerbs, props) | No — capsule sweep vs. boxes |
| Gravity, ground snapping, step-up, slopes, stairs | No — analytic ground query + step logic |
| Player vs. moving vehicles | No — treat vehicle as a moving OBB, push the capsule out |
| Arcade vehicle handling on flat roads | No — kinematic model with tuned curves feels *better* than a naive raycast-vehicle |
| Vehicle vs. static world | No — OBB sweep with slide + speed loss |
| Vehicle vs. vehicle | No — impulse-ish separation along the contact normal, no stacking |
| NPC/traffic avoidance | No — steering behaviours on lanes and paths |
| Ragdolls, stacking crates, cloth, joints, destruction | **Yes — and none of these are in scope** |

### Options compared

| Option | Bundle (gzip) | Complexity | Verdict |
|---|---|---|---|
| **Custom lightweight (chosen)** | 0 KB | Low, but ours to write (~500–700 lines) | Exactly matches requirements, zero dependency, fully tunable feel, no WASM load step, trivial to debug and visualise. |
| **Rapier (`@dimforge/rapier3d-compat`)** | ~1.0–1.3 MB WASM + JS glue | Medium-high: colliders per chunk, sync loops, character controller tuning, WASM init in the boot path | Excellent library, wrong fit now. Would add ~1.2 MB to a 15 MB budget, an async init dependency, and a whole second transform authority to keep in sync — for features we don't use. |
| **Cannon-es** | ~120 KB JS | Medium | Pure JS, small, but the solver cost for hundreds of static bodies plus its character-controller ergonomics are worse than a purpose-built sweep for our case; still adds a second source of truth. |
| **Ammo.js / Jolt / PhysX-wasm** | 0.5–2 MB+ | High | Far past the need. |

### Adoption triggers (when to revisit)

Adopt a real engine only if one of these becomes a *requirement*:
1. Ragdoll or jointed characters/vehicles.
2. Stacking, tumbling or destructible props that must behave physically.
3. Genuine vehicle suspension/rollover simulation as a design goal.
4. Player-vs-dynamic-object interactions our resolver measurably cannot fake.

If triggered, Rapier is the pick, and the swap is contained: all gameplay code calls `physics`' query API (`sweepCapsule`, `sweepBox`, `groundAt`, `raycast`, `overlapSphere`) and never does collision math itself (`ARCHITECTURE.md` §7).

## 2. Collision world (`src/physics/`)

```ts
type Collider =
  | { kind: 'box';  center: Vector3; halfExtents: Vector3; yaw: number }  // OBB (yaw-only)
  | { kind: 'ramp'; center: Vector3; halfExtents: Vector3; yaw: number; rise: number }
  | { kind: 'wall'; a: Vector2; b: Vector2; height: number; thickness: number };

interface CollisionWorld {
  add(c: Collider, ownerChunk?: ChunkId): ColliderId;
  remove(id: ColliderId): void;
  removeChunk(id: ChunkId): void;
  groundAt(x: number, z: number): number;                    // analytic terrain height
  sweepCapsule(cap: Capsule, delta: Vector3, out: SweepResult): void;
  sweepBox(box: OBB, delta: Vector3, out: SweepResult): void;
  raycast(origin: Vector3, dir: Vector3, maxDist: number, out: RayHit): boolean;
  overlapSphere(p: Vector3, r: number, out: ColliderId[]): number;
}
```

Implementation notes:
- **Broadphase:** uniform grid, 8 m cells, over the XZ plane. Static colliders are inserted once at chunk build and removed at chunk unload. Lookup is an integer index — no allocation, no tree rebuilds.
- **Yaw-only OBBs.** Buildings, walls, props and vehicles are all axis-aligned in pitch/roll, so tests reduce to 2D rotation + a Y interval. This is dramatically simpler and faster than general SAT and loses nothing we need.
- **Narrowphase:** capsule-vs-OBB via closest-point-on-box in the box's local frame; continuous behaviour achieved by sub-stepping the delta so no step exceeds 0.25 × capsule radius (tunnel-proof at our speeds).
- **Resolution:** up to 4 iterations of *move → detect deepest penetration → project out along normal → slide remaining delta along the surface*. Deterministic and stable against corners.
- **Ground:** analytic (`WORLD_DESIGN.md` §6) plus collider tops, so standing on a speed breaker or a kerb works without mesh raycasts.
- **Dynamic colliders:** vehicles register as movable OBBs updated each fixed step; they live in the same grid with a per-frame reinsertion (cheap at ≤30 vehicles).
- **No mesh colliders.** Ever. Merged chunk geometry is never a collision source — colliders come from the placement pass that generated it, which is both faster and more reliable.
- **Debug visualisation** of every collider and the broadphase cells is required from day one (`debug` module) — it is the single highest-value debugging tool in the project.

## 3. Player representation

| Property | Value |
|---|---|
| Collider | Capsule, radius **0.35 m**, total height **1.8 m** (eye ~1.65 m) |
| Walk speed | 1.8 m/s |
| Run speed | 4.5 m/s |
| Acceleration / deceleration | 12 / 16 m/s² (ground); 2 / 1 m/s² (air) |
| Turn response | velocity-space steering toward camera-relative input, ~0.12 s smoothing |
| Jump apex | 0.55 m (initial vy ≈ 3.3 m/s with g = 20 m/s²) |
| Gravity | **20 m/s²** (game-feel gravity, not 9.81) |
| Terminal fall speed | 25 m/s |
| Max walkable slope | 45° |
| Step-up height | 0.35 m (kerbs and single steps are automatic) |
| Coyote time | 0.10 s after leaving ground |
| Jump buffer | 0.12 s before landing |

These constants live in `data/balance.ts`, not scattered through code, and are the first thing tuned during Phase 2 acceptance.

## 4. Movement state machine

```
        ┌──────────────────────────────────────────┐
        ▼                                          │
   ┌────────┐  move  ┌──────┐  shift  ┌─────┐      │
   │  Idle  │───────▶│ Walk │────────▶│ Run │      │
   └────────┘◀───────└──────┘◀────────└─────┘      │
        │ jump / no ground   │ jump        │ jump  │
        ▼                    ▼             ▼       │
   ┌──────────┐  vy<0   ┌─────────┐  ground  ──────┘
   │ Jumping  │────────▶│ Falling │─────────▶ (land → Idle/Walk/Run)
   └──────────┘         └─────────┘

   any state ── enter vehicle ──▶ ┌──────────┐ ── exit ──▶ Idle
                                  │ Driving  │
                                  └──────────┘
```

`Driving` disables the player collider and movement integration entirely; the player transform is parented to the vehicle's seat and the camera switches mode (`VEHICLE_ARCHITECTURE.md` §Enter/exit).

Each state exposes `enter/update/exit` and an animation key. States are tiny and explicit — no boolean soup (`isGrounded && !isJumping && wasRunning`), which is the usual source of controller bugs.

## 5. Fixed-step integration

Player movement runs in `fixedUpdate` at 60 Hz:

```
1. read InputState snapshot (already taken this frame)
2. build desired horizontal velocity in camera-relative space, clamped to speed for state
3. accelerate current velocity toward desired
4. apply gravity if airborne
5. delta = velocity * FIXED_DT
6. physics.sweepCapsule(capsule, delta, result)  → slide-resolved position + contacts
7. ground test: analytic height + collider tops within tolerance → grounded, snap, step-up
8. update state machine from contacts/grounded/input
9. write transform to GameState (position) and to the visual root
```

`lateUpdate` interpolates the visual mesh between the previous and current fixed positions using `alpha`, so movement is smooth at any refresh rate while the simulation stays stable.

## 6. Input mapping

Input is a *snapshot*, never a callback into gameplay (`ARCHITECTURE.md`).

```ts
interface InputState {
  move: Vector2;                 // −1..1, from WASD (normalised on diagonals)
  look: Vector2;                 // mouse delta this frame, dpr-normalised
  run: boolean;                  // Shift held
  jump: Pressed;                 // { down, pressedThisFrame, releasedThisFrame }
  interact: Pressed;             // E
  pause: Pressed;                // Escape
  handbrake: Pressed;            // Space, while driving
  horn: Pressed;                 // H (post-MVP)
  zoom: number;                  // wheel delta
}
```

- Bindings live in `data/bindings.ts` as action → key-code lists, persisted in settings; rebinding UI is post-MVP but the data shape supports it from day one.
- Pointer lock is requested on canvas click; if it is denied or lost, look falls back to drag-to-look and the HUD says so.
- Escape releases pointer lock (browser behaviour) *and* opens the pause menu — both handled, no double-toggle.
- Keys are read from `event.code` (layout-independent), so WASD works on AZERTY hardware positions.
- Input is ignored while a modal UI has focus; the UI sets a single `inputBlocked` flag rather than each system checking menus.

## 7. Animation

MVP: a single skinned character GLB with **idle / walk / run / jump / fall / land / sit** clips, driven by `AnimationMixer` with crossfades of 0.15 s. Walk/run blend by speed; playback rate scaled to speed to kill foot sliding (no IK in the MVP).

If a suitable licence-compatible animated character is not available in time, Phase 2 ships a stylized non-skinned proxy (the "block driver") and the swap happens in Phase 3 — gameplay code references animation *keys*, never clip names or mesh internals, so the swap costs nothing.

## 8. Interaction hook

The player does not implement interaction. It publishes `PlayerView` (position, forward, isDriving) and the `interaction` system does proximity resolution and prompt emission (`INTERACTION_ARCHITECTURE.md`). Pressing E is routed as an *intent event*; the player controller does not know what it will hit.

## 9. Failure modes to guard explicitly

| Failure | Guard |
|---|---|
| Falling through the ground | analytic ground floor clamp: position.y is never below `groundAt(x,z) − 0.05` |
| Stuck in geometry after a chunk build | on collider insertion overlapping the player, push the capsule to the nearest free point |
| Stuck in a corner | 4-iteration resolver + a "no progress" detector that nudges along the bisector |
| Launched by a moving vehicle | vehicle-vs-player push is clamped in magnitude and applies no vertical impulse |
| Tunnelling at speed | delta sub-stepping bound to 0.25 × radius |
| Teleport/load into solid | spawn validation: find the nearest free capsule position on the sidewalk graph |

Each of these gets a unit or e2e test (`TESTING_STRATEGY.md`).
