// The camera rig's maths (CAMERA_ARCHITECTURE.md §1, §3, §4).
//
// An explicit three-part rig — anchor, orbit, position — rather than a parented Object3D
// chain, so every stage's smoothing is controllable. Anchor and orbit are plain numbers,
// which is what makes the whole thing allocation-free.
//
// Nothing here touches Three.js or the collision world: it is arithmetic, so it is
// testable without a renderer.

import { CAMERA } from '../data/balance';

/** The rig's whole state. Plain numbers, mutated in place. */
export interface CameraRig {
  /** Smoothed follow point. */
  anchorX: number;
  anchorY: number;
  anchorZ: number;
  /** Orbit, radians. Yaw is wrapped to (−π, π]; pitch is clamped per mode. */
  yaw: number;
  pitch: number;
  /** Distance the player asked for with the wheel, and the one the probe allows. */
  desiredDistance: number;
  distance: number;
  /** Smoothed camera position. */
  x: number;
  y: number;
  z: number;
  fov: number;
}

export function createRig(): CameraRig {
  return {
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    yaw: 0,
    pitch: 0.2,
    desiredDistance: CAMERA.walk.distance,
    distance: CAMERA.walk.distance,
    x: 0,
    y: 0,
    z: 0,
    fov: CAMERA.walk.fov,
  };
}

/**
 * Frame-rate-independent exponential approach (§4). `tau` is the time constant: after
 * `tau` seconds roughly 63% of the remaining distance is covered, whatever the frame rate.
 */
export function approach(current: number, target: number, tau: number, dt: number): number {
  if (tau <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/** Wrap an angle to (−π, π] — closed at the top, so −π comes back as π. */
export function wrapAngle(angle: number): number {
  const shifted = (((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return shifted === 0 ? Math.PI : shifted - Math.PI;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

const DEG = Math.PI / 180;

export const PITCH_MIN = CAMERA.walk.pitchMinDeg * DEG;
export const PITCH_MAX = CAMERA.walk.pitchMaxDeg * DEG;

/**
 * Apply this frame's mouse delta to the orbit. The delta is NOT multiplied by dt: mouse
 * input is already a per-frame displacement, and multiplying it is the classic bug
 * CODING_RULES.md §4 calls out by name.
 */
export function applyLook(rig: CameraRig, lookX: number, lookY: number, invertY = false): void {
  rig.yaw = wrapAngle(rig.yaw - lookX * CAMERA.sensitivity);
  const pitchDelta = lookY * CAMERA.sensitivity * (invertY ? -1 : 1);
  rig.pitch = clamp(rig.pitch - pitchDelta, PITCH_MIN, PITCH_MAX);
}

/** Apply a wheel delta to the requested distance, inside the mode's range (§3). */
export function applyZoom(rig: CameraRig, wheelDelta: number): void {
  rig.desiredDistance = clamp(
    rig.desiredDistance + wheelDelta * CAMERA.zoomRate,
    CAMERA.walk.minDistance,
    CAMERA.walk.maxDistance,
  );
}

/** Move the anchor toward the follow target, with the shoulder offset (§1). */
export function updateAnchor(
  rig: CameraRig,
  targetX: number,
  feetY: number,
  targetZ: number,
  dt: number,
): void {
  // The shoulder offset is to the camera's right, so it depends on the current yaw.
  const rightX = Math.cos(rig.yaw);
  const rightZ = -Math.sin(rig.yaw);
  const wantX = targetX + rightX * CAMERA.walk.shoulder;
  const wantY = feetY + CAMERA.walk.height;
  const wantZ = targetZ + rightZ * CAMERA.walk.shoulder;

  rig.anchorX = approach(rig.anchorX, wantX, CAMERA.tau.anchor, dt);
  rig.anchorY = approach(rig.anchorY, wantY, CAMERA.tau.anchor, dt);
  rig.anchorZ = approach(rig.anchorZ, wantZ, CAMERA.tau.anchor, dt);
}

/** Put the anchor exactly on the target, for spawn and teleports. */
export function snapAnchor(rig: CameraRig, targetX: number, feetY: number, targetZ: number): void {
  const rightX = Math.cos(rig.yaw);
  const rightZ = -Math.sin(rig.yaw);
  rig.anchorX = targetX + rightX * CAMERA.walk.shoulder;
  rig.anchorY = feetY + CAMERA.walk.height;
  rig.anchorZ = targetZ + rightZ * CAMERA.walk.shoulder;
}

/**
 * Unit vector from the anchor toward where the camera wants to sit, written into `out`.
 * Yaw 0 puts the camera behind the player at +Z, matching a forward of −Z.
 */
export function orbitDirection(rig: CameraRig, out: { x: number; y: number; z: number }): void {
  const cosPitch = Math.cos(rig.pitch);
  out.x = -Math.sin(rig.yaw) * cosPitch;
  out.y = Math.sin(rig.pitch);
  out.z = Math.cos(rig.yaw) * cosPitch;
}

/**
 * Distance easing: pulling in is immediate so the camera never clips, pushing back out
 * uses the slow constant so it does not pump while running along a wall (§4, §5.3).
 */
export function easeDistance(rig: CameraRig, allowed: number, dt: number): void {
  if (allowed <= rig.distance) {
    rig.distance = allowed;
    return;
  }
  rig.distance = approach(rig.distance, allowed, CAMERA.tau.distanceRecover, dt);
}
