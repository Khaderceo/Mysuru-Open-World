// The entire framework: one small interface every system implements.
// Reproduced from ARCHITECTURE.md section 2 — change the document first, not this file.

import type { GameContext } from './GameContext';

/**
 * The module names from ARCHITECTURE.md section 6. Declared as a const tuple rather than
 * an enum per CODING_RULES.md section 1, so the union is derived from one list.
 */
export const SYSTEM_IDS = [
  'rendering',
  'input',
  'physics',
  'world',
  'city',
  'player',
  'camera',
  'interaction',
  'vehicles',
  'traffic',
  'npcs',
  'missions',
  'ui',
  'audio',
  'save',
  'debug',
] as const;

export type SystemId = (typeof SYSTEM_IDS)[number];

export interface System {
  readonly id: SystemId;
  /** Construct-time deps only; no scene access, no async. */
  init(ctx: GameContext): void | Promise<void>;
  /** Called at this system's scheduled rate. dt in seconds. */
  update?(dt: number, ctx: GameContext): void;
  /** Fixed-step simulation, if the system needs determinism. */
  fixedUpdate?(fixedDt: number, ctx: GameContext): void;
  /** Called once per rendered frame after all updates (interpolation, visuals). */
  lateUpdate?(dt: number, alpha: number, ctx: GameContext): void;
  /** Release GPU/DOM/audio resources. Must be idempotent. */
  dispose(): void;
}
