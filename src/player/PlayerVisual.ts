// The player's visible body (PLAYER_ARCHITECTURE.md §7, ASSET_PLAN.md §10).
//
// This is the "block driver" §7 allows: a stylized non-skinned proxy, generated in code
// rather than committed as art, because no licence-compatible animated character exists in
// this repository yet. Swapping in the real GLB is meant to cost nothing, and the thing
// that guarantees it is the interface: this class is driven by **animation keys and a
// speed**, never by clip names, mesh internals or the controller's own fields.
//
// So when the character asset lands, `PlayerVisual` is replaced wholesale — an
// AnimationMixer crossfading clips chosen by the same keys — and no gameplay code changes.
//
// One shared material, three boxes, one draw call. Generated geometry is disposed with it.

import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { PLAYER } from '../data/balance';
import type { AnimationKey } from './states';

/** Exactly what the visual is allowed to know about the player. */
export interface VisualDrive {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly forward: { readonly x: number; readonly z: number };
  readonly animationKey: AnimationKey;
  /** Horizontal speed, m/s — what a real mixer would scale playback rate by. */
  readonly speed: number;
}

/** Per-key proxy motion. A mixer would read clips here; the proxy reads numbers. */
interface KeyMotion {
  /** Vertical bob amplitude, metres, and its cycles per metre travelled. */
  readonly bob: number;
  readonly bobPerMetre: number;
  /** Forward lean, radians. */
  readonly lean: number;
  /** Vertical squash, as a scale on the body. */
  readonly squash: number;
}

const MOTION: Readonly<Record<AnimationKey, KeyMotion>> = Object.freeze({
  idle: { bob: 0.012, bobPerMetre: 0, lean: 0, squash: 1 },
  walk: { bob: 0.035, bobPerMetre: 0.9, lean: 0.04, squash: 1 },
  run: { bob: 0.07, bobPerMetre: 0.6, lean: 0.13, squash: 1 },
  jump: { bob: 0, bobPerMetre: 0, lean: -0.08, squash: 1.06 },
  fall: { bob: 0, bobPerMetre: 0, lean: 0.1, squash: 0.97 },
  sit: { bob: 0, bobPerMetre: 0, lean: 0.35, squash: 0.8 },
});

const BODY_COLOUR = 0xd9a05b;
const HEAD_COLOUR = 0x8a6a44;

export class PlayerVisual {
  readonly root = new Group();

  private readonly body = new Group();
  private readonly material: MeshStandardMaterial;
  private readonly headMaterial: MeshStandardMaterial;
  private readonly geometries: BoxGeometry[] = [];

  /** Distance travelled, so the bob is tied to motion rather than to wall-clock time. */
  private travelled = 0;
  /** Idle breathing needs a clock of its own, since nothing is moving. */
  private elapsed = 0;

  constructor() {
    this.material = new MeshStandardMaterial({ color: new Color(BODY_COLOUR), roughness: 0.7 });
    this.headMaterial = new MeshStandardMaterial({ color: new Color(HEAD_COLOUR), roughness: 0.6 });

    const shoulders = PLAYER.radius * 1.7;
    const torsoHeight = PLAYER.height * 0.55;
    const legHeight = PLAYER.height * 0.3;
    const headSize = PLAYER.height * 0.15;

    this.body.add(
      this.box(shoulders, torsoHeight, PLAYER.radius, 0, legHeight + torsoHeight / 2, 0, false),
      this.box(shoulders * 0.8, legHeight, PLAYER.radius * 0.9, 0, legHeight / 2, 0, false),
      this.box(headSize, headSize, headSize, 0, legHeight + torsoHeight + headSize / 2, 0, true),
    );
    this.root.add(this.body);
    this.root.name = 'player_proxy';
  }

  /** Put the proxy in the scene. */
  attach(parent: Object3D): void {
    parent.add(this.root);
  }

  /**
   * Follow the player. Called once per rendered frame with the interpolated view, so the
   * proxy moves smoothly whatever the refresh rate.
   */
  update(drive: VisualDrive, dt: number): void {
    this.root.position.set(drive.position.x, drive.position.y, drive.position.z);

    // Face travel. The controller already smoothed the facing, so this only reads it.
    if (drive.forward.x !== 0 || drive.forward.z !== 0) {
      this.root.rotation.y = Math.atan2(drive.forward.x, -drive.forward.z);
    }

    const motion = MOTION[drive.animationKey];
    this.travelled += drive.speed * dt;
    this.elapsed += dt;

    const phase =
      motion.bobPerMetre > 0
        ? this.travelled * motion.bobPerMetre * Math.PI * 2
        : this.elapsed * Math.PI;
    this.body.position.y = Math.abs(Math.sin(phase)) * motion.bob;
    this.body.rotation.x = motion.lean;
    this.body.scale.y = motion.squash;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.material.dispose();
    this.headMaterial.dispose();
  }

  private box(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    isHead: boolean,
  ): Mesh {
    const geometry = new BoxGeometry(width, height, depth);
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, isHead ? this.headMaterial : this.material);
    mesh.position.set(x, y, z);
    return mesh;
  }
}
