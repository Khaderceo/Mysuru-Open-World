// Per-system update rates (WEB_ARCHITECTURE.md section 4).
//
// Not everything runs every frame: interaction resolves at 10 Hz, streaming at 4 Hz,
// ambience at 2 Hz. Rate-limiting the systems that tolerate it is what makes the frame
// budget in PERFORMANCE.md section 3 close.
//
// Two rules the implementation must honour:
//   - A rate-limited system receives the **accumulated** dt since its last run, never
//     FIXED_DT, so its own integration stays correct.
//   - Entries carry a phase offset so systems at the same rate do not all fire on the
//     same frame and spike it.

import type { TimeSource } from './Clock';
import type { GameContext } from './GameContext';
import type { System, SystemId } from './System';

export interface SystemSchedule {
  /** Target rate. Omit, 0 or negative means every frame. */
  readonly hz?: number;
  /**
   * 0..1 extra fraction of a period to delay the first run by, on top of the first full
   * period. Spreads systems that share a rate across different frames.
   */
  readonly phase?: number;
}

export interface SystemTiming {
  readonly id: SystemId;
  /** Milliseconds spent in the most recent call. */
  readonly lastMs: number;
  /** Rolling average in milliseconds, for the T-1.6 overlay. */
  readonly avgMs: number;
  readonly calls: number;
}

interface Entry {
  readonly system: System;
  /** Seconds between runs. 0 means every frame. */
  readonly period: number;
  /** dt accumulated since this entry last ran. */
  accumulated: number;
  /**
   * Seconds until the next run. Starts at one full period plus the phase offset, so a
   * rate-limited system never fires on its first frame carrying a partial dt.
   */
  wait: number;
}

/** Weight of the newest sample in the rolling average. */
const TIMING_SMOOTHING = 0.1;

interface Timing {
  lastMs: number;
  avgMs: number;
  calls: number;
}

export class Scheduler {
  private readonly entries: Entry[] = [];
  private readonly timings = new Map<SystemId, Timing>();
  private readonly now: TimeSource;

  constructor(now: TimeSource) {
    this.now = now;
  }

  add(system: System, schedule: SystemSchedule = {}): void {
    const hz = schedule.hz ?? 0;
    const period = hz > 0 ? 1 / hz : 0;
    const phase = schedule.phase ?? 0;
    this.entries.push({
      system,
      period,
      accumulated: 0,
      // One full period before the first run; `phase` pushes it later still so systems
      // sharing a rate do not all land on the same frame. Zero-period (every-frame)
      // entries stay at 0 and fire immediately.
      wait: period * (1 + phase),
    });
  }

  /** Runs every entry that is due, passing it the dt accumulated since its last run. */
  run(dt: number, ctx: GameContext): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry === undefined) continue;

      entry.accumulated += dt;
      entry.wait -= dt;
      if (entry.wait > 0) continue;

      const update = entry.system.update;
      if (update !== undefined) {
        this.measure(entry.system.id, () => {
          update.call(entry.system, entry.accumulated, ctx);
        });
      }

      entry.accumulated = 0;
      // Advancing by one period keeps the average rate stable; clamping stops a long
      // stall from queueing a burst of catch-up runs.
      entry.wait += entry.period;
      if (entry.wait < 0) entry.wait = 0;
    }
  }

  /** Times `work` and records it against `id`. Used by the loop for its own phases too. */
  measure(id: SystemId, work: () => void): void {
    const start = this.now();
    work();
    this.record(id, this.now() - start);
  }

  record(id: SystemId, ms: number): void {
    const existing = this.timings.get(id);
    if (existing === undefined) {
      this.timings.set(id, { lastMs: ms, avgMs: ms, calls: 1 });
      return;
    }
    existing.lastMs = ms;
    existing.avgMs += (ms - existing.avgMs) * TIMING_SMOOTHING;
    existing.calls++;
  }

  /** Snapshot for the debug overlay (T-1.6). Allocates, so never call it per frame. */
  timingSnapshot(): readonly SystemTiming[] {
    const out: SystemTiming[] = [];
    for (const [id, timing] of this.timings) {
      out.push({ id, lastMs: timing.lastMs, avgMs: timing.avgMs, calls: timing.calls });
    }
    return out;
  }
}
