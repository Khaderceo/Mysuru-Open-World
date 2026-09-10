# WORLD_DESIGN — size, chunks, streaming, terrain, sky

---

## 1. Recommended world size

| | Value |
|---|---|
| **MVP playable area** | **1.0 km × 1.0 km = 1 km²** |
| **Post-MVP first expansion** | 1.5 km × 1.5 km ≈ 2.25 km² (adds Chamundi Hill approach) |
| **Maximum practical early target** | **≈ 4 km² (2 × 2 km)** — do not plan beyond this without new streaming work |

### Why 1 km²

- **It is enough.** At 4.5 m/s running and ~13 m/s in an auto-rickshaw, crossing 1 km takes ~75 s driving and ~3.5 min running. With four distinct zones and a dense street grid the district reads as a real place, and the player can memorise it — which is a design pillar, not a compromise.
- **Draw calls, not area, are the limit.** With 128 m chunks and a 2-chunk detailed radius, the visible set is ~25 chunks. Our budget is ≤400 draw calls (`PERFORMANCE.md`), which means ~10–16 batches per chunk. That is achievable with merged static geometry plus instanced props. A 4 km² world at the same density would need real occlusion culling and impostors — work we are explicitly deferring.
- **Memory.** 1 km² of shared/instanced content fits comfortably inside a ~256 MB texture budget and ~400 MB heap, with the whole road graph resident. A 9 km² world would force graph paging.
- **Asset loading.** Initial download target ≤15 MB. That buys a modest set of modular kits reused everywhere. Doubling area does not double asset cost (reuse), but it does double authoring and tuning time — which is the actual scarce resource.
- **Solo/agent development effort.** Every square kilometre must be *curated* to hit "small but polished". 1 km² is roughly 25–35 authored city blocks, which is a realistic amount of hand-tuning within the phase plan.

### Expansion strategy

The world is chunked and seeded from the start, so growth is additive: new chunk coordinates, new road-graph segments, new zone definitions. Nothing about a 1 km² MVP has to be undone to reach 4 km². Before exceeding ~2.25 km², the following must land first: distance impostors for building rows, a coarse occlusion scheme (portal or sector visibility along streets), road-graph paging, and LOD for the landmark set.

## 2. Coordinate system and scale

- Right-handed, Y-up. **1 unit = 1 metre.** No exceptions, ever — mismatched scale is the classic source of physics and camera bugs.
- World origin at the district centre (near the Palace precinct). Coordinates run roughly −500 … +500 on X and Z.
- Real-world proportions: 3.0–3.5 m lanes, 1.5–2.5 m sidewalks, 3.0 m storey height, 1.75 m player eye height, ~2.6 m auto-rickshaw length. Believable scale is a pillar; scale is validated against a reference human capsule in the debug overlay.

## 3. Chunking

| Parameter | Value | Reason |
|---|---|---|
| Chunk size | **128 m × 128 m** | ~1 city block plus its street frontage; small enough that a build fits in a few frames' budget, large enough that the grid stays at 8×8 = 64 chunks |
| Grid | 8 × 8 (MVP) | Indexed `(cx, cz)`, `cx,cz ∈ [-4, 3]` |
| Vertical | none (single layer) | The district is nearly flat; Chamundi Hill is outside the playable grid in the MVP |
| Detailed radius | 2 chunks (≈ 5×5 = 25 active) | Covers the 250 m fog/draw distance with margin |
| Silhouette ring | +2 chunks (ring 3–4) | Building blocks only, merged, no props, no colliders |
| Unload radius | 5 chunks | Hysteresis: load at 2, keep until 5, so oscillating at a boundary never thrashes |

Chunk contents:

```
Chunk
├─ static merged mesh(es)   roads, sidewalks, kerbs, walls, building shells (1–3 draw calls per material group)
├─ instanced batches        trees, streetlights, poles, signs, bins, stalls, parked props
├─ collider set             AABB/OBB list registered into the physics grid
├─ spawn descriptors        pedestrian spawn points, traffic entry lanes, interactables, mission anchors
└─ metadata                 seed, zone id, build version, bounds
```

Roads and the road graph are **not** chunk-owned: the graph is global and resident (§5).

## 4. Streaming

Distance-based ring loading, evaluated at 4 Hz from the player's chunk coordinate.

```
evaluate():
  need    = ringsAround(playerChunk, DETAIL_R) ∪ silhouetteRing(playerChunk, SIL_R)
  toLoad  = need − loaded          → enqueue, sorted by distance then by view direction
  toKeep  = loaded ∩ withinUnloadR
  toDrop  = loaded − toKeep        → dispose, return pooled buffers, unregister colliders
```

- Builds are **budgeted and sliced** (`WEB_ARCHITECTURE.md` §5), never blocking.
- A chunk in the direction the camera faces is prioritised over one behind the player.
- **Prewarm:** on load/teleport, the 3×3 around the player is built synchronously behind the loading screen before the first frame, so the player never starts in a void.
- Failure of a single chunk build is a recoverable error: retry once, then log and leave that chunk as flat ground.

Rejected alternatives:

| Option | Verdict |
|---|---|
| Load the whole 1 km² world at once | Simplest, and *nearly* viable at this size — rejected because it caps the world permanently, produces a long single hitch on load, and holds all colliders and props resident. Chunking costs one system and buys the entire expansion path. |
| Visibility/portal-based loading | Better culling, much more authoring and code. Deferred to the >2.25 km² prerequisite list. |
| Per-object distance loading (no chunks) | Loses geometry merging, which is our main draw-call lever. |
| Octree / quadtree scene | Overkill for a flat 8×8 grid. |

## 5. Road graph residency

The full road graph for 1 km² is a few thousand nodes/segments — tens of kilobytes. It is built once at boot from authored data (`CITY_SYSTEM.md`) and stays resident. This is deliberate: traffic routing, NPC sidewalk navigation, minimap drawing, mission destination selection and vehicle spawning all query the same graph and would otherwise need duplicated, chunk-local copies. One source of truth, always available.

## 6. Terrain

The district is treated as **near-flat with authored variation**, not as heightmap terrain:

- A single ground plane per chunk, subdivided ~8×8, with gentle vertex displacement from a seeded noise function (±0.6 m) for believability and drainage-looking camber.
- Roads are authored flat ribbons; ground is fitted to the road surface at the edges so there are no seams or floating kerbs.
- Ground material: one atlas with dirt/asphalt/grass/paving regions, blended by vertex colour. One draw call per chunk.
- **Collision for ground is analytic**, not mesh-based: a height query samples the same noise function the mesh used (`physics.groundAt(x, z)`), so it is exact, allocation-free, and available before the mesh exists.
- Chamundi Hill (MVP) is a distant, non-collidable silhouette mesh on the skyline, placed outside the grid at low LOD.

## 7. Edges of the world

The district is bounded by a ring road. Beyond it:
- Low-detail scenery bands (tree lines, distant building masses, hill silhouette) with no colliders.
- A soft blocker: an invisible collision wall a few metres past the ring road's outer kerb, plus a "You're leaving the district" HUD hint at 20 m. No instant teleports, no invisible-wall-in-the-middle-of-a-street.
- Fog and a matching sky horizon hide the boundary at eye level; the boundary is only obvious from a rooftop, which the MVP does not offer.

## 8. Day/night

Driven by `world/TimeOfDay`, which owns a single normalised clock and publishes lighting values.

| Element | Behaviour |
|---|---|
| Cycle length | default 24 game hours in 24 real minutes; configurable; pauses with the game; persisted |
| Sun | one `DirectionalLight` on a simplified arc (latitude ~12.3° N approximated by a fixed tilted circle — no astronomy). Colour and intensity from a keyframed gradient over the day. |
| Shadows | single shadow map, 2048², fitted to a ~120 m box around the player, snapped to texel grid to stop shimmer; disabled when the sun is below the horizon |
| Ambient | `HemisphereLight` sky/ground colours keyframed alongside the sun |
| Sky | gradient shader dome (cheap, controllable) rather than a physical sky model; star layer fades in at night |
| Fog | exponential-squared fog, colour and density keyframed per phase; matched to sky colour at the horizon |
| Street & shop lights | emissive material swap + a small number of pooled point lights near the player only (`PERFORMANCE.md` caps concurrent point lights at 8) |
| Palace floodlights | scripted emissive + 2 dedicated lights at night — the signature night image |
| Phase events | `time:phase-changed` drives audio ambience, traffic density, NPC density, shop-light state |

Deliberately not built: physically-based atmospheric scattering, moon phases, real solar position math, volumetric light.

## 9. Weather (post-MVP, designed now)

Three states — `clear`, `cloudy`, `rain` — as a blend factor set that modulates existing systems rather than adding new ones: fog density/colour, sun intensity, ambient tint, a wet-surface roughness/reflectance tweak on the road material, an optional light rain effect.

Rain effect must be cheap: a camera-locked, scrolling-texture rain shell plus a small pooled splash-decal set, **not** a high-count particle system. Hard cap: one extra draw call for rain, ≤3,000 quads total. Thunder is audio-only with a light flash on the ambient term.

## 10. World data and seeding

- One `worldSeed` constant in `data/world.ts`; per-chunk seed = `hash(worldSeed, cx, cz)`. Changing `worldSeed` reshuffles all procedural fill deterministically; authored content (roads, landmarks, zone bounds, mission anchors) is unaffected.
- Zones are authored polygons with a `ZoneType` (`palace | market | residential | mainroad | outskirts`) that drives building kit selection, prop density, NPC density, traffic density and ambience.
- Save files record `worldSeed` and a world-data version; a mismatch is handled by `SAVE_SYSTEM.md`'s migration policy rather than by silently loading a different city.

## 11. Map data and legality

The world is an **original layout inspired by Mysuru**, not a reproduction of a map.

- No Google Maps, Mapbox, or any mapping API at runtime or build time.
- No tracing of proprietary map imagery or satellite photos into geometry.
- Open data (e.g. OpenStreetMap under ODbL) may be consulted for *general orientation only*; any derived geometry would carry share-alike obligations, so **no OSM-derived geometry ships**. Layouts are hand-designed to evoke, not to match.
- Real landmark *architecture* is reinterpreted as an original stylized model with a recognizable silhouette; no photogrammetry, no scanned models, no ripped assets. See `ASSET_PLAN.md` §Landmarks and licensing.
- The world is fully playable offline with zero external network requests after load.
