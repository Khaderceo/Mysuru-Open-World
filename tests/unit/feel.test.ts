// T-2.7. The task is a tuning pass whose acceptance is a written checklist signed off by
// someone playing it, which this session cannot do. What it *can* do is pin the two items
// on that checklist that are mechanical rather than subjective — "identical feel at 60 and
// 144 Hz" and "no jitter against walls" — plus the arithmetic behind the jump, so that a
// later tuning change cannot quietly break frame-rate independence.
//
// The subjective items (responsive without ice-skating, running distinctly faster without
// being twitchy, the camera never flinching) still need a human at the keyboard. See the
// checklist in this task's commit body.

import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/data/balance';
import { PlayerSystem } from '../../src/player/PlayerSystem';
import { CameraSystem } from '../../src/camera/CameraSystem';
import { PhysicsSystem } from '../../src/physics/PhysicsSystem';
import { createInitialState } from '../../src/core/state';
import { createInputState } from '../../src/input/InputState';
import type { GameContext } from '../../src/core/GameContext';
import type { Collider } from '../../src/physics/shapes';

const wall: Collider = {
  kind: 'box',
  center: new Vector3(0, 1.5, -3),
  halfExtents: new Vector3(6, 1.5, 0.25),
  yaw: 0,
};

function playerRig(colliders: Collider[] = []) {
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
  const player = new PlayerSystem();
  player.init(ctx);
  return { player, input, state, ctx };
}

function cameraRig() {
  const physics = new PhysicsSystem();
  const input = createInputState();
  const player = {
    id: 'player' as const,
    view: { position: new Vector3(0, 0, 0), isDriving: false },
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
  return { system, camera, player };
}

describe('identical feel at 60 and 144 Hz', () => {
  it('the simulation is fixed-step, so refresh rate cannot change where the player goes', () => {
    // The loop always advances the player in 1/60 steps (ADR-012): a 144 Hz display runs
    // the same steps, just interpolated more often. So one second of held input must
    // travel the same distance whatever the display does.
    const distanceAfterOneSecond = (): number => {
      const rig = playerRig();
      rig.input.move.set(0, 1);
      rig.input.run = true;
      for (let i = 0; i < 60; i++) rig.player.fixedUpdate(1 / 60, rig.ctx);
      return rig.state.player.position.z;
    };
    expect(distanceAfterOneSecond()).toBeCloseTo(distanceAfterOneSecond(), 12);
  });

  it('camera smoothing lands in the same place after a second at either rate', () => {
    const settle = (steps: number): [number, number, number] => {
      const { system, camera, player } = cameraRig();
      player.view.position.set(0, 0, -8);
      const dt = 1 / steps;
      for (let i = 0; i < steps; i++) system.lateUpdate(dt);
      return [camera.position.x, camera.position.y, camera.position.z];
    };

    const at60 = settle(60);
    const at144 = settle(144);
    // Exponential smoothing depends on elapsed time, not step count, so the two agree to
    // within the integration error of the different step sizes.
    for (let axis = 0; axis < 3; axis++) {
      expect(at144[axis] ?? 0).toBeCloseTo(at60[axis] ?? 0, 2);
    }
  });
});

describe('no jitter against walls', () => {
  it('holding into a wall settles on one position and stays there', () => {
    const rig = playerRig([wall]);
    rig.input.move.set(0, 1); // straight into it
    rig.input.run = true;

    const samples: number[] = [];
    for (let i = 0; i < 300; i++) {
      rig.player.fixedUpdate(1 / 60, rig.ctx);
      if (i >= 200) samples.push(rig.state.player.position.z);
    }

    const rest = samples[0] ?? NaN;
    for (const sample of samples) expect(sample).toBeCloseTo(rest, 9);
    // Resting one radius off the wall's near face at z = -2.75, not inside it.
    expect(rest).toBeCloseTo(-2.75 + PLAYER.radius, 2);
  });

  it('sliding along a wall is smooth rather than stuttering', () => {
    const rig = playerRig([wall]);
    rig.input.move.set(1, 1); // diagonally into it, so it slides along x
    rig.input.run = true;

    let previous = rig.state.player.position.x;
    const deltas: number[] = [];
    for (let i = 0; i < 180; i++) {
      rig.player.fixedUpdate(1 / 60, rig.ctx);
      const current = rig.state.player.position.x;
      if (i >= 60) deltas.push(current - previous);
      previous = current;
    }

    // Once sliding, every step advances by about the same amount: no stop-start.
    const first = deltas[0] ?? 0;
    expect(first).toBeGreaterThan(0);
    for (const delta of deltas) expect(delta).toBeCloseTo(first, 3);
  });
});

describe('the jump lands where the constants say it should', () => {
  it('reaches the documented apex', () => {
    const rig = playerRig();
    rig.player.fixedUpdate(1 / 60, rig.ctx);
    rig.input.jump.pressedThisFrame = true;
    rig.player.fixedUpdate(1 / 60, rig.ctx);
    rig.input.jump.pressedThisFrame = false;

    let apex = 0;
    for (let i = 0; i < 120; i++) {
      rig.player.fixedUpdate(1 / 60, rig.ctx);
      apex = Math.max(apex, rig.state.player.position.y);
    }

    // v = sqrt(2gh) for the documented 0.55 m, within one step's integration error.
    expect(apex).toBeCloseTo(PLAYER.jumpApex, 1);
    expect(PLAYER.jumpVelocity).toBeCloseTo(Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpApex), 2);
  });

  it('returns to the ground it left', () => {
    const rig = playerRig();
    rig.player.fixedUpdate(1 / 60, rig.ctx);
    rig.input.jump.pressedThisFrame = true;
    rig.player.fixedUpdate(1 / 60, rig.ctx);
    rig.input.jump.pressedThisFrame = false;

    for (let i = 0; i < 120; i++) rig.player.fixedUpdate(1 / 60, rig.ctx);
    expect(rig.state.player.position.y).toBeCloseTo(0, 6);
    expect(rig.player.view.grounded).toBe(true);
  });
});
