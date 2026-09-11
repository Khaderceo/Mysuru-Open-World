// The third-person camera (CAMERA_ARCHITECTURE.md).
//
// Independent by construction: it reads `PlayerView` and `InputState`, drives the one
// PerspectiveCamera T-1.2 owns, and publishes a single `yaw` number for camera-relative
// movement. It never moves the player, never reads mission or UI state, and never handles
// input itself (§8).
//
// It runs in `lateUpdate`, after the player's, so it follows the interpolated visual
// position rather than lagging a frame behind it.
//
// Phase 2 has one mode, ThirdPersonWalk. Vehicle mode is a second parameter set in
// `data/balance.ts` when its task lands — "adding a mode is adding data, not code" (§2).

import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import type { GameContext } from '../core/GameContext';
import type { System } from '../core/System';
import type { InputState } from '../input/InputState';
import type { CollisionWorld } from '../physics/CollisionWorld';
import { physicsOf } from '../physics/PhysicsSystem';
import { createGroundSample } from '../physics/ground';
import type { GroundSample } from '../physics/ground';
import { createRayHit } from '../physics/shapes';
import type { ColliderId, RayHit } from '../physics/shapes';
import { CAMERA } from '../data/balance';
import { floorFor, isAnchorBlocked, probeDistance } from './probe';
import {
  applyLook,
  applyZoom,
  approach,
  createRig,
  easeDistance,
  orbitDirection,
  snapAnchor,
  updateAnchor,
} from './rig';
import type { CameraRig } from './rig';

/** The published read-only view of the player this system follows. */
interface PlayerAccess extends System {
  readonly view: {
    readonly position: Vector3;
    readonly isDriving: boolean;
  };
}

interface InputAccess extends System {
  readonly state: InputState;
}

export class CameraSystem implements System {
  readonly id = 'camera' as const;

  private readonly rig: CameraRig = createRig();
  private camera: PerspectiveCamera | null = null;
  private world: CollisionWorld | null = null;
  private player: PlayerAccess['view'] | null = null;
  private input: InputState | null = null;

  /** Scratch, so a frame allocates nothing. */
  private readonly direction = { x: 0, y: 0, z: 0 };
  private readonly ground: GroundSample = createGroundSample();
  private readonly hit: RayHit = createRayHit();
  private readonly overlap: ColliderId[] = new Array<ColliderId>(16).fill(0);
  private readonly lookTarget = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly lookMatrix = new Matrix4();
  private readonly targetRotation = new Quaternion();

  /**
   * The one value the player system consumes, for camera-relative movement (§8). A single
   * number in one direction — not a module import.
   */
  get yaw(): number {
    return this.rig.yaw;
  }

  init(ctx: GameContext): void {
    this.camera = ctx.camera;
    this.world = physicsOf(ctx);
    this.player = ctx.get<PlayerAccess>('player').view;
    this.input = ctx.get<InputAccess>('input').state;

    // Start framed on the player rather than easing in from the origin.
    const position = this.player.position;
    snapAnchor(this.rig, position.x, position.y, position.z);
    this.rig.fov = CAMERA.walk.fov;
    this.placeImmediately();
  }

  /** Per rendered frame, after the player's lateUpdate has interpolated its position. */
  lateUpdate(dt: number): void {
    const camera = this.camera;
    const world = this.world;
    const player = this.player;
    const input = this.input;
    if (camera === null || world === null || player === null || input === null) return;

    // Look and zoom, from the snapshot. Mouse delta is never scaled by dt (§3).
    if (!input.blocked) {
      applyLook(this.rig, input.look.x, input.look.y);
      if (input.zoom !== 0) applyZoom(this.rig, input.zoom);
    }

    const target = player.position;
    updateAnchor(this.rig, target.x, target.y, target.z, dt);
    // Driving is T-5.x's mode; the walk rig is the only parameter set Phase 2 has.
    void player.isDriving;

    // Anchor inside geometry: take the fixed over-the-head position rather than flip (§5.5).
    if (
      isAnchorBlocked(world, this.rig.anchorX, this.rig.anchorY, this.rig.anchorZ, this.overlap)
    ) {
      this.rig.x = target.x;
      this.rig.y = target.y + CAMERA.fallbackHeight;
      this.rig.z = target.z;
      this.applyToCamera(camera, dt);
      return;
    }

    orbitDirection(this.rig, this.direction);
    const allowed = probeDistance(
      world,
      this.rig.anchorX,
      this.rig.anchorY,
      this.rig.anchorZ,
      this.direction.x,
      this.direction.y,
      this.direction.z,
      this.rig.desiredDistance,
      this.hit,
    );
    easeDistance(this.rig, allowed, dt);

    const wantX = this.rig.anchorX + this.direction.x * this.rig.distance;
    const wantY = this.rig.anchorY + this.direction.y * this.rig.distance;
    const wantZ = this.rig.anchorZ + this.direction.z * this.rig.distance;

    this.rig.x = approach(this.rig.x, wantX, CAMERA.tau.position, dt);
    this.rig.y = approach(this.rig.y, wantY, CAMERA.tau.position, dt);
    this.rig.z = approach(this.rig.z, wantZ, CAMERA.tau.position, dt);

    // Hard floor, applied after smoothing so it can never be smoothed through (§5.4).
    const floor = floorFor(world, this.rig.x, this.rig.z, this.rig.y + 1, this.ground);
    if (this.rig.y < floor) this.rig.y = floor;

    this.applyToCamera(camera, dt);
  }

  dispose(): void {
    this.camera = null;
    this.world = null;
    this.player = null;
    this.input = null;
  }

  /** Re-frame without easing: for spawn, teleports and vehicle transitions. */
  snapTo(x: number, feetY: number, z: number): void {
    snapAnchor(this.rig, x, feetY, z);
    this.placeImmediately();
  }

  private placeImmediately(): void {
    orbitDirection(this.rig, this.direction);
    this.rig.distance = this.rig.desiredDistance;
    this.rig.x = this.rig.anchorX + this.direction.x * this.rig.distance;
    this.rig.y = this.rig.anchorY + this.direction.y * this.rig.distance;
    this.rig.z = this.rig.anchorZ + this.direction.z * this.rig.distance;
    if (this.camera !== null) {
      this.camera.position.set(this.rig.x, this.rig.y, this.rig.z);
      this.camera.lookAt(this.rig.anchorX, this.rig.anchorY, this.rig.anchorZ);
    }
  }

  /**
   * Rotation is slerped toward the look direction rather than lerped as Euler angles,
   * which produces gimbal artefacts near the pitch clamp (§4). The position tau doubles
   * as the rotation tau: they are the same motion seen two ways.
   */
  private applyToCamera(camera: PerspectiveCamera, dt: number): void {
    camera.position.set(this.rig.x, this.rig.y, this.rig.z);
    this.lookTarget.set(this.rig.anchorX, this.rig.anchorY, this.rig.anchorZ);

    this.lookMatrix.lookAt(camera.position, this.lookTarget, this.up);
    this.targetRotation.setFromRotationMatrix(this.lookMatrix);
    camera.quaternion.slerp(this.targetRotation, 1 - Math.exp(-dt / CAMERA.tau.position));

    if (camera.fov !== this.rig.fov) {
      camera.fov = this.rig.fov;
      camera.updateProjectionMatrix();
    }
  }
}
