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

  /**
   * Apex the jump velocity is derived from, and that velocity.
   *
   * T-2.7 note: PLAYER_ARCHITECTURE.md §3 reads "Jump apex 0.55 m (initial vy ≈ 3.3 m/s
   * with g = 20 m/s²)", but those two do not agree — 3.3²/(2×20) is 0.272 m, less than
   * half the stated apex. The row's headline value is the apex, so that is what is
   * honoured here: v = √(2gh) = √(2×20×0.55) = 4.69 m/s. The document's parenthetical is
   * the part that is wrong, and is flagged in TASKS.md rather than edited from here.
   */
  jumpApex: 0.55,
  jumpVelocity: 4.69,
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

/**
 * Camera rig (CAMERA_ARCHITECTURE.md §2–5). Time constants are seconds; §4 requires they
 * live here. Vehicle mode is a second parameter set, added by its own task (T-5.x) —
 * "adding a mode is adding data, not code".
 */
export const CAMERA = {
  /** ThirdPersonWalk, the only mode Phase 2 has. */
  walk: {
    distance: 4.0,
    minDistance: 2.5,
    maxDistance: 6.0,
    /** Anchor height above the player's feet, and the shoulder offset to its right. */
    height: 1.55,
    shoulder: 0.35,
    fov: 60,
    pitchMinDeg: -35,
    pitchMaxDeg: 70,
  },

  /** Radians per pixel of mouse movement. Never multiplied by dt (§3). */
  sensitivity: 0.0022,
  /** Metres of distance change per unit of wheel delta. */
  zoomRate: 0.005,

  /** Probe sphere radius, and how far the four corner rays sit off the centre ray. */
  probeRadius: 0.25,
  probeRingOffset: 0.2,
  /** The camera never sits closer than this above the ground (§5.4). */
  groundClearance: 0.3,
  /** Where the camera goes when the anchor itself is inside geometry (§5.5). */
  fallbackHeight: 2.6,

  tau: {
    anchor: 0.08,
    position: 0.1,
    vehicleYaw: 0.25,
    fov: 0.3,
    /** Slow push-out after an obstruction clears; pulling in is immediate (§4). */
    distanceRecover: 0.2,
  },
} as const;
