// Ground height and slope (PLAYER_ARCHITECTURE.md §2 "Ground", WORLD_DESIGN.md §6).
//
// Collision for ground is analytic, never mesh-based: a height query samples the same
// function the terrain mesh uses, so it is exact, allocation-free, and answerable before
// any mesh exists. Terrain itself is T-3.2's (`TASKS.md` T-3.2 extends this file), so the
// sampler is a seam here with a flat default — which is exactly right for Phase 2, whose
// grey-box world (T-2.4) is a flat plane.
//
// Ramp tops are resolved here rather than in the sweep because they are a height field:
// one place owns "how high is the ground at x,z, and which way does it face".

import type { Collider, ColliderId, ColliderObb } from './shapes';
import { EPSILON } from '../utils/math';

/** Samples terrain height at a world XZ. Installed by world (T-3.2); flat until then. */
export type TerrainHeightFn = (x: number, z: number) => number;

const FLAT_TERRAIN: TerrainHeightFn = () => 0;

/** A ground sample: height, the surface normal there, and what provided it. */
export interface GroundSample {
  y: number;
  nx: number;
  ny: number;
  nz: number;
  /** -1 when the height came from terrain rather than a collider. */
  id: ColliderId;
}

/** The broadphase reads a sweep or ground query needs. Structural, so no import cycle. */
export interface ColliderQuery {
  queryFootprint(minX: number, minZ: number, maxX: number, maxZ: number, out: ColliderId[]): number;
  colliderOf(id: ColliderId): Collider | undefined;
  obbOf(id: ColliderId): ColliderObb | undefined;
}

export function createGroundSample(): GroundSample {
  return { y: 0, nx: 0, ny: 1, nz: 0, id: -1 };
}

/**
 * Height of the walkable surface at `x, z`, taking the highest of the analytic terrain
 * and any collider top at or below `ceiling`. `ceiling` is how the caller says "I am
 * standing here, do not snap me onto a roof above my head" — pass the capsule's waist.
 */
export function sampleGround(
  query: ColliderQuery,
  terrain: TerrainHeightFn,
  x: number,
  z: number,
  ceiling: number,
  candidates: ColliderId[],
  out: GroundSample,
): void {
  out.y = terrain(x, z);
  out.nx = 0;
  out.ny = 1;
  out.nz = 0;
  out.id = -1;

  const count = query.queryFootprint(x, z, x, z, candidates);
  for (let i = 0; i < count; i++) {
    const id = candidates[i];
    if (id === undefined) continue;
    const collider = query.colliderOf(id);
    const obb = query.obbOf(id);
    if (collider === undefined || obb === undefined) continue;

    // Outside the footprint in the collider's own frame? Then it is not underfoot.
    const dx = x - obb.cx;
    const dz = z - obb.cz;
    const lx = dx * obb.cos - dz * obb.sin;
    const lz = dx * obb.sin + dz * obb.cos;
    if (lx < -obb.hx || lx > obb.hx || lz < -obb.hz || lz > obb.hz) continue;

    let top = obb.cy + obb.hy;
    let nx = 0;
    let ny = 1;
    let nz = 0;
    if (collider.kind === 'ramp') {
      top = rampTopAt(collider, lx);
      // Local slope normal is (-rise, 2·hx, 0) normalised; rotate it into world space.
      const run = 2 * collider.halfExtents.x;
      const scale = Math.hypot(collider.rise, run);
      if (scale > EPSILON) {
        const localNx = -collider.rise / scale;
        const localNy = run / scale;
        nx = localNx * obb.cos;
        ny = localNy;
        nz = -localNx * obb.sin;
      }
    }

    if (top > ceiling || top <= out.y) continue;
    out.y = top;
    out.nx = nx;
    out.ny = ny;
    out.nz = nz;
    out.id = id;
  }
}

/**
 * Height of a ramp's sloped top at a local X, measured in world Y.
 *
 * `rise` is height gained above the base box across the ramp's own length, so the surface
 * runs from `center.y + halfExtents.y` at local -X to that plus `rise` at local +X. The
 * enclosing OBB that T-2.1 builds for the broadphase contains exactly this surface.
 */
export function rampTopAt(collider: Extract<Collider, { kind: 'ramp' }>, localX: number): number {
  const run = 2 * collider.halfExtents.x;
  const base = collider.center.y + collider.halfExtents.y;
  if (run <= EPSILON) return base + collider.rise;
  const t = (localX + collider.halfExtents.x) / run;
  return base + collider.rise * (t < 0 ? 0 : t > 1 ? 1 : t);
}

/**
 * Where the capsule's feet should go to climb onto the surface at `targetX, targetZ`, or
 * `Number.NEGATIVE_INFINITY` if it cannot: a kerb or single step is climbed automatically
 * up to `maxStep`, anything taller is a wall (PLAYER_ARCHITECTURE.md §3 step-up 0.35 m).
 *
 * `fits` decides whether the raised capsule is clear of geometry; the caller supplies it
 * so this file does not depend on the narrowphase (`sweep.ts` imports this one).
 */
export function stepUpTo(
  query: ColliderQuery,
  terrain: TerrainHeightFn,
  cap: { x: number; y: number; z: number; radius: number; height: number },
  targetX: number,
  targetZ: number,
  maxStep: number,
  candidates: ColliderId[],
  sample: GroundSample,
  fits: (x: number, y: number, z: number) => boolean,
): number {
  sampleGround(query, terrain, targetX, targetZ, cap.y + cap.height, candidates, sample);
  const rise = sample.y - cap.y;
  if (rise <= EPSILON || rise > maxStep) return Number.NEGATIVE_INFINITY;
  return fits(targetX, sample.y, targetZ) ? sample.y : Number.NEGATIVE_INFINITY;
}

/** Whether a surface normal is shallow enough to stand on. `maxSlopeCos = cos(angle)`. */
export function isWalkable(normalY: number, maxSlopeCos: number): boolean {
  // A hair of tolerance so a surface authored at exactly the limit is not excluded by
  // floating-point noise — a 45° ramp must be walkable when the limit is 45°.
  return normalY >= maxSlopeCos - 1e-6;
}

export { FLAT_TERRAIN };
