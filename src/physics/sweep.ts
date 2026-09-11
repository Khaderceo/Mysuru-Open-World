// Capsule sweeps and resolution (PLAYER_ARCHITECTURE.md §2 narrowphase/resolution).
//
// The narrowphase is closest-point capsule-vs-OBB in the box's own frame. Because every
// collider is yaw-only and every capsule is upright, the capsule's axis stays vertical
// after the rotation, so the closest pair is found by clamping independently in Y and in
// XZ — exact, not an approximation, and with no iteration.
//
// A ramp's vertical body is its base box; its sloped top is a height field owned by
// `ground.ts` and ridden by the ground snap (PLAYER_ARCHITECTURE.md §5 step 7). The
// enclosing OBB that T-2.1 builds is the broadphase's and stays out of the narrowphase,
// or a wedge would collide as the block that contains it.

import type { Collider, ColliderId, ColliderObb } from './shapes';
import type { ColliderQuery } from './ground';
import { EPSILON, clamp } from '../utils/math';

/** Upright capsule. `y` is the feet: the segment runs from `y + radius` to `y + height - radius`. */
export interface Capsule {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

/** Yaw-only box, for the vehicle sweeps that will come later (T-5.4). */
export interface OBB {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
}

export interface Contact {
  id: ColliderId;
  nx: number;
  ny: number;
  nz: number;
  depth: number;
}

export interface SweepResult {
  /** Resolved position, in the same convention as the capsule that went in. */
  x: number;
  y: number;
  z: number;
  hit: boolean;
  /**
   * Requested motion that achieved almost nothing. Expected when walking into a wall —
   * it is not on its own a sign of being stuck, which is why the corner nudge below keys
   * off actual penetration instead.
   */
  noProgress: boolean;
  /** Set when the corner nudge fired: the resolver had run out of iterations (§9). */
  nudged: boolean;
  contactCount: number;
  readonly contacts: Contact[];
}

export interface Penetration {
  nx: number;
  ny: number;
  nz: number;
  depth: number;
}

/** Resolution iterations per sub-step (PLAYER_ARCHITECTURE.md §2). */
export const MAX_ITERATIONS = 4;
/** No sub-step may exceed this fraction of the capsule radius — the tunnelling bound. */
export const SUBSTEP_RADIUS_FRACTION = 0.25;
/** Left between capsule and surface after a push-out, so contact does not re-trigger. */
export const SKIN = 1e-3;

const MAX_CONTACTS = 8;

export function createCapsule(radius = 0.35, height = 1.8): Capsule {
  return { x: 0, y: 0, z: 0, radius, height };
}

export function createSweepResult(): SweepResult {
  const contacts: Contact[] = [];
  for (let i = 0; i < MAX_CONTACTS; i++) contacts.push({ id: -1, nx: 0, ny: 0, nz: 0, depth: 0 });
  return {
    x: 0,
    y: 0,
    z: 0,
    hit: false,
    noProgress: false,
    nudged: false,
    contactCount: 0,
    contacts,
  };
}

export function createPenetration(): Penetration {
  return { nx: 0, ny: 0, nz: 0, depth: 0 };
}

/** Scratch for the narrowphase's own OBB view of a ramp. Never returned to a caller. */
const _rampBase: ColliderObb = { cx: 0, cy: 0, cz: 0, hx: 0, hy: 0, hz: 0, cos: 1, sin: 0 };
const _penetration: Penetration = createPenetration();
const _deepest: Penetration = createPenetration();

/**
 * The OBB the narrowphase should test a collider against: its solid body. For a box or a
 * wall that is the broadphase OBB; for a ramp it is the base box under the slope.
 */
function solidObb(collider: Collider, broadphase: ColliderObb): ColliderObb {
  if (collider.kind !== 'ramp') return broadphase;
  _rampBase.cx = collider.center.x;
  _rampBase.cy = collider.center.y;
  _rampBase.cz = collider.center.z;
  _rampBase.hx = collider.halfExtents.x;
  _rampBase.hy = collider.halfExtents.y;
  _rampBase.hz = collider.halfExtents.z;
  _rampBase.cos = broadphase.cos;
  _rampBase.sin = broadphase.sin;
  return _rampBase;
}

/**
 * Deepest overlap between an upright capsule and a yaw-only OBB, or false if they are
 * apart. `out.depth` is how far to push the capsule along `out.n*` to separate them.
 */
export function capsuleObbPenetration(obb: ColliderObb, cap: Capsule, out: Penetration): boolean {
  const dx = cap.x - obb.cx;
  const dz = cap.z - obb.cz;
  const lx = dx * obb.cos - dz * obb.sin;
  const lz = dx * obb.sin + dz * obb.cos;

  const segLow = cap.y + cap.radius - obb.cy;
  const segHigh = cap.y + cap.height - cap.radius - obb.cy;
  // Point on the capsule's axis closest to the box's Y interval. When the two intervals
  // overlap, any shared value is equally close, so the one nearest the box centre is used.
  const ly = segHigh < -obb.hy ? segHigh : segLow > obb.hy ? segLow : clamp(0, segLow, segHigh);

  const bx = clamp(lx, -obb.hx, obb.hx);
  const by = clamp(ly, -obb.hy, obb.hy);
  const bz = clamp(lz, -obb.hz, obb.hz);

  const ox = lx - bx;
  const oy = ly - by;
  const oz = lz - bz;
  const distanceSq = ox * ox + oy * oy + oz * oz;

  if (distanceSq > cap.radius * cap.radius) return false;

  if (distanceSq > EPSILON * EPSILON) {
    const distance = Math.sqrt(distanceSq);
    const inverse = 1 / distance;
    const nlx = ox * inverse;
    const nly = oy * inverse;
    const nlz = oz * inverse;
    out.nx = nlx * obb.cos + nlz * obb.sin;
    out.ny = nly;
    out.nz = -nlx * obb.sin + nlz * obb.cos;
    out.depth = cap.radius - distance;
    // Touching is not penetrating: at exactly one radius the subtraction leaves float
    // dust, which would make every "does the capsule fit here" check fail and would keep
    // a resting capsule in permanent contact.
    return out.depth > EPSILON;
  }

  // The axis is inside the box: leave along the least-penetrated face.
  const penX = obb.hx - Math.abs(lx);
  const penY = obb.hy - Math.abs(ly);
  const penZ = obb.hz - Math.abs(lz);
  if (penY <= penX && penY <= penZ) {
    out.nx = 0;
    out.ny = ly >= 0 ? 1 : -1;
    out.nz = 0;
    out.depth = cap.radius + penY;
  } else if (penX <= penZ) {
    const sign = lx >= 0 ? 1 : -1;
    out.nx = sign * obb.cos;
    out.ny = 0;
    out.nz = sign * -obb.sin;
    out.depth = cap.radius + penX;
  } else {
    const sign = lz >= 0 ? 1 : -1;
    out.nx = sign * obb.sin;
    out.ny = 0;
    out.nz = sign * obb.cos;
    out.depth = cap.radius + penZ;
  }
  return true;
}

/**
 * Push a capsule out of anything it overlaps where it stands, up to `MAX_ITERATIONS`
 * times. Returns how many contacts were recorded. Used by the sweep between sub-steps and
 * by the "stuck after a chunk build" guard.
 */
export function resolvePenetration(
  query: ColliderQuery,
  cap: Capsule,
  candidates: ColliderId[],
  out: SweepResult,
): number {
  out.x = cap.x;
  out.y = cap.y;
  out.z = cap.z;
  out.contactCount = 0;
  out.hit = false;
  out.noProgress = false;
  out.nudged = false;

  // Copied: a query never moves its caller's capsule, only reports where it should go.
  const working: Capsule = {
    x: cap.x,
    y: cap.y,
    z: cap.z,
    radius: cap.radius,
    height: cap.height,
  };
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const id = deepestPenetration(query, working, candidates, _deepest);
    if (id === -1) break;

    working.x += _deepest.nx * (_deepest.depth + SKIN);
    working.y += _deepest.ny * (_deepest.depth + SKIN);
    working.z += _deepest.nz * (_deepest.depth + SKIN);
    recordContact(out, id, _deepest);
  }

  nudgeIfStuck(query, working, candidates, out);

  out.x = working.x;
  out.y = working.y;
  out.z = working.z;
  out.hit = out.contactCount > 0;
  return out.contactCount;
}

/**
 * Guard 3 of PLAYER_ARCHITECTURE.md §9 — stuck in a corner.
 *
 * Four iterations of push-out resolve every ordinary contact. What they cannot resolve is
 * a wedge, where each push moves the capsule into the other surface: the resolver runs out
 * of iterations with the body still overlapping. The escape is a nudge along the bisector
 * of the contact normals, which is the one direction that leads out of a wedge.
 *
 * Keyed off actual penetration, not off `noProgress`: walking into a wall makes no
 * progress by design, and nudging every time would be the jitter this guard exists to
 * prevent.
 */
function nudgeIfStuck(
  query: ColliderQuery,
  working: Capsule,
  candidates: ColliderId[],
  out: SweepResult,
): void {
  if (out.contactCount < 2) return;
  if (isCapsuleFree(query, working, candidates)) return;

  let bisectorX = 0;
  let bisectorY = 0;
  let bisectorZ = 0;
  for (let i = 0; i < out.contactCount; i++) {
    const contact = out.contacts[i];
    if (contact === undefined) continue;
    bisectorX += contact.nx;
    bisectorY += contact.ny;
    bisectorZ += contact.nz;
  }

  const length = Math.hypot(bisectorX, bisectorY, bisectorZ);
  if (length < EPSILON) return;

  let deepest = 0;
  for (let i = 0; i < out.contactCount; i++) {
    const contact = out.contacts[i];
    if (contact !== undefined && contact.depth > deepest) deepest = contact.depth;
  }

  const distance = deepest + SKIN;
  working.x += (bisectorX / length) * distance;
  working.y += (bisectorY / length) * distance;
  working.z += (bisectorZ / length) * distance;
  out.nudged = true;
}

/** Whether a capsule at this position overlaps nothing — what step-up and spawn ask. */
export function isCapsuleFree(
  query: ColliderQuery,
  cap: Capsule,
  candidates: ColliderId[],
): boolean {
  return deepestPenetration(query, cap, candidates, _penetration) === -1;
}

/**
 * Move a capsule by a delta, resolving collisions as it goes: the delta is sub-stepped so
 * no step exceeds `SUBSTEP_RADIUS_FRACTION × radius`, and each step is followed by up to
 * four rounds of *detect deepest penetration → push out along the normal → slide the
 * remaining motion along the surface*. `cap` is not modified; the result carries the
 * resolved position.
 */
export function sweepCapsule(
  query: ColliderQuery,
  cap: Capsule,
  dx: number,
  dy: number,
  dz: number,
  candidates: ColliderId[],
  out: SweepResult,
): void {
  out.contactCount = 0;
  out.hit = false;
  out.noProgress = false;
  out.nudged = false;

  const working: Capsule = {
    x: cap.x,
    y: cap.y,
    z: cap.z,
    radius: cap.radius,
    height: cap.height,
  };

  const distance = Math.hypot(dx, dy, dz);
  const limit = SUBSTEP_RADIUS_FRACTION * cap.radius;
  const steps = distance <= limit ? 1 : Math.ceil(distance / limit);

  let remainingX = dx;
  let remainingY = dy;
  let remainingZ = dz;

  const startX = working.x;
  const startY = working.y;
  const startZ = working.z;

  for (let step = 0; step < steps; step++) {
    // Advance by the remaining motion divided by the sub-steps left, and take that much
    // *off* the remainder. Without the subtraction the same remainder is re-spent with a
    // smaller divisor each time and the sweep travels delta x H(steps) — the harmonic
    // series — instead of delta. Found by T-2.7's wall-slide test.
    const left = steps - step;
    const stepX = remainingX / left;
    const stepY = remainingY / left;
    const stepZ = remainingZ / left;
    working.x += stepX;
    working.y += stepY;
    working.z += stepZ;
    remainingX -= stepX;
    remainingY -= stepY;
    remainingZ -= stepZ;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const id = deepestPenetration(query, working, candidates, _deepest);
      if (id === -1) break;

      working.x += _deepest.nx * (_deepest.depth + SKIN);
      working.y += _deepest.ny * (_deepest.depth + SKIN);
      working.z += _deepest.nz * (_deepest.depth + SKIN);
      recordContact(out, id, _deepest);

      // Slide: drop the component of the remaining motion that fights the surface.
      const into = remainingX * _deepest.nx + remainingY * _deepest.ny + remainingZ * _deepest.nz;
      if (into < 0) {
        remainingX -= into * _deepest.nx;
        remainingY -= into * _deepest.ny;
        remainingZ -= into * _deepest.nz;
      }
    }
  }

  nudgeIfStuck(query, working, candidates, out);

  out.x = working.x;
  out.y = working.y;
  out.z = working.z;
  out.hit = out.contactCount > 0;

  // No progress: motion was requested, contacts were found, and almost none of the
  // distance was achieved. T-2.9 owns the nudge; this only reports the condition.
  if (distance > EPSILON && out.hit) {
    const moved = Math.hypot(working.x - startX, working.y - startY, working.z - startZ);
    out.noProgress = moved < distance * 0.02;
  }
}

/** The collider the capsule is most deeply inside, or -1. Fills `out` on a hit. */
function deepestPenetration(
  query: ColliderQuery,
  cap: Capsule,
  candidates: ColliderId[],
  out: Penetration,
): ColliderId {
  const count = query.queryFootprint(
    cap.x - cap.radius,
    cap.z - cap.radius,
    cap.x + cap.radius,
    cap.z + cap.radius,
    candidates,
  );

  let bestId: ColliderId = -1;
  let bestDepth = 0;
  for (let i = 0; i < count; i++) {
    const id = candidates[i];
    if (id === undefined) continue;
    const collider = query.colliderOf(id);
    const broadphase = query.obbOf(id);
    if (collider === undefined || broadphase === undefined) continue;

    if (!capsuleObbPenetration(solidObb(collider, broadphase), cap, _penetration)) continue;
    if (_penetration.depth <= bestDepth) continue;

    bestDepth = _penetration.depth;
    bestId = id;
    out.nx = _penetration.nx;
    out.ny = _penetration.ny;
    out.nz = _penetration.nz;
    out.depth = _penetration.depth;
  }
  return bestId;
}

function recordContact(out: SweepResult, id: ColliderId, penetration: Penetration): void {
  // Repeated pushes against the same collider in one resolve are one contact, deepest kept.
  for (let i = 0; i < out.contactCount; i++) {
    const existing = out.contacts[i];
    if (existing === undefined || existing.id !== id) continue;
    if (penetration.depth > existing.depth) {
      existing.depth = penetration.depth;
      existing.nx = penetration.nx;
      existing.ny = penetration.ny;
      existing.nz = penetration.nz;
    }
    return;
  }
  if (out.contactCount >= MAX_CONTACTS) return;
  const slot = out.contacts[out.contactCount];
  if (slot === undefined) return;
  slot.id = id;
  slot.nx = penetration.nx;
  slot.ny = penetration.ny;
  slot.nz = penetration.nz;
  slot.depth = penetration.depth;
  out.contactCount++;
}
