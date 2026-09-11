// The camera collision probe (CAMERA_ARCHITECTURE.md §5).
//
// Five rays from the anchor toward where the camera wants to be: one down the centre and
// four offset around it to catch corners, which are exactly the case a single ray misses.
// Five rays at 60 Hz is negligible, and the alternative — fading geometry to transparent —
// costs a whole extra pass the MVP does not want.
//
// Allocation-free: the ray origin and direction are module scratch, reused by every cast.

import { Vector3 } from 'three';
import { CAMERA } from '../data/balance';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { GroundSample } from '../physics/ground';
import type { ColliderId, RayHit } from '../physics/shapes';

const _origin = new Vector3();
const _direction = new Vector3();
const _right = new Vector3();
const _up = new Vector3();

/** The four ring offsets, in multiples of the two vectors perpendicular to the ray. */
const RING = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * How far the camera may sit from the anchor along `dir` without clipping. Never more than
 * `desired`; on a hit at distance `d` the answer is `d − probeRadius` (§5.2).
 *
 * `hit` is the caller's reusable RayHit, so nothing here allocates.
 */
export function probeDistance(
  world: CollisionWorld,
  anchorX: number,
  anchorY: number,
  anchorZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  desired: number,
  hit: RayHit,
): number {
  // right = up × dir, horizontal by construction. Pitch is clamped well short of ±90°,
  // so the horizontal part of dir is never zero and this cannot degenerate.
  const horizontal = Math.hypot(dirX, dirZ);
  if (horizontal > 1e-6) {
    _right.set(dirZ / horizontal, 0, -dirX / horizontal);
  } else {
    _right.set(1, 0, 0);
  }
  // up = dir × right.
  _up.set(
    dirY * _right.z - dirZ * _right.y,
    dirZ * _right.x - dirX * _right.z,
    dirX * _right.y - dirY * _right.x,
  );

  _direction.set(dirX, dirY, dirZ);

  let allowed = desired;
  for (let i = 0; i <= RING.length; i++) {
    if (i === 0) {
      _origin.set(anchorX, anchorY, anchorZ);
    } else {
      const offset = RING[i - 1];
      if (offset === undefined) continue;
      const scale = CAMERA.probeRingOffset;
      _origin.set(
        anchorX + (_right.x * offset[0] + _up.x * offset[1]) * scale,
        anchorY + (_right.y * offset[0] + _up.y * offset[1]) * scale,
        anchorZ + (_right.z * offset[0] + _up.z * offset[1]) * scale,
      );
    }

    if (!world.raycast(_origin, _direction, desired, hit)) continue;
    const limited = hit.distance - CAMERA.probeRadius;
    if (limited < allowed) allowed = limited;
  }

  return allowed < 0 ? 0 : allowed;
}

/**
 * True when the anchor is inside a collider — the player has been pushed into geometry.
 * The camera then takes a fixed over-the-head position rather than flipping (§5.5).
 */
export function isAnchorBlocked(
  world: CollisionWorld,
  anchorX: number,
  anchorY: number,
  anchorZ: number,
  scratch: ColliderId[],
): boolean {
  _origin.set(anchorX, anchorY, anchorZ);
  return world.overlapSphere(_origin, CAMERA.probeRadius, scratch) > 0;
}

/** The hard floor: the camera never sits below the ground plus its clearance (§5.4). */
export function floorFor(
  world: CollisionWorld,
  x: number,
  z: number,
  ceiling: number,
  sample: GroundSample,
): number {
  return world.groundAt(x, z, ceiling, sample) + CAMERA.groundClearance;
}
