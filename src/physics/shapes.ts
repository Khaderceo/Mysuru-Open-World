// Collider shapes and the yaw-only OBB tests every physics query reduces to
// (PLAYER_ARCHITECTURE.md §2).
//
// Buildings, walls, props and vehicles are all axis-aligned in pitch and roll, so a
// collider is a box with one rotation about Y. That turns every test into 2D rotation
// plus a Y interval — far simpler and faster than general SAT, and it loses nothing this
// game needs. There are no mesh colliders, ever.

import { Vector3 } from 'three';
import type { Vector2 } from 'three';
import type { GridFootprint, GridOwner } from '../utils/grid';
import { EPSILON, clamp } from '../utils/math';

/** Handle to a collider held by `CollisionWorld`. Opaque to callers; never arithmetic. */
export type ColliderId = number;

/**
 * Bulk-removal key. World (T-2.3) owns chunk ids; physics only needs to group colliders
 * under whatever key that task uses, so it takes the grid's own owner type.
 */
export type ColliderOwner = GridOwner;

export type Collider =
  | { kind: 'box'; center: Vector3; halfExtents: Vector3; yaw: number }
  | { kind: 'ramp'; center: Vector3; halfExtents: Vector3; yaw: number; rise: number }
  | { kind: 'wall'; a: Vector2; b: Vector2; height: number; thickness: number };

/**
 * A collider in the one form the tests use: centre, half extents, and the yaw basis
 * pre-resolved to cosine and sine so no query calls `Math.cos` in a loop.
 *
 * Local → world is `wx = lx·cos + lz·sin`, `wz = -lx·sin + lz·cos`; world → local is its
 * transpose. That convention is fixed here and assumed by every function below.
 */
export interface ColliderObb {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  cos: number;
  sin: number;
}

/** What `CollisionWorld.raycast` fills in. Vectors are owned by the hit, never replaced. */
export interface RayHit {
  id: ColliderId;
  distance: number;
  readonly point: Vector3;
  readonly normal: Vector3;
}

/** Scratch result of one OBB ray test, in plain numbers so the test allocates nothing. */
export interface ObbRayResult {
  distance: number;
  nx: number;
  ny: number;
  nz: number;
}

export function createObb(): ColliderObb {
  return { cx: 0, cy: 0, cz: 0, hx: 0, hy: 0, hz: 0, cos: 1, sin: 0 };
}

export function createRayHit(): RayHit {
  return { id: -1, distance: 0, point: new Vector3(), normal: new Vector3() };
}

export function createObbRayResult(): ObbRayResult {
  return { distance: 0, nx: 0, ny: 0, nz: 0 };
}

/**
 * Resolve any collider to its OBB, written into `out`.
 *
 * - **box** is the OBB.
 * - **wall** becomes an OBB with local +X along `a → b`, `thickness` across it and its
 *   base at y = 0 — walls stand on the ground, which is the only reading the shape
 *   supports since it carries no base height.
 * - **ramp** is enclosed by the box that contains both its low and its high edge: `rise`
 *   is read as height gained above the base box, so the OBB grows by `rise / 2` and its
 *   centre lifts by the same. That is conservative by construction. The sloped surface
 *   itself belongs to the sweep and ground code (T-2.2); nothing here pretends to know
 *   which way a ramp climbs.
 */
export function toObb(collider: Collider, out: ColliderObb): void {
  if (collider.kind === 'wall') {
    const dx = collider.b.x - collider.a.x;
    const dz = collider.b.y - collider.a.y;
    const length = Math.hypot(dx, dz);

    out.cx = (collider.a.x + collider.b.x) * 0.5;
    out.cy = collider.height * 0.5;
    out.cz = (collider.a.y + collider.b.y) * 0.5;
    out.hx = length * 0.5;
    out.hy = collider.height * 0.5;
    out.hz = collider.thickness * 0.5;
    // Local +X must point along the wall. Local (1,0,0) maps to (cos, -sin), so those are
    // the direction's components. A zero-length wall keeps the identity basis.
    out.cos = length > EPSILON ? dx / length : 1;
    out.sin = length > EPSILON ? -dz / length : 0;
    return;
  }

  const lift = collider.kind === 'ramp' ? Math.max(0, collider.rise) * 0.5 : 0;
  out.cx = collider.center.x;
  out.cy = collider.center.y + lift;
  out.cz = collider.center.z;
  out.hx = collider.halfExtents.x;
  out.hy = collider.halfExtents.y + lift;
  out.hz = collider.halfExtents.z;
  out.cos = Math.cos(collider.yaw);
  out.sin = Math.sin(collider.yaw);
}

/** The OBB's axis-aligned XZ footprint, for insertion into the broadphase grid. */
export function obbFootprint(obb: ColliderObb, out: GridFootprint): void {
  // A yaw-rotated box projects onto each world axis by |h·basis| summed over its axes.
  const spanX = Math.abs(obb.hx * obb.cos) + Math.abs(obb.hz * obb.sin);
  const spanZ = Math.abs(obb.hx * obb.sin) + Math.abs(obb.hz * obb.cos);
  out.minX = obb.cx - spanX;
  out.maxX = obb.cx + spanX;
  out.minZ = obb.cz - spanZ;
  out.maxZ = obb.cz + spanZ;
}

/** Exact sphere-vs-OBB test: closest point on the box in its own frame. */
export function sphereOverlapsObb(
  obb: ColliderObb,
  px: number,
  py: number,
  pz: number,
  radius: number,
): boolean {
  const dx = px - obb.cx;
  const dz = pz - obb.cz;
  const lx = dx * obb.cos - dz * obb.sin;
  const ly = py - obb.cy;
  const lz = dx * obb.sin + dz * obb.cos;

  const ox = lx - clamp(lx, -obb.hx, obb.hx);
  const oy = ly - clamp(ly, -obb.hy, obb.hy);
  const oz = lz - clamp(lz, -obb.hz, obb.hz);

  return ox * ox + oy * oy + oz * oz <= radius * radius;
}

/**
 * First forward intersection of a ray with an OBB, by slab test in the box's frame.
 * Returns false on a miss or a hit beyond `maxDist`; on a hit, `out` carries the distance
 * and the world-space surface normal.
 *
 * A ray starting inside the box hits at distance 0 with the normal facing back along the
 * ray: there is no meaningful surface to report, and callers care that they are inside.
 * `dir` must be normalised, so `distance` is in metres.
 */
export function raycastObb(
  obb: ColliderObb,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  out: ObbRayResult,
): boolean {
  const rx = ox - obb.cx;
  const rz = oz - obb.cz;
  const lox = rx * obb.cos - rz * obb.sin;
  const loy = oy - obb.cy;
  const loz = rx * obb.sin + rz * obb.cos;
  const ldx = dx * obb.cos - dz * obb.sin;
  const ldy = dy;
  const ldz = dx * obb.sin + dz * obb.cos;

  let near = 0;
  let far = maxDist;
  // Which local axis produced `near`, and which face of it: 0/1/2 for x/y/z.
  let axis = 0;
  let sign = 0;

  for (let a = 0; a < 3; a++) {
    const origin = a === 0 ? lox : a === 1 ? loy : loz;
    const direction = a === 0 ? ldx : a === 1 ? ldy : ldz;
    const half = a === 0 ? obb.hx : a === 1 ? obb.hy : obb.hz;

    if (Math.abs(direction) < EPSILON) {
      // Parallel to this slab: either always inside it, or never.
      if (origin < -half || origin > half) return false;
      continue;
    }

    const inverse = 1 / direction;
    let enter = (-half - origin) * inverse;
    let exit = (half - origin) * inverse;
    // `enter` is computed from the -half face whatever the direction, so that face's
    // outward normal is -1; a swap means the ray entered through +half instead.
    let enterSign = -1;
    if (enter > exit) {
      const swap = enter;
      enter = exit;
      exit = swap;
      enterSign = 1;
    }

    if (enter > near) {
      near = enter;
      axis = a;
      sign = enterSign;
    }
    if (exit < far) far = exit;
    if (near > far) return false;
  }

  if (near > maxDist) return false;
  out.distance = near;

  if (sign === 0) {
    // Started inside every slab: report the surface as facing back down the ray.
    out.nx = -dx;
    out.ny = -dy;
    out.nz = -dz;
    return true;
  }

  // Rotate the local face normal back into world space.
  if (axis === 0) {
    out.nx = sign * obb.cos;
    out.ny = 0;
    out.nz = sign * -obb.sin;
  } else if (axis === 1) {
    out.nx = 0;
    out.ny = sign;
    out.nz = 0;
  } else {
    out.nx = sign * obb.sin;
    out.ny = 0;
    out.nz = sign * obb.cos;
  }
  return true;
}
