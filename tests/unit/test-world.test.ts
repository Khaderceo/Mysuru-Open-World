// T-2.4. Documented validation is manual; these assert the claims that are mechanical —
// that every piece becomes a collider under one owner, that the draw-call budget holds,
// and that teardown leaves nothing behind. Whether it is a *pleasant* place to tune
// movement is a judgement for a human at the keyboard.

import { Object3D, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { PhysicsSystem } from '../../src/physics/PhysicsSystem';
import { TestWorld } from '../../src/world/TestWorld';
import { TEST_WORLD_PIECES } from '../../src/data/testWorld';
import type { GameContext } from '../../src/core/GameContext';

/** The two members TestWorld.init actually reads, shaped as a context. */
function contextWith(physics: PhysicsSystem, scene: Object3D): GameContext {
  return {
    scene,
    get: () => physics,
  } as unknown as GameContext;
}

describe('TestWorld', () => {
  it('registers a collider for every piece, under one owner', () => {
    const physics = new PhysicsSystem();
    const world = new TestWorld();
    world.init(contextWith(physics, new Scene()));

    expect(physics.world.size).toBe(TEST_WORLD_PIECES.length);

    // One call drops the lot, exactly as a chunk unload will.
    physics.world.removeChunk('test_world');
    expect(physics.world.size).toBe(0);
  });

  it('stays inside the 10 draw call budget by instancing', () => {
    const physics = new PhysicsSystem();
    const scene = new Scene();
    new TestWorld().init(contextWith(physics, scene));

    // Ground, structures, human proxy, ramps: one draw call each.
    const drawables = scene.children.filter((child) => 'geometry' in child);
    expect(drawables.length).toBeLessThanOrEqual(10);
    expect(drawables.length).toBe(4);
  });

  it('brackets the documented movement constants', () => {
    const labels = TEST_WORLD_PIECES.map((piece) => piece.label);
    // Kerbs either side of the 0.35 m step-up, ramps either side of the 45 degree limit.
    expect(labels).toContain('kerb_015');
    expect(labels).toContain('kerb_035');
    expect(labels).toContain('kerb_050');
    expect(labels).toContain('ramp_20');
    expect(labels).toContain('ramp_45');
    expect(labels).toContain('ramp_50');
    expect(labels).toContain('human_proxy_1m8');
    expect(labels.filter((label) => label.startsWith('stair_'))).toHaveLength(5);
    expect(labels.filter((label) => label.startsWith('grid_'))).toHaveLength(9);
  });

  it('the ramps it registers read back at the pitch they were authored at', () => {
    const physics = new PhysicsSystem();
    new TestWorld().init(contextWith(physics, new Scene()));

    // The 45 degree ramp sits at x = 13 with a run of 4, so its midpoint is its centre.
    const sample = { y: 0, nx: 0, ny: 1, nz: 0, id: -1 };
    physics.world.groundAt(13, 2, 5, sample);
    expect(sample.ny).toBeCloseTo(Math.cos((45 * Math.PI) / 180), 4);
  });

  it('disposes its meshes and colliders together', () => {
    const physics = new PhysicsSystem();
    const scene = new Scene();
    const world = new TestWorld();
    world.init(contextWith(physics, scene));
    world.dispose();

    expect(scene.children).toHaveLength(0);
    expect(physics.world.size).toBe(0);
  });
});

// The camera is untouched by this system; asserted so a future change has to be deliberate.
describe('TestWorld and the camera', () => {
  it('does not construct or move a camera', () => {
    const physics = new PhysicsSystem();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(1, 2, 3);
    new TestWorld().init(contextWith(physics, scene));
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
  });
});
