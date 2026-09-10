// The single requestAnimationFrame driver (WEB_ARCHITECTURE.md section 3, ADR-012).
//
// Hybrid fixed/variable: simulation steps at a fixed 60 Hz so collision and vehicle
// handling stay stable and tunnel-free, while camera, animation and UI get the true
// frame delta plus `alpha` so they are smooth at 60, 120 or 144 Hz.
//
// The input snapshot the pseudocode calls first lands with T-1.8; rendering is a
// callback so `core` never imports `rendering`.

import { Clock, type TimeSource } from './Clock';

/** Seconds per simulation step. */
export const FIXED_DT = 1 / 60;

/** Most fixed steps one frame may run before remaining debt is dropped. */
export const MAX_STEPS = 5;

export type FrameRequest = (callback: (nowMs: number) => void) => number;
export type FrameCancel = (handle: number) => void;

export interface LoopCallbacks {
  /** Fixed-step simulation. Called 0..MAX_STEPS times per frame with exactly FIXED_DT. */
  readonly fixedUpdate: (fixedDt: number) => void;
  /** Rate-limited systems. Called once per frame with the clamped frame delta. */
  readonly update: (dt: number) => void;
  /** Per-frame visuals. `alpha` is the fraction of a step left unconsumed. */
  readonly lateUpdate: (dt: number, alpha: number) => void;
  /** Called last, once per frame. Never more than once — see UI_ARCHITECTURE minimap. */
  readonly render: () => void;
}

export interface LoopOptions {
  /** Injected in tests to drive frames by hand. Defaults to requestAnimationFrame. */
  readonly requestFrame?: FrameRequest;
  readonly cancelFrame?: FrameCancel;
  /** Injected in tests. Defaults to performance.now, used only for the first frame. */
  readonly now?: TimeSource;
}

const defaultRequest: FrameRequest = (callback) => requestAnimationFrame(callback);
const defaultCancel: FrameCancel = (handle) => {
  cancelAnimationFrame(handle);
};
const defaultNow: TimeSource = () => performance.now();

export class Loop {
  readonly clock = new Clock();

  private readonly callbacks: LoopCallbacks;
  private readonly requestFrame: FrameRequest;
  private readonly cancelFrame: FrameCancel;
  private readonly now: TimeSource;

  private accumulator = 0;
  private currentAlpha = 0;
  private handle: number | null = null;
  private running = false;
  private paused = false;
  private visibilityBound = false;

  constructor(callbacks: LoopCallbacks, options: LoopOptions = {}) {
    this.callbacks = callbacks;
    this.requestFrame = options.requestFrame ?? defaultRequest;
    this.cancelFrame = options.cancelFrame ?? defaultCancel;
    this.now = options.now ?? defaultNow;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Fraction of a fixed step left unconsumed, in [0, 1). Exposed for tests. */
  get alpha(): number {
    return this.currentAlpha;
  }

  /** Unconsumed simulation debt in seconds. Exposed for tests. */
  get debt(): number {
    return this.accumulator;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.clock.discardElapsed(this.now());
    this.bindVisibility();
    this.schedule();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.handle !== null) {
      this.cancelFrame(this.handle);
      this.handle = null;
    }
    this.unbindVisibility();
  }

  /** Stops requesting frames without tearing down. Simulation debt is dropped. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.handle !== null) {
      this.cancelFrame(this.handle);
      this.handle = null;
    }
    this.accumulator = 0;
  }

  /**
   * Resumes and **discards** the time spent paused, so a backgrounded tab does not
   * fast-forward the world on its first frame back.
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.clock.discardElapsed(this.now());
    if (this.running) this.schedule();
  }

  /** Runs exactly one frame. Public so tests can step deterministically. */
  step(nowMs: number): void {
    const dt = this.clock.advance(nowMs);
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      this.callbacks.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) {
      // Drop the debt rather than spiral: catching up would make the next frame slower
      // still, which is how a stall becomes a freeze.
      this.accumulator = 0;
    }

    this.currentAlpha = this.accumulator / FIXED_DT;
    this.callbacks.update(dt);
    this.callbacks.lateUpdate(dt, this.currentAlpha);
    this.callbacks.render();
  }

  private schedule(): void {
    this.handle = this.requestFrame((nowMs) => {
      this.handle = null;
      if (!this.running || this.paused) return;
      this.step(nowMs);
      if (this.running && !this.paused) this.schedule();
    });
  }

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  private bindVisibility(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.visibilityBound = true;
  }

  private unbindVisibility(): void {
    if (!this.visibilityBound) return;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.visibilityBound = false;
  }
}
