// Collider and broadphase visualisation (PLAYER_ARCHITECTURE.md §2: "the single
// highest-value debugging tool in the project", PERFORMANCE.md §7).
//
// Two LineSegments and one shared material, so the whole view costs two draw calls. The
// collider and cell geometry is rebuilt only when the collision world's revision changes;
// the capsule is a separate object whose transform moves every sync, because it follows
// the player and its shape never changes.
//
// The sources are declared here as structural interfaces rather than imported from
// `physics` and `player`: `debug/` is reached only by the guarded hook in core, and
// keeping it structurally typed means it takes on no module dependencies at all.

import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  type Object3D,
} from 'three';

/** What a collider looks like to this view: its OBB, plus a ramp's rise if it has one. */
export interface ColliderShape {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  cos: number;
  sin: number;
  /** Height the top gains across local +X. 0 for a box or a wall. */
  rise: number;
}

/** The collision world, as much of it as drawing needs. Satisfied by `CollisionWorld`. */
export interface ColliderDebugSource {
  /** Bumped by every add and remove, so the view can skip rebuilding when nothing moved. */
  readonly revision: number;
  readonly cellSize: number;
  forEachCollider(visit: (shape: ColliderShape) => void): void;
  forEachOccupiedCell(visit: (cellX: number, cellZ: number) => void): void;
}

/** The player's collider, for the one capsule worth drawing. Satisfied by `PlayerSystem`. */
export interface CapsuleDebugSource {
  debugCapsule(): { x: number; y: number; z: number; radius: number; height: number } | null;
}

/** Cell outlines sit just above the ground so they do not z-fight with it. */
const CELL_Y = 0.02;
/** Segments per capsule ring. Enough to read as round, cheap enough to rebuild never. */
const RING_SEGMENTS = 16;

/** Box edges as vertex index pairs into the eight corners. */
const BOX_EDGES = [0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7] as const;

export class ColliderView {
  /** One shared line material for every part of the view, per the acceptance criteria. */
  private readonly material = new LineBasicMaterial({
    color: 0x49e0a6,
    transparent: true,
    opacity: 0.75,
  });

  private readonly staticGeometry = new BufferGeometry();
  private readonly staticLines = new LineSegments(this.staticGeometry, this.material);
  private readonly capsuleGeometry = new BufferGeometry();
  private readonly capsuleLines = new LineSegments(this.capsuleGeometry, this.material);

  /** Grown as needed and reused; a rebuild writes into it rather than allocating afresh. */
  private vertices = new Float32Array(3 * 256);
  private vertexCount = 0;

  private builtRevision = -1;
  private builtCapsuleShape = '';
  private attached = false;
  private isVisible = false;

  constructor(private readonly root: Object3D) {
    this.staticLines.visible = false;
    this.capsuleLines.visible = false;
    this.staticLines.frustumCulled = false;
    this.capsuleLines.frustumCulled = false;
  }

  get visible(): boolean {
    return this.isVisible;
  }

  /** Show or hide the whole view. Hidden costs nothing: `sync` returns immediately. */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.staticLines.visible = visible;
    this.capsuleLines.visible = visible;
    if (visible && !this.attached) {
      this.root.add(this.staticLines);
      this.root.add(this.capsuleLines);
      this.attached = true;
    }
  }

  /**
   * Bring the view up to date. Cheap when nothing changed: the collider and cell geometry
   * is skipped entirely unless the world's revision moved.
   */
  sync(world: ColliderDebugSource, player: CapsuleDebugSource | null): void {
    if (!this.isVisible) return;

    if (world.revision !== this.builtRevision) {
      this.rebuildStatic(world);
      this.builtRevision = world.revision;
    }

    const capsule = player?.debugCapsule() ?? null;
    if (capsule === null) {
      this.capsuleLines.visible = false;
      return;
    }
    this.capsuleLines.visible = true;

    // Only the shape justifies a rebuild; moving is a transform.
    const shape = `${capsule.radius}:${capsule.height}`;
    if (shape !== this.builtCapsuleShape) {
      this.rebuildCapsule(capsule.radius, capsule.height);
      this.builtCapsuleShape = shape;
    }
    this.capsuleLines.position.set(capsule.x, capsule.y, capsule.z);
  }

  dispose(): void {
    this.staticLines.removeFromParent();
    this.capsuleLines.removeFromParent();
    this.staticGeometry.dispose();
    this.capsuleGeometry.dispose();
    this.material.dispose();
    this.attached = false;
  }

  private rebuildStatic(world: ColliderDebugSource): void {
    this.vertexCount = 0;

    world.forEachCollider((shape) => {
      this.addObbEdges(shape);
    });

    world.forEachOccupiedCell((cellX, cellZ) => {
      const minX = cellX * world.cellSize;
      const minZ = cellZ * world.cellSize;
      const maxX = minX + world.cellSize;
      const maxZ = minZ + world.cellSize;
      // Four edges, drawn as a flat square on the ground plane.
      this.addSegment(minX, CELL_Y, minZ, maxX, CELL_Y, minZ);
      this.addSegment(maxX, CELL_Y, minZ, maxX, CELL_Y, maxZ);
      this.addSegment(maxX, CELL_Y, maxZ, minX, CELL_Y, maxZ);
      this.addSegment(minX, CELL_Y, maxZ, minX, CELL_Y, minZ);
    });

    this.commit(this.staticGeometry);
  }

  /** The eight corners of a yaw-only box, plus the four raised by a ramp's rise. */
  private addObbEdges(shape: ColliderShape): void {
    const corners = _corners;
    for (let i = 0; i < 8; i++) {
      const sx = (i & 1) === 0 ? -1 : 1;
      const sy = (i & 2) === 0 ? -1 : 1;
      const sz = (i & 4) === 0 ? -1 : 1;
      const lx = sx * shape.hx;
      const lz = sz * shape.hz;
      // A ramp's top face climbs across local +X; its bottom face is flat.
      const lift = sy > 0 && shape.rise !== 0 ? (sx > 0 ? shape.rise : 0) : 0;
      const base = i * 3;
      corners[base] = shape.cx + lx * shape.cos + lz * shape.sin;
      corners[base + 1] = shape.cy + sy * shape.hy + lift;
      corners[base + 2] = shape.cz - lx * shape.sin + lz * shape.cos;
    }

    for (let e = 0; e < BOX_EDGES.length; e += 2) {
      const a = (BOX_EDGES[e] ?? 0) * 3;
      const b = (BOX_EDGES[e + 1] ?? 0) * 3;
      this.addSegment(
        corners[a] ?? 0,
        corners[a + 1] ?? 0,
        corners[a + 2] ?? 0,
        corners[b] ?? 0,
        corners[b + 1] ?? 0,
        corners[b + 2] ?? 0,
      );
    }
  }

  /** Capsule drawn in its own local space: three rings and four uprights. */
  private rebuildCapsule(radius: number, height: number): void {
    this.vertexCount = 0;
    const low = radius;
    const high = height - radius;
    const mid = (low + high) / 2;

    for (const y of [low, mid, high]) {
      for (let i = 0; i < RING_SEGMENTS; i++) {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        const b = ((i + 1) / RING_SEGMENTS) * Math.PI * 2;
        this.addSegment(
          Math.cos(a) * radius,
          y,
          Math.sin(a) * radius,
          Math.cos(b) * radius,
          y,
          Math.sin(b) * radius,
        );
      }
    }

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      this.addSegment(x, low, z, x, high, z);
    }

    // The caps, as two crossed arcs each, so the ends do not look open.
    this.addSegment(-radius, low, 0, 0, 0, 0);
    this.addSegment(radius, low, 0, 0, 0, 0);
    this.addSegment(0, low, -radius, 0, 0, 0);
    this.addSegment(0, low, radius, 0, 0, 0);
    this.addSegment(-radius, high, 0, 0, height, 0);
    this.addSegment(radius, high, 0, 0, height, 0);
    this.addSegment(0, high, -radius, 0, height, 0);
    this.addSegment(0, high, radius, 0, height, 0);

    this.commit(this.capsuleGeometry);
  }

  private addSegment(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    this.ensureCapacity(this.vertexCount + 2);
    let at = this.vertexCount * 3;
    this.vertices[at] = ax;
    this.vertices[at + 1] = ay;
    this.vertices[at + 2] = az;
    at += 3;
    this.vertices[at] = bx;
    this.vertices[at + 1] = by;
    this.vertices[at + 2] = bz;
    this.vertexCount += 2;
  }

  private ensureCapacity(vertices: number): void {
    if (vertices * 3 <= this.vertices.length) return;
    let size = this.vertices.length * 2;
    while (vertices * 3 > size) size *= 2;
    const grown = new Float32Array(size);
    grown.set(this.vertices);
    this.vertices = grown;
  }

  /** Copy exactly the vertices written into a fresh attribute for this geometry. */
  private commit(geometry: BufferGeometry): void {
    const data = this.vertices.slice(0, this.vertexCount * 3);
    geometry.setAttribute('position', new BufferAttribute(data, 3));
    geometry.setDrawRange(0, this.vertexCount);
    geometry.computeBoundingSphere();
  }
}

/** Scratch corners, shared by every OBB drawn in one rebuild. */
const _corners = new Float32Array(8 * 3);
