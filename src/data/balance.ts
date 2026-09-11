// Movement and feel constants (PLAYER_ARCHITECTURE.md §3). Data, not behaviour — ADR-011.
//
// Every number the player controller tunes lives here and nowhere else, because T-2.7 is
// a tuning pass that changes values in this file and touches no logic at all. If a
// controller file grows a numeric literal that affects feel, it belongs here instead.
//
// Gravity is game-feel gravity, not 9.81: PLAYER_ARCHITECTURE.md §3 sets it at 20 m/s²
// and derives the jump velocity from the 0.55 m apex it wants.

/** The player capsule and how it moves. All lengths in metres, all times in seconds. */
export const PLAYER = {
  /** Capsule radius; total height including both caps. */
  radius: 0.35,
  height: 1.8,
  /** Eye height, for the camera anchor and the human proxy's scale. */
  eyeHeight: 1.65,

  walkSpeed: 1.8,
  runSpeed: 4.5,

  /** Ground acceleration / deceleration, m/s². */
  groundAccel: 12,
  groundDecel: 16,
  /** Air acceleration / deceleration — much lower, so a jump commits. */
  airAccel: 2,
  airDecel: 1,

  /** Velocity-space steering time constant toward the input direction, seconds. */
  turnTau: 0.12,

  /** Apex the jump velocity is derived from, and the derived velocity itself. */
  jumpApex: 0.55,
  jumpVelocity: 3.3,
  gravity: 20,
  terminalFall: 25,

  /** Steepest surface that counts as ground. */
  maxWalkableSlopeDeg: 45,
  /** Kerbs and single steps up to this are climbed without a jump. */
  stepUp: 0.35,

  /** Grace after walking off an edge during which a jump still works. */
  coyoteTime: 0.1,
  /** Grace before landing during which a jump press is remembered. */
  jumpBuffer: 0.12,

  /**
   * How far above the ground the capsule is still considered standing on it, and is
   * snapped down. Larger than the sweep's skin, smaller than a step.
   */
  groundSnap: 0.05,
} as const;

/** Cosine of the walkable-slope limit, so the hot path compares without a trig call. */
export const MAX_WALKABLE_SLOPE_COS = Math.cos((PLAYER.maxWalkableSlopeDeg * Math.PI) / 180);

/** Speed below which the controller treats the player as standing still. */
export const IDLE_SPEED = 0.05;
