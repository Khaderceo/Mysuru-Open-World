// Grey-box playground (TASKS.md T-2.4). Dev content, not the city.
//
// A controlled environment for tuning movement and camera feel before Mysuru exists.
// Every piece brackets a documented constant — see `data/testWorld.ts`.
//
// Draw calls: ground, one InstancedMesh for every box, one for every ramp, one for the
// human proxy. Four, against a budget of ten. Instancing is what keeps it there: a mesh
// per block would be thirty.
//
// Gated by `__DEV__ || __E2E__` and a URL flag (`?testworld=1`), so it is absent from the
// deployed bundle. `__E2E__` is in the gate because T-1.9's smoke test asserts the render
// path drew something, and this is the only content in the scene once T-2.4 retires
// T-1.5a's geometry.
//
// RETIREMENT: deleted together with `data/testWorld.ts` when Phase 3 lands the real
// world. It registers its colliders under one owner key so the world can drop them in a
// single call, exactly as a chunk does.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Object3D,
} from 'three';
import type { GameContext } from '../core/GameContext';
import type { System } from '../core/System';
import { physicsOf } from '../physics/PhysicsSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { ColliderOwner } from '../physics/shapes';
import {
  GROUND_HALF,
  HUMAN_PROXY,
  TEST_SPAWN,
  TEST_WORLD_PIECES,
  type GreyBoxPiece,
} from '../data/testWorld';

/** URL flag that builds the playground, e.g. `?testworld=1`. */
export const TEST_WORLD_FLAG = 'testworld';

/** Re-exported so the bootstrap can spawn the player here without importing dev data. */
export const TEST_WORLD_SPAWN = TEST_SPAWN;

/** Every collider is registered under this owner, so teardown is one call. */
const OWNER: ColliderOwner = 'test_world';

const STRUCTURE_COLOUR = 0x8a8378;
const RAMP_COLOUR = 0x7d8a74;
const PROXY_COLOUR = 0xc0703a;
const GROUND_COLOUR = 0x6d6152;

export class TestWorld implements System {
  readonly id = 'world' as const;

  private readonly disposables: { dispose(): void }[] = [];
  private world: CollisionWorld | null = null;

  init(ctx: GameContext): void {
    this.world = physicsOf(ctx);
    const root = ctx.scene;

    const blocks = TEST_WORLD_PIECES.filter(
      (piece): piece is Extract<GreyBoxPiece, { kind: 'box' }> =>
        piece.kind === 'box' && piece.label !== HUMAN_PROXY.label,
    );
    const ramps = TEST_WORLD_PIECES.filter(
      (piece): piece is Extract<GreyBoxPiece, { kind: 'ramp' }> => piece.kind === 'ramp',
    );

    this.addGround(root);
    this.addBlocks(root, blocks, STRUCTURE_COLOUR);
    this.addBlocks(root, [HUMAN_PROXY], PROXY_COLOUR);
    this.addRamps(root, ramps);
    this.registerColliders(blocks, ramps);
  }

  dispose(): void {
    this.world?.removeChunk(OWNER);
    this.world = null;
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }

  /** Flat, and not a collider: ground collision is analytic (WORLD_DESIGN.md §6). */
  private addGround(root: Object3D): void {
    const geometry = new PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2);
    const material = new MeshStandardMaterial({
      color: new Color(GROUND_COLOUR),
      roughness: 0.95,
    });
    const ground = new Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.name = 'test_world_ground';
    root.add(ground);
    this.track(ground, geometry, material);
  }

  private addBlocks(
    root: Object3D,
    blocks: readonly Extract<GreyBoxPiece, { kind: 'box' }>[],
    colour: number,
  ): void {
    if (blocks.length === 0) return;
    // One unit cube, scaled per instance: every block is one draw call together.
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({ color: new Color(colour), roughness: 0.8 });
    const mesh = new InstancedMesh(geometry, material, blocks.length);
    mesh.name = `test_world_blocks_${colour.toString(16)}`;

    const matrix = new Matrix4();
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block === undefined) continue;
      composeYaw(matrix, block.center, block.size, block.yaw);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    this.track(mesh, geometry, material);
  }

  private addRamps(
    root: Object3D,
    ramps: readonly Extract<GreyBoxPiece, { kind: 'ramp' }>[],
  ): void {
    if (ramps.length === 0) return;
    // A unit wedge — run 1, rise 1, width 1 — scaled per instance, so pitch costs nothing.
    const geometry = unitWedgeGeometry();
    const material = new MeshStandardMaterial({ color: new Color(RAMP_COLOUR), roughness: 0.85 });
    const mesh = new InstancedMesh(geometry, material, ramps.length);
    mesh.name = 'test_world_ramps';

    const matrix = new Matrix4();
    for (let i = 0; i < ramps.length; i++) {
      const ramp = ramps[i];
      if (ramp === undefined) continue;
      const rise = riseOf(ramp.run, ramp.degrees);
      // The wedge's own origin is the centre of its base, matching the collider.
      composeYaw(matrix, ramp.center, [ramp.run, rise, ramp.width], ramp.yaw);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    this.track(mesh, geometry, material);
  }

  /**
   * Every piece gets a collider, under one owner key. Ramps carry their base height and
   * rise, so `ground.ts` reads the slope rather than the block enclosing it.
   */
  private registerColliders(
    blocks: readonly Extract<GreyBoxPiece, { kind: 'box' }>[],
    ramps: readonly Extract<GreyBoxPiece, { kind: 'ramp' }>[],
  ): void {
    const world = this.world;
    if (world === null) return;

    for (const block of blocks) {
      world.add(
        {
          kind: 'box',
          center: new Vector3(block.center[0], block.center[1], block.center[2]),
          halfExtents: new Vector3(block.size[0] / 2, block.size[1] / 2, block.size[2] / 2),
          yaw: block.yaw,
        },
        OWNER,
      );
    }
    world.add(
      {
        kind: 'box',
        center: new Vector3(HUMAN_PROXY.center[0], HUMAN_PROXY.center[1], HUMAN_PROXY.center[2]),
        halfExtents: new Vector3(
          HUMAN_PROXY.size[0] / 2,
          HUMAN_PROXY.size[1] / 2,
          HUMAN_PROXY.size[2] / 2,
        ),
        yaw: HUMAN_PROXY.yaw,
      },
      OWNER,
    );

    for (const ramp of ramps) {
      world.add(
        {
          kind: 'ramp',
          center: new Vector3(ramp.center[0], ramp.center[1] + ramp.baseHeight / 2, ramp.center[2]),
          halfExtents: new Vector3(ramp.run / 2, ramp.baseHeight / 2, ramp.width / 2),
          yaw: ramp.yaw,
          rise: riseOf(ramp.run, ramp.degrees),
        },
        OWNER,
      );
    }
  }

  private track(object: Object3D, ...resources: { dispose(): void }[]): void {
    this.disposables.push({
      dispose: () => {
        object.removeFromParent();
        for (const resource of resources) resource.dispose();
      },
    });
  }
}

/** Rise of a ramp of this run at this pitch. */
export function riseOf(run: number, degrees: number): number {
  return run * Math.tan((degrees * Math.PI) / 180);
}

/** Position + yaw + non-uniform scale, without allocating a Quaternion per instance. */
function composeYaw(
  out: Matrix4,
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  yaw: number,
): void {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // Same yaw convention as physics/shapes.ts: local +X maps to (cos, -sin).
  out.set(
    cos * size[0],
    0,
    sin * size[2],
    center[0],
    0,
    size[1],
    0,
    center[1],
    -sin * size[0],
    0,
    cos * size[2],
    center[2],
    0,
    0,
    0,
    1,
  );
}

/**
 * A wedge in a unit box: its base spans ±0.5 in X and Z, its top face climbs from y = 0
 * at -X to y = 1 at +X. Scaling gives any run, rise and width — which is why one geometry
 * serves every ramp in the world.
 */
function unitWedgeGeometry(): BufferGeometry {
  // Six vertices: a triangular prism lying across Z.
  const positions = new Float32Array([
    // low edge (-X) bottom, high edge (+X) bottom, high edge (+X) top
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5,
  ]);
  const indices = [
    // near triangle, far triangle
    0, 2, 1, 3, 4, 5,
    // sloped top
    0, 3, 5, 0, 5, 2,
    // vertical back face at +X
    1, 2, 5, 1, 5, 4,
    // bottom
    0, 1, 4, 0, 4, 3,
  ];

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
