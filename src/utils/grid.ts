// Uniform spatial grid over the XZ plane (PLAYER_ARCHITECTURE.md §2 broadphase).
//
// Generic on purpose. `physics` stores collider ids in one instance; `city/spatialIndex`
// (T-3.3) and `interaction` will store their own contents in other instances of the same
// class. One implementation, several instances — a second grid implementation is the
// duplication `CLAUDE_WORKFLOW.md` §9 names (`TASKS.md` T-2.1).

/**
 * Axis-aligned XZ footprint. Y is deliberately absent: the grid indexes the ground plane
 * and callers do the vertical test in their own narrowphase, which keeps the cell lists
 * short without paying for a third dimension the world does not need.
 */
export interface GridFootprint {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Bulk-removal key — a chunk id for physics, a block id for city content. `string | number`
 * because the owning module names its own keys (`CODING_RULES.md` §3); world's `ChunkId`
 * (T-2.3) is assignable to it either way.
 */
export type GridOwner = string | number;

/**
 * Cells are addressed by one integer, so lookup allocates nothing and needs no tree
 * rebuilds. The bias makes negative coordinates non-negative before packing; at the 8 m
 * cells physics uses it spans ±262 km, four orders of magnitude past the 1 km² world
 * (`WORLD_DESIGN.md` §2), so no coordinate in this project can collide.
 */
const CELL_BIAS = 32768;
const CELL_STRIDE = 65536;

interface Entry {
  /** Every cell key this item was inserted into, for removal without a full scan. */
  readonly cells: readonly number[];
  readonly owner: GridOwner | null;
}

export class UniformGrid<T> {
  private readonly cells = new Map<number, T[]>();
  private readonly entries = new Map<T, Entry>();
  private readonly byOwner = new Map<GridOwner, T[]>();

  /** Reused across queries so a query allocates nothing. See `query`. */
  private readonly seen = new Set<T>();

  constructor(readonly cellSize: number) {
    if (!(cellSize > 0)) {
      throw new Error(`UniformGrid cellSize must be positive, got ${cellSize}`);
    }
  }

  /** How many distinct items the grid holds. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Insert an item under its footprint. Re-inserting an item that is already present
   * replaces its previous footprint, so a mover can be reinserted without leaking cells.
   */
  insert(item: T, footprint: GridFootprint, owner?: GridOwner): void {
    if (this.entries.has(item)) this.remove(item);

    const minCellX = this.cellIndex(footprint.minX);
    const maxCellX = this.cellIndex(footprint.maxX);
    const minCellZ = this.cellIndex(footprint.minZ);
    const maxCellZ = this.cellIndex(footprint.maxZ);

    // Allocated per insert, not per query: static colliders are inserted once at chunk
    // build and removed at chunk unload (PLAYER_ARCHITECTURE.md §2).
    const cells: number[] = [];
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const key = cellKey(cx, cz);
        let bucket = this.cells.get(key);
        if (bucket === undefined) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(item);
        cells.push(key);
      }
    }

    this.entries.set(item, { cells, owner: owner ?? null });
    if (owner !== undefined) {
      let owned = this.byOwner.get(owner);
      if (owned === undefined) {
        owned = [];
        this.byOwner.set(owner, owned);
      }
      owned.push(item);
    }
  }

  /** Remove one item. Returns false if it was not in the grid. */
  remove(item: T): boolean {
    const entry = this.entries.get(item);
    if (entry === undefined) return false;

    this.detach(item, entry);
    this.entries.delete(item);

    if (entry.owner !== null) {
      const owned = this.byOwner.get(entry.owner);
      if (owned !== undefined) {
        const at = owned.indexOf(item);
        if (at >= 0) owned.splice(at, 1);
        if (owned.length === 0) this.byOwner.delete(entry.owner);
      }
    }
    return true;
  }

  /**
   * Remove every item inserted under `owner` — one chunk unloading, in one call, without
   * touching anything else. Appends the removed items to `out` and returns how many.
   */
  removeOwner(owner: GridOwner, out: T[]): number {
    const owned = this.byOwner.get(owner);
    if (owned === undefined) return 0;

    // Copied by index because `remove` mutates `owned` as it goes.
    let removed = 0;
    for (let i = 0; i < owned.length; i++) {
      const item = owned[i];
      if (item === undefined) continue;
      const entry = this.entries.get(item);
      if (entry === undefined) continue;

      this.detach(item, entry);
      this.entries.delete(item);
      out[removed] = item;
      removed++;
    }
    this.byOwner.delete(owner);
    return removed;
  }

  /**
   * Items whose cells overlap `footprint`, written into `out` and counted by the return
   * value. Each item appears once however many cells it spans.
   *
   * Allocation-free in the steady state: the dedupe set is reused and `out` is filled by
   * index, so it only grows on a query wider than any before it. Not reentrant — do not
   * call it from inside a loop that is still reading a previous result.
   */
  query(footprint: GridFootprint, out: T[]): number {
    const minCellX = this.cellIndex(footprint.minX);
    const maxCellX = this.cellIndex(footprint.maxX);
    const minCellZ = this.cellIndex(footprint.minZ);
    const maxCellZ = this.cellIndex(footprint.maxZ);

    this.seen.clear();
    let found = 0;
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const bucket = this.cells.get(cellKey(cx, cz));
        if (bucket === undefined) continue;
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          if (item === undefined || this.seen.has(item)) continue;
          this.seen.add(item);
          out[found] = item;
          found++;
        }
      }
    }
    return found;
  }

  /** Drop every item and every cell. */
  clear(): void {
    this.cells.clear();
    this.entries.clear();
    this.byOwner.clear();
    this.seen.clear();
  }

  /** Which cell a world coordinate falls in, on either axis. */
  cellIndex(coordinate: number): number {
    return Math.floor(coordinate / this.cellSize);
  }

  /** Pull an item out of its cells, leaving ownership bookkeeping to the caller. */
  private detach(item: T, entry: Entry): void {
    for (let i = 0; i < entry.cells.length; i++) {
      const key = entry.cells[i];
      if (key === undefined) continue;
      const bucket = this.cells.get(key);
      if (bucket === undefined) continue;
      const at = bucket.indexOf(item);
      if (at >= 0) bucket.splice(at, 1);
      if (bucket.length === 0) this.cells.delete(key);
    }
  }
}

function cellKey(cellX: number, cellZ: number): number {
  return (cellX + CELL_BIAS) * CELL_STRIDE + (cellZ + CELL_BIAS);
}
