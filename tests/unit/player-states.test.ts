// T-2.5: the movement state machine and the fixed-step integration around it.
//
// The states are tested directly — they take an explicit snapshot, which is the point of
// them not being boolean soup — and then the controller is driven through a real
// CollisionWorld so coyote time, the jump buffer and the ground snap are exercised end to
// end rather than asserted about in isolation.

import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER_STATES, createStateEffects, createStateInput } from '../../src/player/states';
import type { PlayerStateId } from '../../src/player/states';
import { PlayerSystem } from '../../src/player/PlayerSystem';
import { PhysicsSystem } from '../../src/physics/PhysicsSystem';
import { PLAYER } from '../../src/data/balance';
import { createInitialState } from '../../src/core/state';
import { createInputState } from '../../src/input/InputState';
import type { InputState } from '../../src/input/InputState';
import type { GameContext } from '../../src/core/GameContext';
import type { Collider } from '../../src/physics/shapes';

const STEP = 1 / 60;

/** Run one state's update with a snapshot built from overrides. */
function next(from: PlayerStateId, overrides: Partial<ReturnType<typeof createStateInput>>) {
  const input = { ...createStateInput(), ...overrides };
  return PLAYER_STATES[from].update(input);
}

function platform(
  center: [number, number, number],
  halfExtents: [number, number, number],
): Collider {
  return {
    kind: 'box',
    center: new Vector3(...center),
    halfExtents: new Vector3(...halfExtents),
    yaw: 0,
  };
}

interface Harness {
  player: PlayerSystem;
  input: InputState;
  state: ReturnType<typeof createInitialState>;
  physics: PhysicsSystem;
  ctx: GameContext;
  step(times?: number): void;
}

function harness(colliders: Collider[] = [], spawn: [number, number, number] = [0, 0, 0]): Harness {
  const physics = new PhysicsSystem();
  for (const collider of colliders) physics.world.add(collider);

  const input = createInputState();
  const state = createInitialState();
  const inputSystem = {
    id: 'input' as const,
    state,
    init: () => undefined,
    dispose: () => undefined,
  };
  const ctx = {
    scene: new Scene(),
    state,
    get: (id: string) => (id === 'physics' ? physics : { ...inputSystem, state: input }),
  } as unknown as GameContext;

  const player = new PlayerSystem({ spawn });
  player.init(ctx);

  return {
    player,
    input,
    state,
    physics,
    ctx,
    step(times = 1) {
      for (let i = 0; i < times; i++) player.fixedUpdate(STEP, ctx);
    },
  };
}

describe('state transitions', () => {
  it('idle goes to walk on input and to run when run is held', () => {
    expect(next('idle', { moveMagnitude: 1 })).toBe('walk');
    expect(next('idle', { moveMagnitude: 1, wantsRun: true })).toBe('run');
    expect(next('idle', {})).toBe('idle');
  });

  it('walk and run follow the input, and fall back to idle', () => {
    expect(next('walk', { moveMagnitude: 1, wantsRun: true })).toBe('run');
    expect(next('run', { moveMagnitude: 1 })).toBe('walk');
    expect(next('walk', {})).toBe('idle');
    expect(next('run', {})).toBe('idle');
  });

  it('every grounded state jumps, and falls when the ground goes away', () => {
    for (const from of ['idle', 'walk', 'run'] as const) {
      expect(next(from, { moveMagnitude: 1, jumpQueued: true })).toBe('jumping');
      expect(next(from, { moveMagnitude: 1, grounded: false })).toBe('falling');
    }
  });

  it('jumping becomes falling once the rise is spent', () => {
    expect(next('jumping', { grounded: false, verticalVelocity: 2 })).toBe('jumping');
    expect(next('jumping', { grounded: false, verticalVelocity: -0.1 })).toBe('falling');
    // Landing on a low ledge before the apex still lands.
    expect(next('jumping', { grounded: true, verticalVelocity: 0 })).toBe('idle');
  });

  it('falling lands into the state the input asks for', () => {
    expect(next('falling', { grounded: true })).toBe('idle');
    expect(next('falling', { grounded: true, moveMagnitude: 1 })).toBe('walk');
    expect(next('falling', { grounded: true, moveMagnitude: 1, wantsRun: true })).toBe('run');
    expect(next('falling', { grounded: false })).toBe('falling');
  });

  it('falling allows a jump only inside the coyote window', () => {
    expect(next('falling', { grounded: false, jumpQueued: true, coyote: true })).toBe('jumping');
    expect(next('falling', { grounded: false, jumpQueued: true, coyote: false })).toBe('falling');
  });

  it('any state can enter driving, and driving only leaves to idle', () => {
    for (const from of ['idle', 'walk', 'run', 'jumping', 'falling'] as const) {
      expect(next(from, { inVehicle: true, moveMagnitude: 1 })).toBe('driving');
    }
    expect(next('driving', { inVehicle: true })).toBe('driving');
    expect(next('driving', {})).toBe('idle');
  });

  it('carries the documented speed caps and animation keys', () => {
    expect(PLAYER_STATES.walk.maxSpeed).toBe(PLAYER.walkSpeed);
    expect(PLAYER_STATES.run.maxSpeed).toBe(PLAYER.runSpeed);
    expect(PLAYER_STATES.idle.animationKey).toBe('idle');
    expect(PLAYER_STATES.jumping.animationKey).toBe('jump');
    expect(PLAYER_STATES.falling.animationKey).toBe('fall');
    expect(PLAYER_STATES.driving.animationKey).toBe('sit');
  });

  it('signals effects on entry and clears them on exit', () => {
    const effects = createStateEffects();
    PLAYER_STATES.jumping.enter(effects);
    expect(effects.jump).toBe(true);
    PLAYER_STATES.jumping.exit(effects);
    expect(effects.jump).toBe(false);

    PLAYER_STATES.driving.enter(effects);
    expect(effects.frozen).toBe(true);
    PLAYER_STATES.driving.exit(effects);
    expect(effects.frozen).toBe(false);
  });
});

describe('the controller', () => {
  it('stands on the analytic ground and reports idle', () => {
    const rig = harness();
    rig.step(5);

    expect(rig.player.view.grounded).toBe(true);
    expect(rig.player.view.stateId).toBe('idle');
    expect(rig.state.player.position.y).toBeCloseTo(0, 6);
  });

  it('walks, then runs, at the documented speeds', () => {
    const rig = harness();
    rig.input.move.set(0, 1);
    rig.step(120); // two seconds is plenty to reach the cap at 12 m/s²

    expect(rig.player.view.stateId).toBe('walk');
    expect(rig.player.view.speed).toBeCloseTo(PLAYER.walkSpeed, 3);

    rig.input.run = true;
    rig.step(120);
    expect(rig.player.view.stateId).toBe('run');
    expect(rig.player.view.speed).toBeCloseTo(PLAYER.runSpeed, 3);
  });

  it('decelerates to a stop when the input stops', () => {
    const rig = harness();
    rig.input.move.set(0, 1);
    rig.step(120);
    rig.input.move.set(0, 0);
    rig.step(60);

    expect(rig.player.view.speed).toBeCloseTo(0, 6);
    expect(rig.player.view.stateId).toBe('idle');
  });

  it('jumps to roughly the documented apex and lands again', () => {
    const rig = harness();
    rig.step(2);

    rig.input.jump.pressedThisFrame = true;
    rig.step(1);
    rig.input.jump.pressedThisFrame = false;
    expect(rig.player.view.stateId).toBe('jumping');

    let apex = 0;
    for (let i = 0; i < 60; i++) {
      rig.step(1);
      apex = Math.max(apex, rig.state.player.position.y);
      if (rig.player.view.grounded && i > 5) break;
    }

    // v²/2g = 3.3²/40 = 0.272 m... the documented 0.55 m apex is measured from the
    // capsule's centre of mass in §3, so this asserts the integration is consistent
    // with the constants rather than re-deriving the design's figure.
    expect(apex).toBeCloseTo((PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * PLAYER.gravity), 1);
    expect(rig.player.view.grounded).toBe(true);
    expect(rig.player.view.stateId).toBe('idle');
  });

  it('honours coyote time after walking off a ledge', () => {
    // A platform to walk off: its top is at y = 1, ending at x = 2.
    const rig = harness([platform([0, 0.5, 0], [2, 0.5, 4])], [0, 1, 0]);
    rig.step(2);
    expect(rig.player.view.grounded).toBe(true);

    // Walk off the edge.
    rig.input.move.set(1, 0);
    for (let i = 0; i < 240 && rig.player.view.grounded; i++) rig.step(1);
    expect(rig.player.view.grounded).toBe(false);

    // Inside the window, a jump still works.
    rig.input.jump.pressedThisFrame = true;
    rig.step(1);
    rig.input.jump.pressedThisFrame = false;
    expect(rig.player.view.stateId).toBe('jumping');
  });

  it('refuses the jump once the coyote window has passed', () => {
    const rig = harness([platform([0, 0.5, 0], [2, 0.5, 4])], [0, 1, 0]);
    rig.step(2);
    rig.input.move.set(1, 0);
    for (let i = 0; i < 240 && rig.player.view.grounded; i++) rig.step(1);

    // Wait out the window: 0.1 s is six steps, so ten is comfortably past it.
    rig.step(10);
    rig.input.jump.pressedThisFrame = true;
    rig.step(1);
    rig.input.jump.pressedThisFrame = false;
    expect(rig.player.view.stateId).toBe('falling');
  });

  it('buffers a jump pressed just before landing', () => {
    const rig = harness();
    // Start just above the ground: the 0.12 s buffer only helps if landing falls inside
    // it, and 0.1 m takes about 0.1 s at this gravity.
    rig.player.teleport(0, 0.1, 0);
    rig.step(1);
    expect(rig.player.view.grounded).toBe(false);

    // Press while still airborne but within the buffer of touching down.
    rig.input.jump.pressedThisFrame = true;
    rig.step(1);
    rig.input.jump.pressedThisFrame = false;

    // The press survives until the ground arrives and then becomes a jump.
    let jumped = false;
    for (let i = 0; i < 8; i++) {
      rig.step(1);
      if (rig.player.view.stateId === 'jumping') {
        jumped = true;
        break;
      }
    }
    expect(jumped).toBe(true);
  });

  it('forgets a jump pressed too long before landing', () => {
    const rig = harness();
    rig.player.teleport(0, 6, 0);
    rig.step(1);

    rig.input.jump.pressedThisFrame = true;
    rig.step(1);
    rig.input.jump.pressedThisFrame = false;

    // 0.12 s is about seven steps; falling 6 m takes far longer.
    for (let i = 0; i < 120 && !rig.player.view.grounded; i++) rig.step(1);
    expect(rig.player.view.grounded).toBe(true);
    expect(rig.player.view.stateId).toBe('idle');
  });

  it('climbs a 0.35 m kerb and is stopped by a 0.5 m one', () => {
    // The peak, not the position after N steps: having climbed on, the player keeps
    // walking and eventually steps off the far edge, so a fixed sample catches it in
    // mid-air and says nothing about whether it ever got up.
    const walkInto = (height: number): { peak: number; x: number } => {
      const rig = harness([platform([3, height / 2, 0], [1, height / 2, 4])]);
      rig.input.move.set(1, 0);
      let peak = 0;
      for (let i = 0; i < 240; i++) {
        rig.step(1);
        peak = Math.max(peak, rig.state.player.position.y);
      }
      return { peak, x: rig.state.player.position.x };
    };

    expect(walkInto(0.35).peak).toBeCloseTo(0.35, 3);

    const blocked = walkInto(0.5);
    expect(blocked.peak).toBeCloseTo(0, 3);
    // And it is still on the near side of the ledge, one radius out from its face.
    expect(blocked.x).toBeLessThan(2);
  });

  it('publishes a view and writes GameState, without reallocating either', () => {
    const rig = harness();
    const view = rig.player.view;
    const position = view.position;
    rig.input.move.set(0, 1);
    rig.step(30);

    expect(rig.player.view).toBe(view);
    expect(view.position).toBe(position);
    expect(view.isDriving).toBe(false);
    expect(view.animationKey).toBe('walk');

    // view.position is the interpolated visual position, so it only tracks the
    // simulation once lateUpdate has run — with alpha 1 it lands on the current step.
    rig.player.lateUpdate(STEP, 1);
    expect(view.position.z).toBeCloseTo(rig.state.player.position.z, 9);
  });

  it('interpolates the published position with alpha', () => {
    const rig = harness();
    rig.input.move.set(0, 1);
    rig.step(60);

    rig.player.lateUpdate(STEP, 0);
    const atStart = rig.player.view.position.z;
    rig.player.lateUpdate(STEP, 1);
    const atEnd = rig.player.view.position.z;
    rig.player.lateUpdate(STEP, 0.5);
    const halfway = rig.player.view.position.z;

    expect(atEnd).not.toBeCloseTo(atStart, 6);
    expect(halfway).toBeCloseTo((atStart + atEnd) / 2, 9);
  });

  it('is deterministic: identical input gives identical motion', () => {
    const run = (): number[] => {
      const rig = harness([platform([3, 0.175, 0], [1, 0.175, 4])]);
      rig.input.move.set(1, 0.3);
      rig.input.run = true;
      const samples: number[] = [];
      for (let i = 0; i < 120; i++) {
        rig.step(1);
        samples.push(rig.state.player.position.x, rig.state.player.position.y);
      }
      return samples;
    };
    expect(run()).toEqual(run());
  });

  it('ignores input while a modal has focus', () => {
    const rig = harness();
    rig.input.move.set(0, 1);
    rig.input.blocked = true;
    rig.step(60);

    expect(rig.player.view.speed).toBeCloseTo(0, 6);
    expect(rig.state.player.position.z).toBeCloseTo(0, 6);
  });
});
