// The single game-state tree (ARCHITECTURE.md section 5).
//
// Holds ONLY persistable, gameplay-meaningful data. Transient data — velocities,
// animation phase, pooled agents, GPU handles — stays inside the owning system.
// If it is not here, SaveSystem (T-10.1) does not save it, which is the point.
//
// **Every field names its single owning system. Anything else mutating it is a bug.**
// Each owning task adds its own branch here as it lands; the branches still missing are
// player + camera transforms (T-2.5 / T-2.6), inventory + missions (T-8.3 / T-8.4),
// discovered anchors (T-8.8), vehicles (T-5.7) and settings (T-10.7). They are absent
// rather than stubbed because their id types belong to those tasks.

export interface GameState {
  /**
   * Owner: core. Shape version of this tree. SaveSystem (T-10.1) maps it onto the save
   * file's `version` and its migration chain; bump it when a branch changes incompatibly.
   */
  readonly schema: number;

  /** Owner: world/TimeOfDay (T-9.1). */
  time: {
    /** 0..24, fractional. */
    hour: number;
    dayCount: number;
    paused: boolean;
  };

  /** Owner: missions/economy (T-8.5). Its `addMoney()` is the only writer. */
  economy: {
    money: number;
    totalEarned: number;
  };

  /** Owner: missions (T-8.4) for gameplay flags; read by anyone. */
  flags: Record<string, boolean>;
}

export const STATE_SCHEMA_VERSION = 1;

/**
 * Defaults come from data/balance.ts once it exists (T-2.5); until then the only
 * meaningful default is a zeroed tree at the documented start of day.
 */
export function createInitialState(): GameState {
  return {
    schema: STATE_SCHEMA_VERSION,
    time: { hour: 8, dayCount: 0, paused: false },
    economy: { money: 0, totalEarned: 0 },
    flags: {},
  };
}
