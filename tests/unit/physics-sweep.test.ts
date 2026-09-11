// T-2.2: the eight cases `TASKS.md` names for capsule sweep, resolution and ground.
//
// Run against the real CollisionWorld rather than a stubbed query: the sweep's whole job
// is to be correct over the broadphase, and a mock broadphase would test the mock.

import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../../src/physics/CollisionWorld';
import { createGroundSample, isWalkable, stepUpTo } from '../../src/physics/ground';
import { FLAT_TERRAIN } from '../../src/physics/ground';
import {
  SUBSTEP_RADIUS_FRACTION,
  createCapsule,
  createSweepResult,
  isCapsuleFree,
  resolvePenetration,
} from '../../src/physics/sweep';
import type { Capsule } from '../../src/physics/sweep';
import type { Collider, ColliderId } from '../../src/physics/shapes';

const RADIUS = 0.35;
const HEIGHT = 1.8;

function box(
  center: [number, number, number],
  halfExtents: [number, number, number],
  yaw = 0,
): Collider {
  return {
    kind: 'box',
    center: new Vector3(...center),
    halfExtents: new Vector3(...halfExtents),
    yaw,
  };
}

function ramp(degrees: number, halfLength = 1): Collider {
  // rise / run = tan(angle), so a ramp of the requested pitch.
  return {
    kind: 'ramp',
    center: new Vector3(0, 0, 0),
    halfExtents: new Vector3(halfLength, 0, 2),
    yaw: 0,
    rise: 2 * halfLength * Math.tan((degrees * Math.PI) / 180),
  };
}

function capsuleAt(x: number, y: number, z: number): Capsule {
  const cap = createCapsule(RADIUS, HEIGHT);
  cap.x = x;
  cap.y = y;
  cap.z = z;
  return cap;
}

describe('capsule resolution', () => {
  it('resolves penetration by pushing the capsule clear', () => {
    const world = new CollisionWorld();
    world.add(box([0, 1, 0], [1, 1, 1]));

    // Feet inside the block, axis overlapping it.
    const cap = capsuleAt(0.5, 0.5, 0);
    const result = createSweepResult();
    const scratch: ColliderId[] = [];

    expect(resolvePenetration(world, cap, scratch, result)).toBeGreaterThan(0);

    const resolved = capsuleAt(result.x, result.y, result.z);
    expect(isCapsuleFree(world, resolved, scratch)).toBe(true);
    // The caller's capsule is untouched — queries report, they do not move things.
    expect(cap.x).toBe(0.5);
  });

  it('slides along a wall instead of stopping dead', () => {
    const world = new CollisionWorld();
    // Wall spanning x, its face at z = -0.25.
    world.add(box([0, 0, 0], [5, 2, 0.25]));

    const cap = capsuleAt(0, 0, -1);
    const result = createSweepResult();
    world.sweepCapsule(cap, 1, 0, 1, result);

    expect(result.hit).toBe(true);
    // Blocked in z at one radius from the face, but the tangential metre is preserved.
    expect(result.z).toBeLessThan(-0.55);
    expect(result.z).toBeGreaterThan(-0.65);
    expect(result.x).toBeGreaterThan(0.9);
    expect(result.noProgress).toBe(false);
  });

  it('is stable in a corner over 300 steps — no jitter', () => {
    const world = new CollisionWorld();
    world.add(box([0, 0, 0], [5, 2, 0.25])); // wall along x
    world.add(box([0, 0, 0], [0.25, 2, 5])); // wall along z

    const cap = capsuleAt(-1, 0, -1);
    const result = createSweepResult();
    const seen: number[] = [];

    for (let step = 0; step < 300; step++) {
      world.sweepCapsule(cap, 0.05, 0, 0.05, result);
      cap.x = result.x;
      cap.y = result.y;
      cap.z = result.z;
      if (step >= 200) seen.push(cap.x, cap.z);
    }

    expect(Number.isFinite(cap.x)).toBe(true);
    expect(Number.isFinite(cap.z)).toBe(true);
    // Every late step must land on exactly the same point: settled, not oscillating.
    const [restX, restZ] = [seen[0] ?? NaN, seen[1] ?? NaN];
    for (let i = 0; i < seen.length; i += 2) {
      expect(seen[i]).toBeCloseTo(restX, 9);
      expect(seen[i + 1]).toBeCloseTo(restZ, 9);
    }
    // And it must have settled outside both walls, not inside the corner.
    expect(restX).toBeLessThan(-0.55);
    expect(restZ).toBeLessThan(-0.55);
  });

  it('does not tunnel through a thin wall at 30 m/s', () => {
    const world = new CollisionWorld();
    // 0.2 m thick, the classic tunnelling victim.
    world.add(box([2, 0, 0], [0.1, 2, 5]));

    // 30 m/s for one 60 Hz step is 0.5 m — far more than the 0.2 m wall is thick.
    const perStep = 30 / 60;
    expect(perStep).toBeGreaterThan(SUBSTEP_RADIUS_FRACTION * RADIUS);

    const cap = capsuleAt(1, 0, 0);
    const result = createSweepResult();

    // Ten steps at that speed, each one larger than the wall is thick.
    for (let step = 0; step < 10; step++) {
      world.sweepCapsule(cap, perStep, 0, 0, result);
      cap.x = result.x;
      cap.y = result.y;
      cap.z = result.z;
      // It must never be found on the far side, on any step.
      expect(cap.x).toBeLessThan(1.9);
    }

    expect(result.hit).toBe(true);
    // Settled against the near face, one radius out.
    expect(cap.x).toBeCloseTo(1.9 - RADIUS, 2);
  });

  it('reports no progress when a delta achieves nothing', () => {
    const world = new CollisionWorld();
    world.add(box([0, 0, 0], [5, 2, 0.25]));

    // Already against the wall, pushing straight into it.
    const cap = capsuleAt(0, 0, -0.6);
    const result = createSweepResult();
    world.sweepCapsule(cap, 0, 0, 0.2, result);

    expect(result.hit).toBe(true);
    expect(result.noProgress).toBe(true);
  });
});

describe('ground', () => {
  it('is analytic and flat before terrain is installed', () => {
    const world = new CollisionWorld();
    const sample = createGroundSample();

    expect(world.groundAt(12, -40, 2, sample)).toBe(0);
    expect(sample.id).toBe(-1);
    expect([sample.nx, sample.ny, sample.nz]).toEqual([0, 1, 0]);
  });

  it('takes the analytic height from the installed terrain function', () => {
    const world = new CollisionWorld();
    world.setTerrain((x) => x * 0.1);
    const sample = createGroundSample();

    expect(world.groundAt(20, 0, 10, sample)).toBeCloseTo(2, 10);
    world.setTerrain(FLAT_TERRAIN);
    expect(world.groundAt(20, 0, 10, sample)).toBe(0);
  });

  it('stands on collider tops, and ignores the ones above the ceiling', () => {
    const world = new CollisionWorld();
    const platform = world.add(box([0, 0.5, 0], [1, 0.5, 1])); // top at y = 1

    const sample = createGroundSample();
    expect(world.groundAt(0, 0, 2, sample)).toBeCloseTo(1, 10);
    expect(sample.id).toBe(platform);

    // A ceiling below the top means that surface is overhead, not underfoot.
    expect(world.groundAt(0, 0, 0.5, sample)).toBe(0);
    expect(sample.id).toBe(-1);

    // Beside the platform it is terrain again.
    expect(world.groundAt(5, 0, 0, sample)).toBe(0);
  });

  it('reads a ramp as a slope, so 45° is walkable and 50° is not', () => {
    const maxSlopeCos = Math.cos((45 * Math.PI) / 180);
    const sample = createGroundSample();

    const gentle = new CollisionWorld();
    gentle.add(ramp(45));
    gentle.groundAt(0, 0, 5, sample);
    expect(sample.ny).toBeCloseTo(Math.cos((45 * Math.PI) / 180), 6);
    expect(isWalkable(sample.ny, maxSlopeCos)).toBe(true);
    // Halfway along a 45° ramp of run 2 the surface is 1 m up.
    expect(sample.y).toBeCloseTo(1, 6);

    const steep = new CollisionWorld();
    steep.add(ramp(50));
    steep.groundAt(0, 0, 5, sample);
    expect(sample.ny).toBeCloseTo(Math.cos((50 * Math.PI) / 180), 6);
    expect(isWalkable(sample.ny, maxSlopeCos)).toBe(false);
  });

  it('climbs the ramp surface from its low edge to its high edge', () => {
    const world = new CollisionWorld();
    world.add(ramp(45));
    const sample = createGroundSample();

    expect(world.groundAt(-1, 0, 5, sample)).toBeCloseTo(0, 6);
    expect(world.groundAt(1, 0, 5, sample)).toBeCloseTo(2, 6);
  });
});

describe('step-up', () => {
  const scratch: ColliderId[] = [];
  const sample = createGroundSample();
  const result = createSweepResult();

  function fitsIn(world: CollisionWorld) {
    return (x: number, y: number, z: number) => isCapsuleFree(world, capsuleAt(x, y, z), scratch);
  }

  it('steps up onto a 0.35 m kerb', () => {
    const world = new CollisionWorld();
    world.add(box([2, 0.175, 0], [1, 0.175, 1])); // top at 0.35

    const cap = capsuleAt(0.8, 0, 0);
    const y = stepUpTo(world, FLAT_TERRAIN, cap, 2, 0, 0.35, scratch, sample, fitsIn(world));
    expect(y).toBeCloseTo(0.35, 10);
  });

  it('refuses to step up onto a 0.5 m ledge', () => {
    const world = new CollisionWorld();
    world.add(box([2, 0.25, 0], [1, 0.25, 1])); // top at 0.5

    const cap = capsuleAt(0.8, 0, 0);
    const y = stepUpTo(world, FLAT_TERRAIN, cap, 2, 0, 0.35, scratch, sample, fitsIn(world));
    expect(y).toBe(Number.NEGATIVE_INFINITY);
  });

  it('refuses a step whose landing is not free', () => {
    const world = new CollisionWorld();
    world.add(box([2, 0.175, 0], [1, 0.175, 1])); // a 0.35 m step
    world.add(box([2, 1.2, 0], [1, 0.4, 1])); // with a slab right above it

    const cap = capsuleAt(0.8, 0, 0);
    const y = stepUpTo(world, FLAT_TERRAIN, cap, 2, 0, 0.35, scratch, sample, fitsIn(world));
    expect(y).toBe(Number.NEGATIVE_INFINITY);
    // The step itself is still the ground there; only the capsule does not fit.
    expect(resolvePenetration(world, capsuleAt(2, 0.35, 0), scratch, result)).toBeGreaterThan(0);
  });
});
