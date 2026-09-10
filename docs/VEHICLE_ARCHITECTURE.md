# VEHICLE_ARCHITECTURE

One vehicle model serves the player and AI traffic. The difference between "the player's auto-rickshaw" and "a traffic auto-rickshaw" is only **who supplies the control input**.

---

## 1. Core idea

```
          ┌──────────────────────────┐
          │      VehicleInstance      │   transform, velocity, wheels, seats, visuals, collider
          └────────────┬─────────────┘
                       │ consumes
                  ┌────▼─────┐
                  │ Controls │   throttle −1..1, steer −1..1, brake 0..1, handbrake bool
                  └────┬─────┘
        ┌──────────────┴──────────────┐
   PlayerDriver                   TrafficDriver
   (reads InputState)             (lane following, car-following, signals)
```

This keeps one dynamics implementation, one collider path, one visual/audio path, and lets a traffic vehicle become drivable (post-MVP "steal an auto") with no new systems.

## 2. Dynamics: arcade kinematic, not rigid-body

**Decision (ADR-005):** a tuned kinematic bicycle model. No suspension simulation, no wheel colliders, no rigid-body solver.

```
// fixedUpdate, 60 Hz
engineForce  = throttleCurve(throttle, speed) * spec.power
drag         = spec.drag * speed²  +  spec.rollResist * speed
brakeForce   = brake * spec.brakePower * sign(speed)
speed       += (engineForce − drag − brakeForce) / spec.mass * dt
speed        = clamp(speed, −spec.reverseMax, spec.topSpeed)

steerAngle   = steer * maxSteer(speed)              // steering authority falls off with speed
if |speed| > 0.1:
    yawRate  = speed * tan(steerAngle) / spec.wheelBase
    heading += yawRate * dt
    // lateral grip: blend velocity direction toward heading; handbrake reduces grip → slides
velocity     = heading * speed  +  lateralSlip
```

Then: `physics.sweepBox(chassisOBB, velocity*dt)` resolves against the world with slide + speed loss along the contact normal, and the body is snapped to `groundAt()` with a smoothed pitch/roll derived from the ground normal (visual only).

Why this and not a raycast-vehicle or a real solver:
- It is ~200 lines, fully tunable, and *predictable* — the arcade feel this game wants.
- No dependency, no WASM, no second transform authority.
- Our roads are flat; suspension simulation would buy visual travel we can fake with a spring-damper on the visual body only.
- Traffic AI can drive the same model at 20 Hz cheaply.

Visual polish on top of the kinematic core: per-wheel spin and steer rotation, a visual body spring (pitch under accel/brake, roll in turns), and a speed-breaker bump response from the ramp collider.

## 3. Vehicle spec data

Specs are data, not subclasses (`data/vehicles.ts`):

```ts
interface VehicleSpec {
  id: 'auto' | 'car' | 'bus';
  assetKey: string;                 // resolved by the asset system, never a path
  mass: number;  power: number;     brakePower: number;
  topSpeed: number; reverseMax: number;
  drag: number; rollResist: number; grip: number;
  wheelBase: number; trackWidth: number; maxSteerDeg: number; steerFalloff: number;
  chassis: { halfExtents: [number, number, number]; centerY: number };
  wheels: { nodeName: string; radius: number; steered: boolean; driven: boolean }[];
  seats: SeatDef[];                 // driver + passengers, local position + exit point
  audio: { engineLoop: string; idle: string; horn: string; pitchRange: [number, number] };
  ai: { comfortAccel: number; comfortBrake: number; laneOffsetBias: number };
}
```

MVP ships **one** spec: the auto-rickshaw.

| Auto-rickshaw target figures | |
|---|---|
| Top speed | ~13 m/s (≈47 km/h) |
| 0→10 m/s | ~6 s |
| Wheelbase | 2.0 m, length 2.6 m, width 1.4 m |
| Max steer | 38° at rest, ~12° at top speed |
| Feel | tippy, buzzy, quick to turn, slow to accelerate — character over performance |

Post-MVP: hatchback car (faster, wider, understeers), KSRTC-style bus (heavy, long, wide turning circle, AI-only at first).

## 4. Enter / exit

The single most bug-prone interaction in the game, so it is specified precisely.

**Enter** (E while the interaction system reports a vehicle target):
1. Validate: vehicle unoccupied, player within 2.2 m of a seat's entry point, vehicle speed < 1 m/s.
2. Emit `player:entered-vehicle`.
3. Disable player collider + movement integration; set player state `Driving`.
4. Play a 0.5 s entry blend: player mesh moves to the seat pose along an eased path (no full entry animation in the MVP — a blend reads as intentional and cannot desync).
5. Attach player visual to the seat node; camera enters `Transition` → `ThirdPersonVehicle`.
6. Route `InputState` to `PlayerDriver`; HUD swaps to the driving layout (speed readout).

**Exit** (E while driving):
1. Require speed < 2 m/s (HUD hint "slow down to get out" otherwise).
2. Choose an exit point: the seat's preferred side, then the other side, then front — first one whose capsule position is free per `physics.overlapSphere` and above ground.
3. If none is free, refuse with a prompt rather than pushing the player into a wall.
4. Reverse the blend, re-enable the collider at the chosen point, emit `player:exited-vehicle`, camera transitions back.

Rules: the vehicle is never destroyed or hidden while occupied; the player is never a child of a moving object during physics (attachment is visual only, transform written in `lateUpdate`); the handbrake is applied automatically on exit so parked vehicles do not roll.

## 5. Collision behaviour

| Case | Response |
|---|---|
| Vehicle vs. static | `sweepBox` slide; speed reduced by the normal-component fraction; impact sound + small camera shake scaled by Δspeed |
| Vehicle vs. vehicle | Separate along the contact normal, exchange a fraction of relative speed (no mass-correct impulse, no rotation impulse) |
| Vehicle vs. pedestrian | Pedestrian is pushed aside and plays a startled reaction; **no injury, no death, no penalty** (`GAME_DESIGN.md` §10) |
| Vehicle vs. player capsule | Clamped horizontal push, no vertical launch |
| Speed breaker (`ramp` collider) | Vertical visual bump + speed loss above a threshold + a thump sound |
| Kerb | Small speed loss and a bump; kerbs are mountable at low speed, which is authentically Indian |

No damage model, no deformation, no wrecks in the MVP.

## 6. Player vehicle lifecycle

- One player auto-rickshaw exists from boot, parked at the player's home/stand anchor.
- Its transform and state are in `GameState` and persist across sessions (`SAVE_SYSTEM.md`).
- It is never streamed out. If the player walks far away, the vehicle stays where it was left; a minimap icon always shows it.
- Post-MVP: a "return my auto" option at any auto stand for players who lose it.

## 7. Vehicle audio

Engine loop with playback-rate mapped from RPM-proxy (speed / gear-free continuous curve), cross-faded with an idle loop below ~1 m/s; tyre/road loop scaled by speed; horn one-shot; impact one-shots by Δspeed bucket. All voices pooled, all positioned via a single `PannerNode` per vehicle, and the whole vehicle bus is muted when the vehicle is >60 m away and out of view (`AUDIO_PLAN.md`).

## 8. Interface published to other systems

```ts
interface VehicleView {
  readonly all: readonly VehicleHandle[];
  get(id: VehicleId): VehicleHandle | null;
  playerVehicle: VehicleHandle | null;
  nearestUnoccupied(p: Vector3, maxDist: number): VehicleHandle | null;
}
interface VehicleHandle {
  id: VehicleId; specId: string;
  position: Readonly<Vector3>; heading: number; speed: number;
  occupiedBy: 'player' | 'ai' | null;
}
```

Traffic uses it to spawn/despawn; interaction uses `nearestUnoccupied`; UI uses speed and the minimap icon; missions use position for "arrive by vehicle" objectives.
