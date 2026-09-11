// T-2.1: the broadphase grid and the two collision queries that read it.
//
// Membership, bulk removal and query correctness, per `TASKS.md` T-2.1. The collision
// queries live here too because they are the grid's only real consumer — testing them
// against a synthetic grid would test the mock. Capsule sweeps, resolution and ground are
// T-2.2's and are not exercised here.

import { Vector2, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CELL_SIZE, CollisionWorld } from '../../src/physics/CollisionWorld';
import { createRayHit } from '../../src/physics/shapes';
import type { Collider, ColliderId } from '../../src/physics/shapes';
import { UniformGrid } from '../../src/utils/grid';

const around = (x: number, z: number, r = 0.5) => ({
  minX: x - r,
  maxX: x + r,
  minZ: z - r,
  maxZ: z + r,
});

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

describe('UniformGrid membership', () => {
  it('finds an inserted item and reports its own size', () => {
    const grid = new UniformGrid<string>(8);
    grid.insert('a', around(4, 4));
    grid.insert('b', around(40, 40));

    const out: string[] = [];
    expect(grid.size).toBe(2);
    expect(grid.query(around(4, 4), out)).toBe(1);
    expect(out[0]).toBe('a');
    expect(grid.query(around(40, 40), out)).toBe(1);
    expect(out[0]).toBe('b');
  });

  it('does not report an item in a cell it does not occupy', () => {
    const grid = new UniformGrid<string>(8);
    grid.insert('a', around(4, 4));

    const out: string[] = [];
    expect(grid.query(around(100, 100), out)).toBe(0);
  });

  it('reports an item spanning several cells exactly once', () => {
    const grid = new UniformGrid<string>(8);
    // 24 m wide: three cells across, two deep.
    grid.insert('wide', { minX: 0, maxX: 24, minZ: 0, maxZ: 9 });

    const out: string[] = [];
    expect(grid.query({ minX: 0, maxX: 24, minZ: 0, maxZ: 9 }, out)).toBe(1);
    expect(out[0]).toBe('wide');
  });

  it('removes an item from every cell it spanned', () => {
    const grid = new UniformGrid<string>(8);
    grid.insert('wide', { minX: 0, maxX: 24, minZ: 0, maxZ: 9 });

    expect(grid.remove('wide')).toBe(true);
    expect(grid.size).toBe(0);

    const out: string[] = [];
    expect(grid.query({ minX: 0, maxX: 24, minZ: 0, maxZ: 9 }, out)).toBe(0);
    // Removing something absent is a no-op, so unload paths need no bookkeeping.
    expect(grid.remove('wide')).toBe(false);
  });

  it('re-inserting an item replaces its footprint instead of leaving a ghost', () => {
    const grid = new UniformGrid<string>(8);
    grid.insert('mover', around(4, 4));
    grid.insert('mover', around(40, 40));

    const out: string[] = [];
    expect(grid.size).toBe(1);
    expect(grid.query(around(4, 4), out)).toBe(0);
    expect(grid.query(around(40, 40), out)).toBe(1);
  });

  it('indexes negative coordinates', () => {
    const grid = new UniformGrid<string>(8);
    grid.insert('left', around(-20, -20));

    const out: string[] = [];
    expect(grid.query(around(-20, -20), out)).toBe(1);
    expect(grid.query(around(20, 20), out)).toBe(0);
    expect(grid.cellIndex(-1)).toBe(-1);
    expect(grid.cellIndex(-8)).toBe(-1);
    expect(grid.cellIndex(0)).toBe(0);
  });

  it('rejects a non-positive cell size rather than dividing by zero later', () => {
    expect(() => new UniformGrid<string>(0)).toThrow(/cellSize/);
  });
});

describe('UniformGrid bulk removal', () => {
  it('removes only the named owner, and reports what it removed', () => {
    const grid = new UniformGrid<string>(8);
    grid.insert('a1', around(4, 4), 'chunk_a');
    grid.insert('a2', around(12, 4), 'chunk_a');
    grid.insert('b1', around(20, 4), 'chunk_b');
    grid.insert('loose', around(28, 4));

    const removed: string[] = [];
    expect(grid.removeOwner('chunk_a', removed)).toBe(2);
    expect(removed.slice(0, 2).sort()).toEqual(['a1', 'a2']);
    expect(grid.size).toBe(2);

    const out: string[] = [];
    expect(grid.query(around(4, 4), out)).toBe(0);
    expect(grid.query(around(12, 4), out)).toBe(0);
    expect(grid.query(around(20, 4), out)).toBe(1);
    expect(grid.query(around(28, 4), out)).toBe(1);
  });

  it('treats an unknown owner as nothing to do', () => {
    const grid = new UniformGrid<string>(8);
    grid.insert('a1', around(4, 4), 'chunk_a');

    const removed: string[] = [];
    expect(grid.removeOwner('chunk_z', removed)).toBe(0);
    expect(grid.size).toBe(1);
  });

  it('forgets an owner once its last item is removed individually', () => {
    const grid = new UniformGrid<string>(8);
    grid.insert('a1', around(4, 4), 'chunk_a');
    grid.remove('a1');

    const removed: string[] = [];
    expect(grid.removeOwner('chunk_a', removed)).toBe(0);
  });
});

describe('CollisionWorld query correctness', () => {
  it('uses the documented 8 m broadphase cells', () => {
    expect(CELL_SIZE).toBe(8);
  });

  it('reports a sphere touching a box and not one merely near it', () => {
    const world = new CollisionWorld();
    const id = world.add(box([0, 0, 0], [0.5, 0.5, 0.5]));

    const out: ColliderId[] = [];
    // Nearest face is at x = 0.5, so a 0.4 m sphere centred at x = 1 falls 0.1 m short.
    expect(world.overlapSphere(new Vector3(1, 0, 0), 0.4, out)).toBe(0);
    expect(world.overlapSphere(new Vector3(1, 0, 0), 0.6, out)).toBe(1);
    expect(out[0]).toBe(id);
  });

  it('respects yaw — a point inside the AABB but outside the OBB is a miss', () => {
    const world = new CollisionWorld();
    world.add(box([0, 0, 0], [2, 0.5, 0.5], Math.PI / 4));

    const out: ColliderId[] = [];
    // (1.7, 1.7) is inside the rotated box's axis-aligned bounds (±1.77) but 1.9 m off
    // its surface, so only an exact test rejects it.
    expect(world.overlapSphere(new Vector3(1.7, 0, 1.7), 0.3, out)).toBe(0);
    // Along the box's own long axis it is a hit at the same distance from the centre.
    expect(world.overlapSphere(new Vector3(1.2, 0, -1.2), 0.3, out)).toBe(1);
  });

  it('treats a wall as a thin OBB along a → b with its base on the ground', () => {
    const world = new CollisionWorld();
    world.add({
      kind: 'wall',
      a: new Vector2(0, 0),
      b: new Vector2(4, 0),
      height: 3,
      thickness: 0.4,
    });

    const out: ColliderId[] = [];
    // 0.2 m half thickness: 0.35 m out is within reach of a 0.2 m sphere, 0.5 m is not.
    expect(world.overlapSphere(new Vector3(2, 1.5, 0.35), 0.2, out)).toBe(1);
    expect(world.overlapSphere(new Vector3(2, 1.5, 0.5), 0.2, out)).toBe(0);
    // Above the wall is a miss, which is the Y interval doing its job.
    expect(world.overlapSphere(new Vector3(2, 4, 0), 0.2, out)).toBe(0);
    // Past its end too.
    expect(world.overlapSphere(new Vector3(4.5, 1.5, 0), 0.2, out)).toBe(0);
  });

  it("encloses a ramp's rise, so its top is solid and above it is not", () => {
    const world = new CollisionWorld();
    world.add({
      kind: 'ramp',
      center: new Vector3(0, 0, 0),
      halfExtents: new Vector3(1, 0.5, 1),
      yaw: 0,
      rise: 1,
    });

    const out: ColliderId[] = [];
    // Base box tops out at 0.5; the rise carries the enclosing volume to 1.5.
    expect(world.overlapSphere(new Vector3(0, 1.4, 0), 0.05, out)).toBe(1);
    expect(world.overlapSphere(new Vector3(0, 1.6, 0), 0.05, out)).toBe(0);
  });

  it('finds every collider a sphere spans, across cell boundaries', () => {
    const world = new CollisionWorld();
    // Straddling x = 8, the first cell boundary.
    const left = world.add(box([7.5, 0, 0], [0.5, 0.5, 0.5]));
    const right = world.add(box([8.5, 0, 0], [0.5, 0.5, 0.5]));

    const out: ColliderId[] = [];
    expect(world.overlapSphere(new Vector3(8, 0, 0), 0.2, out)).toBe(2);
    expect(out.slice(0, 2).sort()).toEqual([left, right].sort());
  });

  it('raycast returns the nearest hit with its distance and face normal', () => {
    const world = new CollisionWorld();
    const near = world.add(box([5, 0, 0], [1, 1, 1]));
    world.add(box([10, 0, 0], [1, 1, 1]));

    const hit = createRayHit();
    expect(world.raycast(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 20, hit)).toBe(true);
    expect(hit.id).toBe(near);
    expect(hit.distance).toBeCloseTo(4, 10);
    expect(hit.point.x).toBeCloseTo(4, 10);
    expect([hit.normal.x, hit.normal.y, hit.normal.z]).toEqual([-1, 0, 0]);
  });

  it('raycast normalises the direction, so distance is always metres', () => {
    const world = new CollisionWorld();
    world.add(box([5, 0, 0], [1, 1, 1]));

    const hit = createRayHit();
    expect(world.raycast(new Vector3(0, 0, 0), new Vector3(3, 0, 0), 20, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(4, 10);
  });

  it('raycast honours maxDist and direction', () => {
    const world = new CollisionWorld();
    world.add(box([5, 0, 0], [1, 1, 1]));

    const hit = createRayHit();
    expect(world.raycast(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 3, hit)).toBe(false);
    expect(world.raycast(new Vector3(0, 0, 0), new Vector3(-1, 0, 0), 20, hit)).toBe(false);
    expect(world.raycast(new Vector3(0, 0, 0), new Vector3(0, 0, 0), 20, hit)).toBe(false);
  });

  it('raycast from inside a collider reports contact at zero distance', () => {
    const world = new CollisionWorld();
    const id = world.add(box([5, 0, 0], [1, 1, 1]));

    const hit = createRayHit();
    expect(world.raycast(new Vector3(5, 0, 0), new Vector3(1, 0, 0), 20, hit)).toBe(true);
    expect(hit.id).toBe(id);
    expect(hit.distance).toBe(0);
    // Facing back down the ray: there is no surface to report from inside. Compared
    // component-wise because negating a zero component yields -0.
    expect(hit.normal.x).toBeCloseTo(-1, 10);
    expect(hit.normal.y).toBeCloseTo(0, 10);
    expect(hit.normal.z).toBeCloseTo(0, 10);
  });

  it('raycast against an empty world is a miss, not a throw', () => {
    const world = new CollisionWorld();
    const hit = createRayHit();
    expect(world.raycast(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 20, hit)).toBe(false);
  });

  it('removes one collider by id and a whole chunk in bulk', () => {
    const world = new CollisionWorld();
    const a = world.add(box([2, 0, 0], [0.5, 0.5, 0.5]), 'chunk_a');
    world.add(box([4, 0, 0], [0.5, 0.5, 0.5]), 'chunk_a');
    const b = world.add(box([6, 0, 0], [0.5, 0.5, 0.5]), 'chunk_b');

    const out: ColliderId[] = [];
    expect(world.size).toBe(3);
    expect(world.colliderOf(a)?.kind).toBe('box');

    world.remove(a);
    expect(world.size).toBe(2);
    expect(world.colliderOf(a)).toBeUndefined();
    expect(world.overlapSphere(new Vector3(2, 0, 0), 0.2, out)).toBe(0);

    world.removeChunk('chunk_a');
    expect(world.size).toBe(1);
    expect(world.overlapSphere(new Vector3(4, 0, 0), 0.2, out)).toBe(0);
    expect(world.overlapSphere(new Vector3(6, 0, 0), 0.2, out)).toBe(1);
    expect(out[0]).toBe(b);

    // Removing an unknown id or an already-removed chunk changes nothing.
    world.remove(999);
    world.removeChunk('chunk_a');
    expect(world.size).toBe(1);
  });

  it('clear empties the world and its grid', () => {
    const world = new CollisionWorld();
    world.add(box([0, 0, 0], [1, 1, 1]));
    world.clear();

    const out: ColliderId[] = [];
    expect(world.size).toBe(0);
    expect(world.overlapSphere(new Vector3(0, 0, 0), 2, out)).toBe(0);
  });
});
