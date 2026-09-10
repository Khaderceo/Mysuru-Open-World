// Owns system lifecycle and the context (ARCHITECTURE.md section 1).
//
// `Game` knows lifecycle and order; it does not know gameplay. It owns the loop, the
// scheduler and the context, and dispatches the System contract's three update phases.
// Rendering is a callback so `core` never imports `rendering`.

import type { PerspectiveCamera, Scene } from 'three';
import { EventBus } from './EventBus';
import { Loop, type LoopOptions } from './Loop';
import { Scheduler, type SystemSchedule, type SystemTiming } from './Scheduler';
import { RuntimeContext, type GameContext } from './GameContext';
import type { Config } from './config';
import type { GameState } from './state';
import type { System, SystemId } from './System';

export interface InitProgress {
  /** Systems whose init has resolved. */
  readonly completed: number;
  readonly total: number;
  /** The system that just finished. */
  readonly systemId: SystemId;
}

export interface GameOptions {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly config: Config;
  readonly state: GameState;
  /** Reported after each system's init, for the T-1.7 loading screen. */
  readonly onProgress?: (progress: InitProgress) => void;
  /**
   * Called once per frame, after lateUpdate. The renderer is owned by `rendering`
   * (T-1.2) and passed in here so `core` keeps no dependency on it.
   */
  readonly onRender?: () => void;
  /** Injected in tests to drive frames by hand. */
  readonly loop?: LoopOptions;
}

type Phase = 'registering' | 'initialising' | 'ready' | 'disposed';

export class Game {
  private readonly systems: System[] = [];
  private readonly byId = new Map<SystemId, System>();
  /** Only systems whose init resolved, in init order, so dispose can unwind in reverse. */
  private readonly initialised: System[] = [];
  /** Declared rate per system, applied to the scheduler once that system has initialised. */
  private readonly schedules = new Map<SystemId, SystemSchedule>();
  /** Cached phase participants, so no per-frame filtering happens in the loop. */
  private readonly fixedUpdaters: System[] = [];
  private readonly lateUpdaters: System[] = [];
  private readonly runtime: RuntimeContext;
  private readonly options: GameOptions;
  private readonly scheduler: Scheduler;
  private readonly loop: Loop;
  private currentPhase: Phase = 'registering';

  constructor(options: GameOptions) {
    this.options = options;
    this.runtime = new RuntimeContext(
      options.config,
      options.state,
      options.scene,
      options.camera,
      (id) => this.byId.get(id),
    );

    this.scheduler = new Scheduler(() => performance.now());
    this.loop = new Loop(
      {
        fixedUpdate: (fixedDt) => this.dispatchFixed(fixedDt),
        update: (dt) => this.scheduler.run(dt, this.runtime),
        lateUpdate: (dt, alpha) => this.dispatchLate(dt, alpha),
        render: () => this.options.onRender?.(),
      },
      options.loop ?? {},
    );

    // Core infrastructure, not systems: both are available before any system
    // initialises, so a system may subscribe or read time in its own init().
    this.runtime.provide('events', new EventBus());
    this.runtime.provide('clock', this.loop.clock);
  }

  /** Per-system update timings for the T-1.6 debug overlay. */
  timings(): readonly SystemTiming[] {
    return this.scheduler.timingSnapshot();
  }

  get context(): GameContext {
    return this.runtime;
  }

  get phase(): Phase {
    return this.currentPhase;
  }

  get isRunning(): boolean {
    return this.loop.isRunning;
  }

  /**
   * Registration order is init order. `schedule` declares this system's `update` rate;
   * omit it for every frame. The System interface carries no rate of its own
   * (ARCHITECTURE.md section 2), so it is declared here.
   */
  register(system: System, schedule: SystemSchedule = {}): this {
    if (this.currentPhase !== 'registering') {
      throw new Error(
        `Game.register('${system.id}'): systems may only be registered before initSystems() (phase: ${this.currentPhase})`,
      );
    }
    if (this.byId.has(system.id)) {
      throw new Error(`Game.register('${system.id}'): a system with that id is already registered`);
    }
    this.byId.set(system.id, system);
    this.systems.push(system);
    this.schedules.set(system.id, schedule);
    return this;
  }

  /**
   * Initialises systems in declared order, awaiting each before starting the next, and
   * reporting progress. If one throws, everything already initialised is disposed in
   * reverse before the error is rethrown, so a failed boot leaks nothing.
   */
  async initSystems(): Promise<void> {
    if (this.currentPhase !== 'registering') {
      throw new Error(`Game.initSystems(): already called (phase: ${this.currentPhase})`);
    }
    this.currentPhase = 'initialising';

    const total = this.systems.length;
    for (const system of this.systems) {
      try {
        await system.init(this.runtime);
      } catch (cause) {
        this.unwind();
        this.currentPhase = 'disposed';
        // `Error.cause` needs the ES2022 lib; target is pinned to ES2020 (CODING_RULES.md
        // section 1), so the original is logged and its message carried in the rethrow.
        console.error(`[mow] system '${system.id}' failed to initialise`, cause);
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          `Game.initSystems(): system '${system.id}' failed to initialise: ${detail}`,
        );
      }
      this.initialised.push(system);
      // Only initialised systems are ever updated.
      this.scheduler.add(system, this.schedules.get(system.id) ?? {});
      if (system.fixedUpdate !== undefined) this.fixedUpdaters.push(system);
      if (system.lateUpdate !== undefined) this.lateUpdaters.push(system);
      this.options.onProgress?.({
        completed: this.initialised.length,
        total,
        systemId: system.id,
      });
    }

    this.currentPhase = 'ready';
  }

  /** Starts the frame loop. Requires initSystems() to have completed. */
  start(): void {
    if (this.currentPhase !== 'ready') {
      throw new Error(
        `Game.start(): initSystems() must complete first (phase: ${this.currentPhase})`,
      );
    }
    this.loop.start();
  }

  /** Stops the frame loop. Systems stay initialised, so start() may be called again. */
  stop(): void {
    this.loop.stop();
  }

  /** Idempotent. Stops the loop, then disposes in reverse init order. */
  dispose(): void {
    if (this.currentPhase === 'disposed') return;
    this.loop.stop();
    this.unwind();
    this.fixedUpdaters.length = 0;
    this.lateUpdaters.length = 0;
    this.currentPhase = 'disposed';
  }

  private dispatchFixed(fixedDt: number): void {
    for (let i = 0; i < this.fixedUpdaters.length; i++) {
      const system = this.fixedUpdaters[i];
      if (system === undefined) continue;
      const fixedUpdate = system.fixedUpdate;
      if (fixedUpdate === undefined) continue;
      this.scheduler.measure(system.id, () => {
        fixedUpdate.call(system, fixedDt, this.runtime);
      });
    }
  }

  private dispatchLate(dt: number, alpha: number): void {
    for (let i = 0; i < this.lateUpdaters.length; i++) {
      const system = this.lateUpdaters[i];
      if (system === undefined) continue;
      const lateUpdate = system.lateUpdate;
      if (lateUpdate === undefined) continue;
      this.scheduler.measure(system.id, () => {
        lateUpdate.call(system, dt, alpha, this.runtime);
      });
    }
  }

  /**
   * Disposes initialised systems newest-first. One failure must not strand the rest, so
   * errors are collected and reported after every system has had its turn.
   */
  private unwind(): void {
    const failures: unknown[] = [];
    for (let i = this.initialised.length - 1; i >= 0; i--) {
      const system = this.initialised[i];
      if (system === undefined) continue;
      try {
        system.dispose();
      } catch (error) {
        failures.push(error);
        console.error(`[mow] system '${system.id}' threw during dispose`, error);
      }
    }
    this.initialised.length = 0;
    if (failures.length > 0) {
      console.error(`[mow] ${failures.length} system(s) failed to dispose cleanly`);
    }
  }
}
