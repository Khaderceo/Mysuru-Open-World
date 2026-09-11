// T-2.8: the asset system's policy. The manifest is empty until there is art, so every
// case here injects its own — which is also the point of the loader being injectable: the
// cache, reference counting, de-duplication, retry schedule and tier order are all
// testable without a single byte of art or a GPU.

import { describe, expect, it, vi } from 'vitest';
import { AssetSystem, RETRY_DELAYS_MS } from '../../src/assets/AssetSystem';
import { MANIFEST } from '../../src/data/assets';
import type { AssetManifest } from '../../src/data/assets';

const manifest: AssetManifest = {
  'char.player': { url: 'models/char_player.glb', tier: 0, kind: 'gltf', bytes: 900_000 },
  'lm.palace': { url: 'models/lm_palace.glb', tier: 1, kind: 'gltf', bytes: 2_500_000 },
  'sfx.horn': { url: 'audio/horn.ogg', tier: 2, kind: 'audio', bytes: 40_000 },
};

/** No real waiting: the schedule is asserted from the recorded delays instead. */
function recorder() {
  const waits: number[] = [];
  return {
    waits,
    delay: async (ms: number) => {
      waits.push(ms);
    },
  };
}

describe('the shipped manifest', () => {
  it('is empty, because entries must have files behind them', () => {
    // ASSET_PLAN.md §2 requires every URL to exist in public/, and §10 forbids committing
    // placeholder art. An entry here without a file would be a fatal tier-0 failure.
    expect(Object.keys(MANIFEST)).toHaveLength(0);
  });
});

describe('de-duplication', () => {
  it('joins a second request to the one already in flight', async () => {
    // The promise is built up front so its resolver is a plain value, not something
    // TypeScript has to track being assigned from inside a callback.
    let resolveLoad: (value: unknown) => void = () => undefined;
    const pending = new Promise<unknown>((resolve) => {
      resolveLoad = resolve;
    });
    const load = vi.fn(async () => pending);
    const assets = new AssetSystem({ manifest, load });

    const first = assets.load('char.player');
    const second = assets.load('char.player');
    expect(assets.isLoading('char.player')).toBe(true);

    resolveLoad({ id: 'model' });
    await expect(first).resolves.toEqual({ id: 'model' });
    await expect(second).resolves.toEqual({ id: 'model' });
    // One request, not two.
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('serves a second load from the cache', async () => {
    const load = vi.fn(async () => ({ id: 'model' }));
    const assets = new AssetSystem({ manifest, load });

    await assets.load('char.player');
    await assets.load('char.player');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('rejects a key that is not in the manifest', async () => {
    const assets = new AssetSystem({ manifest, load: async () => ({}) });
    await expect(assets.load('nope.missing')).rejects.toThrow(/manifest/);
  });
});

describe('reference counting', () => {
  it('disposes only when the last reference goes', async () => {
    const dispose = vi.fn();
    const assets = new AssetSystem({ manifest, load: async () => ({ dispose }) });

    await assets.load('char.player'); // one reference
    await assets.load('char.player'); // two
    assets.retain('char.player'); // three

    assets.release('char.player');
    assets.release('char.player');
    expect(dispose).not.toHaveBeenCalled();
    expect(assets.cachedKeys).toContain('char.player');

    assets.release('char.player');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(assets.cachedKeys).not.toContain('char.player');
  });

  it('ignores a release of something it does not hold', () => {
    const assets = new AssetSystem({ manifest, load: async () => ({}) });
    expect(() => assets.release('char.player')).not.toThrow();
    expect(assets.retain('char.player')).toBeNull();
    expect(assets.peek('char.player')).toBeNull();
  });

  it('disposes everything it owns on dispose', async () => {
    const dispose = vi.fn();
    const assets = new AssetSystem({ manifest, load: async () => ({ dispose }) });
    await assets.load('char.player');
    assets.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(assets.cachedKeys).toHaveLength(0);
  });
});

describe('retry policy', () => {
  it('retries twice on the documented backoff, then succeeds', async () => {
    const clock = recorder();
    let attempts = 0;
    const assets = new AssetSystem({
      manifest,
      delay: clock.delay,
      load: async () => {
        attempts++;
        if (attempts < 3) throw new Error('network');
        return { id: 'model' };
      },
    });

    await expect(assets.load('char.player')).resolves.toEqual({ id: 'model' });
    expect(attempts).toBe(3);
    expect(clock.waits).toEqual([...RETRY_DELAYS_MS]);
    expect(RETRY_DELAYS_MS).toEqual([500, 1500]);
  });

  it('a tier-0 failure is fatal', async () => {
    const clock = recorder();
    const onFatal = vi.fn();
    const onDegraded = vi.fn();
    const assets = new AssetSystem({
      manifest,
      delay: clock.delay,
      onFatal,
      onDegraded,
      load: async () => {
        throw new Error('gone');
      },
    });

    await expect(assets.load('char.player')).resolves.toBeNull();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onDegraded).not.toHaveBeenCalled();
    expect(assets.failedKeys).toEqual(['char.player']);
    // Three attempts in total: the first plus two retries.
    expect(clock.waits).toHaveLength(2);
  });

  it('a later-tier failure is degraded, and is not retried again', async () => {
    const clock = recorder();
    const onDegraded = vi.fn();
    const load = vi.fn(async () => {
      throw new Error('404');
    });
    const assets = new AssetSystem({ manifest, delay: clock.delay, onDegraded, load });

    await expect(assets.load('lm.palace')).resolves.toBeNull();
    expect(onDegraded).toHaveBeenCalledTimes(1);

    // A failed key answers null straight away rather than hammering the network.
    load.mockClear();
    await expect(assets.load('lm.palace')).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('tiered loading', () => {
  it('loads exactly the tier asked for', async () => {
    const loaded: string[] = [];
    const assets = new AssetSystem({
      manifest,
      load: async (key) => {
        loaded.push(key);
        return { key };
      },
    });

    await assets.loadTier(0);
    expect(loaded).toEqual(['char.player']);

    await assets.loadTier(1);
    expect(loaded).toEqual(['char.player', 'lm.palace']);

    await assets.loadTier(2);
    expect(loaded).toEqual(['char.player', 'lm.palace', 'sfx.horn']);
  });

  it('reports byte-weighted progress against the manifest total', async () => {
    const progress: [number, number][] = [];
    const assets = new AssetSystem({
      manifest,
      load: async () => ({}),
      onProgress: (loadedBytes, totalBytes) => progress.push([loadedBytes, totalBytes]),
    });

    await assets.loadTier(0);
    expect(progress).toEqual([[900_000, 3_440_000]]);
    expect(assets.totalBytes).toBe(3_440_000);
  });
});
