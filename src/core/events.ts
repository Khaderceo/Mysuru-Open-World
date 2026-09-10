// The one map of event name -> payload type (ARCHITECTURE.md section 4).
//
// Events are for *facts that already happened*. They are not commands and they are not
// a request/response mechanism — a query that needs a real answer goes through a
// published read-only interface fetched via `ctx.get()`.
//
// Payload objects may be **reused** by the emitter, because `emit` neither copies nor
// retains them. A handler that needs a payload after it returns must copy the fields it
// wants; it must never keep the object.
//
// Extended per feature, never with `any`.

export interface GameEvents {
  'player:entered-vehicle': { vehicleId: string };
  'player:exited-vehicle': { vehicleId: string };
  /** `null` when nothing is in range — the prompt is cleared. */
  'interaction:available': { promptKey: string; targetId: string } | null;
  'mission:started': { missionId: string };
  'mission:objective-done': { missionId: string; index: number };
  'mission:completed': { missionId: string; reward: number };
  'economy:money-changed': { total: number; delta: number };
  'world:chunk-loaded': { cx: number; cz: number };
  'time:phase-changed': { phase: 'dawn' | 'day' | 'dusk' | 'night' };
  'save:written': { slot: number };
  'ui:pause-toggled': { paused: boolean };
}

export type EventKey = keyof GameEvents;
