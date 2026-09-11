// The collision world: every static and movable collider, indexed for query
// (PLAYER_ARCHITECTURE.md §2).
//
// T-2.1 landed the shapes, the broadphase and the queries that read them. T-2.2 added
// `sweepCapsule` and `groundAt`, which delegate to `sweep.ts` and `ground.ts` so this file
// stays the API and they stay the maths. `sweepBox` is still absent: the documented
// signature takes an `OBB` and no task before the vehicle dynamics (T-5.4) has a caller
// for it, so it would be a method with no test and no user.

import type { Vector3 } from 'three';
import { UniformGrid } from '../utils/grid';
import type { GroundSample, TerrainHeightFn } from './ground';
import { FLAT_TERRAIN, sampleGround } from './ground';
import type { Capsule, SweepResult } from './sweep';
import { sweepCapsule } from './sweep';
import type { GridFootprint } from '../utils/grid';
import type {
  Collider,
  ColliderId,
  ColliderObb,
  ColliderOwner,
  ObbRayResult,
  RayHit,
} from './shapes';
import {
  createObb,
  createObbRayResult,
  obbFootprint,
  raycastObb,
  sphereOverlapsObb,
  toObb,
} from './shapes';
import { EPSILON } from '../utils/math';

/** Broadphase cell size in metres (PLAYER_ARCHITECTURE.md §2). */
export const CELL_SIZE = 8;

/** Grows only if a single query ever returns more colliders than any query before it. */
const INITIAL_CANDIDATES = 64;

interface Held {
  readonly collider: Collider;
  readonly obb: ColliderObb;
}

export class CollisionWorld {
  private readonly grid = new UniformGrid<ColliderId>(CELL_SIZE);
  private readonly held = new Map<ColliderId, Held>();
  private nextId: ColliderId = 1;

  /** Scratch, reused so queries allocate nothing. Queries are therefore not reentrant. */
  private readonly candidates: ColliderId[] = new Array<ColliderId>(INITIAL_CANDIDATES).fill(0);
  private readonly footprint: GridFootprint = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  private readonly queryBox: GridFootprint = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  private readonly rayResult: ObbRayResult = createObbRayResult();

  /**
   * A second candidate buffer: the sweep queries the broadphase repeatedly inside one
   * call, so it must not share scratch with `overlapSphere` or `raycast`.
   */
  private readonly sweepCandidates: ColliderId[] = new Array<ColliderId>(INITIAL_CANDIDATES).fill(
    0,
  );

  /**
   * Analytic terrain sampler behind `groundAt`. Flat until world installs the real one
   * (T-3.2); Phase 2's grey-box world is flat by design (`WORLD_DESIGN.md` §6).
   */
  private terrain: TerrainHeightFn = FLAT_TERRAIN;

  /** How many colliders the world holds. */
  get size(): number {
    return this.held.size;
  }

  /** Install the terrain height function. Called by world (T-3.2); flat before that. */
  setTerrain(terrain: TerrainHeightFn): void {
    this.terrain = terrain;
  }

  /**
   * Add a collider, optionally owned by a chunk so `removeChunk` can drop it in bulk.
   * The collider is resolved to its OBB once, here — not per query.
   */
  add(collider: Collider, ownerChunk?: ColliderOwner): ColliderId {
    const id = this.nextId;
    this.nextId++;

    const obb = createObb();
    toObb(collider, obb);
    this.held.set(id, { collider, obb });

    obbFootprint(obb, this.footprint);
    if (ownerChunk === undefined) this.grid.insert(id, this.footprint);
    else this.grid.insert(id, this.footprint, ownerChunk);

    return id;
  }

  /** Remove one collider. Unknown ids are ignored, so unload paths need no bookkeeping. */
  remove(id: ColliderId): void {
    if (!this.held.delete(id)) return;
    this.grid.remove(id);
  }

  /** Remove every collider added under `ownerChunk` — one chunk unloading, in one call. */
  removeChunk(ownerChunk: ColliderOwner): void {
    const removed = this.grid.removeOwner(ownerChunk, this.candidates);
    for (let i = 0; i < removed; i++) {
      const id = this.candidates[i];
      if (id === undefined) continue;
      this.held.delete(id);
    }
  }

  /** The collider behind an id, for the narrowphase and for debug drawing. */
  colliderOf(id: ColliderId): Collider | undefined {
    return this.held.get(id)?.collider;
  }

  /** The broadphase OBB behind an id: the volume that encloses the collider. */
  obbOf(id: ColliderId): ColliderObb | undefined {
    return this.held.get(id)?.obb;
  }

  /**
   * Broadphase only — every collider whose cells meet the XZ box, with no exact test.
   * This is what the sweep and the ground query walk; callers wanting an exact answer use
   * `overlapSphere`. Shares the same one-query-at-a-time contract as the rest.
   */
  queryFootprint(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    out: ColliderId[],
  ): number {
    this.queryBox.minX = minX;
    this.queryBox.maxX = maxX;
    this.queryBox.minZ = minZ;
    this.queryBox.maxZ = maxZ;
    return this.grid.query(this.queryBox, out);
  }

  /**
   * Move an upright capsule by a delta, sliding along whatever it meets
   * (PLAYER_ARCHITECTURE.md §2). The capsule is not modified.
   */
  sweepCapsule(cap: Capsule, dx: number, dy: number, dz: number, out: SweepResult): void {
    sweepCapsule(this, cap, dx, dy, dz, this.sweepCandidates, out);
  }

  /**
   * Height of the walkable surface at `x, z` — analytic terrain or a collider top,
   * whichever is higher without being above `ceiling`. Fills `out` with the slope normal
   * too, so callers can judge walkability without a second query.
   */
  groundAt(x: number, z: number, ceiling: number, out: GroundSample): number {
    sampleGround(this, this.terrain, x, z, ceiling, this.sweepCandidates, out);
    return out.y;
  }

  /**
   * Ids of every collider the sphere actually touches, written into `out` and counted by
   * the return value. Exact against each OBB, not just its grid cell.
   */
  overlapSphere(p: Vector3, r: number, out: ColliderId[]): number {
    this.footprint.minX = p.x - r;
    this.footprint.maxX = p.x + r;
    this.footprint.minZ = p.z - r;
    this.footprint.maxZ = p.z + r;

    const count = this.grid.query(this.footprint, this.candidates);
    let found = 0;
    for (let i = 0; i < count; i++) {
      const id = this.candidates[i];
      if (id === undefined) continue;
      const entry = this.held.get(id);
      if (entry === undefined) continue;
      if (!sphereOverlapsObb(entry.obb, p.x, p.y, p.z, r)) continue;
      out[found] = id;
      found++;
    }
    return found;
  }

  /**
   * Nearest collider hit along the ray within `maxDist`, filling `out`. `dir` is
   * normalised here, so callers may pass an unnormalised direction.
   *
   * Candidates come from the ray's XZ bounding box rather than a DDA walk of the cells:
   * at 8 m cells and the ray lengths this game uses (interaction probes, camera
   * occlusion) that is a handful of cells, and it keeps the traversal trivially correct.
   */
  raycast(origin: Vector3, dir: Vector3, maxDist: number, out: RayHit): boolean {
    const length = Math.hypot(dir.x, dir.y, dir.z);
    if (length < EPSILON || maxDist <= 0) return false;
    const dx = dir.x / length;
    const dy = dir.y / length;
    const dz = dir.z / length;

    const endX = origin.x + dx * maxDist;
    const endZ = origin.z + dz * maxDist;
    this.footprint.minX = Math.min(origin.x, endX);
    this.footprint.maxX = Math.max(origin.x, endX);
    this.footprint.minZ = Math.min(origin.z, endZ);
    this.footprint.maxZ = Math.max(origin.z, endZ);

    const count = this.grid.query(this.footprint, this.candidates);
    let bestDistance = maxDist;
    let bestId: ColliderId = -1;
    let nx = 0;
    let ny = 0;
    let nz = 0;

    for (let i = 0; i < count; i++) {
      const id = this.candidates[i];
      if (id === undefined) continue;
      const entry = this.held.get(id);
      if (entry === undefined) continue;
      if (!raycastObb(entry.obb, origin.x, origin.y, origin.z, dx, dy, dz, maxDist, this.rayResult))
        continue;
      if (this.rayResult.distance > bestDistance) continue;
      // Ties go to the first id examined; a tie means two coincident faces, where either
      // answer is as true as the other.
      if (this.rayResult.distance === bestDistance && bestId !== -1) continue;

      bestDistance = this.rayResult.distance;
      bestId = id;
      nx = this.rayResult.nx;
      ny = this.rayResult.ny;
      nz = this.rayResult.nz;
    }

    if (bestId === -1) return false;

    out.id = bestId;
    out.distance = bestDistance;
    out.point.set(
      origin.x + dx * bestDistance,
      origin.y + dy * bestDistance,
      origin.z + dz * bestDistance,
    );
    out.normal.set(nx, ny, nz);
    return true;
  }

  /** Drop every collider. Used by world teardown and by tests. */
  clear(): void {
    this.held.clear();
    this.grid.clear();
  }
}
