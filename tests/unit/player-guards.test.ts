// T-2.9: one test per failure mode in PLAYER_ARCHITECTURE.md §9.
//
// These are the six bugs every third-person controller ships at least once. Each is
// guarded explicitly in `src/physics/`, and each guard is pinned here — because the whole
// point of the table in §9 is that these must not be left to fall out of some other rule
// by luck.

import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../../src/physics/CollisionWorld';
import { PhysicsSystem } from '../../src/physics/PhysicsSystem';
import { PlayerSystem } from '../../src/player/PlayerSystem';
import { FLOOR_TOLERANCE, clampPush } from '../../src/physics/guards';
import { SUBSTEP_RADIUS_FRACTION, createCapsule, createSweepResult } from '../../src/physics/sweep';
import { createGroundSample } from '../../src/physics/ground';
import { createInitialState } from '../../src/core/state';
import { createInputState } from '../../src/input/InputState';
import { PLAYER } from '../../src/data/balance';
import type { Collider, ColliderId } from '../../src/physics/shapes';
import type { GameContext } from '../../src/core/GameContext';

function box(center: [number, number, number], halfExtents: [number, number, number]): Collider {
  return {
    kind: 'box',
    center: new Vector3(...center),
    halfExtents: new Vector3(...halfExtents),
    yaw: 0,
  };
}

function capsuleAt(x: number, y: number, z: number) {
  const cap = createCapsule(PLAYER.radius, PLAYER.height);
  cap.x = x;
  cap.y = y;
  cap.z = z;
  return cap;
}

function playerRig(colliders: Collider[] = [], spawn: [number, number, number] = [0, 0, 0]) {
  const physics = new PhysicsSystem();
  for (const collider of colliders) physics.world.add(collider);
  const input = createInputState();
  const state = createInitialState();
  const ctx = {
    scene: new Scene(),
    state,
    get: (id: string) =>
      id === 'physics'
        ? physics
        : { id: 'input', state: input, init: () => undefined, dispose: () => undefined },
  } as unknown as GameContext;
  const player = new PlayerSystem({ spawn });
  player.init(ctx);
  return { physics, player, input, state, ctx };
}

describe('guard 1 — falling through the ground', () => {
  it('never lets the feet go below the floor tolerance, however hard it is pushed', () => {
    const rig = playerRig();
    // Drive the player deep underground and step: the clamp must recover it.
    rig.player.teleport(0, -50, 0);
    rig.player.fixedUpdate(1 / 60, rig.ctx);

    expect(rig.state.player.position.y).toBeGreaterThanOrEqual(-FLOOR_TOLERANCE - 1e-9);
    expect(FLOOR_TOLERANCE).toBe(0.05);
  });

  it('holds on a raised floor too, not just at y = 0', () => {
    const rig = playerRig([box([0, 1, 0], [4, 1, 4])]); // top at y = 2
    rig.player.teleport(0, -5, 0);
    for (let i = 0; i < 5; i++) rig.player.fixedUpdate(1 / 60, rig.ctx);
    expect(rig.state.player.position.y).toBeGreaterThanOrEqual(2 - FLOOR_TOLERANCE - 1e-9);
  });

  it('survives a long fall without passing through the ground on any step', () => {
    const rig = playerRig();
    rig.player.teleport(0, 40, 0);
    for (let i = 0; i < 300; i++) {
      rig.player.fixedUpdate(1 / 60, rig.ctx);
      expect(rig.state.player.position.y).toBeGreaterThanOrEqual(-FLOOR_TOLERANCE - 1e-9);
    }
    expect(rig.player.view.grounded).toBe(true);
  });
});

describe('guard 2 — stuck in geometry after a chunk build', () => {
  it('pushes the capsule out when a collider is inserted on top of it', () => {
    const rig = playerRig();
    for (let i = 0; i < 3; i++) rig.player.fixedUpdate(1 / 60, rig.ctx);

    // A chunk builds a wall exactly where the player is standing.
    rig.physics.world.add(box([0, 1.5, 0], [1, 1.5, 1]));
    for (let i = 0; i < 20; i++) rig.player.fixedUpdate(1 / 60, rig.ctx);

    // It is outside the block rather than inside it.
    const { x, z } = rig.state.player.position;
    const outside = Math.abs(x) > 1 - 1e-6 || Math.abs(z) > 1 - 1e-6;
    expect(outside).toBe(true);
  });

  it('resolves a capsule that starts overlapping, without moving the caller', () => {
    const world = new CollisionWorld();
    world.add(box([0, 1, 0], [1, 1, 1]));
    const cap = capsuleAt(0.4, 0.5, 0);
    const result = createSweepResult();
    const scratch: ColliderId[] = [];

    world.sweepCapsule(cap, 0, 0, 0, result);
    expect(result.hit).toBe(true);
    expect(cap.x).toBe(0.4);

    // The resolved position is clear.
    const moved = capsuleAt(result.x, result.y, result.z);
    world.sweepCapsule(moved, 0, 0, 0, result);
    expect(result.contactCount).toBe(0);
    void scratch;
  });
});

describe('guard 3 — stuck in a corner', () => {
  it('nudges along the bisector when the resolver runs out of iterations', () => {
    const world = new CollisionWorld();
    // A tight wedge: each push-out drives the capsule into the other face.
    world.add(box([0, 1.5, 0.55], [3, 1.5, 0.25]));
    world.add(box([0.55, 1.5, 0], [0.25, 1.5, 3]));

    const cap = capsuleAt(0.35, 0, 0.35);
    const result = createSweepResult();
    world.sweepCapsule(cap, 0, 0, 0, result);

    // Two contacts and still overlapping, so the nudge is what gets it out.
    expect(result.contactCount).toBeGreaterThanOrEqual(2);
    const escaped = capsuleAt(result.x, result.y, result.z);
    const after = createSweepResult();
    world.sweepCapsule(escaped, 0, 0, 0, after);
    expect(after.contactCount).toBe(0);
  });

  it('does not nudge merely because a wall stopped progress', () => {
    const world = new CollisionWorld();
    world.add(box([0, 1.5, -3], [6, 1.5, 0.25]));

    const cap = capsuleAt(0, 0, -2.4);
    const result = createSweepResult();
    world.sweepCapsule(cap, 0, 0, -0.2, result);

    // Blocked, yes — but resolved, so no nudge. Nudging here would be the jitter the
    // guard exists to prevent.
    expect(result.hit).toBe(true);
    expect(result.noProgress).toBe(true);
    expect(result.nudged).toBe(false);
  });
});

describe('guard 4 — launched by a moving vehicle', () => {
  it('clamps the magnitude of a push', () => {
    const out = { x: 0, y: 0, z: 0 };
    clampPush(100, 0, 0, 3, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(3, 9);

    clampPush(1, 0, 0, 3, out);
    expect(out.x).toBeCloseTo(1, 9);
  });

  it('never applies a vertical impulse, however vertical the push', () => {
    const out = { x: 0, y: 0, z: 0 };
    clampPush(0, 999, 0, 3, out);
    expect(out.y).toBe(0);
    expect(out.x).toBe(0);
    expect(out.z).toBe(0);

    clampPush(2, 999, 2, 3, out);
    expect(out.y).toBe(0);
    // The horizontal part passes through untouched: it is under the cap on its own. Had
    // the vertical been included in the magnitude before clamping, this 2.83 m/s shove
    // would have been scaled by 3/999 and all but vanished.
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(Math.hypot(2, 2), 9);
    expect(out.x).toBeCloseTo(2, 9);
  });
});

describe('guard 5 — tunnelling at speed', () => {
  it('bounds the sub-step to a quarter of the radius', () => {
    expect(SUBSTEP_RADIUS_FRACTION).toBe(0.25);
  });

  it('a player sprinting at a thin wall does not pass through it', () => {
    // 0.2 m thick and the player is doing 30 m/s: 0.5 m per step, well past it.
    const rig = playerRig([box([0, 1.5, -4], [6, 1.5, 0.1])]);
    rig.player.teleport(0, 0, 0);

    // Teleport-stepping at 30 m/s, which is faster than the controller can run, so the
    // sweep is doing the work rather than the speed cap.
    for (let step = 0; step < 40; step++) {
      const cap = rig.player.debugCapsule();
      const result = createSweepResult();
      rig.physics.world.sweepCapsule(cap, 0, 0, -30 / 60, result);
      rig.player.teleport(result.x, result.y, result.z);
      // Never on the far side of the wall.
      expect(result.z).toBeGreaterThan(-4);
    }
  });
});

describe('guard 6 — teleport or load into solid', () => {
  it('moves a spawn inside a wall to the nearest free position', () => {
    const world = new CollisionWorld();
    world.add(box([0, 1.5, 0], [1, 1.5, 1]));

    const out = { x: 0, y: 0, z: 0 };
    const found = world.findFreeSpawn(capsuleAt(0, 0, 0), PLAYER.radius * 2, out);

    expect(found).toBe(true);
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(1);
    // And the answer really is free.
    const result = createSweepResult();
    world.sweepCapsule(capsuleAt(out.x, out.y, out.z), 0, 0, 0, result);
    expect(result.contactCount).toBe(0);
  });

  it('leaves a spawn that is already free exactly where it is', () => {
    const world = new CollisionWorld();
    world.add(box([10, 1.5, 10], [1, 1.5, 1]));

    const out = { x: -1, y: -1, z: -1 };
    expect(world.findFreeSpawn(capsuleAt(0, 0, 0), 0.7, out)).toBe(true);
    expect([out.x, out.y, out.z]).toEqual([0, 0, 0]);
  });

  it('reports failure rather than returning a solid position', () => {
    const world = new CollisionWorld();
    // Solid for far further than the search rings reach.
    world.add(box([0, 1.5, 0], [200, 1.5, 200]));

    const out = { x: 0, y: 0, z: 0 };
    expect(world.findFreeSpawn(capsuleAt(0, 0, 0), 0.7, out)).toBe(false);
  });

  it('the player uses it, so a spawn in a wall does not start the game stuck', () => {
    const rig = playerRig([box([0, 1.5, 0], [1, 1.5, 1])], [0, 0, 0]);
    const start = rig.state.player.position;
    expect(Math.hypot(start.x, start.z)).toBeGreaterThan(1);

    const sample = createGroundSample();
    expect(rig.physics.world.groundAt(start.x, start.z, 5, sample)).toBeLessThanOrEqual(3);
  });
});
