// Runtime owner of the collision world.
//
// T-2.1 and T-2.2 built the world and its queries but nothing constructed one, because
// no task before this had a caller. `SYSTEM_IDS` in core/System.ts has reserved the
// 'physics' id since T-1.3 and ARCHITECTURE.md §6 gives this module the "static collision
// world, capsule sweeps, ground/ray queries, spatial grid", so the owner belongs here.
//
// It is deliberately thin: it holds the world, publishes it, and does nothing per frame.
// Consumers reach it with `ctx.get<PhysicsSystem>('physics').world`, which ARCHITECTURE.md
// §1 names as the way to read another system's published interface. That route is used
// rather than the `GameContext.physics` service slot because `core` may not import
// `physics` under §3's dependency direction — see TASKS.md T-2.1.

import type { GameContext } from '../core/GameContext';
import type { System } from '../core/System';
import { CollisionWorld } from './CollisionWorld';

export class PhysicsSystem implements System {
  readonly id = 'physics' as const;

  /** The one collision world. Published for readers; only its owners mutate it. */
  readonly world = new CollisionWorld();

  init(): void {
    // Nothing to do: colliders are registered by whoever creates them (the test world in
    // T-2.4, chunk build in Phase 3), and the world needs no per-frame work of its own.
  }

  dispose(): void {
    this.world.clear();
  }
}

/** The shape consumers ask `GameContext.get` for. Keeps them off the concrete class. */
export type PhysicsAccess = Pick<PhysicsSystem, 'id' | 'world'>;

/** Narrow helper so every consumer spells the lookup the same way. */
export function physicsOf(ctx: GameContext): CollisionWorld {
  return ctx.get<PhysicsSystem>('physics').world;
}
