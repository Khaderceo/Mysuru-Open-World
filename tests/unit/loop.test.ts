import { PerspectiveCamera, Scene } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock, MAX_FRAME_DT } from '../../src/core/Clock';
import { Game } from '../../src/core/Game';
import { FIXED_DT, Loop, MAX_STEPS, type LoopCallbacks } from '../../src/core/Loop';
import { RuntimeContext, type GameContext } from '../../src/core/GameContext';
import { Scheduler } from '../../src/core/Scheduler';
import { createInitialState } from '../../src/core/state';
import type { Config } from '../../src/core/config';
import type { System, SystemId } from '../../src/core/System';

const config: Config = { dev: true, e2e: false, flags: {} };

function makeContext(): GameContext {
  return new RuntimeContext(
    config,
    createInitialState(),
    new Scene(),
    new PerspectiveCamera(),
    () => undefined,
  );
}

/** Drives frames by hand instead of via requestAnimationFrame. */
function makeFrameDriver() {
  let pending: ((nowMs: number) => void) | null = null;
  let handles = 0;
  return {
    requestFrame: (callback: (nowMs: number) => void): number => {
      pending = callback;
      return ++handles;
    },
    cancelFrame: (): void => {
      pending = null;
    },
    /** Fires the queued frame, if any. Returns whether one was queued. */
    tick(nowMs: number): boolean {
      const callback = pending;
      if (callback === null) return false;
      pending = null;
      callback(nowMs);
      return true;
    },
    get hasPending(): boolean {
      return pending !== null;
    },
  };
}

function makeCallbacks() {
  const order: string[] = [];
  const fixedDts: number[] = [];
  const updateDts: number[] = [];
  const lateCalls: { dt: number; alpha: number }[] = [];
  const callbacks: LoopCallbacks = {
    fixedUpdate: (fixedDt) => {
      order.push('fixed');
      fixedDts.push(fixedDt);
    },
    update: (dt) => {
      order.push('update');
      updateDts.push(dt);
    },
    lateUpdate: (dt, alpha) => {
      order.push('late');
      lateCalls.push({ dt, alpha });
    },
    render: () => order.push('render'),
  };
  return { callbacks, order, fixedDts, updateDts, lateCalls };
}

describe('Clock', () => {
  it('reports zero for the first frame rather than time since page load', () => {
    const clock = new Clock();
    expect(clock.advance(5_000)).toBe(0);
    expect(clock.elapsed).toBe(0);
  });

  it('clamps a long frame to MAX_FRAME_DT', () => {
    const clock = new Clock();
    clock.advance(0);
    expect(clock.advance(500)).toBeCloseTo(MAX_FRAME_DT, 10);
  });

  it('never returns a negative delta', () => {
    const clock = new Clock();
    clock.advance(100);
    expect(clock.advance(50)).toBe(0);
  });

  it('accumulates elapsed time and counts frames', () => {
    const clock = new Clock();
    clock.advance(0);
    clock.advance(100);
    clock.advance(200);
    expect(clock.elapsed).toBeCloseTo(0.2, 10);
    expect(clock.frame).toBe(3);
  });

  it('discardElapsed drops the gap instead of integrating it', () => {
    const clock = new Clock();
    clock.advance(0);
    clock.advance(100);
    const before = clock.elapsed;

    clock.discardElapsed(60_000); // 60 s "hidden"
    const dt = clock.advance(60_016);

    expect(dt).toBeCloseTo(0.016, 3);
    expect(clock.elapsed).toBeCloseTo(before + 0.016, 3);
  });
});

describe('Loop fixed stepping', () => {
  it('runs one fixed step for a 60 Hz frame', () => {
    const { callbacks, fixedDts } = makeCallbacks();
    const loop = new Loop(callbacks);
    loop.step(0);
    loop.step(1000 / 60);
    expect(fixedDts).toEqual([FIXED_DT]);
  });

  it('runs three fixed steps for a 50 ms frame and keeps the remainder as alpha', () => {
    const { callbacks, fixedDts } = makeCallbacks();
    const loop = new Loop(callbacks);
    loop.step(0);
    loop.step(50);

    expect(fixedDts).toHaveLength(3);
    expect(fixedDts.every((d) => d === FIXED_DT)).toBe(true);
    expect(loop.debt).toBeCloseTo(0.05 - 3 * FIXED_DT, 10);
    expect(loop.alpha).toBeCloseTo(loop.debt / FIXED_DT, 10);
  });

  it('caps steps at MAX_STEPS and drops the remaining debt', () => {
    const { callbacks, fixedDts } = makeCallbacks();
    const loop = new Loop(callbacks);
    loop.step(0);
    // 0.1 s is MAX_FRAME_DT, which needs six steps — one more than MAX_STEPS.
    loop.step(100);

    expect(fixedDts).toHaveLength(MAX_STEPS);
    expect(loop.debt).toBe(0);
    expect(loop.alpha).toBe(0);
  });

  it('keeps alpha in [0, 1) across a range of frame times', () => {
    const { callbacks } = makeCallbacks();
    const loop = new Loop(callbacks);
    let now = 0;
    loop.step(now);
    for (const ms of [4, 8, 16.7, 20, 33, 41, 7, 16.7, 16.7]) {
      now += ms;
      loop.step(now);
      expect(loop.alpha).toBeGreaterThanOrEqual(0);
      expect(loop.alpha).toBeLessThan(1);
    }
  });

  it('runs no fixed step when the frame is shorter than one step', () => {
    const { callbacks, fixedDts } = makeCallbacks();
    const loop = new Loop(callbacks);
    loop.step(0);
    loop.step(5);
    expect(fixedDts).toHaveLength(0);
  });
});

describe('Loop frame phases', () => {
  it('orders fixed steps, then update, then lateUpdate, then render', () => {
    const { callbacks, order } = makeCallbacks();
    const loop = new Loop(callbacks);
    loop.step(0);
    order.length = 0;
    loop.step(50);

    expect(order).toEqual(['fixed', 'fixed', 'fixed', 'update', 'late', 'render']);
  });

  it('passes the clamped frame delta to update and lateUpdate', () => {
    const { callbacks, updateDts, lateCalls } = makeCallbacks();
    const loop = new Loop(callbacks);
    loop.step(0);
    loop.step(500); // clamped

    expect(updateDts).toEqual([0, MAX_FRAME_DT]);
    expect(lateCalls[1]?.dt).toBeCloseTo(MAX_FRAME_DT, 10);
  });

  it('exposes alpha to lateUpdate', () => {
    const { callbacks, lateCalls } = makeCallbacks();
    const loop = new Loop(callbacks);
    loop.step(0);
    loop.step(20);

    expect(lateCalls[1]?.alpha).toBeCloseTo(loop.alpha, 10);
    expect(lateCalls[1]?.alpha).toBeGreaterThan(0);
  });

  it('renders exactly once per frame', () => {
    const { callbacks, order } = makeCallbacks();
    const loop = new Loop(callbacks);
    loop.step(0);
    loop.step(16);
    loop.step(32);

    expect(order.filter((phase) => phase === 'render')).toHaveLength(3);
  });
});

describe('Loop start, stop and visibility', () => {
  it('drives frames while running and stops requesting them after stop()', () => {
    const driver = makeFrameDriver();
    const { callbacks, order } = makeCallbacks();
    const loop = new Loop(callbacks, { ...driver, now: () => 0 });

    loop.start();
    expect(driver.tick(0)).toBe(true);
    expect(driver.tick(16)).toBe(true);
    expect(loop.isRunning).toBe(true);

    loop.stop();
    expect(driver.hasPending).toBe(false);
    expect(loop.isRunning).toBe(false);

    const renders = order.filter((phase) => phase === 'render').length;
    expect(renders).toBe(2);
  });

  it('pause stops frames and drops accumulated debt', () => {
    const driver = makeFrameDriver();
    const { callbacks } = makeCallbacks();
    const loop = new Loop(callbacks, { ...driver, now: () => 0 });

    loop.start();
    driver.tick(0);
    driver.tick(10); // leaves debt below one step
    expect(loop.debt).toBeGreaterThan(0);

    loop.pause();
    expect(loop.isPaused).toBe(true);
    expect(loop.debt).toBe(0);
    expect(driver.hasPending).toBe(false);
  });

  it('resume discards the time spent paused instead of fast-forwarding', () => {
    const driver = makeFrameDriver();
    const { callbacks, fixedDts } = makeCallbacks();
    let wall = 0;
    const loop = new Loop(callbacks, { ...driver, now: () => wall });

    loop.start();
    driver.tick(0);
    loop.pause();

    // 60 seconds pass while hidden.
    wall = 60_000;
    loop.resume();
    fixedDts.length = 0;
    driver.tick(60_016);

    // Without discarding, this frame would have integrated 60 s and run MAX_STEPS.
    expect(fixedDts).toHaveLength(0);
    expect(loop.isPaused).toBe(false);
  });
});

describe('Scheduler', () => {
  let ctx: GameContext;
  beforeEach(() => {
    ctx = makeContext();
  });

  function makeSystem(id: SystemId, onUpdate?: (dt: number) => void): System {
    return {
      id,
      init: () => undefined,
      dispose: () => undefined,
      ...(onUpdate === undefined ? {} : { update: (dt: number) => onUpdate(dt) }),
    };
  }

  it('runs an unrated system every frame with the frame delta', () => {
    const scheduler = new Scheduler(() => 0);
    const dts: number[] = [];
    scheduler.add(makeSystem('input', (dt) => dts.push(dt)));

    scheduler.run(0.016, ctx);
    scheduler.run(0.016, ctx);

    expect(dts).toEqual([0.016, 0.016]);
  });

  it('honours a target Hz', () => {
    const scheduler = new Scheduler(() => 0);
    const calls: number[] = [];
    scheduler.add(
      makeSystem('interaction', (dt) => calls.push(dt)),
      { hz: 10 },
    );

    // 10 Hz means one run per 100 ms.
    for (let i = 0; i < 5; i++) scheduler.run(0.02, ctx);

    expect(calls).toHaveLength(1);
  });

  it('passes the accumulated dt, never the fixed step', () => {
    const scheduler = new Scheduler(() => 0);
    const calls: number[] = [];
    scheduler.add(
      makeSystem('missions', (dt) => calls.push(dt)),
      { hz: 10 },
    );

    scheduler.run(0.05, ctx);
    scheduler.run(0.05, ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeCloseTo(0.1, 10);
    expect(calls[0]).not.toBeCloseTo(FIXED_DT, 5);
  });

  it('staggers systems of the same rate using the phase offset', () => {
    const scheduler = new Scheduler(() => 0);
    const early: number[] = [];
    const late: number[] = [];
    scheduler.add(
      makeSystem('world', () => early.push(1)),
      { hz: 10, phase: 0 },
    );
    scheduler.add(
      makeSystem('audio', () => late.push(1)),
      { hz: 10, phase: 0.5 },
    );

    // Both wait a full period first; the phase offset then separates them.
    scheduler.run(0.06, ctx);
    expect(early).toHaveLength(0);
    expect(late).toHaveLength(0);

    scheduler.run(0.06, ctx);
    expect(early).toHaveLength(1);
    expect(late).toHaveLength(0);

    scheduler.run(0.06, ctx);
    expect(early).toHaveLength(1);
    expect(late).toHaveLength(1);
  });

  it('keeps the average rate stable over many frames', () => {
    const scheduler = new Scheduler(() => 0);
    let calls = 0;
    scheduler.add(
      makeSystem('ui', () => calls++),
      { hz: 10 },
    );

    // 2 seconds at 60 fps should be about 20 runs at 10 Hz.
    for (let i = 0; i < 120; i++) scheduler.run(1 / 60, ctx);

    expect(calls).toBeGreaterThanOrEqual(19);
    expect(calls).toBeLessThanOrEqual(21);
  });

  it('skips a system that declares no update', () => {
    const scheduler = new Scheduler(() => 0);
    scheduler.add(makeSystem('save'));
    expect(() => scheduler.run(0.016, ctx)).not.toThrow();
  });

  it('records per-system timings for the debug overlay', () => {
    let fake = 0;
    const scheduler = new Scheduler(() => (fake += 2));
    scheduler.add(makeSystem('traffic', () => undefined));

    scheduler.run(0.016, ctx);
    scheduler.run(0.016, ctx);

    const timing = scheduler.timingSnapshot().find((entry) => entry.id === 'traffic');
    expect(timing?.calls).toBe(2);
    expect(timing?.lastMs).toBeGreaterThan(0);
    expect(timing?.avgMs).toBeGreaterThan(0);
  });
});

describe('Game loop integration', () => {
  function makeGame(driver: ReturnType<typeof makeFrameDriver>) {
    const render = vi.fn();
    const game = new Game({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      config,
      state: createInitialState(),
      onRender: render,
      loop: { ...driver, now: () => 0 },
    });
    return { game, render };
  }

  it('refuses to start before initSystems() has completed', () => {
    const { game } = makeGame(makeFrameDriver());
    expect(() => game.start()).toThrow(/initSystems\(\) must complete first/);
  });

  it('dispatches all three phases to a registered system', async () => {
    const driver = makeFrameDriver();
    const { game, render } = makeGame(driver);
    const seen: string[] = [];
    game.register(
      {
        id: 'player',
        init: () => undefined,
        dispose: () => undefined,
        fixedUpdate: (fixedDt) => seen.push(`fixed:${String(fixedDt === FIXED_DT)}`),
        update: () => seen.push('update'),
        lateUpdate: (_dt, alpha) => seen.push(`late:${String(alpha >= 0 && alpha < 1)}`),
      },
      { hz: 0 },
    );

    await game.initSystems();
    game.start();
    driver.tick(0);
    seen.length = 0;
    driver.tick(20);

    expect(seen).toEqual(['fixed:true', 'update', 'late:true']);
    expect(render).toHaveBeenCalled();
    expect(game.isRunning).toBe(true);
  });

  it('exposes the clock through the context', async () => {
    const driver = makeFrameDriver();
    const { game } = makeGame(driver);
    await game.initSystems();
    game.start();
    driver.tick(0);
    driver.tick(16);

    expect(game.context.clock.frame).toBe(2);
    expect(game.context.clock.dt).toBeCloseTo(0.016, 3);
  });

  it('records timings reachable from Game', async () => {
    const driver = makeFrameDriver();
    const { game } = makeGame(driver);
    game.register({
      id: 'npcs',
      init: () => undefined,
      dispose: () => undefined,
      update: () => undefined,
    });

    await game.initSystems();
    game.start();
    driver.tick(0);

    expect(game.timings().some((entry) => entry.id === 'npcs')).toBe(true);
  });

  it('stops the loop on dispose', async () => {
    const driver = makeFrameDriver();
    const { game } = makeGame(driver);
    await game.initSystems();
    game.start();
    driver.tick(0);

    game.dispose();

    expect(game.isRunning).toBe(false);
    expect(driver.hasPending).toBe(false);
  });

  it('never updates a system that has not initialised', async () => {
    const driver = makeFrameDriver();
    const { game } = makeGame(driver);
    const update = vi.fn();
    game.register({
      id: 'city',
      init: () => {
        throw new Error('city boom');
      },
      dispose: () => undefined,
      update,
    });

    await expect(game.initSystems()).rejects.toThrow(/city/);
    expect(update).not.toHaveBeenCalled();
  });
});
