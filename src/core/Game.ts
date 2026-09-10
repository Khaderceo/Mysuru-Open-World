// Owns system lifecycle and the context (ARCHITECTURE.md section 1).
//
// `Game` knows lifecycle and order; it does not know gameplay. The loop and scheduler
// that dispatch update/fixedUpdate/lateUpdate are added here by T-1.5 — this task
// deliberately exposes no dispatch surface yet.

import type { PerspectiveCamera, Scene } from 'three';
import { EventBus } from './EventBus';
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
}

type Phase = 'registering' | 'initialising' | 'ready' | 'disposed';

export class Game {
  private readonly systems: System[] = [];
  private readonly byId = new Map<SystemId, System>();
  /** Only systems whose init resolved, in init order, so dispose can unwind in reverse. */
  private readonly initialised: System[] = [];
  private readonly runtime: RuntimeContext;
  private readonly options: GameOptions;
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
    // Core infrastructure, not a system: available before any system initialises, so a
    // system may subscribe in its own init().
    this.runtime.provide('events', new EventBus());
  }

  get context(): GameContext {
    return this.runtime;
  }

  get phase(): Phase {
    return this.currentPhase;
  }

  /** Registration order is init order. Returns `this` so registrations can chain. */
  register(system: System): this {
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
      this.options.onProgress?.({
        completed: this.initialised.length,
        total,
        systemId: system.id,
      });
    }

    this.currentPhase = 'ready';
  }

  /** Idempotent. Disposes in reverse init order. */
  dispose(): void {
    if (this.currentPhase === 'disposed') return;
    this.unwind();
    this.currentPhase = 'disposed';
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
