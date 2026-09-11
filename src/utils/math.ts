// Scalar helpers shared by modules that must not depend on each other (CODING_RULES §2).
//
// Deliberately tiny: only what a caller in `src/` already needs. Later tasks add to it
// when they have a second user — a utils module that grows ahead of its callers is how
// duplicate maths creeps in (`CLAUDE_WORKFLOW.md` §9).

/** Below this, a length or a ray-slab denominator is treated as zero. */
export const EPSILON = 1e-6;

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
