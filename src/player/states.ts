// The movement state machine (PLAYER_ARCHITECTURE.md §4).
//
// Six states, each with `enter`/`update`/`exit` and an animation key. `update` returns the
// state the player should be in next — returning its own id means "stay". The states read
// a small, explicit snapshot (`StateInput`) rather than the whole system, which is what
// keeps them testable without a collision world.
//
// The point of the diagram in §4 is that this is NOT boolean soup: no consumer asks
// `isGrounded && !isJumping && wasRunning`. There is one current state and it has a name.

import { IDLE_SPEED, PLAYER } from '../data/balance';

export type PlayerStateId = 'idle' | 'walk' | 'run' | 'jumping' | 'falling' | 'driving';

/** Animation keys, never clip names (PLAYER_ARCHITECTURE.md §7). */
export type AnimationKey = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'sit';

/** Everything a state needs to decide, and nothing else. */
export interface StateInput {
  /** Horizontal input magnitude, 0..1. */
  moveMagnitude: number;
  /** Shift held. */
  wantsRun: boolean;
  /** A jump press, either this frame or still inside the buffer window. */
  jumpQueued: boolean;
  /** Standing on walkable ground right now. */
  grounded: boolean;
  /** Still inside the coyote window after leaving the ground. */
  coyote: boolean;
  /** Vertical velocity, m/s. */
  verticalVelocity: number;
  /** Horizontal speed, m/s. */
  speed: number;
  /** Set while seated in a vehicle (T-5.6 drives this; nothing sets it in Phase 2). */
  inVehicle: boolean;
}

/**
 * What a state may ask the controller to do on a transition. The controller owns the
 * integration; a state only signals intent, so the physics stays in one place.
 */
export interface StateEffects {
  /** Apply the jump impulse on this step. */
  jump: boolean;
  /** Movement integration and the collider are disabled while seated. */
  frozen: boolean;
}

export interface PlayerState {
  readonly id: PlayerStateId;
  readonly animationKey: AnimationKey;
  /** Horizontal speed cap while in this state, m/s. */
  readonly maxSpeed: number;
  enter(effects: StateEffects): void;
  update(input: StateInput): PlayerStateId;
  exit(effects: StateEffects): void;
}

/** Where a grounded state goes when the player is on the floor with this input. */
function groundedFor(input: StateInput): PlayerStateId {
  if (input.moveMagnitude <= 0) return 'idle';
  return input.wantsRun ? 'run' : 'walk';
}

/** Shared by the three grounded states: leaving the ground, or jumping off it. */
function groundedExit(input: StateInput): PlayerStateId | null {
  if (input.inVehicle) return 'driving';
  if (input.jumpQueued && (input.grounded || input.coyote)) return 'jumping';
  if (!input.grounded) return 'falling';
  return null;
}

const idle: PlayerState = {
  id: 'idle',
  animationKey: 'idle',
  maxSpeed: 0,
  enter: () => undefined,
  update: (input) => groundedExit(input) ?? (input.moveMagnitude > 0 ? groundedFor(input) : 'idle'),
  exit: () => undefined,
};

const walk: PlayerState = {
  id: 'walk',
  animationKey: 'walk',
  maxSpeed: PLAYER.walkSpeed,
  enter: () => undefined,
  update: (input) => groundedExit(input) ?? groundedFor(input),
  exit: () => undefined,
};

const run: PlayerState = {
  id: 'run',
  animationKey: 'run',
  maxSpeed: PLAYER.runSpeed,
  enter: () => undefined,
  update: (input) => groundedExit(input) ?? groundedFor(input),
  exit: () => undefined,
};

const jumping: PlayerState = {
  id: 'jumping',
  animationKey: 'jump',
  // Air control keeps the run cap: a jump out of a sprint must not brake mid-air.
  maxSpeed: PLAYER.runSpeed,
  enter: (effects) => {
    effects.jump = true;
  },
  update: (input) => {
    if (input.inVehicle) return 'driving';
    // Landing immediately is possible on a low ledge, so ground wins over apex.
    if (input.grounded && input.verticalVelocity <= 0) return groundedFor(input);
    if (input.verticalVelocity < 0) return 'falling';
    return 'jumping';
  },
  exit: (effects) => {
    effects.jump = false;
  },
};

const falling: PlayerState = {
  id: 'falling',
  animationKey: 'fall',
  maxSpeed: PLAYER.runSpeed,
  enter: () => undefined,
  update: (input) => {
    if (input.inVehicle) return 'driving';
    if (input.grounded) return groundedFor(input);
    // A jump is still allowed inside the coyote window after walking off an edge.
    if (input.jumpQueued && input.coyote) return 'jumping';
    return 'falling';
  },
  exit: () => undefined,
};

const driving: PlayerState = {
  id: 'driving',
  animationKey: 'sit',
  maxSpeed: 0,
  enter: (effects) => {
    effects.frozen = true;
  },
  update: (input) => (input.inVehicle ? 'driving' : 'idle'),
  exit: (effects) => {
    effects.frozen = false;
  },
};

export const PLAYER_STATES: Readonly<Record<PlayerStateId, PlayerState>> = Object.freeze({
  idle,
  walk,
  run,
  jumping,
  falling,
  driving,
});

export function createStateEffects(): StateEffects {
  return { jump: false, frozen: false };
}

export function createStateInput(): StateInput {
  return {
    moveMagnitude: 0,
    wantsRun: false,
    jumpQueued: false,
    grounded: true,
    coyote: false,
    verticalVelocity: 0,
    speed: 0,
    inVehicle: false,
  };
}

/** True once the player is moving fast enough to be animated as moving. */
export function isMoving(speed: number): boolean {
  return speed > IDLE_SPEED;
}
