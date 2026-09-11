// The player controller (PLAYER_ARCHITECTURE.md §3–5).
//
// `fixedUpdate` runs the nine steps of §5 in that order, at 60 Hz. `lateUpdate`
// interpolates the published position between the previous and current fixed positions
// with `alpha`, so movement is smooth at any refresh rate while the simulation stays
// deterministic.
//
// Movement is built in camera-relative space. The camera yaw arrives through an injected
// reader rather than an import, because CAMERA_ARCHITECTURE.md requires it be a single
// published value and T-2.6 is what publishes it; until then it reads 0, which means
// world-relative movement.
//
// Zero allocation per step: every vector is a field, and the one scratch array is
// module-level.

import { Vector3 } from 'three';
import type { GameContext } from '../core/GameContext';
import type { System } from '../core/System';
import type { InputState } from '../input/InputState';
import type { CollisionWorld } from '../physics/CollisionWorld';
import { physicsOf } from '../physics/PhysicsSystem';
import { createGroundSample, isWalkable } from '../physics/ground';
import type { GroundSample } from '../physics/ground';
import { createSweepResult } from '../physics/sweep';
import type { Capsule, SweepResult } from '../physics/sweep';
import { IDLE_SPEED, MAX_WALKABLE_SLOPE_COS, PLAYER } from '../data/balance';
import { PLAYER_STATES, createStateEffects, createStateInput } from './states';
import type { AnimationKey, PlayerStateId, StateEffects, StateInput } from './states';

/** What other systems may read from the player (PLAYER_ARCHITECTURE.md §8). */
export interface PlayerView {
  /** Interpolated position of the capsule's feet. Never retained or mutated by readers. */
  readonly position: Readonly<Vector3>;
  /** Unit horizontal facing. */
  readonly forward: Readonly<Vector3>;
  readonly isDriving: boolean;
  /** Animation key, never a clip name (§7) — T-2.8's visual reads this. */
  readonly animationKey: AnimationKey;
  readonly stateId: PlayerStateId;
  readonly grounded: boolean;
  /** Horizontal speed, m/s. */
  readonly speed: number;
}

/** The same object, from the owner's side. */
interface MutableView {
  position: Vector3;
  forward: Vector3;
  isDriving: boolean;
  animationKey: AnimationKey;
  stateId: PlayerStateId;
  grounded: boolean;
  speed: number;
}

export interface PlayerOptions {
  /** Feet position to start at. */
  readonly spawn?: readonly [number, number, number];
  /** Camera yaw in radians, published by T-2.6. World-relative movement without it. */
  readonly cameraYaw?: () => number;
  /**
   * The visible body (T-2.8). Optional, and driven only by the published view, so the
   * controller never learns anything about meshes or clips.
   */
  readonly visual?: PlayerVisualDrive;
}

/** What the controller needs from a visual: something that can be pointed at the view. */
export interface PlayerVisualDrive {
  update(drive: PlayerView, dt: number): void;
}

/** How far ahead of the capsule a step-up is probed. */
const STEP_PROBE = 0.1;

export class PlayerSystem implements System {
  readonly id = 'player' as const;

  private world: CollisionWorld | null = null;
  private input: InputState | null = null;
  private readonly readCameraYaw: () => number;
  private readonly visual: PlayerVisualDrive | null;

  private readonly capsule: Capsule;
  private readonly velocity = new Vector3();
  private readonly sweep: SweepResult = createSweepResult();
  private readonly ground: GroundSample = createGroundSample();
  private readonly effects: StateEffects = createStateEffects();
  private readonly stateInput: StateInput = createStateInput();

  private stateId: PlayerStateId = 'falling';
  private grounded = false;
  private yaw = 0;
  /** Set by the vehicle enter/exit flow in T-5.6; nothing in Phase 2 changes it. */
  private inVehicle = false;

  /** Coyote and jump-buffer timers, in seconds. */
  private timeSinceGrounded = Number.POSITIVE_INFINITY;
  private jumpBufferedFor = 0;

  /** Previous and current fixed positions, for the `alpha` interpolation. */
  private readonly previous = new Vector3();
  private readonly current = new Vector3();
  /** Scratch: the capsule lifted onto a step, for the retry sweep. */
  private readonly lifted: Capsule = { x: 0, y: 0, z: 0, radius: 0, height: 0 };

  private readonly mutableView: MutableView = {
    position: new Vector3(),
    forward: new Vector3(0, 0, -1),
    isDriving: false,
    animationKey: 'idle',
    stateId: 'idle',
    grounded: false,
    speed: 0,
  };

  constructor(options: PlayerOptions = {}) {
    this.readCameraYaw = options.cameraYaw ?? (() => 0);
    this.visual = options.visual ?? null;
    const spawn = options.spawn ?? [0, 0, 0];
    this.capsule = {
      x: spawn[0],
      y: spawn[1],
      z: spawn[2],
      radius: PLAYER.radius,
      height: PLAYER.height,
    };
    this.previous.set(spawn[0], spawn[1], spawn[2]);
    this.current.copy(this.previous);
    this.mutableView.position.copy(this.previous);
  }

  init(ctx: GameContext): void {
    this.world = physicsOf(ctx);
    this.input = ctx.get<InputAccess>('input').state;

    // Stand on whatever is under the spawn point rather than trusting the authored y.
    this.sampleGroundHere();
    if (this.ground.y > this.capsule.y - PLAYER.stepUp) this.capsule.y = this.ground.y;
    this.current.set(this.capsule.x, this.capsule.y, this.capsule.z);
    this.previous.copy(this.current);
    this.mutableView.position.copy(this.current);
    this.publish(ctx);
  }

  /** The nine steps of PLAYER_ARCHITECTURE.md §5, in order. */
  fixedUpdate(dt: number, ctx: GameContext): void {
    const world = this.world;
    const input = this.input;
    if (world === null || input === null) return;

    const state = PLAYER_STATES[this.stateId];

    // 1. Read the snapshot InputSystem already took this frame. A blocked snapshot reads
    //    as neutral input rather than every consumer checking menus (§6).
    const blocked = input.blocked;
    const moveX = blocked ? 0 : input.move.x;
    const moveY = blocked ? 0 : input.move.y;
    const wantsRun = !blocked && input.run;
    if (!blocked && input.jump.pressedThisFrame) this.jumpBufferedFor = PLAYER.jumpBuffer;

    // 2. Desired horizontal velocity in camera-relative space, capped for this state.
    const yaw = this.readCameraYaw();
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const moveMagnitude = Math.min(1, Math.hypot(moveX, moveY));
    // desired = right x move.x + forward x move.y, where the camera's own rig puts
    // forward at (sin yaw, 0, −cos yaw) and screen-right at (cos yaw, 0, sin yaw). Getting
    // the forward term's sign wrong here makes W walk away from the camera, which is what
    // it did until T-2.7's wall test caught it.
    const desiredX = (moveX * cos + moveY * sin) * state.maxSpeed;
    const desiredZ = (moveX * sin - moveY * cos) * state.maxSpeed;

    // 3. Accelerate toward it at the documented m/s², which is frame-rate independent
    //    without any exponential: the step is rate x dt, clamped so it cannot overshoot.
    const accelerating = moveMagnitude > 0;
    const rate = this.grounded
      ? accelerating
        ? PLAYER.groundAccel
        : PLAYER.groundDecel
      : accelerating
        ? PLAYER.airAccel
        : PLAYER.airDecel;
    this.approachHorizontal(desiredX, desiredZ, rate * dt);

    // The impulse a state asked for when it was entered.
    if (this.effects.jump) {
      this.velocity.y = PLAYER.jumpVelocity;
      this.grounded = false;
      this.timeSinceGrounded = Number.POSITIVE_INFINITY;
      this.jumpBufferedFor = 0;
      this.effects.jump = false;
    }

    // 4. Gravity while airborne, to terminal speed.
    if (!this.grounded) {
      this.velocity.y = Math.max(-PLAYER.terminalFall, this.velocity.y - PLAYER.gravity * dt);
    } else if (this.velocity.y < 0) {
      this.velocity.y = 0;
    }

    // 5–6. Delta, then the slide-resolved sweep. Driving freezes both (§4).
    if (!this.effects.frozen) {
      const deltaX = this.velocity.x * dt;
      const deltaZ = this.velocity.z * dt;
      world.sweepCapsule(this.capsule, deltaX, this.velocity.y * dt, deltaZ, this.sweep);
      this.applySweep(deltaX, deltaZ);
    }

    // 7. Ground test: analytic height plus collider tops, then snap.
    this.resolveGround(dt);

    // 8. The state machine, from grounded, velocity and input.
    this.stateInput.moveMagnitude = moveMagnitude;
    this.stateInput.wantsRun = wantsRun;
    this.stateInput.jumpQueued = this.jumpBufferedFor > 0;
    this.stateInput.grounded = this.grounded;
    this.stateInput.coyote = !this.grounded && this.timeSinceGrounded < PLAYER.coyoteTime;
    this.stateInput.verticalVelocity = this.velocity.y;
    this.stateInput.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.stateInput.inVehicle = this.inVehicle;

    const next = state.update(this.stateInput);
    if (next !== this.stateId) {
      state.exit(this.effects);
      this.stateId = next;
      PLAYER_STATES[next].enter(this.effects);
    }

    this.jumpBufferedFor = Math.max(0, this.jumpBufferedFor - dt);

    // 9. Write the transform: the simulation's own history, then GameState and the view.
    this.previous.copy(this.current);
    this.current.set(this.capsule.x, this.capsule.y, this.capsule.z);
    this.updateFacing(dt);
    this.publish(ctx);
  }

  /** Visual interpolation between fixed steps (PLAYER_ARCHITECTURE.md §5). */
  lateUpdate(dt: number, alpha: number): void {
    this.mutableView.position.lerpVectors(this.previous, this.current, alpha);
    // The visual reads the interpolated view and nothing else (T-2.8).
    this.visual?.update(this.mutableView, dt);
  }

  dispose(): void {
    this.world = null;
    this.input = null;
  }

  /** The published read-only interface (§8). One object, never reallocated. */
  get view(): PlayerView {
    return this.mutableView;
  }

  /** For T-2.3's collider view. Returns the live capsule, not a copy. */
  debugCapsule(): Capsule {
    return this.capsule;
  }

  /** Teleport. Clears velocity and grounding, so the next step re-tests the floor. */
  teleport(x: number, y: number, z: number): void {
    this.capsule.x = x;
    this.capsule.y = y;
    this.capsule.z = z;
    this.velocity.set(0, 0, 0);
    this.current.set(x, y, z);
    this.previous.copy(this.current);
    this.mutableView.position.copy(this.current);
    this.grounded = false;
    this.timeSinceGrounded = Number.POSITIVE_INFINITY;
  }

  /** Move the horizontal velocity toward a target by at most `maxDelta` m/s. */
  private approachHorizontal(targetX: number, targetZ: number, maxDelta: number): void {
    const dx = targetX - this.velocity.x;
    const dz = targetZ - this.velocity.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= maxDelta || distance === 0) {
      this.velocity.x = targetX;
      this.velocity.z = targetZ;
      return;
    }
    this.velocity.x += (dx / distance) * maxDelta;
    this.velocity.z += (dz / distance) * maxDelta;
  }

  private applySweep(deltaX: number, deltaZ: number): void {
    if (this.sweep.hit) {
      // Blocked while walking? Try the kerb in front before writing the velocity off.
      const climbed = this.grounded && this.tryStepUp(deltaX, deltaZ);
      if (!climbed) this.zeroVelocityIntoContacts();
    }
    this.capsule.x = this.sweep.x;
    this.capsule.y = this.sweep.y;
    this.capsule.z = this.sweep.z;
  }

  /** Kill the velocity pushing into each contact, so it cannot accumulate against a wall. */
  private zeroVelocityIntoContacts(): void {
    for (let i = 0; i < this.sweep.contactCount; i++) {
      const contact = this.sweep.contacts[i];
      if (contact === undefined) continue;
      const into =
        this.velocity.x * contact.nx + this.velocity.y * contact.ny + this.velocity.z * contact.nz;
      if (into >= 0) continue;
      this.velocity.x -= into * contact.nx;
      this.velocity.y -= into * contact.ny;
      this.velocity.z -= into * contact.nz;
    }
  }

  /**
   * Climb a kerb or single step in the direction of travel (§3: step-up 0.35 m).
   *
   * Lifting alone is not enough: a capsule raised to the step's height but still behind
   * its face is simply airborne, and gravity takes it straight back down. So the lift is
   * followed by a second horizontal sweep from the raised position, which is what carries
   * the player *onto* the step. Returns true when that retry produced the result.
   */
  private tryStepUp(deltaX: number, deltaZ: number): boolean {
    const world = this.world;
    if (world === null) return false;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed < IDLE_SPEED) return false;

    const reach = this.capsule.radius + STEP_PROBE;
    const targetX = this.capsule.x + (this.velocity.x / speed) * reach;
    const targetZ = this.capsule.z + (this.velocity.z / speed) * reach;

    const y = world.stepUpTo(this.capsule, targetX, targetZ, PLAYER.stepUp, this.ground);
    if (!Number.isFinite(y)) return false;

    this.lifted.x = this.capsule.x;
    this.lifted.y = y;
    this.lifted.z = this.capsule.z;
    this.lifted.radius = this.capsule.radius;
    this.lifted.height = this.capsule.height;
    world.sweepCapsule(this.lifted, deltaX, 0, deltaZ, this.sweep);
    return true;
  }

  private resolveGround(dt: number): void {
    this.sampleGroundHere();

    const walkable = isWalkable(this.ground.ny, MAX_WALKABLE_SLOPE_COS);
    const distance = this.capsule.y - this.ground.y;
    const settling = this.velocity.y <= 0;

    if (walkable && settling && distance <= PLAYER.groundSnap) {
      this.capsule.y = this.ground.y;
      this.velocity.y = 0;
      this.grounded = true;
      this.timeSinceGrounded = 0;
      return;
    }

    // Leaving the ground starts the coyote clock rather than resetting it every step.
    if (this.grounded) this.timeSinceGrounded = 0;
    this.grounded = false;
    this.timeSinceGrounded += dt;
  }

  private sampleGroundHere(): void {
    const world = this.world;
    if (world === null) return;
    // Ceiling at the head: a surface above that is a roof, not the floor.
    world.groundAt(
      this.capsule.x,
      this.capsule.z,
      this.capsule.y + this.capsule.height,
      this.ground,
    );
  }

  /** Turn response: the facing eases toward travel with the documented time constant. */
  private updateFacing(dt: number): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed <= IDLE_SPEED) return;

    const targetYaw = Math.atan2(this.velocity.x, -this.velocity.z);
    const blend = 1 - Math.exp(-dt / PLAYER.turnTau);
    this.yaw += shortestAngle(this.yaw, targetYaw) * blend;
    this.mutableView.forward.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** GameState carries only what a save needs; the view carries what systems read. */
  private publish(ctx: GameContext): void {
    const player = ctx.state.player;
    player.position.x = this.capsule.x;
    player.position.y = this.capsule.y;
    player.position.z = this.capsule.z;
    player.yaw = this.yaw;
    player.isDriving = this.stateId === 'driving';

    const view = this.mutableView;
    view.isDriving = player.isDriving;
    view.animationKey = PLAYER_STATES[this.stateId].animationKey;
    view.stateId = this.stateId;
    view.grounded = this.grounded;
    view.speed = Math.hypot(this.velocity.x, this.velocity.z);
  }
}

/** The published shape of the input system, so the player need not import its class. */
interface InputAccess extends System {
  readonly state: InputState;
}

/** Signed shortest rotation from `from` to `to`, in radians. */
function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
