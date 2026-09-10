# ASSET_PLAN — pipeline, phases, licensing

---

## 1. Phases

| Phase | Content | Purpose |
|---|---|---|
| **A — Primitives** (Phases 1–3) | Boxes, cylinders, planes with flat colours, generated in code by the same assembly rules the real kit will use | Prove gameplay, layout, collision and performance with zero asset risk. The city is *playable* before it is pretty. |
| **B — Modular kit** (Phases 3–4) | Authored/sourced modular building parts, road/ground atlas, props, vegetation, characters, vehicles | Real visual identity, still cheap |
| **C — Hero landmarks** (Phase 4) | Mysore Palace, market hero pieces, Chamundi silhouette | Recognition |
| **D — Polish** (Phase 9–11) | Better materials, night lighting details, signage variety, sound design pass | "Small but polished" |

**Critical rule:** gameplay code never depends on a specific model. Systems reference **asset keys**; the manifest maps keys to files. Swapping Phase A primitives for Phase B GLBs is a manifest change plus a placement-offset tune, never a code change. This is what makes the phased approach safe.

## 2. Asset keys and manifest

```ts
// data/assets.ts
export const MANIFEST = {
  'char.player':      { url: 'models/char_player.glb',  tier: 0, kind: 'gltf', bytes: 900_000 },
  'veh.auto':         { url: 'models/veh_auto.glb',     tier: 0, kind: 'gltf', bytes: 420_000 },
  'kit.building':     { url: 'models/kit_building.glb', tier: 0, kind: 'gltf', bytes: 1_200_000 },
  'lm.palace':        { url: 'models/lm_palace.glb',    tier: 1, kind: 'gltf', bytes: 2_500_000 },
  'tex.atlas.city':   { url: 'textures/city_atlas.ktx2', tier: 0, kind: 'texture', bytes: 2_800_000, fallback: 'textures/city_atlas.webp' },
  // …
} as const;
export type AssetKey = keyof typeof MANIFEST;
```

- `tier: 0` = required before first frame; `tier: 1` = loaded right after; `tier: 2` = on demand.
- `bytes` is the real measured size, used for an honest loading bar (`UI_ARCHITECTURE.md` §4).
- `AssetKey` is a union type, so a reference to a non-existent asset is a compile error.
- Paths are relative to Vite's `base` so the game works from a GitHub Pages subpath (`DEPLOYMENT.md`).
- A CI check verifies every manifest URL exists in `public/` and every file in `public/models|textures|audio` is referenced by the manifest (no orphans, no 404s) — see `TESTING_STRATEGY.md`.

## 3. Loader

`src/assets/AssetSystem.ts`:
- Wraps `GLTFLoader` (with `DRACOLoader` / `MeshoptDecoder` / `KTX2Loader` from the `three` package) and `TextureLoader`.
- One in-flight request per key (de-duplicated), a reference-counted cache, `AbortController` for cancellation.
- `get<T>(key)` returns a cached instance; `instance(key)` returns a clone sharing geometry and materials.
- **Retry policy:** 2 retries with 500 ms / 1500 ms backoff, then mark failed. A failed `tier: 0` asset is fatal; `tier: 1/2` failures are degraded and substituted with a magenta placeholder box so the gap is visible in dev and unobtrusive in production.
- Disposal is reference-counted; the cache is the sole owner of geometry/material/texture (`WEB_ARCHITECTURE.md` §9).

## 4. 3D format and compression

- **glTF 2.0 binary (`.glb`)**, one file per logical kit, not per object — a kit GLB with 30 named nodes is one request and one parse, and parts are instanced from it.
- Geometry compression: **Meshopt** preferred (fast decode, small, decoder ships with `three`); Draco acceptable for high-vertex hero assets.
- Textures: **KTX2/Basis** where supported (GPU-compressed, lower VRAM), with **WebP** fallback selected by feature detection. `PERFORMANCE.md` counts VRAM, and this is the single biggest lever on it.
- Atlases over per-object textures: one `city_atlas` (roads, kerbs, ground, walls, generic building surfaces), one `props_atlas`, one `signs_atlas` (Kannada signage), one `chars_atlas`. Target ≤6 unique textures resident in the district.
- Mip-mapped, power-of-two atlases, 2048² (4096² only for `city_atlas` if measurement justifies it).
- Materials: `MeshStandardMaterial` with no per-object clones — a shared material per atlas, with per-instance variation via vertex colour and instanced attributes.

## 5. LOD and instancing expectations per asset class

| Class | LOD | Batching |
|---|---|---|
| Building parts | none (merged into chunk mesh; silhouette ring uses a separate low-poly block mesh) | merged per chunk per material |
| Landmarks | 3 levels (near / mid / silhouette) via `THREE.LOD` | own draw calls (budgeted) |
| Trees | 2 levels + a billboard cross at distance | `InstancedMesh` per species |
| Street props | 1 level, low-poly by construction | `InstancedMesh` per prop type |
| Characters | 1 level (hidden beyond 100 m) | pooled `SkinnedMesh` sharing geometry (`NPC_ARCHITECTURE.md` §7) |
| Vehicles | 2 levels (near with wheels/details, far as a single mesh) | `InstancedMesh` per type/colour |

Triangle guidance: building part ≤300 tris, prop ≤200, tree ≤600 (LOD0), character ≤4,000, auto-rickshaw ≤3,000, Palace ≤40,000 (LOD0).

## 6. Download budget (MVP)

| Group | Target |
|---|---|
| JS (three + game, gzipped) | ≤ 900 KB |
| Textures (KTX2) | ≤ 6 MB |
| Models | ≤ 4 MB |
| Audio tier 0+1 | ≤ 2.5 MB |
| Fonts | ≤ 300 KB |
| **Total first playable** | **≤ 15 MB** |
| Tier 2 (on demand) | ≤ 5 MB additional |

## 7. Sourcing strategy

Preference order:
1. **Procedural / code-generated geometry** (roads, ground, kit assembly, cables, kerbs) — free, zero licence risk, zero download.
2. **Original assets** created for the project.
3. **CC0 / public-domain** libraries (e.g. Kenney-style kits, Poly Haven HDRIs/textures under CC0).
4. **CC-BY / permissive** assets, with attribution shipped in-game.

Never: assets of unknown provenance, "free" model-site downloads without an explicit licence file, ripped game assets, photogrammetry or scans of real buildings, textures made from photographs we do not have rights to, AI-generated assets whose provenance or terms are unclear, or anything derived from Google/Mapbox imagery (`WORLD_DESIGN.md` §11).

## 8. Licensing register — mandatory

Every external asset gets a row in `public/ASSET_CREDITS.md` (and a machine-readable `public/asset-credits.json`) **in the same commit that adds the file**:

| Field | Required |
|---|---|
| Asset key / filename | yes |
| Source (site + direct URL) | yes |
| Author / creator | yes |
| Licence (SPDX id or full name + version) | yes |
| Licence URL, and a copy in `licenses/` for OFL/CC-BY | yes |
| Attribution text as required by the licence | yes |
| Modifications made | yes |
| Date added, added by | yes |

CI fails if a file exists under `public/models|textures|audio|fonts` without a credits entry. In-game: a Credits panel in the pause menu renders the register, satisfying attribution obligations at runtime.

Landmark note: the Mysore Palace *building* is a real structure. We ship an **original stylized reinterpretation** built by us — recognizable silhouette, not a copy of anyone's model or scan. No third-party Palace model is used unless its licence explicitly permits commercial-style redistribution and modification, and even then it is recorded in full.

## 9. Naming and organisation

```
public/
  models/    char_*.glb  veh_*.glb  kit_*.glb  lm_*.glb  prop_*.glb  veg_*.glb
  textures/  *_atlas.ktx2 (+ .webp fallback)  sky_*.webp
  audio/     amb_*  sfx_*  ui_*  mus_*   (.ogg + .m4a)
  fonts/     notosans-kannada-subset.woff2
```

Lowercase, `snake_case`, prefixed by class. No spaces, no capitals (case-sensitivity bites on Linux hosting). Source files (`.blend`, uncompressed textures) are **not** committed — they belong in a separate archive; only optimized runtime assets are in the repo, keeping clones fast.

## 10. Placeholder policy

Phase A placeholders are generated in code (`city/kitPrimitives.ts`), never committed as art files, and are removed in the same commit that lands the real kit — so there is never a second, stale implementation of a building (`PROJECT_SPEC.md` §6 rule 5).
