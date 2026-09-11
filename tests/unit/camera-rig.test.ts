// T-2.6. Its documented validation is manual plus typecheck; the arithmetic and the probe
// are asserted here because they are the parts that can be wrong silently — a pitch clamp
// off by a sign, or a probe that lets the camera into a wall, is not obvious on screen
// until it is. The *feel* is still T-2.7's manual pass.

import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraSystem } from '../../src/camera/CameraSystem';
import {
  PITCH_MAX,
  PITCH_MIN,
  applyLook,
  applyZoom,
  approach,
  createRig,
  easeDistance,
  orbitDirection,
  wrapAngle,
} from '../../src/camera/rig';
import { probeDistance } from '../../src/camera/probe';
import { CAMERA } from '../../src/data/balance';
import { CollisionWorld } from '../../src/physics/CollisionWorld';
import { PhysicsSystem } from '../../src/physics/PhysicsSystem';
import { createRayHit } from '../../src/physics/shapes';
import { createInputState } from '../../src/input/InputState';
import { createInitialState } from '../../src/core/state';
import type { GameContext } from '../../src/core/GameContext';
import type { Collider } from '../../src/physics/shapes';

function wall(center: [number, number, number], halfExtents: [number, number, number]): Collider {
  return {
    kind: 'box',
    center: new Vector3(...center),
    halfExtents: new Vector3(...halfExtents),
    yaw: 0,
  };
}

describe('rig maths', () => {
  it('smooths at a rate set by tau, not by frame count', () => {
    // Same elapsed time in one big step or many small ones lands in the same place.
    let coarse = 0;
    coarse = approach(coarse, 1, 0.1, 0.5);

    let fine = 0;
    for (let i = 0; i < 50; i++) fine = approach(fine, 1, 0.1, 0.01);

    expect(fine).toBeCloseTo(coarse, 2);
    // And after one tau it has covered roughly 63%.
    expect(approach(0, 1, 0.1, 0.1)).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it('clamps pitch to the documented walk range', () => {
    const rig = createRig();
    // Mouse down, hard: pitch stops at the lower clamp rather than going under the ground.
    for (let i = 0; i < 200; i++) applyLook(rig, 0, 500);
    expect(rig.pitch).toBeCloseTo(PITCH_MIN, 9);
    expect(PITCH_MIN).toBeCloseTo((-35 * Math.PI) / 180, 9);

    for (let i = 0; i < 200; i++) applyLook(rig, 0, -500);
    expect(rig.pitch).toBeCloseTo(PITCH_MAX, 9);
    expect(PITCH_MAX).toBeCloseTo((70 * Math.PI) / 180, 9);
  });

  it('does not scale the mouse delta by dt', () => {
    // There is no dt in the signature at all, and the same delta always turns the camera
    // by the same angle — which is the whole point of CODING_RULES.md's callout.
    const rig = createRig();
    applyLook(rig, 100, 0);
    expect(rig.yaw).toBeCloseTo(-100 * CAMERA.sensitivity, 9);

    const again = createRig();
    for (let i = 0; i < 10; i++) applyLook(again, 10, 0);
    expect(again.yaw).toBeCloseTo(-100 * CAMERA.sensitivity, 9);
  });

  it('wraps yaw into (-pi, pi]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 9);

    const rig = createRig();
    for (let i = 0; i < 100; i++) applyLook(rig, 1000, 0);
    expect(rig.yaw).toBeGreaterThan(-Math.PI - 1e-9);
    expect(rig.yaw).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  it('keeps wheel zoom inside the mode range', () => {
    const rig = createRig();
    for (let i = 0; i < 1000; i++) applyZoom(rig, 100);
    expect(rig.desiredDistance).toBe(CAMERA.walk.maxDistance);
    for (let i = 0; i < 1000; i++) applyZoom(rig, -100);
    expect(rig.desiredDistance).toBe(CAMERA.walk.minDistance);
  });

  it('pulls in immediately and pushes out slowly', () => {
    const rig = createRig();
    rig.distance = 4;

    // Obstruction: taken at once, so the camera cannot clip.
    easeDistance(rig, 1.5, 1 / 60);
    expect(rig.distance).toBe(1.5);

    // Clear again: eased back, so it does not pump along a wall.
    easeDistance(rig, 4, 1 / 60);
    expect(rig.distance).toBeGreaterThan(1.5);
    expect(rig.distance).toBeLessThan(2.1);
  });

  it('puts the camera behind the player at yaw zero', () => {
    const rig = createRig();
    rig.pitch = 0;
    const out = { x: 0, y: 0, z: 0 };
    orbitDirection(rig, out);
    // The player's forward is -Z, so the camera sits at +Z.
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.z).toBeCloseTo(1, 9);
  });
});

describe('collision probe', () => {
  it('allows the full distance in the open', () => {
    const world = new CollisionWorld();
    const hit = createRayHit();
    expect(probeDistance(world, 0, 2, 0, 0, 0, 1, 4, hit)).toBe(4);
  });

  it('pulls in to just short of an obstruction', () => {
    const world = new CollisionWorld();
    // A wall 3 m behind the anchor, facing it.
    world.add(wall([0, 2, 3], [4, 2, 0.25]));

    const hit = createRayHit();
    const allowed = probeDistance(world, 0, 2, 0, 0, 0, 1, 4, hit);
    // Face at z = 2.75, less the probe radius.
    expect(allowed).toBeCloseTo(2.75 - CAMERA.probeRadius, 6);
  });

  it('catches a corner the centre ray misses', () => {
    const world = new CollisionWorld();
    // A pillar offset to the side: the centre ray goes past it, a ring ray does not.
    world.add(wall([0.3, 2, 3], [0.1, 2, 0.1]));

    const hit = createRayHit();
    const centreOnly = world.raycast(new Vector3(0, 2, 0), new Vector3(0, 0, 1), 4, hit);
    expect(centreOnly).toBe(false);

    const allowed = probeDistance(world, 0, 2, 0, 0, 0, 1, 4, hit);
    expect(allowed).toBeLessThan(4);
  });
});

describe('CameraSystem', () => {
  function rig(colliders: Collider[] = []) {
    const physics = new PhysicsSystem();
    for (const collider of colliders) physics.world.add(collider);

    const input = createInputState();
    const playerPosition = new Vector3(0, 0, 0);
    const player = {
      id: 'player' as const,
      view: { position: playerPosition, isDriving: false },
      init: () => undefined,
      dispose: () => undefined,
    };
    const camera = new PerspectiveCamera(60, 1.6, 0.15, 600);
    const ctx = {
      scene: new Scene(),
      camera,
      state: createInitialState(),
      get: (id: string) =>
        id === 'physics'
          ? physics
          : id === 'player'
            ? player
            : { id: 'input', state: input, init: () => undefined, dispose: () => undefined },
    } as unknown as GameContext;

    const system = new CameraSystem();
    system.init(ctx);
    return { system, camera, input, playerPosition, physics };
  }

  it('frames the player immediately at init, without easing in from the origin', () => {
    const { camera } = rig();
    // Behind and above the anchor, at the walk distance.
    expect(camera.position.z).toBeCloseTo(CAMERA.walk.distance * Math.cos(0.2), 1);
    expect(camera.position.y).toBeGreaterThan(CAMERA.walk.height);
  });

  it('publishes one yaw number for camera-relative movement', () => {
    const { system, input } = rig();
    expect(system.yaw).toBe(0);

    input.look.set(200, 0);
    system.lateUpdate(1 / 60);
    expect(system.yaw).toBeCloseTo(-200 * CAMERA.sensitivity, 6);
  });

  it('follows the player', () => {
    const { system, camera, playerPosition } = rig();
    const startZ = camera.position.z;
    playerPosition.set(0, 0, -10);
    for (let i = 0; i < 120; i++) system.lateUpdate(1 / 60);
    expect(camera.position.z).toBeLessThan(startZ - 5);
  });

  it('never sits below the ground clearance', () => {
    const { system, camera } = rig();
    // Aim the camera hard down so the desired position would be underground.
    const rigState = system as unknown as { rig: { pitch: number } };
    rigState.rig.pitch = -1;
    for (let i = 0; i < 120; i++) system.lateUpdate(1 / 60);
    expect(camera.position.y).toBeGreaterThanOrEqual(CAMERA.groundClearance - 1e-6);
  });

  it('takes the over-the-head fallback when the anchor is inside geometry', () => {
    // A block swallowing the anchor position (player pushed into geometry).
    const { system, camera, playerPosition } = rig([wall([0, 2, 0], [2, 2, 2])]);
    playerPosition.set(0, 0, 0);
    system.lateUpdate(1 / 60);

    expect(camera.position.x).toBeCloseTo(0, 6);
    expect(camera.position.z).toBeCloseTo(0, 6);
    expect(camera.position.y).toBeCloseTo(CAMERA.fallbackHeight, 6);
  });

  it('ignores look and zoom while a modal has focus', () => {
    const { system, input } = rig();
    input.blocked = true;
    input.look.set(500, 0);
    input.zoom = 100;
    system.lateUpdate(1 / 60);
    expect(system.yaw).toBe(0);
  });
});
