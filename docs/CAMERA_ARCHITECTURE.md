# CAMERA_ARCHITECTURE

The camera is an independent system. It reads `PlayerView` / `VehicleView` and input; nothing reads the camera except `rendering` (which renders with it) and `input` (which needs the camera yaw to build camera-relative movement — supplied via a single published `cameraYaw` value, not a module import).

---

## 1. Rig

An explicit three-part rig rather than a parented Object3D chain, so smoothing is fully controllable:

```
anchor      = follow target position + shoulder offset      (lerped)
orbit       = yaw + pitch (mouse-driven, clamped)
desiredPos  = anchor + sphericalToCartesian(orbit, distance)
actualPos   = collisionProbe(anchor, desiredPos)            (pulled in on obstruction)
camera.pos  = smoothDamp(camera.pos, actualPos, posSmoothing)
camera.look = anchor + lookOffset
```

Only `camera` is a real `PerspectiveCamera`; anchor/orbit are plain numbers, which makes the whole thing allocation-free and easy to reason about.

## 2. Modes

| Mode | When | Behaviour |
|---|---|---|
| `ThirdPersonWalk` | on foot | Distance 4.0 m, height offset 1.55 m, shoulder offset 0.35 m right, FOV 60° |
| `ThirdPersonVehicle` | driving | Distance 6.5 m (scales to 8.5 m at top speed), height 2.4 m, FOV 62°→70° with speed, yaw eases toward the vehicle's heading |
| `Transition` | enter/exit vehicle | 0.45 s eased blend of distance/height/FOV/anchor between the two modes; no cut |
| `Cinematic` | mission intro, landmark reveal (post-MVP) | Scripted anchor + look targets, input ignored, skippable |
| `DebugFree` | dev only | Detached fly camera, `debug` module, stripped in production |

Modes share one implementation with a parameter set; adding a mode is adding data, not code.

## 3. Look control

- Mouse delta → yaw/pitch, scaled by a sensitivity setting (default 0.0022 rad/px), **not** multiplied by `dt` (mouse input is already per-frame displacement — multiplying by dt is a classic bug and is called out in `CODING_RULES.md`).
- Pitch clamped to **−35° … +70°** (walk) and **−20° … +50°** (vehicle) so the camera never goes under the ground plane or above the anchor.
- Yaw is unbounded and wrapped to (−π, π].
- Optional invert-Y, sensitivity slider, and a "camera shake" toggle in settings.
- Wheel adjusts distance within per-mode min/max (walk 2.5–6.0 m), persisted per mode.

## 4. Smoothing

Exponential smoothing with a **frame-rate-independent** factor:

```ts
const k = 1 - Math.exp(-dt / tau);      // tau = time constant in seconds
value += (target - value) * k;
```

Time constants (in `data/balance.ts`): anchor 0.08 s, position 0.10 s, vehicle yaw follow 0.25 s, FOV 0.30 s, distance recovery after obstruction 0.20 s (fast pull-in, slow push-out — pulling in must be immediate to avoid clipping).

Rotation smoothing uses `Quaternion.slerp` toward the look target, never Euler lerps (gimbal artefacts near the pitch clamp).

## 5. Collision probe

Prevents the camera clipping into buildings and walls — a stated polish requirement (`GAME_DESIGN.md` §15).

1. Sphere-cast (radius 0.25 m) from `anchor` toward `desiredPos` using `physics.raycast` plus a small offset ring of 4 additional rays for corner cases (cheap: 5 rays at 60 Hz is negligible).
2. On a hit at distance `d`, use `min(desiredDistance, d − 0.25)`.
3. Distance recovers with the slow time constant once clear, so the camera does not pump while running along a wall.
4. Hard floor: camera Y is never below `groundAt(x,z) + 0.3`.
5. If the anchor itself is inside a collider (player pushed into geometry), the camera falls back to a fixed over-the-head position rather than flipping.

Materials/geometry are never faded or made transparent in the MVP — the probe alone is enough at our distances, and alpha-fading buildings costs a separate transparent pass.

## 6. Vehicle camera specifics

- Yaw eases toward `vehicle.heading` with the 0.25 s constant, but only above ~2 m/s so the camera does not spin while stationary or reversing slowly.
- Reversing (sustained negative speed > 1 s) blends the yaw 180° so the player sees where they are going.
- Speed effects: FOV widens with speed; distance extends; a tiny position lag along the velocity vector adds a sense of acceleration. All three are subtle and toggleable.
- Camera shake: a very small perlin-ish offset scaled by speed and collision impulses, disabled by the accessibility toggle.

## 7. Projection and framing

- Perspective, FOV per mode, `near = 0.15`, `far = 600` (fog fully occludes by ~250 m, far distance covers the Chamundi silhouette and sky dome).
- Aspect from the canvas; updated on the debounced resize (`WEB_ARCHITECTURE.md` §6).
- No vertical-FOV surprises on ultrawide: FOV is vertical (Three.js default), so wider windows show more horizontally — the intended behaviour.

## 8. Independence rules

- The camera **never** reads mission, UI or NPC state.
- The camera **never** moves the player. Movement is camera-*relative* by consuming a published yaw value; the dependency is one number in one direction.
- The camera **never** owns input handling; it reads `InputState`.
- Pausing the game freezes the camera; a paused game still renders (one frame, then idle) so the pause menu sits over a live-looking scene.
