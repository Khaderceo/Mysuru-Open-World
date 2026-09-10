// Typed, decoupled notifications (ARCHITECTURE.md section 4).
//
// Design constraints that shape the implementation:
//   - `emit` is synchronous and allocates nothing: no listener-array copy, no closure,
//     no iterator. Only the caller's payload is passed through, by reference.
//   - Unsubscribing during an in-flight emit is safe. A removed handler is tombstoned
//     rather than spliced out, so indices never shift under the emit loop — splicing
//     would silently skip the handler that slid into the vacated slot.
//   - Handlers subscribed during an emit are not called by that emit, which is what
//     stops a handler that subscribes on every event from looping forever.
//   - No try/catch around handlers: CODING_RULES section 4 forbids it in hot loops, and
//     ARCHITECTURE section 8 forbids swallowing errors. A throwing handler propagates.

import type { EventKey, GameEvents } from './events';

export type Handler<K extends EventKey> = (payload: GameEvents[K]) => void;
export type Unsubscribe = () => void;

/**
 * Handlers are stored with their payload erased to `never`. Every handler is assignable
 * to this by parameter contravariance, so storing needs no cast; only the call site does,
 * and the bucket's key guarantees the payload type there.
 */
type ErasedHandler = (payload: never) => void;

interface Bucket {
  /** `null` entries are tombstones from an unsubscribe during an in-flight emit. */
  readonly handlers: (ErasedHandler | null)[];
  /** Emit re-entrancy depth. Compaction waits until this returns to 0. */
  emitting: number;
  /** Tombstone count, so compaction is skipped when there is nothing to compact. */
  holes: number;
}

export class EventBus {
  private readonly buckets = new Map<EventKey, Bucket>();

  /** Subscribes and returns an unsubscribe function. Duplicate handlers are rejected. */
  on<K extends EventKey>(key: K, handler: Handler<K>): Unsubscribe {
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = { handlers: [], emitting: 0, holes: 0 };
      this.buckets.set(key, bucket);
    }
    if (bucket.handlers.indexOf(handler) !== -1) {
      throw new Error(`EventBus.on('${key}'): this handler is already subscribed`);
    }
    bucket.handlers.push(handler);
    return () => {
      this.off(key, handler);
    };
  }

  /** Removes a handler. Safe to call from inside a handler, including on itself. */
  off<K extends EventKey>(key: K, handler: Handler<K>): void {
    const bucket = this.buckets.get(key);
    if (bucket === undefined) return;

    const index = bucket.handlers.indexOf(handler);
    if (index === -1) return;

    if (bucket.emitting > 0) {
      bucket.handlers[index] = null;
      bucket.holes++;
    } else {
      bucket.handlers.splice(index, 1);
    }
  }

  /** Synchronous. The payload is passed by reference and never retained. */
  emit<K extends EventKey>(key: K, payload: GameEvents[K]): void {
    const bucket = this.buckets.get(key);
    if (bucket === undefined) return;

    const handlers = bucket.handlers;
    // Length is read once, so handlers added during this emit are left for the next one.
    const count = handlers.length;
    bucket.emitting++;
    for (let i = 0; i < count; i++) {
      const handler = handlers[i];
      if (handler === undefined || handler === null) continue;
      // The bucket was selected by `key`, so its handlers take exactly GameEvents[K].
      handler(payload as never);
    }
    bucket.emitting--;

    if (bucket.emitting === 0 && bucket.holes > 0) {
      compact(bucket);
    }
  }
}

/** In-place two-pointer removal of tombstones. Allocates nothing. */
function compact(bucket: Bucket): void {
  const handlers = bucket.handlers;
  let write = 0;
  for (let read = 0; read < handlers.length; read++) {
    const handler = handlers[read];
    if (handler !== undefined && handler !== null) {
      handlers[write] = handler;
      write++;
    }
  }
  handlers.length = write;
  bucket.holes = 0;
}
