// The asset loader (ASSET_PLAN.md §3).
//
// What this owns is *policy*: one in-flight request per key, a reference-counted cache
// that is the sole owner of what it holds, the retry schedule, and the tier order. The
// actual fetch-and-parse is injected, which is what lets every one of those rules be
// tested — and means the GLTFLoader/KTX2Loader wiring can land with the first real asset
// instead of being written blind against a manifest that is still empty.
//
// Not a `System`: `SYSTEM_IDS` has no 'assets' id, and ARCHITECTURE.md routes this through
// the `GameContext.assets` service slot instead. The bootstrap owns the instance.

import type { AssetEntry, AssetManifest, AssetTier } from '../data/assets';
import { MANIFEST } from '../data/assets';

/** Backoff before the first and second retry, in milliseconds (ASSET_PLAN.md §3). */
export const RETRY_DELAYS_MS = [500, 1500] as const;

export type AssetLoadFn = (key: string, entry: AssetEntry) => Promise<unknown>;

export interface AssetSystemOptions {
  readonly manifest?: AssetManifest;
  /** Fetch and parse one asset. Injected so the policy above is testable. */
  readonly load: AssetLoadFn;
  /** Sleep between retries. Injected so tests do not wait two seconds. */
  readonly delay?: (ms: number) => Promise<void>;
  /** A tier-0 failure is fatal; tier 1 and 2 are degraded notices (ASSET_PLAN.md §3). */
  readonly onFatal?: (key: string, cause: unknown) => void;
  readonly onDegraded?: (key: string, cause: unknown) => void;
  /** Byte-weighted progress, for the loading bar. */
  readonly onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

interface CacheEntry {
  readonly value: unknown;
  /** Reference count; the cache disposes what it holds when this reaches zero. */
  references: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class AssetSystem {
  private readonly manifest: AssetManifest;
  private readonly loadOne: AssetLoadFn;
  private readonly delay: (ms: number) => Promise<void>;

  private readonly cache = new Map<string, CacheEntry>();
  /** One promise per key: a second request while the first is in flight joins it. */
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly failed = new Set<string>();
  private loadedBytes = 0;

  constructor(private readonly options: AssetSystemOptions) {
    this.manifest = options.manifest ?? MANIFEST;
    this.loadOne = options.load;
    this.delay = options.delay ?? sleep;
  }

  /** Keys currently held in the cache. */
  get cachedKeys(): readonly string[] {
    return [...this.cache.keys()];
  }

  /** Keys that exhausted their retries. */
  get failedKeys(): readonly string[] {
    return [...this.failed];
  }

  /** True while a request for this key is outstanding. */
  isLoading(key: string): boolean {
    return this.inFlight.has(key);
  }

  /**
   * Load one asset, or join the request already in flight for it. Resolves to null when
   * the asset failed after its retries — callers substitute a placeholder rather than
   * crashing, except for tier 0 where the failure is reported as fatal.
   */
  async load(key: string): Promise<unknown> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      cached.references++;
      return cached.value;
    }
    if (this.failed.has(key)) return null;

    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing;

    const entry = this.manifest[key];
    if (entry === undefined) {
      throw new Error(`AssetSystem.load('${key}'): not in the manifest`);
    }

    const request = this.attempt(key, entry).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, request);
    return request;
  }

  /** Load every asset of a tier, in parallel (ASSET_PLAN.md §2). */
  async loadTier(tier: AssetTier): Promise<void> {
    const keys = Object.keys(this.manifest).filter((key) => this.manifest[key]?.tier === tier);
    await Promise.all(keys.map(async (key) => this.load(key)));
  }

  /** A cached asset, or null if it is not loaded. Does not take a reference. */
  peek(key: string): unknown {
    return this.cache.get(key)?.value ?? null;
  }

  /** Take a reference to a cached asset. */
  retain(key: string): unknown {
    const cached = this.cache.get(key);
    if (cached === undefined) return null;
    cached.references++;
    return cached.value;
  }

  /**
   * Release one reference. The cache disposes its value and drops the key when the last
   * reference goes, which makes the cache the sole owner (WEB_ARCHITECTURE.md §9).
   */
  release(key: string): void {
    const cached = this.cache.get(key);
    if (cached === undefined) return;
    cached.references--;
    if (cached.references > 0) return;
    disposeValue(cached.value);
    this.cache.delete(key);
  }

  /** Total bytes of the manifest, for the loading bar's denominator. */
  get totalBytes(): number {
    let total = 0;
    for (const key of Object.keys(this.manifest)) total += this.manifest[key]?.bytes ?? 0;
    return total;
  }

  /** Drop everything, disposing what the cache owns. */
  dispose(): void {
    for (const entry of this.cache.values()) disposeValue(entry.value);
    this.cache.clear();
    this.inFlight.clear();
    this.failed.clear();
    this.loadedBytes = 0;
  }

  /** One key, with the documented retry schedule: two retries, then failed. */
  private async attempt(key: string, entry: AssetEntry): Promise<unknown> {
    let lastCause: unknown = null;

    for (let tryIndex = 0; tryIndex <= RETRY_DELAYS_MS.length; tryIndex++) {
      if (tryIndex > 0) {
        await this.delay(RETRY_DELAYS_MS[tryIndex - 1] ?? 0);
      }
      try {
        const value = await this.loadOne(key, entry);
        this.cache.set(key, { value, references: 1 });
        this.loadedBytes += entry.bytes;
        this.options.onProgress?.(this.loadedBytes, this.totalBytes);
        return value;
      } catch (cause) {
        lastCause = cause;
      }
    }

    this.failed.add(key);
    // Tier 0 is required before the first frame, so losing it is fatal; anything later is
    // a degraded notice and the caller substitutes a visible placeholder.
    if (entry.tier === 0) this.options.onFatal?.(key, lastCause);
    else this.options.onDegraded?.(key, lastCause);
    return null;
  }
}

/** Three.js resources own GPU memory, so the cache disposes whatever it can. */
function disposeValue(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  const disposable = value as { dispose?: () => void };
  if (typeof disposable.dispose === 'function') disposable.dispose();
}
