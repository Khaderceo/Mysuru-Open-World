import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';

describe('EventBus ordering', () => {
  it('calls handlers in subscription order', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('save:written', () => seen.push('a'));
    bus.on('save:written', () => seen.push('b'));
    bus.on('save:written', () => seen.push('c'));

    bus.emit('save:written', { slot: 0 });

    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('is synchronous — handlers have run by the time emit returns', () => {
    const bus = new EventBus();
    let ran = false;
    bus.on('ui:pause-toggled', () => {
      ran = true;
    });

    bus.emit('ui:pause-toggled', { paused: true });

    expect(ran).toBe(true);
  });

  it('emitting a key with no listeners is a no-op', () => {
    const bus = new EventBus();
    expect(() => bus.emit('world:chunk-loaded', { cx: 0, cz: 0 })).not.toThrow();
  });

  it('keeps keys isolated', () => {
    const bus = new EventBus();
    const started = vi.fn();
    const completed = vi.fn();
    bus.on('mission:started', started);
    bus.on('mission:completed', completed);

    bus.emit('mission:started', { missionId: 'M_TIFFIN_RUN' });

    expect(started).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
  });

  it('rejects the same handler subscribed twice to one key', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('save:written', handler);

    expect(() => bus.on('save:written', handler)).toThrow(/already subscribed/);
  });
});

describe('EventBus unsubscribe', () => {
  it('off removes a handler', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('save:written', handler);
    bus.off('save:written', handler);

    bus.emit('save:written', { slot: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('the function returned by on unsubscribes', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('save:written', handler);
    unsubscribe();

    bus.emit('save:written', { slot: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('off is a no-op for an unknown key or handler', () => {
    const bus = new EventBus();
    expect(() => bus.off('save:written', vi.fn())).not.toThrow();
    bus.on('save:written', vi.fn());
    expect(() => bus.off('save:written', vi.fn())).not.toThrow();
  });
});

describe('EventBus unsubscribe during emit', () => {
  it('does not call a later handler that an earlier one removed', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const b = (): void => {
      seen.push('b');
    };
    bus.on('save:written', () => {
      seen.push('a');
      bus.off('save:written', b);
    });
    bus.on('save:written', b);
    bus.on('save:written', () => seen.push('c'));

    bus.emit('save:written', { slot: 0 });

    expect(seen).toEqual(['a', 'c']);
  });

  it('still calls the following handlers when one removes itself', () => {
    // The regression this guards: splicing during emit shifts indices, so the handler
    // that slides into the vacated slot gets skipped. Tombstoning must not.
    const bus = new EventBus();
    const seen: string[] = [];
    const a = (): void => {
      seen.push('a');
      bus.off('save:written', a);
    };
    bus.on('save:written', a);
    bus.on('save:written', () => seen.push('b'));
    bus.on('save:written', () => seen.push('c'));

    bus.emit('save:written', { slot: 0 });

    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('compacts removals so the next emit is unaffected', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const a = (): void => {
      seen.push('a');
      bus.off('save:written', a);
    };
    bus.on('save:written', a);
    bus.on('save:written', () => seen.push('b'));

    bus.emit('save:written', { slot: 0 });
    seen.length = 0;
    bus.emit('save:written', { slot: 1 });

    expect(seen).toEqual(['b']);
  });

  it('does not call a handler subscribed during the emit that added it', () => {
    const bus = new EventBus();
    const late = vi.fn();
    let subscribed = false;
    bus.on('save:written', () => {
      if (!subscribed) {
        subscribed = true;
        bus.on('save:written', late);
      }
    });

    bus.emit('save:written', { slot: 0 });
    expect(late).not.toHaveBeenCalled();

    bus.emit('save:written', { slot: 1 });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('survives a re-entrant emit of the same key', () => {
    const bus = new EventBus();
    let depth = 0;
    let maxDepth = 0;
    bus.on('world:chunk-loaded', (payload) => {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      if (payload.cx < 2) bus.emit('world:chunk-loaded', { cx: payload.cx + 1, cz: 0 });
      depth--;
    });

    expect(() => bus.emit('world:chunk-loaded', { cx: 0, cz: 0 })).not.toThrow();
    expect(maxDepth).toBe(3);
  });
});

describe('EventBus payloads', () => {
  it('passes the payload by reference and never copies it', () => {
    const bus = new EventBus();
    const payload = { total: 100, delta: 100 };
    let received: unknown = null;
    bus.on('economy:money-changed', (p) => {
      received = p;
    });

    bus.emit('economy:money-changed', payload);

    expect(received).toBe(payload);
  });

  it('supports reusing one payload object across emits', () => {
    const bus = new EventBus();
    const scratch = { total: 0, delta: 0 };
    const totals: number[] = [];
    bus.on('economy:money-changed', (p) => totals.push(p.total));

    scratch.total = 120;
    scratch.delta = 120;
    bus.emit('economy:money-changed', scratch);
    scratch.total = 240;
    scratch.delta = 120;
    bus.emit('economy:money-changed', scratch);

    expect(totals).toEqual([120, 240]);
  });

  it('accepts the documented null payload for interaction:available', () => {
    const bus = new EventBus();
    const seen: unknown[] = [];
    bus.on('interaction:available', (p) => seen.push(p));

    bus.emit('interaction:available', { promptKey: 'ui.prompt.talk', targetId: 'npc_1' });
    bus.emit('interaction:available', null);

    expect(seen).toEqual([{ promptKey: 'ui.prompt.talk', targetId: 'npc_1' }, null]);
  });

  it('does not swallow a throwing handler', () => {
    const bus = new EventBus();
    bus.on('save:written', () => {
      throw new Error('handler boom');
    });

    expect(() => bus.emit('save:written', { slot: 0 })).toThrow(/handler boom/);
  });
});

describe('EventBus payload typing', () => {
  // These assertions are checked by `npm run typecheck`. @ts-expect-error fails the
  // build if the line below it stops being an error, so they cannot silently rot.
  it('types handlers and emits by key', () => {
    // No handler is subscribed for the keys emitted below: the invalid emits still run
    // at runtime, and this test is about what the compiler accepts, not what runs.
    const bus = new EventBus();

    bus.on('mission:completed', (p) => {
      // Inference is the assertion: these annotations fail the build if it changes.
      const reward: number = p.reward;
      const id: string = p.missionId;
      void reward;
      void id;
    });

    // @ts-expect-error unknown event key
    bus.on('does:not-exist', () => {});
    // @ts-expect-error wrong payload shape for this key
    bus.emit('save:written', { slot: 'zero' });
    // @ts-expect-error missing required payload field
    bus.emit('mission:completed', { missionId: 'M' });
    // @ts-expect-error null is not allowed for this key
    bus.emit('save:written', null);
    // @ts-expect-error phase must be one of the documented literals
    bus.emit('time:phase-changed', { phase: 'midnight' });

    expect(true).toBe(true);
  });
});
