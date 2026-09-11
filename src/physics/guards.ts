// The explicit guards for PLAYER_ARCHITECTURE.md §9's known failure modes.
//
// Each of these is a bug that every third-person controller ships at least once. They are
// collected here, in physics, because they are all statements about geometry rather than
// about gameplay — and because §9 asks for each to be guarded *explicitly* rather than
// falling out of some other rule by luck.
//
// The two guards that are not here live where they belong: the sub-stepping bound that
// prevents tunnelling is `sweep.ts`'s `SUBSTEP_RADIUS_FRACTION`, and the push-out for a
// collider inserted on top of the player is `sweep.ts`'s `resolvePenetration`.

import type { ColliderId } from './shapes';
import type { ColliderQuery, GroundSample, TerrainHeightFn } from './ground';
import { sampleGround } from './ground';
import { isCapsuleFree } from './sweep';
import type { Capsule } from './sweep';

/**
 * How far below the ground a position is allowed to be before it is clamped back
 * (PLAYER_ARCHITECTURE.md §9: "position.y is never below groundAt(x,z) − 0.05").
 */
export const FLOOR_TOLERANCE = 0.05;

/** Rings and steps the spawn search walks before giving up. */
const SPAWN_RINGS = 6;
const SPAWN_STEPS_PER_RING = 8;

/**
 * Guard 1 — falling through the ground.
 *
 * Returns the Y the capsule's feet must not go below. A caller that has just integrated
 * gravity clamps to this; the tolerance leaves room for the ground snap without letting a
 * body sink through a floor it was standing on.
 */
export function floorLimit(
  query: ColliderQuery,
  terrain: TerrainHeightFn,
  x: number,
  z: number,
  ceiling: number,
  candidates: ColliderId[],
  sample: GroundSample,
): number {
  sampleGround(query, terrain, x, z, ceiling, candidates, sample);
  return sample.y - FLOOR_TOLERANCE;
}

/**
 * Guard 4 — launched by a moving vehicle.
 *
 * A push from another body is clamped in magnitude and carries **no vertical component**,
 * so a vehicle nudging the player can shove them aside but never fire them into the air.
 * Writes the accepted push into `out`.
 */
export function clampPush(
  pushX: number,
  pushY: number,
  pushZ: number,
  maxMagnitude: number,
  out: { x: number; y: number; z: number },
): void {
  // Vertical is discarded before the clamp, not after: the horizontal push keeps its full
  // allowance rather than losing part of it to a component that is thrown away anyway.
  void pushY;
  const magnitude = Math.hypot(pushX, pushZ);
  out.y = 0;
  if (magnitude <= 1e-6) {
    out.x = 0;
    out.z = 0;
    return;
  }
  const scale = magnitude > maxMagnitude ? maxMagnitude / magnitude : 1;
  out.x = pushX * scale;
  out.z = pushZ * scale;
}

/**
 * Guard 6 — teleporting or loading into solid geometry.
 *
 * Finds the nearest free capsule position to `cap`, searching outward in rings. Returns
 * true and writes the answer into `out` when one is found; false when even the widest ring
 * is solid, which the caller must treat as a bad spawn point rather than ignore.
 *
 * The rings are walked nearest-first, so the answer is the closest free spot rather than
 * merely a free one.
 */
export function findFreeSpawn(
  query: ColliderQuery,
  cap: Capsule,
  spacing: number,
  candidates: ColliderId[],
  out: { x: number; y: number; z: number },
): boolean {
  if (isCapsuleFree(query, cap, candidates)) {
    out.x = cap.x;
    out.y = cap.y;
    out.z = cap.z;
    return true;
  }

  const probe: Capsule = {
    x: cap.x,
    y: cap.y,
    z: cap.z,
    radius: cap.radius,
    height: cap.height,
  };

  for (let ring = 1; ring <= SPAWN_RINGS; ring++) {
    const radius = ring * spacing;
    for (let step = 0; step < SPAWN_STEPS_PER_RING; step++) {
      const angle = (step / SPAWN_STEPS_PER_RING) * Math.PI * 2;
      probe.x = cap.x + Math.cos(angle) * radius;
      probe.z = cap.z + Math.sin(angle) * radius;
      if (!isCapsuleFree(query, probe, candidates)) continue;
      out.x = probe.x;
      out.y = probe.y;
      out.z = probe.z;
      return true;
    }
  }
  return false;
}
