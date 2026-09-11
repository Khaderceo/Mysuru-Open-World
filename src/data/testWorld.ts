// Grey-box playground layout (TASKS.md T-2.4). Typed data, no behaviour — ADR-011.
//
// Every feature here exists to tune one thing in PLAYER_ARCHITECTURE.md §3: the kerb
// heights bracket the 0.35 m step-up, the ramps bracket the 45° walkable slope, the gaps
// bracket the 0.7 m capsule diameter. When a number here changes, it is because a
// documented constant it brackets changed.
//
// Dev content. `world/TestWorld.ts` builds it, and both are deleted in one commit when
// the real city arrives (Phase 3).

/** A grey-box block. `size` is full width/height/depth in metres, `center` its middle. */
export interface GreyBoxBlock {
  readonly kind: 'box';
  readonly label: string;
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly yaw: number;
}

/**
 * A ramp. `run` is its length up the slope, `width` across it, `baseHeight` the solid
 * plinth under the slope, and `degrees` the pitch — the rise follows from run and pitch.
 * The surface climbs towards local +X.
 */
export interface GreyBoxRamp {
  readonly kind: 'ramp';
  readonly label: string;
  /** Centre of the base box, at ground level. */
  readonly center: readonly [number, number, number];
  readonly run: number;
  readonly width: number;
  readonly baseHeight: number;
  readonly degrees: number;
  readonly yaw: number;
}

export type GreyBoxPiece = GreyBoxBlock | GreyBoxRamp;

/** Half-width of the ground plane in metres. Big enough to run in, small enough to read. */
export const GROUND_HALF = 30;

/** Where the player starts: clear ground, facing the kerbs. */
export const TEST_SPAWN: readonly [number, number, number] = [0, 0, 10];

/** A 1.8 m proxy, so every other height in the scene can be judged against a person. */
export const HUMAN_PROXY: GreyBoxBlock = {
  kind: 'box',
  label: 'human_proxy_1m8',
  center: [-2, 0.9, 9],
  size: [0.5, 1.8, 0.3],
  yaw: 0,
};

function kerb(label: string, height: number, x: number): GreyBoxBlock {
  return {
    kind: 'box',
    label,
    center: [x, height / 2, 2],
    size: [3, height, 6],
    yaw: 0,
  };
}

function step(index: number): GreyBoxBlock {
  const rise = 0.2;
  const tread = 0.4;
  const height = rise * (index + 1);
  return {
    kind: 'box',
    label: `stair_${String(index)}`,
    center: [-14 + index * tread, height / 2, -6],
    size: [tread, height, 4],
    yaw: 0,
  };
}

function gapWall(label: string, x: number, z: number, depth: number): GreyBoxBlock {
  return { kind: 'box', label, center: [x, 1.25, z], size: [1, 2.5, depth], yaw: 0 };
}

function gridBlock(ix: number, iz: number): GreyBoxBlock {
  return {
    kind: 'box',
    label: `grid_${String(ix)}_${String(iz)}`,
    center: [14 + ix * 3, 0.5, -12 + iz * 3],
    size: [1, 1, 1],
    yaw: ix === iz ? Math.PI / 6 : 0,
  };
}

/**
 * The pieces, in one flat list. Order is irrelevant to behaviour; it is grouped by
 * feature so the file reads as a map.
 */
export const TEST_WORLD_PIECES: readonly GreyBoxPiece[] = [
  // Kerbs: below, exactly at, and above the 0.35 m step-up limit.
  kerb('kerb_015', 0.15, -8),
  kerb('kerb_035', 0.35, -4),
  kerb('kerb_050', 0.5, 0),

  // Ramps: comfortably walkable, exactly at the 45° limit, and past it.
  {
    kind: 'ramp',
    label: 'ramp_20',
    center: [6, 0, 2],
    run: 6,
    width: 4,
    baseHeight: 0,
    degrees: 20,
    yaw: 0,
  },
  {
    kind: 'ramp',
    label: 'ramp_45',
    center: [13, 0, 2],
    run: 4,
    width: 4,
    baseHeight: 0,
    degrees: 45,
    yaw: 0,
  },
  {
    kind: 'ramp',
    label: 'ramp_50',
    center: [20, 0, 2],
    run: 4,
    width: 4,
    baseHeight: 0,
    degrees: 50,
    yaw: 0,
  },

  // A stair run of five 0.2 m steps: each one is climbable, the run tests repeated snaps.
  step(0),
  step(1),
  step(2),
  step(3),
  step(4),

  // Narrow gaps bracketing the 0.7 m capsule: 0.9 m passes, 0.5 m does not.
  gapWall('gap_wide_left', -6, -14, 4),
  gapWall('gap_wide_right', -6 + 1 + 0.9, -14, 4),
  gapWall('gap_tight_left', 0, -14, 4),
  gapWall('gap_tight_right', 0 + 1 + 0.5, -14, 4),

  // A wall corner, for the resolver's corner case and the camera's probe.
  { kind: 'box', label: 'corner_wall_x', center: [8, 1.5, -18], size: [12, 3, 0.5], yaw: 0 },
  { kind: 'box', label: 'corner_wall_z', center: [2.25, 1.5, -12.25], size: [0.5, 3, 12], yaw: 0 },

  // A box grid — no moving platforms anywhere in this world, by design.
  gridBlock(0, 0),
  gridBlock(1, 0),
  gridBlock(2, 0),
  gridBlock(0, 1),
  gridBlock(1, 1),
  gridBlock(2, 1),
  gridBlock(0, 2),
  gridBlock(1, 2),
  gridBlock(2, 2),

  HUMAN_PROXY,
];
