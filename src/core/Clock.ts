// Frame timing. Owns nothing but time.
//
// The clamp is the tab-switch and stall guard from WEB_ARCHITECTURE.md section 3: a
// frame that took 500 ms must not be integrated as 500 ms, or the player teleports
// through walls on the first frame back.

/** Monotonic milliseconds, e.g. `performance.now`. Injected so the loop is testable. */
export type TimeSource = () => number;

/** Seconds. A frame longer than this is treated as this long. */
export const MAX_FRAME_DT = 0.1;

export class Clock {
  private lastMs: number | null = null;
  private currentDt = 0;
  private totalElapsed = 0;
  private frames = 0;

  /** Advances to `nowMs` and returns the clamped delta in seconds. */
  advance(nowMs: number): number {
    if (this.lastMs === null) {
      // First frame has no previous timestamp; a zero delta is correct rather than a
      // delta measured from page load, which would be large and meaningless.
      this.lastMs = nowMs;
      this.currentDt = 0;
      this.frames++;
      return 0;
    }
    const raw = (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;
    this.currentDt = raw > MAX_FRAME_DT ? MAX_FRAME_DT : raw < 0 ? 0 : raw;
    this.totalElapsed += this.currentDt;
    this.frames++;
    return this.currentDt;
  }

  /**
   * Discards the time since the last frame without integrating it. Called when the page
   * becomes visible again so a backgrounded tab does not fast-forward the world
   * (WEB_ARCHITECTURE.md section 6).
   */
  discardElapsed(nowMs: number): void {
    this.lastMs = nowMs;
    this.currentDt = 0;
  }

  /** Clamped delta of the most recent frame, in seconds. */
  get dt(): number {
    return this.currentDt;
  }

  /** Total integrated time in seconds — excludes anything discarded. */
  get elapsed(): number {
    return this.totalElapsed;
  }

  get frame(): number {
    return this.frames;
  }
}
