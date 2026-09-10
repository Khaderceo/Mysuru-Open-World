// The only shared handle systems receive (ARCHITECTURE.md section 1).
//
// A system may read this. It may not import another system's module for behaviour:
// cross-system needs go through `events`, `state`, or a published read-only interface
// fetched via `get()`.

import type { PerspectiveCamera, Scene } from 'three';
import type { Clock } from './Clock';
import type { EventBus } from './EventBus';
import type { Config } from './config';
import type { GameState } from './state';
import type { System, SystemId } from './System';

/**
 * Services registered into the context rather than passed to its constructor.
 *
 * The remaining `unknown` aliases exist because T-1.3 owns none of those designs: the
 * owning task replaces the alias with its real type in one line and every consumer
 * keeps working. `events` (T-1.4) and `clock` (T-1.5) are now real and Game registers
 * both at construction, so reading them never throws.
 */
export type ClockPort = Clock;
export type EventBusPort = EventBus;
export type PhysicsPort = unknown; // TODO(T-2.1): replace with CollisionWorld
export type AssetsPort = unknown; // TODO(T-2.8): replace with AssetSystem

export interface Services {
  clock: ClockPort;
  events: EventBusPort;
  physics: PhysicsPort;
  assets: AssetsPort;
}

/** Which task provides each service, so the not-yet-registered error names a fix. */
const SERVICE_OWNERS: Readonly<Record<keyof Services, string>> = Object.freeze({
  clock: 'T-1.5 (core/Clock.ts)',
  events: 'T-1.4 (core/EventBus.ts)',
  physics: 'T-2.1 (physics/CollisionWorld.ts)',
  assets: 'T-2.8 (assets/AssetSystem.ts)',
});

export interface GameContext {
  readonly config: Config;
  readonly state: GameState;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;

  /** Throws a named error until its owning system registers it. Never silently undefined. */
  readonly clock: ClockPort;
  readonly events: EventBusPort;
  readonly physics: PhysicsPort;
  readonly assets: AssetsPort;

  /** True once the service is registered, for callers that must degrade rather than throw. */
  has(name: keyof Services): boolean;

  /** Fetch another system's published interface. Throws if that system is not registered. */
  get<T extends System>(id: SystemId): T;
}

/** A service that exists in the contract before its implementation does. */
class ServiceSlot<T> {
  private held: { readonly value: T } | null = null;

  constructor(private readonly name: keyof Services) {}

  register(value: T): void {
    if (this.held !== null) {
      throw new Error(`GameContext.${this.name} is already registered`);
    }
    this.held = { value };
  }

  get(): T {
    if (this.held === null) {
      throw new Error(
        `GameContext.${this.name} is not registered yet — it is provided by ` +
          `${SERVICE_OWNERS[this.name]}. Read it in update(), not while systems are still initialising.`,
      );
    }
    return this.held.value;
  }

  get isRegistered(): boolean {
    return this.held !== null;
  }
}

/** The concrete context. Constructed once by Game; there is no module-level instance. */
export class RuntimeContext implements GameContext {
  private readonly slots = {
    clock: new ServiceSlot<ClockPort>('clock'),
    events: new ServiceSlot<EventBusPort>('events'),
    physics: new ServiceSlot<PhysicsPort>('physics'),
    assets: new ServiceSlot<AssetsPort>('assets'),
  } as const;

  constructor(
    readonly config: Config,
    readonly state: GameState,
    readonly scene: Scene,
    readonly camera: PerspectiveCamera,
    private readonly lookup: (id: SystemId) => System | undefined,
  ) {}

  get clock(): ClockPort {
    return this.slots.clock.get();
  }

  get events(): EventBusPort {
    return this.slots.events.get();
  }

  get physics(): PhysicsPort {
    return this.slots.physics.get();
  }

  get assets(): AssetsPort {
    return this.slots.assets.get();
  }

  has(name: keyof Services): boolean {
    return this.slots[name].isRegistered;
  }

  /** Called by the owning system during its own init, or by Game for core services. */
  provide<K extends keyof Services>(name: K, value: Services[K]): void {
    // `slots[name]` is the slot for exactly this key by construction, but TypeScript
    // cannot relate the parameter types across the slot union, so the correspondence is
    // asserted here once rather than at every call site.
    const slot = this.slots[name] as ServiceSlot<Services[K]>;
    slot.register(value);
  }

  get<T extends System>(id: SystemId): T {
    const system = this.lookup(id);
    if (system === undefined) {
      throw new Error(`GameContext.get('${id}'): no such system is registered`);
    }
    // The caller names the id, so it also knows the concrete type behind it. This is the
    // one unavoidable cast in a service-locator signature.
    return system as T;
  }
}
