// The asset manifest (ASSET_PLAN.md §2). Typed data, no behaviour — ADR-011.
//
// **It is empty, deliberately.** ASSET_PLAN.md §2 requires every manifest URL to exist in
// `public/` (a CI check enforces it), §10 forbids committing placeholder art, and this
// project has no art files yet. An entry here for a file that does not exist would be a
// tier-0 load failure, which is fatal by policy — so entries arrive with the art, in the
// task that lands it. `AssetSystem` is complete and tested against injected manifests in
// the meantime, and Phase 2's player is the code-generated proxy §7 allows.

/** 0 = needed before the first frame, 1 = right after, 2 = on demand (ASSET_PLAN.md §2). */
export type AssetTier = 0 | 1 | 2;

export interface AssetEntry {
  /** Relative to Vite's `base`, so the game works from the Pages subpath. */
  readonly url: string;
  readonly tier: AssetTier;
  readonly kind: 'gltf' | 'texture' | 'audio';
  /** Real measured size, for an honest loading bar (UI_ARCHITECTURE.md §4). */
  readonly bytes: number;
  /** Used when the primary format is unsupported, e.g. WebP for a KTX2 texture. */
  readonly fallback?: string;
}

export type AssetManifest = Readonly<Record<string, AssetEntry>>;

export const MANIFEST = {} as const satisfies AssetManifest;

/**
 * A union of the manifest's keys, so referencing an asset that does not exist is a
 * compile error. Empty until the manifest has entries.
 */
export type AssetKey = keyof typeof MANIFEST;
